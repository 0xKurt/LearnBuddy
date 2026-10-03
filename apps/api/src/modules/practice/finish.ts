// The end of a run (docs/architecture.md §Practice, "Session lifecycle"): finished in the
// transaction that closes its last question (audit H-12), with Buddy's step given its evidence
// and Buddy woken to plan next. Used by every writer that can close a question.

import type { Db } from '../../lib/db.js';
import { emitEvent } from '../buddy/events.js';
import { bumpContext } from '../buddy/plan.js';
import { DRILL_PASS } from './drill.js';
import { stillPreparing, type SessionRow, SESSION_COLS } from './sessionRow.js';

/**
 * Finish the (locked, active) session: Buddy's step gets its evidence — done only if
 * something was answered, else back to prepared — and Buddy is woken to plan next.
 */
export async function finishLocked(
  db: Db,
  learnerId: string,
  s: SessionRow,
  now: Date,
): Promise<void> {
  const counts = await db.one<{ answered: number; first_try: number; total: number }>(
    `select count(*) filter (where status <> 'open' and flagged_at is null)::int as answered,
            count(*) filter (where first_try_correct)::int as first_try,
            count(*)::int as total
       from session_items where session_id = $1`,
    [s.id],
  );
  await db.query(
    `update practice_sessions set status = 'finished', finished_at = $2, last_activity_at = $2 where id = $1`,
    [s.id, now],
  );
  if (s.step_id) {
    if (counts.answered > 0) {
      await db.query(
        `update buddy_steps set state = 'done', done_source = 'evidence', finished_at = $2, version = version + 1,
                                evidence = $3
          where id = $1 and state in ('planned','prepared','in_progress')`,
        [s.step_id, now, { session_id: s.id, ...counts }],
      );
    } else {
      // Nothing answered: the step is still open, not "done".
      await db.query(
        `update buddy_steps set state = 'prepared', version = version + 1 where id = $1 and state = 'in_progress'`,
        [s.step_id],
      );
    }
  }
  // A Kopfrechnen round wakes nobody (issue #243): Buddy's follow-up is a model call, and a
  // round is twenty seconds of practice with zero of them. Buddy still sees it in STATE.
  if (counts.answered > 0 && s.pass !== DRILL_PASS) {
    await emitEvent(db, learnerId, { type: 'session_finished', sessionId: s.id }, now, counts);
  }
  await bumpContext(db, learnerId);
}

/**
 * Once no question is open any more, the session is finished on the server — in the same
 * transaction as the answer that closed the last one, so a lost /finish call (network, a
 * killed app) never leaves an answered session invisible and Buddy's step without evidence
 * (audit H-12). The caller holds the session lock.
 *
 * Unless the rest of the questions is still being written (issue #220, trap 1): then "nothing
 * open" means she was faster than the generator, not that the run is over. Finishing here would
 * end a practice after three questions and hand Buddy's step its evidence, and the six questions
 * still being written would land in a run that already has a result.
 */
export async function finishIfComplete(
  db: Db,
  learnerId: string,
  sessionId: string,
  now: Date,
): Promise<boolean> {
  const s = await db.maybeOne<SessionRow>(
    `select ${SESSION_COLS} from practice_sessions
      where id = $1 and learner_id = $2 for update`,
    [sessionId, learnerId],
  );
  if (!s || s.status !== 'active') return false;
  if (stillPreparing(s, now)) return false;
  const open = await db.one<{ n: number }>(
    `select count(*)::int as n from session_items where session_id = $1 and status = 'open'`,
    [sessionId],
  );
  if (open.n > 0) return false;
  await finishLocked(db, learnerId, s, now);
  return true;
}
