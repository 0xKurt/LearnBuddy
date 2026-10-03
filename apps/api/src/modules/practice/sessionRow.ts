// A practice session's row as code reads it, and the one way to lock it (docs/architecture.md
// §Practice): every writer locks the session row first, so an answer, a reveal and the end of the
// run cannot cross. Another learner's session is not found.

import type { SessionMode } from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import type { Db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';

export type SessionRow = {
  id: string;
  learner_id: string;
  step_id: string | null;
  goal_id: string | null;
  mode: SessionMode;
  status: 'active' | 'finished' | 'abandoned';
  title: string | null;
  /**
   * Which kind of pass this run is (migration 0069): null means its questions are answered
   * and checked; 'cards' means the card turns over and she says herself whether she knew it
   * (issue #147, `cards.ts`). Deliberately not a fourth `mode` — a card pass IS practice, and
   * `mode` is read far outside this module, down to `NowCard.mode` in the app's contracts.
   */
  pass: 'cards' | null;
  /**
   * Set while the rest of this run's questions is still being written (migration 0073,
   * issue #220); null for every run that was written in one go. Never compared in SQL — see
   * `stillPreparing`.
   */
  items_pending_until: Date | null;
};

/**
 * The session columns as code reads them. Sessions of the removed explain mode (issue #70)
 * are served as plain practice — their stored `mode` and `intro` stay in the database
 * untouched (migrations are immutable), but nothing shows or writes them any more.
 */
export const SESSION_COLS = `id, learner_id, step_id, goal_id,
       case when mode = 'explain' then 'practice' else mode end as mode, status, title, pass,
       items_pending_until`;

/** The session row, locked, and still running — else 404 / 409 (one lock order: session first). */
export async function lockActiveSession(
  db: Db,
  learnerId: string,
  sessionId: string,
): Promise<SessionRow> {
  const s = await lockSession(db, learnerId, sessionId);
  if (s.status !== 'active') throw new AppError('conflict', 'Session has ended');
  return s;
}

/**
 * A change to her session under its lock (the caller then shows the session as she sees it).
 * The session row is locked first, one order everywhere; `active` refuses one that has ended.
 */
export async function changeSession(
  deps: Deps,
  learnerId: string,
  sessionId: string,
  opts: { active: boolean },
  change: (tx: Db, s: SessionRow, now: Date) => Promise<void>,
): Promise<void> {
  const now = deps.now();
  await deps.db.tx(async (tx) =>
    change(
      tx,
      await (opts.active ? lockActiveSession : lockSession)(tx, learnerId, sessionId),
      now,
    ),
  );
}

/** Her session, locked for this transaction whatever its status; another's is not found. */
async function lockSession(db: Db, learnerId: string, sessionId: string): Promise<SessionRow> {
  const s = await db.maybeOne<SessionRow>(
    `select ${SESSION_COLS} from practice_sessions
      where id = $1 and learner_id = $2 for update`,
    [sessionId, learnerId],
  );
  if (!s) throw new AppError('not_found', 'Session not found');
  return s;
}
