// One exchange under a closed question's solution (docs/architecture.md §Practice): her tap and
// Buddy's answer, stored together as practice turns that carry the way she asked. Used by "Anders
// erklären" (`reexplain.ts`) and by „Warum stimmt das?" (`why.ts`, #388). One implementation of
// the lock, the two turns and the replay, so the two can never store an exchange differently.

import type { AnswerResponse, ReexplainWay } from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import { isUniqueViolation, type Db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { nextSeq, replayTurn } from './service.js';

/** What the two turns say: her words (or the chip she tapped) and Buddy's answer. */
export type Exchange = { asked: string; reply: string };

/**
 * Stores her turn and Buddy's for one question, behind the session row's lock, whatever the
 * session's status: the last question's solution may still be on screen after the run finished.
 * `decide` runs inside that transaction, so a check it makes holds when the turns are written.
 * Idempotent per `clientTurnId`: a concurrent duplicate that won gets its result back.
 */
export async function storeExchange(
  deps: Deps,
  learnerId: string,
  sessionId: string,
  turn: { clientTurnId: string; itemId: string; way: ReexplainWay },
  decide: (tx: Db) => Promise<Exchange>,
): Promise<AnswerResponse> {
  const now = deps.now();
  try {
    await deps.db.tx(async (tx) => {
      // The session row first (one order everywhere).
      const locked = await tx.maybeOne<{ status: string }>(
        `select status from practice_sessions where id = $1 and learner_id = $2 for update`,
        [sessionId, learnerId],
      );
      if (!locked) throw new AppError('not_found', 'Session not found');
      if (locked.status === 'abandoned') throw new AppError('conflict', 'Session has ended');
      const { asked, reply } = await decide(tx);
      const seq = await nextSeq(tx, sessionId);
      await tx.query(
        `insert into practice_turns (session_id, learner_id, item_id, seq, role, text, verdict, evaluated_by, client_turn_id, reexplain, created_at)
         values ($1, $2, $3, $4, 'learner', $5, 'not_an_attempt', 'rule', $6, $8, $7)`,
        [sessionId, learnerId, turn.itemId, seq, asked, turn.clientTurnId, now, turn.way],
      );
      await tx.query(
        `insert into practice_turns (session_id, learner_id, item_id, seq, role, text, reexplain, created_at)
         values ($1, $2, $3, $4, 'tutor', $5, $6, $7)`,
        [sessionId, learnerId, turn.itemId, seq + 1, reply, turn.way, now],
      );
      if (locked.status === 'active') {
        await tx.query(`update practice_sessions set last_activity_at = $2 where id = $1`, [
          sessionId,
          now,
        ]);
      }
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const r = await replayTurn(deps, learnerId, sessionId, turn.clientTurnId);
      if (r) return r;
    }
    throw err;
  }
  const done = await replayTurn(deps, learnerId, sessionId, turn.clientTurnId);
  if (!done) throw new AppError('internal', 'exchange missing');
  return done;
}
