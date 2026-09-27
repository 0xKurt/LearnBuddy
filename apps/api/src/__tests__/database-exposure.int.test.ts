// The anon and authenticated keys ship inside the app, so they must reach nothing in the
// database directly (docs/privacy.md §Access control): no callable function, no readable table.
// The test shim grants what a hosted Supabase project grants by default, so a migration that
// forgets to revoke fails here (audit M-6 p2-sec-anon-rpc-lb-invoke-tick).
// requires live verification in Claude Code session (needs a running Postgres)

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createTestDatabase,
  testDatabaseAvailable,
  type TestDatabase,
} from '../testing/database.js';

const dbReady = await testDatabaseAvailable();

describe.skipIf(!dbReady)('database exposure to the app keys', () => {
  let database: TestDatabase;
  let client: pg.Client;
  beforeAll(async () => {
    database = await createTestDatabase();
    client = new pg.Client({ connectionString: database.url });
    await client.connect();
  });
  afterAll(async () => {
    await client.end();
    await database.drop();
  });

  it('the anon key cannot trigger a scheduler tick', async () => {
    await client.query('begin');
    try {
      await client.query('set local role anon');
      await expect(client.query('select public.lb_invoke_tick()')).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await client.query('rollback');
    }
  });

  it('no function in the public schema is executable by anon or authenticated', async () => {
    const res = await client.query<{ fn: string; role: string }>(
      `select p.oid::regprocedure::text as fn, r.role
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         cross join (values ('anon'), ('authenticated')) as r(role)
        where n.nspname = 'public'
          -- Extension functions (pgcrypto etc.) live in "extensions" on Supabase.
          and not exists (select 1 from pg_depend d
                           where d.classid = 'pg_proc'::regclass and d.objid = p.oid
                             and d.deptype = 'e')
          and has_function_privilege(r.role, p.oid, 'execute')
        order by 1, 2`,
    );
    expect(res.rows).toEqual([]);
  });

  it('every table in the public schema has row level security on', async () => {
    const res = await client.query<{ relname: string }>(
      `select c.relname
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
        order by 1`,
    );
    expect(res.rows).toEqual([]);
  });

  it('the anon role reads no rows even where a table grant exists', async () => {
    await client.query('begin');
    try {
      await client.query('set local role anon');
      const res = await client.query<{ n: number }>('select count(*)::int as n from accounts');
      expect(res.rows[0]?.n).toBe(0);
    } finally {
      await client.query('rollback');
    }
  });
});
