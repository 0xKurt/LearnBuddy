// A practice session's row as code reads it, and the one way to lock it (docs/architecture.md
// §Practice): every writer locks the session row first, so an answer, a reveal and the end of the
// run cannot cross. Another learner's session is not found.

import type { SessionMode, TestMinutes } from '@learnbuddy/shared-types/contracts';

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
  pass: 'cards' | 'drill' | null;
  /**
   * The range of a Kopfrechnen round (migration 0082, issue #243) — set exactly when `pass` is
   * 'drill'. Read through `drillViewOf`, never trusted as it stands.
   */
  drill: unknown;
  /**
   * Set while the rest of this run's questions is still being written (migration 0073,
   * issue #220); null for every run that was written in one go. Never compared in SQL — see
   * `stillPreparing`.
   */
  items_pending_until: Date | null;
  /** A test she asked to sit with time: its minutes (migration 0083, issue #241). */
  time_limit_minutes: TestMinutes | null;
  /** When that time is up; set the first time she opens the test (`settleTestClock`). */
  deadline_at: Date | null;
  finished_at: Date | null;
};

/**
 * The session columns as code reads them. Sessions of the removed explain mode (issue #70)
 * are served as plain practice — their stored `mode` and `intro` stay in the database
 * untouched (migrations are immutable), but nothing shows or writes them any more.
 */
export const SESSION_COLS = `id, learner_id, step_id, goal_id,
       case when mode = 'explain' then 'practice' else mode end as mode, status, title, pass,
       items_pending_until, drill, time_limit_minutes, deadline_at, finished_at`;

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
  change: (tx: Db, s: SessionRow, now: Date) => Promise<void>,
  opts: { active: boolean } = { active: true },
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
export async function lockSession(
  db: Db,
  learnerId: string,
  sessionId: string,
): Promise<SessionRow> {
  const s = await db.maybeOne<SessionRow>(
    `select ${SESSION_COLS} from practice_sessions
      where id = $1 and learner_id = $2 for update`,
    [sessionId, learnerId],
  );
  if (!s) throw new AppError('not_found', 'Session not found');
  return s;
}

/**
 * Is this run still waiting for the rest of its questions (issue #220)? The one place that
 * decides it, because two different answers would mean a run that cannot be finished in one
 * code path and is finished behind its own back in the other.
 *
 * The deadline is compared against the app clock, never against SQL `now()` (CLAUDE.md rule 7):
 * past it the run is complete with the questions it has, so a refill that never arrived costs
 * her the extra questions and never her result.
 */
export function stillPreparing(s: Pick<SessionRow, 'items_pending_until'>, now: Date): boolean {
  return s.items_pending_until !== null && s.items_pending_until.getTime() > now.getTime();
}

/** Her session as it stands (not locked); another's is not found. */
export async function loadSession(
  db: Db,
  learnerId: string,
  sessionId: string,
): Promise<SessionRow> {
  const s = await db.maybeOne<SessionRow>(
    `select ${SESSION_COLS} from practice_sessions
      where id = $1 and learner_id = $2`,
    [sessionId, learnerId],
  );
  if (!s) throw new AppError('not_found', 'Session not found');
  return s;
}
