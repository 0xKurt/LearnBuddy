// Buddy's state is read side by side, not one round trip after the other (issue #637): the chat
// turn waited for ~17 sequential reads of independent tables before the model was even asked —
// at the production distance (3.2 ms a round trip, #447) that alone was ~60 ms of every turn.
// Inside a transaction the one client still takes them in order, so the home's snapshot holds.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Db, Row } from '../lib/db.js';
import { bumpContext } from '../modules/buddy/plan.js';
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
    // Many independent reads at once, not one after the other: the core's six at least, and a
    // domain's own beside them (issue #107: a core copy has only the six).
    expect(peak()).toBeGreaterThanOrEqual(6);
    // And the same state either way.
    expect(parallel).toEqual(sequential);
  });

  // The fence (CLAUDE.md rule 4): the version a decision is checked against must never be newer
  // than the data it was made on. Here a goal and its bump commit after the goals were read: a
  // state that carries the new version but not the new goal would let the fence pass a decision
  // made on old data. Read first, the version can only be older — and the fence then stops it.
  it('never carries a version newer than the data it read', async () => {
    let goalsRead: () => void = () => undefined;
    const goalsDone = new Promise<void>((r) => (goalsRead = r));
    let wrote: Promise<number> | null = null;
    const write = () =>
      env.db.tx(async (tx) => {
        await tx.query(
          `insert into buddy_goals (learner_id, kind, title, due_date)
           values ($1, 'exam', 'Neue Arbeit', '2026-11-01')`,
          [l.learnerId],
        );
        return bumpContext(tx, l.learnerId);
      });
    const held: Db = {
      query: async <R extends Row = Row>(text: string, params?: readonly unknown[]) => {
        if (/from buddy_goals g/.test(text)) {
          const rows = await env.db.query<R>(text, params);
          wrote = write();
          goalsRead();
          return rows;
        }
        return env.db.query<R>(text, params);
      },
      one: <R extends Row = Row>(text: string, params?: readonly unknown[]) =>
        env.db.one<R>(text, params),
      maybeOne: async <R extends Row = Row>(text: string, params?: readonly unknown[]) => {
        // The version read waits until the goals were read and the write committed — or, when
        // it goes first (as it must), a moment, and then reads before anything changed.
        if (/from buddy_settings/.test(text)) {
          const first = await Promise.race([
            goalsDone.then(() => true),
            new Promise<boolean>((r) => setTimeout(() => r(false), 300)),
          ]);
          if (first && wrote) await wrote;
        }
        return env.db.maybeOne<R>(text, params);
      },
      tx: (fn) => env.db.tx(fn),
    };
    const state = await loadBuddyState(held, l.learnerId, env.deps.now());
    const bumped = wrote ? await wrote : null;
    const hasNewGoal = state.goals.some((g) => g.title === 'Neue Arbeit');
    if (state.settings.context_version === bumped) expect(hasNewGoal).toBe(true);
    else expect(state.settings.context_version).toBeLessThan(bumped ?? Infinity);
  });
});
