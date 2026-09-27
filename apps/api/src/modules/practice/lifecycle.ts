// How long a session stays open, and what closes it (docs/architecture.md §Practice, session
// lifecycle; decision D-5, audit I-3/I-4):
// - a session finishes on the server when its last question closes (service.ts
//   finishIfComplete), whatever happens to the app's /finish call;
// - "Beenden" in homework help with open tasks is a pause; the help session stays resumable
//   for 14 days after her last activity, from the home card and from the sheet;
// - every other session left alone for 3 days is abandoned, and the step it belonged to goes
//   back to 'prepared' so Buddy can offer it again. A session with nothing open left (its
//   finish was lost before this rule existed) is finished instead, with its evidence.

import type { Deps } from '../../deps.js';
import { bumpContext } from '../buddy/plan.js';
import { finishIfComplete } from './service.js';

export const HELP_IDLE_MS = 14 * 86_400_000;
export const PRACTICE_IDLE_MS = 3 * 86_400_000;

/** How long a session may rest before it is closed (and until then offered to resume). */
export function idleLimitMs(mode: 'practice' | 'test' | 'help' | 'explain'): number {
  return mode === 'help' ? HELP_IDLE_MS : PRACTICE_IDLE_MS;
}

/** Still offered to go on with: open, with something open, and not rested past its limit. */
export function resumable(
  s: {
    status: string;
    mode: 'practice' | 'test' | 'help' | 'explain';
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
 * The scheduler's sweep: sessions idle past their limit are finished (nothing open) or
 * abandoned (their step back to 'prepared'). Bounded per run; each session in its own
 * transaction behind the session lock, so an answer arriving at the same moment wins or waits.
 */
export async function closeIdleSessions(deps: Deps, limit = 200): Promise<number> {
  const now = deps.now();
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
        mode: 'practice' | 'test' | 'help' | 'explain';
        step_id: string | null;
        last_activity_at: Date;
      }>(
        `select status, mode, step_id, last_activity_at from practice_sessions
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
  return closed;
}
