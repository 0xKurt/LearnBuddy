// requires live verification in Claude Code session (real Postgres, scripted outside world)
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();
const names = ['0998_first', '0999_second'];

describe.skipIf(!dbReady)('candidate migration evidence (#915)', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.close();
  });

  async function record(applied: string[]) {
    await env.db.query('create schema supabase_migrations');
    await env.db.query(
      'create table supabase_migrations.schema_migrations (version text, name text)',
    );
    await env.db.query(
      'insert into supabase_migrations.schema_migrations select name, name from unnest($1::text[]) name',
      [applied],
    );
  }
  const request = (value = names.join(',')) =>
    env.app.request(`/v1/health?expect=${encodeURIComponent(value)}`);

  it('does not treat an absent migration record as evidence', async () => {
    const res = await request();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ expected: names, applied: null });
  });
  it('does not accept another project ledger as candidate evidence', async () => {
    await record(['0001_unrelated_project']);
    const res = await request();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ expected: names, applied: [] });
  });
  it('checks every requested migration beyond the deployed build', async () => {
    await record(names.slice(0, 1));
    const missing = await request();
    expect(missing.status).toBe(503);
    expect(await missing.json()).toEqual({ expected: names, applied: names.slice(0, 1) });
    await env.db.query('insert into supabase_migrations.schema_migrations values ($1, $1)', [
      names[1],
    ]);
    const complete = await request();
    expect(complete.status).toBe(200);
    expect(await complete.json()).toEqual({ expected: names, applied: names });
    expect(complete.headers.get('cache-control')).toBe('no-store');
  });
  it('rejects a number collision even if the requested name also exists', async () => {
    await record([...names, '0999_different']);
    const res = await request();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ expected: names, applied: [names[0]] });
  });
  it('treats missing read privileges as unknown, never healthy', async () => {
    await record(names);
    await env.db.query('revoke all on schema supabase_migrations from public');
    await env.db.tx(async (db) => {
      // Pin the route to the same real connection whose permissions we restrict.
      env.deps.db = db;
      await db.query('set local role anon');
      try {
        const res = await request();
        expect(res.status).toBe(503);
        expect(await res.json()).toEqual({ expected: names, applied: null });
      } finally {
        env.deps.db = env.db;
      }
    });
  });
  it.each([
    '',
    "0999_x');drop table learners;--",
    '0999_x,0999_x',
    '0999_a,0999_b',
    Array.from({ length: 21 }, (_, i) => `${9000 + i}_x`).join(','),
    `0999_${'x'.repeat(100)}`,
  ])('rejects invalid or unbounded input: %s', async (input) => {
    expect((await request(input)).status).toBe(422);
  });
  it('rejects repeated expect parameters', async () => {
    expect((await env.app.request('/v1/health?expect=0998_first&expect=0999_second')).status).toBe(
      422,
    );
  });
});
