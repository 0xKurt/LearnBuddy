// The test harness itself: real databases come and go cleanly, also after interrupted runs
// (audit template-db-lifecycle, template-force-drop-and-single-lock,
// harness-close-does-not-drain-background).
// requires live verification in Claude Code session (needs a running Postgres)

import pg from 'pg';
import { describe, expect, it } from 'vitest';

import {
  createTestDatabase,
  LOCK_KEY,
  TEST_DATABASE_URL,
  templateName,
  testDatabaseAvailable,
} from '../testing/database.js';
import { createTestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

async function admin<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

const exists = (name: string) =>
  admin(
    async (c) =>
      (await c.query('select 1 from pg_database where datname = $1', [name])).rowCount === 1,
  );

describe.skipIf(!dbReady)('test databases', () => {
  it('drops what interrupted runs left behind, never what a concurrent run may use', async () => {
    const old = `lb_test_${(Date.now() - 2 * 86_400_000).toString(36)}_deadbeef`;
    const recent = `lb_test_${(Date.now() - 60_000).toString(36)}_cafebabe`;
    const build = 'lb_tplbuild_000000000000_deadbeef';
    const otherSet = 'lb_tpl_ffffffffffff';
    await admin(async (c) => {
      for (const n of [old, recent, build, otherSet]) await c.query(`create database "${n}"`);
      await c.query(`comment on database "${otherSet}" is 'lb built ${new Date().toISOString()}'`);
    });
    try {
      const db = await createTestDatabase();
      await db.drop();
      expect(await exists(old)).toBe(false);
      expect(await exists(build)).toBe(false);
      expect(await exists(recent)).toBe(true);
      expect(await exists(otherSet)).toBe(true);
    } finally {
      await admin(async (c) => {
        for (const n of [old, recent, build, otherSet])
          await c.query(`drop database if exists "${n}" with (force)`);
      });
    }
  });

  it('never copies a half-built template', async () => {
    const template = templateName();
    // A template left empty by a run killed while building it (no "built" mark).
    await admin(async (c) => {
      // Under the helper's lock: parallel test files copy the template meanwhile.
      await c.query('select pg_advisory_lock($1)', [LOCK_KEY]);
      try {
        await c.query(`drop database if exists "${template}" with (force)`);
        await c.query(`create database "${template}"`);
      } finally {
        await c.query('select pg_advisory_unlock($1)', [LOCK_KEY]);
      }
    });
    const db = await createTestDatabase();
    try {
      const c = new pg.Client({ connectionString: db.url });
      await c.connect();
      try {
        const r = await c.query<{ t: string | null }>(
          `select to_regclass('public.learners')::text as t`,
        );
        expect(r.rows[0]?.t).toBe('learners');
      } finally {
        await c.end();
      }
    } finally {
      await db.drop();
    }
  });

  it('closing an environment waits for its background work', async () => {
    const env = await createTestEnv();
    let finished = false;
    env.deps.background(async () => {
      await new Promise((r) => setTimeout(r, 50));
      await env.db.query('select 1');
      finished = true;
    });
    await env.close();
    expect(finished).toBe(true);
  });
});
