// The shared lockout / rate-limit primitive on a real Postgres (lib/limits.ts,
// docs/architecture.md §Limits).
// requires live verification in Claude Code session (needs a running Postgres)

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { consume, lockedUntil, resetCounter } from '../lib/limits.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

describe.skipIf(!dbReady)('attempt counters', () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await createTestEnv();
  });
  afterAll(async () => {
    await env?.close();
  });

  it('counts 50 parallel attempts exactly and allows no more than the limit', async () => {
    const l = await onboard(env);
    const policy = { limit: 30, windowMs: 60_000 };
    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        consume(env.db, 'messages', l.accountId, env.clock.now(), policy),
      ),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(30);
    const refused = results.filter((r) => !r.allowed);
    expect(refused).toHaveLength(20);
    for (const r of refused) if (!r.allowed) expect(r.reason).toBe('limit');
    const row = await env.db.one<{ count: number }>(
      `select count from attempt_counters where scope = 'messages' and account_id = $1`,
      [l.accountId],
    );
    expect(row.count).toBe(30);
    // The window ends by the app clock, never by the database's.
    env.clock.minutes(1);
    expect((await consume(env.db, 'messages', l.accountId, env.clock.now(), policy)).allowed).toBe(
      true,
    );
  });

  it('locks at the limit for the same time every time (no escalation), and resets on success', async () => {
    const l = await onboard(env);
    const policy = { limit: 3, windowMs: 3_600_000, lock: { ms: 60_000 } };
    const take = () => consume(env.db, 'pin', l.accountId, env.clock.now(), policy);
    const burst = await Promise.all(Array.from({ length: 8 }, take));
    expect(burst.filter((r) => r.allowed)).toHaveLength(3);
    expect(burst.filter((r) => r.allowed && r.lockedUntil !== null)).toHaveLength(1);
    const locked = await lockedUntil(env.db, 'pin', l.accountId, env.clock.now());
    expect(locked!.getTime() - env.clock.now().getTime()).toBe(60_000);

    // A second and a third lock last exactly as long as the first (ADR 0006).
    for (let round = 0; round < 2; round++) {
      env.clock.advance(61_000);
      for (let i = 0; i < 3; i++) await take();
      const again = await lockedUntil(env.db, 'pin', l.accountId, env.clock.now());
      expect(again!.getTime() - env.clock.now().getTime()).toBe(60_000);
    }

    await resetCounter(env.db, 'pin', l.accountId);
    expect(await lockedUntil(env.db, 'pin', l.accountId, env.clock.now())).toBeNull();
    for (let i = 0; i < 3; i++) await take();
    const fresh = await lockedUntil(env.db, 'pin', l.accountId, env.clock.now());
    expect(fresh!.getTime() - env.clock.now().getTime()).toBe(60_000);
  });

  it('keeps budgets per account and per scope', async () => {
    const a = await onboard(env);
    const b = await onboard(env);
    const policy = { limit: 1, windowMs: 60_000 };
    expect((await consume(env.db, 'answers', a.accountId, env.clock.now(), policy)).allowed).toBe(
      true,
    );
    expect((await consume(env.db, 'answers', a.accountId, env.clock.now(), policy)).allowed).toBe(
      false,
    );
    expect((await consume(env.db, 'answers', b.accountId, env.clock.now(), policy)).allowed).toBe(
      true,
    );
    expect((await consume(env.db, 'messages', a.accountId, env.clock.now(), policy)).allowed).toBe(
      true,
    );
  });
});
