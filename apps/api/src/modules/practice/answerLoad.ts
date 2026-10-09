// Answering one question, step 1 of `answerItem` (answer.ts, #311): the run and the question,
// loaded and guarded. A turn sent again gets its first answer back; an answer that cannot be one
// here — the test's time is up, the run is answered another way, the question is closed or is
// answered by speaking — is refused before anything is judged. docs/architecture.md §Practice.

import { type AnswerRequest, type AnswerResponse } from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import { AppError } from '../../lib/errors.js';
import { CARD_PASS } from './cards.js';
import { DRILL_PASS } from './drill.js';
import { admitText } from './essay.js';
import {
  replayOrLoad,
  type ItemRow,
  type PracticeLearner,
  type SessionItemRow,
} from './service.js';
import { settleTestClock, timeUpError } from './testClock.js';

/** What `answerItem` was asked for: an answer, „Tipp", or her question (#391). */
export type AnswerAsk = {
  /** Her question through `POST …/ask` (#391): help like „Tipp", never graded. */
  question: boolean;
  /** „Tipp" or her question: a request for help, never an answer to grade. */
  hintRequest: boolean;
};

/** The answer as every later step reads it: who, in which run, to which question, and how. */
export type Answering = Exclude<
  Awaited<ReturnType<typeof loadAnswer>>,
  { replayed: AnswerResponse }
>;

export async function loadAnswer(
  deps: Deps,
  learner: PracticeLearner,
  sessionId: string,
  input: AnswerRequest,
  { question, hintRequest }: AnswerAsk,
) {
  const first = await replayOrLoad(deps, learner.id, sessionId, input.client_turn_id);
  if ('replayed' in first) return first;
  const { session } = first;
  const now = deps.now();
  // A timed test (issue #241): an answer that arrives after the time is up is not graded — no
  // rule, no model, no turn — and the test ends with what she had answered in time.
  if ((await settleTestClock(deps.db, learner.id, sessionId, now)) === 'time_up') {
    throw timeUpError();
  }
  if (session.status !== 'active') throw new AppError('conflict', 'Session has ended');
  // One path per session (issue #147): a flashcard pass is turned over, never answered,
  // hinted at or revealed. The pass was decided when it started, so the server refuses the
  // other way in rather than letting two kinds of evidence meet on one question.
  if (session.pass === CARD_PASS && !question) {
    throw new AppError('conflict', 'These are cards: you say yourself whether you knew it', {
      reason: 'use_cards',
    });
  }
  // A Kopfrechnen round (issue #243) is answered through its own door, which checks by code
  // and never reaches the tutor; this path would call the model on a second miss.
  if (session.pass === DRILL_PASS) {
    throw new AppError('conflict', 'A quick round is answered on its pad', {
      reason: 'use_drill',
    });
  }
  const item = await deps.db.maybeOne<
    ItemRow & SessionItemRow & { extracted_text: string | null; subject_kind: string | null }
  >(
    `select i.*, si.status, si.attempts, si.hints_used, si.prepared_hints_used, si.first_try_correct,
            si.position, si.item_id,
            m.extracted_text, s.kind as subject_kind
       from session_items si join items i on i.id = si.item_id left join materials m on m.id = i.material_id
       left join subjects s on s.id = i.subject_id
      where si.session_id = $1 and si.item_id = $2`,
    [sessionId, input.item_id],
  );
  if (!item) throw new AppError('not_found', 'Question not in this session');
  if (item.status !== 'open') throw new AppError('conflict', 'This question is already closed');

  if (item.kind === 'speak' && !question) {
    throw new AppError('conflict', 'This question is answered by speaking', {
      reason: 'use_speak',
    });
  }
  // A Diktat has no written hint (issue #242): a hint about a word she is to spell would spell it,
  // and writing one would be a model call. The help is hearing it again, slower — on the card.
  if (hintRequest && !question && item.kind === 'spelling_dictation') {
    throw new AppError('conflict', 'The help here is hearing it again', { reason: 'no_hints' });
  }
  // Only a long text takes up to 12 000 characters, and it is never a test question (#258).
  admitText(item.kind, session.mode, input.text);
  /** A version of her long text: feedback per key point, never a verdict (`essay.ts`, #258). */
  const essay = item.kind === 'essay' && !hintRequest;
  return { learner, sessionId, input, session, item, now, question, hintRequest, essay };
}
