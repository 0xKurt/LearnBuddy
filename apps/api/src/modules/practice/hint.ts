// "Tipp" (docs/architecture.md §Practice): the next prepared hint for an open question, at once and
// without a model; with none prepared, the tutor writes one. A use case of its own, beside answering
// (answer.ts), which it reuses for the tutor's hint.

import { type AnswerResponse, type HintRequest } from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import { isUniqueViolation } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { t } from '../../i18n/index.js';
import { lockActiveSession } from './sessionRow.js';
import { CARD_PASS } from './cards.js';
import { DRILL_PASS } from './drill.js';
import { offersHintButton } from './modeRules.js';
import { mentionsSolution } from './tutor.js';
import { answerItem } from './answer.js';
import {
  nextSeq,
  replayOrLoad,
  replayTurn,
  solutionsOf,
  type ItemRow,
  type PracticeLearner,
  type SessionItemRow,
} from './service.js';

class NoPreparedHint extends Error {}

/**
 * "Tipp": the next prepared hint for an open question, at once and without a model;
 * with none prepared (yet), the tutor writes one like for "weiß nicht".
 * Recorded as a learner turn ("Tipp, bitte") and a tutor turn; idempotent per
 * client_turn_id; 409 for a closed question or in a test. In homework help a prepared hint
 * is used only when it does not state the solution; otherwise the tutor writes one, under
 * the same leak check as every homework reply (user feedback #7).
 */
export async function hintItem(
  deps: Deps,
  learner: PracticeLearner,
  sessionId: string,
  input: HintRequest,
): Promise<AnswerResponse> {
  const first = await replayOrLoad(deps, learner.id, sessionId, input.client_turn_id);
  if ('replayed' in first) return first.replayed;
  const { session } = first;
  if (session.status !== 'active') throw new AppError('conflict', 'Session has ended');
  if (
    !offersHintButton(session.mode) ||
    session.pass === CARD_PASS ||
    session.pass === DRILL_PASS
  ) {
    throw new AppError('conflict', 'No hints in this mode', { reason: 'no_hints' });
  }
  const now = deps.now();
  try {
    await deps.db.tx(async (tx) => {
      await lockActiveSession(tx, learner.id, sessionId);
      const si = await tx.maybeOne<
        {
          status: SessionItemRow['status'];
          hints_used: number;
          prepared_hints_used: number;
          hints: string[];
        } & Pick<
          ItemRow,
          'kind' | 'prompt' | 'answer' | 'accepted_answers' | 'choices' | 'correct_choice' | 'unit'
        >
      >(
        `select si.status, si.hints_used, si.prepared_hints_used, i.hints, i.kind, i.prompt, i.answer, i.accepted_answers,
                i.choices, i.correct_choice, i.unit
           from session_items si join items i on i.id = si.item_id
          where si.session_id = $1 and si.item_id = $2 and i.learner_id = $3
          for update of si`,
        [sessionId, input.item_id, learner.id],
      );
      if (!si) throw new AppError('not_found', 'Question not in this session');
      if (si.status !== 'open') throw new AppError('conflict', 'This question is already closed');
      const hint = si.hints[si.prepared_hints_used];
      if (hint === undefined) throw new NoPreparedHint();
      if (
        session.mode === 'help' &&
        solutionsOf(si).some((sol) => mentionsSolution(hint, sol, si.prompt))
      ) {
        throw new NoPreparedHint();
      }
      const seq = await nextSeq(tx, sessionId);
      await tx.query(
        `insert into practice_turns (session_id, learner_id, item_id, seq, role, text, verdict, evaluated_by, client_turn_id)
         values ($1, $2, $3, $4, 'learner', $5, 'not_an_attempt', 'rule', $6)`,
        [
          sessionId,
          learner.id,
          input.item_id,
          seq,
          t(learner.locale, 'practice.hint_request'),
          input.client_turn_id,
        ],
      );
      await tx.query(
        `insert into practice_turns (session_id, learner_id, item_id, seq, role, text, gave_hint, revealed)
         values ($1, $2, $3, $4, 'tutor', $5, true, false)`,
        [sessionId, learner.id, input.item_id, seq + 1, hint],
      );
      await tx.query(
        `update session_items set hints_used = hints_used + 1,
                                  prepared_hints_used = prepared_hints_used + 1, deferred_at = null
          where session_id = $1 and item_id = $2`,
        [sessionId, input.item_id],
      );
      await tx.query(`update practice_sessions set last_activity_at = $2 where id = $1`, [
        sessionId,
        now,
      ]);
    });
  } catch (err) {
    // None prepared (yet, or used up): the tutor writes one, as for "weiß nicht".
    if (err instanceof NoPreparedHint) {
      return answerItem(
        deps,
        learner,
        sessionId,
        {
          client_turn_id: input.client_turn_id,
          item_id: input.item_id,
          text: t(learner.locale, 'practice.hint_request'),
        },
        { hintRequest: true },
      );
    }
    if (isUniqueViolation(err)) {
      const r = await replayTurn(deps, learner.id, sessionId, input.client_turn_id);
      if (r) return r;
    }
    throw err;
  }
  const replayedNow = await replayTurn(deps, learner.id, sessionId, input.client_turn_id);
  if (!replayedNow) throw new AppError('internal', 'hint missing');
  return replayedNow;
}
