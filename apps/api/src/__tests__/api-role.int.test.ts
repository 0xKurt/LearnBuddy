// The API as the role it runs as in production, not as the superuser that built the test
// database (issue #107 §3: on LearnBuddy the role `lb_api` existed only live, made by hand,
// and every test ran as superuser — a missing grant would have shown up first in production).
// The role comes from the versioned template infra/supabase/templates/api-role.sql, applied
// with psql exactly as the operator runs it.
// requires live verification in Claude Code session (needs a running Postgres and psql)

import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { checkDatabase } from '../../scripts/deploy-check.js';
import { TEST_DATABASE_URL, testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, TEST_TICK_SECRET, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();
const TEMPLATE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../infra/supabase/templates/api-role.sql',
);

/** The operator's command, verbatim apart from the connection string. */
function applyTemplate(adminUrl: string, role: string, password: string): void {
  execFileSync(
    'psql',
    [adminUrl, '-q', '-v', `api_role=${role}`, '-v', `api_password=${password}`, '-f', TEMPLATE],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
}

const psqlAvailable = spawnSync('psql', ['--version']).status === 0;

describe.skipIf(!dbReady)('the API role from infra/supabase/templates/api-role.sql', () => {
  let env: TestEnv;
  let role: string;
  let adminUrl: string;
  let apiUrl: string;

  beforeEach(async () => {
    // A missing psql must fail, not skip: the template is only proven if it really ran.
    expect(psqlAvailable, 'psql is needed to apply the role template').toBe(true);
    role = `lb_api_${randomBytes(4).toString('hex')}`;
    const password = randomBytes(18).toString('base64url');
    env = await createTestEnv({
      start: '2026-10-02T08:00:00Z',
      connectAs: async (url) => {
        adminUrl = url;
        applyTemplate(url, role, password);
        // Idempotent: the operator may run it again (and does, to reset the password).
        applyTemplate(url, role, password);
        const u = new URL(url);
        u.username = role;
        u.password = password;
        apiUrl = u.toString();
        return apiUrl;
      },
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await env.close();
    // Roles are per cluster; the database (with its default privileges) is gone by now.
    const admin = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await admin.connect();
    try {
      await admin.query(`drop role if exists "${role}"`);
    } finally {
      await admin.end();
    }
  });

  it('is what the template says and nothing more', async () => {
    const [me] = await env.db.query<{
      current_user: string;
      rolsuper: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
      rolbypassrls: boolean;
    }>(
      `select current_user, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls
         from pg_roles where rolname = current_user`,
    );
    expect(me).toEqual({
      current_user: role,
      rolsuper: false,
      rolcreaterole: false,
      rolcreatedb: false,
      rolbypassrls: true,
    });
    await expect(env.db.query('create table api_role_ddl (i int)')).rejects.toThrow(
      /permission denied/,
    );
    await expect(env.db.query('select * from auth.users limit 1')).rejects.toThrow(
      /permission denied/,
    );
  });

  async function adminSql(sql: string): Promise<void> {
    const admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    try {
      await admin.query(sql);
    } finally {
      await admin.end();
    }
  }

  async function deployFailures(): Promise<string[]> {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await checkDatabase(apiUrl);
    return errors.mock.calls.map(([message]) => String(message));
  }

  it('accepts the template role in the deploy check', async () => {
    expect(await deployFailures()).toEqual([]);
  });

  it.each([
    ['no RLS bypass', 'nobypassrls', 'BYPASSRLS'],
    ['superuser', 'superuser', 'SUPERUSER'],
    ['database creation', 'createdb', 'CREATEDB'],
    ['role creation', 'createrole', 'CREATEROLE'],
    ['replication', 'replication', 'REPLICATION'],
  ])('rejects %s in the deploy check', async (_label, attribute, diagnostic) => {
    await adminSql(`alter role "${role}" ${attribute}`);
    expect((await deployFailures()).join('\n')).toContain(diagnostic);
  });

  it.each(['select', 'insert', 'update', 'delete'])('detects missing table %s', async (grant) => {
    await adminSql(`revoke ${grant} on public.accounts from "${role}"`);
    expect((await deployFailures()).join('\n')).toContain(`public.accounts: missing ${grant}`);
  });

  it('checks sequence, function and migration-read rights individually', async () => {
    await adminSql(`
      create sequence public.role_probe;
      revoke update on sequence public.role_probe from "${role}";
      create function public.role_probe() returns int language sql as 'select 1';
      revoke execute on function public.role_probe() from public, "${role}";
      create schema supabase_migrations;
      create table supabase_migrations.schema_migrations (version text, name text);
      grant usage on schema supabase_migrations to "${role}";
    `);
    const failures = (await deployFailures()).join('\n');
    expect(failures).toContain('public.role_probe: missing update');
    expect(failures).toContain('role_probe(): missing execute');
    expect(failures).toContain('supabase_migrations.schema_migrations: missing select');
  });

  it('detects missing public usage and table ownership', async () => {
    await adminSql(`revoke usage on schema public from public, "${role}";
      alter table public.accounts owner to "${role}"`);
    const failures = (await deployFailures()).join('\n');
    expect(failures).toContain('public: missing usage');
    expect(failures).toContain('public.accounts: forbidden ownership');
  });

  it('detects effective schema CREATE inherited from PUBLIC and private schema access', async () => {
    await adminSql(`grant create on schema public to public;
      grant usage on schema auth to "${role}"`);
    const failures = (await deployFailures()).join('\n');
    expect(failures).toContain('public: forbidden create');
    expect(failures).toContain('auth: forbidden usage');
  });

  it('runs a whole account through the API: sign-up, material, export, deletion, health', async () => {
    const l = await onboard(env);
    const created = await l.api.post<{ uploads: Array<{ path: string }> }>('/materials', {
      client_request_id: '00000000-0000-4000-8000-0000000a0001',
      photo_mimes: ['image/jpeg'],
    });
    expect(created.status).toBe(201);
    env.storage.put(created.body.uploads[0]!.path);

    const exported = await l.api.get<Record<string, unknown>>('/account/export');
    expect(exported.status).toBe(200);

    expect((await l.api.post('/account/deletion')).status).toBe(202);
    const tick = () =>
      env.app.request('/v1/internal/tick', {
        method: 'POST',
        headers: { 'x-tick-secret': TEST_TICK_SECRET },
      });
    env.clock.hours(24 * 7 + 1);
    const ran = await tick();
    expect(ran.status).toBe(200);
    expect(((await ran.json()) as { errors: string[] }).errors).toEqual([]);
    expect(await env.db.maybeOne(`select 1 from learners where id = $1`, [l.learnerId])).toBeNull();

    const health = await env.app.request('/v1/health');
    expect(health.status).toBe(200);
    expect(((await health.json()) as { ok: boolean }).ok).toBe(true);
  });

  it('keeps the grants for a table a later migration adds (default privileges)', async () => {
    const admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    try {
      await admin.query(
        `create table later_migration (id bigserial primary key, note text);
         alter table later_migration enable row level security;`,
      );
    } finally {
      await admin.end();
    }
    await env.db.query(`insert into later_migration (note) values ('from a later migration')`);
    expect(await env.db.query(`select note from later_migration`)).toEqual([
      { note: 'from a later migration' },
    ]);
  });
});
