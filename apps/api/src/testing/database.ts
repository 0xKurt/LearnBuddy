// Real Postgres for tests: the actual migrations on a throwaway database.
// requires live verification in Claude Code session (needs a running Postgres)
//
// A template database is built once per migration set (shim + migrations),
// then every test file gets its own copy (CREATE DATABASE … TEMPLATE), so
// files run in parallel without sharing state. Nothing is mocked.

import { createHash, randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const MIGRATIONS = join(ROOT, 'infra/supabase/migrations');
const SHIM = join(ROOT, 'infra/supabase/test-shim.sql');
export const LOCK_KEY = 7_319_004;

export const TEST_DATABASE_URL =
  process.env.LB_TEST_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/postgres';

/** CI sets LB_REQUIRE_TEST_DB=1 so a missing database fails instead of skipping. */
export const TEST_DATABASE_REQUIRED = process.env.LB_REQUIRE_TEST_DB === '1';

function urlFor(database: string): string {
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${database}`;
  return url.toString();
}

function schema(): { sql: string; hash: string } {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
    .sort();
  const sql = [
    readFileSync(SHIM, 'utf8'),
    ...files.map((f) => readFileSync(join(MIGRATIONS, f), 'utf8')),
  ]
    .join('\n;\n')
    // Supabase-only extensions; the shim provides the schemas they would create.
    .replace(/^create extension if not exists (pg_cron|pg_net);$/gim, '-- test: $&');
  // The encoding is part of the name, so templates built before it was pinned are never reused.
  const hash = createHash('sha256').update(sql).update(TEMPLATE_ENCODING).digest('hex');
  return { sql, hash: hash.slice(0, 12) };
}

let available: boolean | null = null;

/**
 * Every template is UTF8 with English collation, whatever the cluster's defaults: production
 * (Supabase) and CI (postgres:16) sort and check text this way, and a SQL_ASCII/C cluster once
 * let a test pass locally that failed in CI (issue #335). Copies inherit it from the template.
 */
const TEMPLATE_ENCODING =
  "encoding 'UTF8' locale_provider icu icu_locale 'en-US' locale 'C.UTF-8' template template0";

export async function testDatabaseAvailable(): Promise<boolean> {
  if (available !== null) return available;
  const client = new pg.Client({
    connectionString: TEST_DATABASE_URL,
    connectionTimeoutMillis: 2000,
  });
  try {
    await client.connect();
    await client.query('select 1');
    available = true;
  } catch {
    available = false;
  } finally {
    await client.end().catch(() => undefined);
  }
  if (!available && TEST_DATABASE_REQUIRED) {
    throw new Error(`LB_REQUIRE_TEST_DB=1 but no Postgres at ${TEST_DATABASE_URL}`);
  }
  return available;
}

export type TestDatabase = { url: string; drop(): Promise<void> };

/** The template database of the current migration set. */
export function templateName(): string {
  return `lb_tpl_${schema().hash}`;
}

/** Marks a template as completely built (only then is it copied). */
const BUILT = 'lb built ';
/** Test databases and templates of other runs are left alone for this long. */
const STALE_MS = 24 * 3_600_000;

/**
 * Leftovers of interrupted runs (audit template-db-lifecycle, template-force-drop-and-single-lock):
 * test databases older than a day (their name carries the creation time), unfinished template
 * builds, and templates of other migration sets not built within the last day — never what a
 * concurrent run (e.g. another branch on the same server) may still be using.
 */
async function dropLeftovers(admin: pg.Client, current: string): Promise<void> {
  const rows = await admin.query<{ datname: string; note: string | null }>(
    `select datname, shobj_description(oid, 'pg_database') as note from pg_database
      where datname like 'lb_test_%' or datname like 'lb_tpl_%' or datname like 'lb_tplbuild_%'`,
  );
  const now = Date.now();
  for (const { datname, note } of rows.rows) {
    let stale = false;
    if (datname.startsWith('lb_tplbuild_'))
      stale = true; // a build dies with its lock holder
    else if (datname.startsWith('lb_test_')) {
      const born = parseInt(datname.slice('lb_test_'.length).split('_')[0] ?? '', 36);
      stale = Number.isFinite(born) && now - born > STALE_MS;
    } else if (datname !== current) {
      const built = note?.startsWith(BUILT) ? Date.parse(note.slice(BUILT.length)) : NaN;
      stale = !Number.isFinite(built) || now - built > STALE_MS;
    }
    if (stale) await admin.query(`drop database if exists "${datname}" with (force)`);
  }
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const { sql, hash } = schema();
  const template = `lb_tpl_${hash}`;
  const name = `lb_test_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
  const admin = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  try {
    // Serialise template creation and copying across parallel test workers.
    await admin.query('select pg_advisory_lock($1)', [LOCK_KEY]);
    try {
      await dropLeftovers(admin, template);
      const exists = await admin.query<{ note: string | null }>(
        `select shobj_description(oid, 'pg_database') as note from pg_database where datname = $1`,
        [template],
      );
      // A template without the "built" mark is a half-built one from an older helper: rebuild.
      const complete = exists.rows[0]?.note?.startsWith(BUILT) ?? false;
      if (!complete) {
        if (exists.rowCount)
          await admin.query(`drop database if exists "${template}" with (force)`);
        // Built under another name and renamed when complete: an interrupted build is
        // never mistaken for the template.
        const build = `lb_tplbuild_${hash}_${randomBytes(4).toString('hex')}`;
        await admin.query(`create database "${build}" ${TEMPLATE_ENCODING}`);
        const setup = new pg.Client({ connectionString: urlFor(build) });
        await setup.connect();
        try {
          await setup.query(sql);
        } catch (err) {
          await setup.end();
          await admin.query(`drop database if exists "${build}" with (force)`);
          throw err;
        }
        await setup.end();
        await admin.query(`alter database "${build}" rename to "${template}"`);
        await admin.query(
          `comment on database "${template}" is '${BUILT}${new Date().toISOString()}'`,
        );
      }
      await admin.query(`create database "${name}" template "${template}"`);
    } finally {
      await admin.query('select pg_advisory_unlock($1)', [LOCK_KEY]);
    }
  } finally {
    await admin.end();
  }
  return {
    url: urlFor(name),
    drop: async () => {
      const c = new pg.Client({ connectionString: TEST_DATABASE_URL });
      await c.connect();
      try {
        await c.query(`drop database if exists "${name}" with (force)`);
      } finally {
        await c.end();
      }
    },
  };
}
