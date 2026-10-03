// New code live without its migrations (issue #342): /v1/health names what the database lacks
// and goes 503, so the half-hourly probe turns red on its first run instead of a learner
// meeting a missing column. docs/architecture.md §Delivery.
// requires live verification in Claude Code session (needs a running Postgres; the Supabase
// migration table is created here by hand — a hosted project has it, the test database not)

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EXPECTED_MIGRATIONS } from '../lib/migrations.js';
import { runTick } from '../modules/scheduler/tick.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

type Health = { ok: boolean; migrations: { ok: boolean; missing: string[] | null } };

describe.skipIf(!dbReady)('health and migrations', () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await createTestEnv();
    await runTick(env.deps);
  });
  afterAll(async () => {
    await env.close();
  });

  async function health(): Promise<{ status: number; body: Health }> {
    const res = await env.app.request('/v1/health');
    return { status: res.status, body: (await res.json()) as Health };
  }

  it('does not fail a database that keeps no migration record', async () => {
    const { status, body } = await health();
    expect(status).toBe(200);
    expect(body.migrations).toEqual({ ok: true, missing: null });
  });

  it('names a missing migration and goes 503, then recovers once it is applied', async () => {
    const last = EXPECTED_MIGRATIONS[EXPECTED_MIGRATIONS.length - 1] ?? '';
    await env.db.query(`create schema supabase_migrations`);
    await env.db.query(
      `create table supabase_migrations.schema_migrations (version text primary key, name text)`,
    );
    await env.db.query(
      `insert into supabase_migrations.schema_migrations (version, name)
       select lpad(n::text, 14, '0'), name from unnest($1::text[]) with ordinality as u(name, n)`,
      [EXPECTED_MIGRATIONS.slice(0, -1)],
    );
    const before = await health();
    expect(before.status).toBe(503);
    expect(before.body.ok).toBe(false);
    expect(before.body.migrations).toEqual({ ok: false, missing: [last] });

    await env.db.query(
      `insert into supabase_migrations.schema_migrations (version, name) values ('99999999999999', $1)`,
      [last],
    );
    const after = await health();
    expect(after.status).toBe(200);
    expect(after.body.migrations).toEqual({ ok: true, missing: [] });
  });
});
