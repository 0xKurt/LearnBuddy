// Buddy's state is read side by side, not one round trip after the other (issue #637): the chat
// turn waited for ~17 sequential reads of independent tables before the model was even asked —
// at the production distance (3.2 ms a round trip, #447) that alone was ~60 ms of every turn.
// Inside a transaction the one client still takes them in order, so the home's snapshot holds.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Db, Row } from '../lib/db.js';
import { loadBuddyState } from '../modules/buddy/state.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

/** The pool, counting how many reads are on their way at the same time. */
function counting(db: Db): { db: Db; peak: () => number } {
  let inFlight = 0;
  let peak = 0;
  const track = async <T>(run: () => Promise<T>): Promise<T> => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    try {
      return await run();
    } finally {
      inFlight--;
    }
  };
  const wrapped: Db = {
    query: <R extends Row = Row>(text: string, params?: readonly unknown[]) =>
      track(() => db.query<R>(text, params)),
    one: <R extends Row = Row>(text: string, params?: readonly unknown[]) =>
      track(() => db.one<R>(text, params)),
    maybeOne: <R extends Row = Row>(text: string, params?: readonly unknown[]) =>
      track(() => db.maybeOne<R>(text, params)),
    tx: (fn) => db.tx(fn),
  };
  return { db: wrapped, peak: () => peak };
}

describe.skipIf(!dbReady)("Buddy's state reads", () => {
  let env: TestEnv;
  let l: Learner;

  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-10-14T13:30:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterAll(async () => env.close());

  it('go out side by side on the pool', async () => {
    const { db, peak } = counting(env.db);
    const sequential = await loadBuddyState(env.db, l.learnerId, env.deps.now());
    const parallel = await loadBuddyState(db, l.learnerId, env.deps.now());
    // Many independent reads at once, not one after the other.
    expect(peak()).toBeGreaterThanOrEqual(8);
    // And the same state either way.
    expect(parallel).toEqual(sequential);
  });
});
