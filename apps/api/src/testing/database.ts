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
const LOCK_KEY = 7_319_004;

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
  return { sql, hash: createHash('sha256').update(sql).digest('hex').slice(0, 12) };
}

let available: boolean | null = null;

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
      const exists = await admin.query('select 1 from pg_database where datname = $1', [template]);
      if (exists.rowCount === 0) {
        await admin.query(`create database "${template}"`);
        const setup = new pg.Client({ connectionString: urlFor(template) });
        await setup.connect();
        try {
          await setup.query(sql);
        } catch (err) {
          await setup.end();
          await admin.query(`drop database if exists "${template}"`);
          throw err;
        }
        await setup.end();
        // Old templates and databases left behind by crashed runs.
        const stale = await admin.query<{ datname: string }>(
          `select datname from pg_database
            where (datname like 'lb_tpl_%' and datname <> $1)`,
          [template],
        );
        for (const row of stale.rows)
          await admin.query(`drop database if exists "${row.datname}" with (force)`);
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
