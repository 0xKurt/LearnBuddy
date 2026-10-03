// A practice test with time, on her wish only (issue #241, docs/architecture.md §Practice): the
// server keeps the clock (CLAUDE.md rule 7). It starts the first time she opens the test, an
// answer after the time is up is not graded, and a test whose time ran out ends with what she
// answered in time — open questions are "nicht beantwortet", never wrong.

import type { SessionView } from '@learnbuddy/shared-types/contracts';

import type { Db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { finishLocked } from './finish.js';
import { loadSession, lockSession, type SessionRow } from './sessionRow.js';

/**
 * How long after the deadline an answer still counts: what it may have spent on the network.
 * Her tap on "Prüfen" at 0:01 left must not be lost to a slow connection; anything that arrives
 * later than this was not given in time. Small on purpose — it is an allowance for the network,
 * not extra time.
 */
export const TIME_UP_GRACE_MS = 20_000;

/** The time of this test is up for good: past its deadline plus the network allowance. */
function timeIsUp(s: Pick<SessionRow, 'deadline_at'>, now: Date): boolean {
  return s.deadline_at !== null && now.getTime() > s.deadline_at.getTime() + TIME_UP_GRACE_MS;
}

export type TestClock = 'none' | 'running' | 'time_up';

/**
 * The clock of a timed test, settled for this moment (issue #241). The one place it moves:
 *
 * - the first time she opens the test, its deadline is set — from the app clock (rule 7), not
 *   when the test was written: Buddy prepares an offered test while she still reads his reply
 *   (issue #48), and those seconds are not hers to lose;
 * - once the time is up for good (`timeIsUp`), the test is ended in the same transaction, like a
 *   test she handed in: what she answered stands, and every question still open is "nicht
 *   beantwortet" — never wrong (`summarize` counts only closed questions).
 *
 * Every call that could act on a timed test goes through here first, so an answer, a skip and a
 * look at the test all see the same clock. 404 for a session that is not hers.
 */
export async function settleTestClock(
  db: Db,
  learnerId: string,
  sessionId: string,
  now: Date,
): Promise<TestClock> {
  const seen = await loadSession(db, learnerId, sessionId);
  if (seen.time_limit_minutes === null) return 'none';
  // Nothing to write: running, or already over (the answer to it is the same every time).
  if (seen.deadline_at !== null && (!timeIsUp(seen, now) || seen.status !== 'active')) {
    return timeIsUp(seen, now) ? 'time_up' : 'running';
  }
  if (seen.deadline_at === null && seen.status !== 'active') return 'none';
  return db.tx(async (tx) => {
    const s = await lockSession(tx, learnerId, sessionId);
    if (s.time_limit_minutes === null) return 'none';
    if (s.deadline_at === null) {
      if (s.status !== 'active') return 'none';
      await tx.query(
        `update practice_sessions set deadline_at = $2, last_activity_at = $3 where id = $1`,
        [s.id, new Date(now.getTime() + s.time_limit_minutes * 60_000), now],
      );
      return 'running';
    }
    if (!timeIsUp(s, now)) return 'running';
    if (s.status === 'active') await finishLocked(tx, learnerId, s, now);
    return 'time_up';
  });
}

/** The answer to anything she sends after her time was up: not graded, and said why. */
export function timeUpError(): AppError {
  return new AppError('conflict', 'The time for this test is up', { reason: 'time_up' });
}

/** What the app is told about the clock of a timed test; null for every other run. */
export function timerOf(s: SessionRow, now: Date): SessionView['timer'] {
  if (s.time_limit_minutes === null) return null;
  const limitMs = s.time_limit_minutes * 60_000;
  const remaining =
    s.status !== 'active'
      ? 0
      : s.deadline_at === null
        ? limitMs
        : Math.max(0, Math.min(limitMs, s.deadline_at.getTime() - now.getTime()));
  return {
    minutes: s.time_limit_minutes,
    remaining_ms: Math.round(remaining),
    // Ended at or after the deadline: the time ran out, it was not handed in early. Whether
    // the app's own countdown, an answer that came too late or the scheduler ended it.
    ran_out:
      s.status === 'finished' &&
      s.deadline_at !== null &&
      s.finished_at !== null &&
      s.finished_at.getTime() >= s.deadline_at.getTime(),
  };
}
