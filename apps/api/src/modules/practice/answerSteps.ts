// Answering one question, step 3 of `answerItem` (answer.ts, #311): what follows from her earlier
// answers and the steps already shown — a part that goes on correctly from her wrong earlier
// result (Folgefehler), her line in a guided example, the next prepared hint and where the ladder
// ends, and whether a wrong choice left only one option untried. Code alone.
// docs/architecture.md §Practice.

import type { Deps } from '../../deps.js';
import type { Answering } from './answerLoad.js';
import type { Ruled } from './answerRules.js';
import { pickAnswers, untriedPicks } from './bars.js';
import type { RuleVerdict } from './evaluate.js';
import { ladderDone } from './ladder.js';
import { givesHints } from './modeRules.js';
import { pointStepText } from './pointSteps.js';
import { earlierAnswers, followsOn, taskPartOf } from './taskParts.js';
import { guidedStep } from './workedSteps.js';

/** The verdict after the follow-on, and the steps and choices around it. */
export type Stepped = Awaited<ReturnType<typeof followOnAndSteps>>;

export async function followOnAndSteps(deps: Deps, a: Answering & Ruled) {
  const { learner, sessionId, session, item, hintRequest, text, barTask, byKey, pointsLadder } = a;
  // A part of a task in parts that goes on correctly from her WRONG earlier result is right
  // (Folgefehler, issue #297): code recomputes it with her numbers (`taskParts.ts`).
  const taskPart = taskPartOf(item.task_part);
  const part = hintRequest || byKey === 'correct' ? null : taskPart;
  const followed = part
    ? followsOn(part, item, text, await earlierAnswers(deps.db, sessionId, part))
    : null;
  const rule: RuleVerdict = followed ? 'correct' : byKey;
  // An explanation's ladder is its key points (#298, `pointSteps.ts`), any other's its hints.
  const nextHint = pointsLadder
    ? pointsLadder.next && pointStepText(learner.locale, pointsLadder.next)
    : givesHints(session.mode)
      ? (item.hints[item.prepared_hints_used] ?? null)
      : null;
  /** The end of the hint ladder: for an explanation, when no point is left to show. */
  const atLadderEnd = pointsLadder ? pointsLadder.done : ladderDone(item);
  // Mitmachen (#298, `workedSteps.ts`): her line once a step of a proven way was shown.
  const guided =
    hintRequest || !givesHints(session.mode)
      ? null
      : guidedStep({ ...item, form_free: barTask !== null }, item.prepared_hints_used, text);
  // Two options and one was wrong: tapping the other one is no knowledge. A wrong choice that
  // leaves a single untried option closes the question with the solution explained — shown,
  // never right (user feedback #9).
  // The same holds for two bars she compares (issue #162): once one of them is ruled out,
  // tapping the other is elimination, not knowledge.
  const twoBars = barTask !== null && pickAnswers(barTask) !== null;
  let onlyOneLeft = false;
  if (
    givesHints(session.mode) &&
    rule === 'incorrect' &&
    ((item.kind === 'multiple_choice' && item.choices !== null) || twoBars)
  ) {
    const wrong = await deps.db.query<{ text: string }>(
      `select distinct text from practice_turns
        where session_id = $1 and item_id = $2 and role = 'learner' and verdict = 'incorrect'`,
      [sessionId, item.id],
    );
    const said = [...wrong.map((w) => w.text), text];
    const untried = untriedPicks(barTask, said);
    if (untried !== null) {
      onlyOneLeft = untried.length <= 1;
    } else if (item.choices) {
      const tried = new Set(said);
      onlyOneLeft = item.choices.filter((c) => !tried.has(c)).length <= 1;
    }
  }
  return { taskPart, followed, rule, nextHint, atLadderEnd, guided, onlyOneLeft };
}
