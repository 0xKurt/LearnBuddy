// One answer to one question (docs/architecture.md §Practice): checked by rules where exactness is
// decidable, otherwise by the tutor model with structured output, then applied in one transaction
// behind the session lock — the turn, the question's state and, when it closes, FSRS. A use case
// of its own beside the start and the view (`service.ts`, `sessionView.ts`), like "Tipp"
// (`hint.ts`) and "Lösung zeigen" (`setAside.ts`).
//
// The steps, one file each (#311):
//   1. load and guard the run and the question (answerLoad.ts);
//   2. the rules' verdict on what she answered (answerRules.ts);
//   3. what follows from earlier answers and shown steps (answerSteps.ts);
//   4. the judgement code gives alone (answerJudge.ts) — a long text is judged by essay.ts;
//   5. the tutor for what is left (answerTutor.ts);
//   6. the reply she gets, whoever judged (answerReply.ts);
//   7. applied in one transaction (answerApply.ts).

import type { AnswerRequest, AnswerResponse } from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import { applyAnswer } from './answerApply.js';
import { judgeByRules, type AnswerCase } from './answerJudge.js';
import { loadAnswer } from './answerLoad.js';
import { finishReply } from './answerReply.js';
import { ruleVerdict } from './answerRules.js';
import { followOnAndSteps } from './answerSteps.js';
import { tutorJudgement } from './answerTutor.js';
import { judgeEssay } from './essay.js';
import type { PracticeLearner } from './service.js';

export async function answerItem(
  deps: Deps,
  learner: PracticeLearner,
  sessionId: string,
  input: AnswerRequest,
  opts: {
    /** "Tipp" with no prepared hint left: a request for help, never an answer to grade. */
    hintRequest?: boolean;
    /**
     * Her question through `POST …/ask` (issue #391, `routes.ts`): help like "Tipp" — never graded,
     * never a try — but on every form, never the end of the ladder, and a hint only if one came.
     */
    question?: boolean;
  } = {},
): Promise<AnswerResponse> {
  const question = opts.question === true;
  const hintRequest = opts.hintRequest === true || question;
  const loaded = await loadAnswer(deps, learner, sessionId, input, { question, hintRequest });
  if ('replayed' in loaded) return loaded.replayed;
  const ruled = { ...loaded, ...(await ruleVerdict(deps, loaded)) };
  const c: AnswerCase = { ...ruled, ...(await followOnAndSteps(deps, ruled)) };
  const byCode = c.essay ? await judgeEssay(deps, learner, c.item, c.text) : judgeByRules(c);
  const { judged, explained, columnStep } = finishReply(
    c,
    byCode ? { judged: byCode, claims: [], safeguarded: false } : await tutorJudgement(deps, c),
  );
  const settled = await applyAnswer(deps, c, judged, explained);
  return columnStep === null ? settled : { ...settled, column_step: columnStep };
}
