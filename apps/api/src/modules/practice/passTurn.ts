// One turn of a pass that code alone records (docs/architecture.md §Practice): a card she turned
// over (issue #147, cards.ts) or a task of a Kopfrechnen round (issue #243, drill.ts). Both are
// the same frame around their own step — idempotent per `client_turn_id`, the session row locked
// first (one lock order), refused when the run is another kind of pass, then the run's activity
// touched and the run closed with its last turn in the same transaction (audit H-12). A
// concurrent duplicate of the same tap reads what the winner wrote.

import type { SessionView } from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import { isUniqueViolation, type Db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { sessionView, touchRun, type PracticeLearner } from './service.js';
import { lockActiveSession, type SessionRow } from './sessionRow.js';

/** Has this very tap already been recorded? (Idempotency, like an answer: issue #163.) */
async function alreadyRecorded(db: Db, sessionId: string, clientTurnId: string): Promise<boolean> {
  const turn = await db.maybeOne<{ id: string }>(
    `select id from practice_turns where session_id = $1 and client_turn_id = $2`,
    [sessionId, clientTurnId],
  );
  return turn !== null;
}

export async function passTurn(
  deps: Deps,
  learner: PracticeLearner,
  sessionId: string,
  clientTurnId: string,
  /** The pass this turn belongs to, and how a run of another kind refuses it. */
  only: { pass: NonNullable<SessionRow['pass']>; message: string; reason: string },
  /** Her turn itself, inside the transaction. */
  record: (tx: Db, now: Date) => Promise<void>,
): Promise<SessionView> {
  const now = deps.now();
  const view = () => sessionView(deps.db, learner.id, sessionId, deps.storage, deps.now());
  if (await alreadyRecorded(deps.db, sessionId, clientTurnId)) return view();
  try {
    await deps.db.tx(async (tx) => {
      const s = await lockActiveSession(tx, learner.id, sessionId);
      if (s.pass !== only.pass) {
        throw new AppError('conflict', only.message, { reason: only.reason });
      }
      // The same tap sent twice at once: the second one waited on the lock above and now finds
      // the first one's turn — that is its answer, not a second try at a closed question.
      if (await alreadyRecorded(tx, sessionId, clientTurnId)) return;
      await record(tx, now);
      await touchRun(tx, learner.id, sessionId, now);
    });
  } catch (err) {
    if (isUniqueViolation(err) && (await alreadyRecorded(deps.db, sessionId, clientTurnId))) {
      return view();
    }
    throw err;
  }
  return view();
}
