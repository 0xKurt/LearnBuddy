// Answering one question, step 7 of `answerItem` (answer.ts, #311): the judgement applied in one
// transaction behind the session lock — her turn and Buddy's reply, a key that learns, the
// question's state, a similar task after a shown solution and, when it closes, FSRS. A concurrent
// duplicate of the same answer gets the first one's result (`settleTurn`). docs/architecture.md
// §Practice.

import type { AnswerResponse } from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import { AppError } from '../../lib/errors.js';
import type { AnswerCase, Judged } from './answerJudge.js';
import { noSingleSolution } from './evaluate.js';
import { reviewItem, type ItemOutcome } from './fsrs.js';
import { MAX_ACCEPTED } from './items.js';
import { givesHints, learnsFsrs } from './modeRules.js';
import { nextSeq, settleTurn, touchRun, type SessionItemRow } from './service.js';
import { lockActiveSession } from './sessionRow.js';
import { followWithSimilar } from './similar.js';
import { partsVia } from './structured.js';
import { recordExplained } from './teachBack.js';

function outcomeOf(si: { status: string; first_try_correct: boolean | null }): ItemOutcome {
  if (si.status === 'correct') return si.first_try_correct ? 'first_try' : 'with_help';
  return 'revealed';
}

export function applyAnswer(
  deps: Deps,
  c: AnswerCase,
  judged: Judged,
  explained: string[],
): Promise<AnswerResponse> {
  const { learner, sessionId, input, session, item, now, text, rule } = c;
  const { structured, partsCheck } = c;
  return settleTurn(
    deps,
    learner.id,
    sessionId,
    item.id,
    input.client_turn_id,
    judged.verdict,
    () =>
      deps.db.tx(async (tx) => {
        // The session row first (one order everywhere): an answer to a session that ended
        // meanwhile is refused behind the same lock, and closing the last question finishes it.
        await lockActiveSession(tx, learner.id, sessionId);
        const si = await tx.one<SessionItemRow>(
          `select item_id, position, status, attempts, hints_used, prepared_hints_used, first_try_correct
           from session_items where session_id = $1 and item_id = $2 for update`,
          [sessionId, item.id],
        );
        if (si.status !== 'open') throw new AppError('conflict', 'This question is already closed');
        const seq = await nextSeq(tx, sessionId);
        await tx.query(
          `insert into practice_turns (session_id, learner_id, item_id, seq, role, text, verdict, evaluated_by, client_turn_id)
         values ($1, $2, $3, $4, 'learner', $5, $6, $7, $8)`,
          [
            sessionId,
            learner.id,
            item.id,
            seq,
            text,
            judged.verdict,
            judged.evaluatedBy,
            input.client_turn_id,
          ],
        );
        await tx.query(
          `insert into practice_turns (session_id, learner_id, item_id, seq, role, text, gave_hint, revealed, essay_feedback, later)
         values ($1, $2, $3, $4, 'tutor', $5, $6, $7, $8, $9)`,
          [
            sessionId,
            learner.id,
            item.id,
            seq + 1,
            judged.reply,
            judged.gaveHint,
            judged.revealed,
            judged.essay ? JSON.stringify(judged.essay) : null,
            judged.offersLater ? 'offered' : null,
          ],
        );
        // The key learns: an answer the model judged right that the rules did not know
        // is accepted by the rules next time — at once and without a model.
        //
        // Two limits, because this is the one place where a MODEL judgement becomes a RULE and
        // then outlives everything (issue #227, finding 3):
        //
        //   - never in a test. There the model judges with less context, its reply is thrown
        //     away and replaced, and nobody reads what it decided — the worst possible moment
        //     to make one of its judgements permanent.
        //   - never past MAX_ACCEPTED, the same ceiling the reading prompts name. Without it the
        //     list grows without end, every entry widens what counts as right, and a key that
        //     accepts everything accepts a wrong answer too. Postgres does the counting, so two
        //     answers arriving at once cannot both slip past a check done in code.
        //   - never an answer that is the key of another question beside it — of the same
        //     material, or of this session where a question has no material (a topic, Buddy):
        //     "the teacher" judged right for "der Schüler" would otherwise become a rule that
        //     makes the two questions interchangeable, and that is a model mistake, not a synonym.
        if (
          judged.evaluatedBy === 'model' &&
          judged.verdict === 'correct' &&
          rule === 'unknown' &&
          (item.kind === 'vocab' || item.kind === 'short') &&
          session.mode !== 'help' &&
          session.mode !== 'test' &&
          text.trim().length <= 80
        ) {
          await tx.query(
            `update items set accepted_answers = array_append(accepted_answers, $3)
            where id = $1 and learner_id = $2 and not ($3 = any(accepted_answers))
              and coalesce(array_length(accepted_answers, 1), 0) < $4
              and not exists (
                select 1 from items other
                 where other.learner_id = $2 and other.id <> items.id
                   and (other.material_id = items.material_id
                        or other.id in (select item_id from session_items where session_id = $5))
                   and lower($3) in (select lower(btrim(k))
                                       from unnest(array_prepend(other.answer, other.accepted_answers)) k))`,
            [item.id, learner.id, text.trim(), MAX_ACCEPTED, sessionId],
          );
        }
        // A version of her long text is a try though nothing was graded (#258).
        const attempted =
          (judged.verdict !== null && judged.verdict !== 'not_an_attempt') || !!judged.essay;
        const attempts = si.attempts + (attempted ? 1 : 0);
        const hints = si.hints_used + (judged.gaveHint ? 1 : 0);
        const moved = si.prepared_hints_used + (judged.usedPrepared ? 1 : 0);
        // Past a step of the way she wrote herself (#298): the ladder never goes back.
        const prepared = Math.max(moved, judged.ownStep ?? 0);
        let status: SessionItemRow['status'] = 'open';
        let firstTry: boolean | null = si.first_try_correct;
        if (judged.verdict === 'correct') {
          status = 'correct';
          firstTry = si.attempts === 0 && si.hints_used === 0;
        } else if (judged.revealed) {
          status = 'revealed';
          firstTry = false;
        } else if (session.mode === 'test' && attempted) {
          // One try per question in a test.
          status = 'missed';
          firstTry = false;
        }
        // Working on a task she set aside brings it back in line (deferred_at cleared).
        await tx.query(
          `update session_items set attempts = $3, hints_used = $4, status = $5, first_try_correct = $6,
                                  closed_at = case when $5 = 'open' then null else $7::timestamptz end,
                                  deferred_at = null, prepared_hints_used = $8,
                                  -- How the CLOSING answer was given (issue #163); an open
                                  -- question keeps nothing, a tap is not production.
                                  answered_by = case when $5 = 'open' then null else $9::text end
          where session_id = $1 and item_id = $2`,
          [
            sessionId,
            item.id,
            attempts,
            hints,
            status,
            firstTry,
            now,
            prepared,
            // Arranging parts is tapping (issue #163), unless the app says otherwise — and a
            // cloze without a word bank can only be typed (issue #232).
            input.via ?? (partsCheck && structured ? partsVia(structured) : 'typed'),
          ],
        );
        await recordExplained(tx, sessionId, item.id, explained);
        // The solution shown: a similar task comes right after it (#388, `similar.ts`).
        if (status === 'revealed' && givesHints(session.mode)) {
          await followWithSimilar(tx, learner.id, sessionId, item.id);
        }
        // A free text she did not get right produces NO review: `Again` is a statement about
        // memory, and nothing here was measured (issue #197). Got right, it counts like any
        // other question. The cost is that such a question does not come back on a schedule —
        // which is the honest price for not inventing the rating.
        const rateable = status === 'correct' || !noSingleSolution(item);
        if (status !== 'open' && learnsFsrs(session.mode) && rateable) {
          // What the spaced repetition held BEFORE this review is recorded by `reviewItem`
          // itself (`session_items.state_before`, issue #164), from the same read that
          // overwrites it — so a judgement she says is wrong can be taken back without
          // costing her the history from earlier sessions.
          await reviewItem(
            tx,
            learner.id,
            sessionId,
            item.id,
            outcomeOf({ status, first_try_correct: firstTry }),
            now,
          );
        }
        await touchRun(tx, learner.id, sessionId, now);
      }),
  );
}
