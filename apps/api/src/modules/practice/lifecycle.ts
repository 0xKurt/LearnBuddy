// How long a session stays open, and what closes it (docs/architecture.md §Practice, session
// lifecycle; decision D-5, audit I-3/I-4):
// - a session finishes on the server when its last question closes (service.ts
//   finishIfComplete), whatever happens to the app's /finish call;
// - "Beenden" in homework help with open tasks is a pause; the help session stays resumable
//   for 14 days after her last activity, from the home card and from the sheet;
// - every other session left alone for 3 days is abandoned, and the step it belonged to goes
//   back to 'prepared' so Buddy can offer it again. A session with nothing open left (its
//   finish was lost before this rule existed) is finished instead, with its evidence;
// - a test she sat with time ends once its time is up (issue #241, service.ts settleTestClock).

import type { Deps } from '../../deps.js';
import type { Db } from '../../lib/db.js';
import { bumpContext } from '../buddy/plan.js';
import { finishIfComplete } from './finish.js';
import { settleTestClock, TIME_UP_GRACE_MS } from './testClock.js';

const HELP_IDLE_MS = 14 * 86_400_000;
export const PRACTICE_IDLE_MS = 3 * 86_400_000;

/** How long a session may rest before it is closed (and until then offered to resume). */
function idleLimitMs(mode: 'practice' | 'test' | 'help'): number {
  return mode === 'help' ? HELP_IDLE_MS : PRACTICE_IDLE_MS;
}

/** Still offered to go on with: open, with something open, and not rested past its limit. */
export function resumable(
  s: {
    status: string;
    mode: 'practice' | 'test' | 'help';
    last_activity_at: Date;
    answered: number;
    total: number;
  },
  now: Date,
): boolean {
  return (
    s.status === 'active' &&
    s.answered < s.total &&
    now.getTime() - s.last_activity_at.getTime() < idleLimitMs(s.mode)
  );
}

/**
 * The run a start request already made, by its request id — null when there is none yet.
 *
 * An offer's card sends the offer's id as the request id, so the same card always opens the same
 * run (issue #48). A run the sweep below closed after three days of rest ('abandoned') answered
 * her "Los geht's" with "Diese Übung ist schon beendet": a practice that read as finished at the
 * moment she started it (issue #643). Her tap is new activity, so that run goes on where she left
 * it — its questions are still hers and nothing of it was finished. A finished run stays finished:
 * its card already says so (`finished_session_id`).
 */
export async function runOfRequest(
  db: Db,
  learnerId: string,
  requestId: string,
  now: Date,
): Promise<string | null> {
  const existing = await db.maybeOne<{ id: string; status: string }>(
    `select id, status from practice_sessions where learner_id = $1 and client_request_id = $2`,
    [learnerId, requestId],
  );
  if (!existing) return null;
  if (existing.status === 'abandoned') {
    await db.query(
      `update practice_sessions set status = 'active', last_activity_at = $2
        where id = $1 and status = 'abandoned'`,
      [existing.id, now],
    );
    // Buddy's STATE lists open runs: what he knows changed (rule 4).
    await bumpContext(db, learnerId);
  }
  return existing.id;
}

/**
 * The scheduler's sweep: sessions idle past their limit are finished (nothing open) or
 * abandoned (their step back to 'prepared'). Bounded per run; each session in its own
 * transaction behind the session lock, so an answer arriving at the same moment wins or waits.
 */
export async function closeIdleSessions(deps: Deps, limit = 200): Promise<number> {
  const now = deps.now();
  // A timed test whose time is up ends now, not three days later (issue #241): her result and
  // Buddy's evidence should not wait until she happens to open the app again. The instant is
  // the app clock's, passed in (rule 7); `settleTestClock` decides it again behind the lock.
  const late = await deps.db.query<{ id: string; learner_id: string }>(
    `select id, learner_id from practice_sessions
      where status = 'active' and deadline_at is not null and deadline_at < $1
      order by deadline_at limit $2`,
    [new Date(now.getTime() - TIME_UP_GRACE_MS), limit],
  );
  let timedOut = 0;
  for (const s of late) {
    if ((await settleTestClock(deps.db, s.learner_id, s.id, now)) === 'time_up') timedOut++;
  }
  const idle = await deps.db.query<{ id: string; learner_id: string }>(
    `select id, learner_id from practice_sessions
      where status = 'active'
        and last_activity_at < case when mode = 'help' then $1::timestamptz else $2::timestamptz end
      order by last_activity_at limit $3`,
    [new Date(now.getTime() - HELP_IDLE_MS), new Date(now.getTime() - PRACTICE_IDLE_MS), limit],
  );
  let closed = 0;
  for (const s of idle) {
    await deps.db.tx(async (tx) => {
      const row = await tx.maybeOne<{
        status: string;
        mode: 'practice' | 'test' | 'help';
        step_id: string | null;
        last_activity_at: Date;
      }>(
        // Sessions of the removed explain mode (issue #70) age like practice.
        `select status, case when mode = 'explain' then 'practice' else mode end as mode,
                step_id, last_activity_at from practice_sessions
          where id = $1 for update`,
        [s.id],
      );
      // Answered meanwhile, or closed by someone else: nothing to do.
      if (
        !row ||
        row.status !== 'active' ||
        now.getTime() - row.last_activity_at.getTime() < idleLimitMs(row.mode)
      ) {
        return;
      }
      if (await finishIfComplete(tx, s.learner_id, s.id, now)) {
        closed++;
        return;
      }
      await tx.query(`update practice_sessions set status = 'abandoned' where id = $1`, [s.id]);
      if (row.step_id) {
        await tx.query(
          `update buddy_steps set state = 'prepared', version = version + 1
            where id = $1 and state = 'in_progress'`,
          [row.step_id],
        );
      }
      await bumpContext(tx, s.learner_id);
      closed++;
    });
  }
  return closed + timedOut;
}
