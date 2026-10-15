// Distress in a practice answer field (CLAUDE.md rule 18, issues #389, #747): whoever judged her
// answer — code alone, the tutor, the long-text feedback — what she typed is checked for danger to
// herself, and a concern gets the app's fixed help answer by age (`i18n/safeguarding.ts`).
//
// The check never depends on the judgement working. The tutor's own concern bit counts when the
// tutor answered; every other answer in her own words goes to the distress check (`distress.ts`).
// When no check could run at all (outage, timeout, invalid output, the day's limit), it fails
// safe: the reply code gives anyway carries one fixed sentence that names a trusted adult and the
// helpline (`safeguarding.unchecked`). The full help answer for every answer in an outage would be
// a false alarm she learns to skip, and blocking practice would take away what still works; the
// one sentence reaches her if she did tell of danger and stays calm if she did not.
// docs/architecture.md §Practice, "Distress in an answer field".

import { safeguardingText } from '../../i18n/safeguarding.js';
import type { Deps } from '../../deps.js';
import { isMinor } from '../identity/model.js';
import type { AnswerCase, Judged } from './answerJudge.js';
import { distressCheck, type DistressFinding } from './distress.js';
import { NEAR_MISS } from './evaluate.js';
import type { RubricClaim } from './rubric.js';
import { solutionsOf } from './service.js';
import { VALUE_CONFIRMED } from './tutor.js';

/** The judgement of her answer, and what follows from the distress check. */
export type TutorJudgement = {
  judged: Judged;
  /**
   * What the model said about the elements it was asked about. It stays empty when no model was
   * called at all (the rules alone answered, or the model was unavailable) — and then every
   * judged element is `unknown` rather than missing: nobody measured it.
   */
  claims: readonly RubricClaim[];
  /** The app's fixed help answer (#389): nothing may be put on top of it. */
  safeguarded: boolean;
  /** No distress check could run on her words (#747): the reply gets the fixed help line. */
  unchecked: boolean;
};

/**
 * Distress in the answer field, or the provider's safety filter (issue #389): the reply is
 * the app's fixed help answer, the same as in the chat — never the model's words, never a
 * hint, a solution or the test's neutral line on top of it, and never a try.
 */
function safeguard(c: AnswerCase, kind: 'concern' | 'blocked'): Judged {
  return {
    verdict: 'not_an_attempt',
    evaluatedBy: 'rule',
    reply: safeguardingText(c.learner.locale, isMinor(c.learner, c.now), kind),
    gaveHint: false,
    revealed: false,
  };
}

/** Words of two letters or more: a lone letter is a variable ("2x = 8"), a choice or a unit. */
const words = (s: string): number => s.match(/\p{L}{2,}/gu)?.length ?? 0;

/**
 * The words of hers a check has to read, or null when there are none: "Tipp" carries nothing she
 * wrote, a tap or a choice is one of the app's own options, digits, signs and the lone letters of
 * mathematics tell of nothing, and a text code matched to the key (right, or a slip of it) holds
 * no words beyond the key's.
 */
function ownWords(c: AnswerCase): string | null {
  const { input, rule, text } = c;
  if (c.hintRequest && !c.question) return null;
  if (input.via === 'tapped' || (input.text == null && input.parts == null)) return null;
  if (words(text) === 0) return null;
  const matched = rule === 'correct' || NEAR_MISS.has(rule) || VALUE_CONFIRMED.has(rule);
  if (!matched) return text;
  // A structured answer, a note line, a program or a Diktat that code found right is the key's.
  if (c.partsCheck || c.staffCheck || c.codeCheck || c.dictationCheck) return null;
  const longestKey = Math.max(0, ...solutionsOf(c.item).map(words));
  return words(text) > longestKey + 1 ? text : null;
}

/** The fixed help answer as the whole judgement: nothing goes on top of it. */
export function safeguarded(
  c: AnswerCase,
  kind: 'concern' | 'blocked',
  claims: readonly RubricClaim[],
): TutorJudgement {
  return { judged: safeguard(c, kind), claims, safeguarded: true, unchecked: false };
}

/** What a finding makes of the judgement code or a model gave. */
export function settle(
  c: AnswerCase,
  found: DistressFinding,
  given: Omit<TutorJudgement, 'unchecked'>,
): TutorJudgement {
  if (found === 'concern' || found === 'blocked') return safeguarded(c, found, given.claims);
  return { ...given, unchecked: found === 'unchecked' };
}

/** Her words checked for distress, when there are any (`ownWords`). */
export async function checkDistress(deps: Deps, c: AnswerCase): Promise<DistressFinding> {
  const words = ownWords(c);
  return words === null ? 'clear' : distressCheck(deps, c.learner.id, c.item.prompt, words);
}

/** The judgement code gave alone, with her words checked (#747): code grades, it does not listen. */
export async function guardByCode(
  deps: Deps,
  c: AnswerCase,
  judged: Judged,
): Promise<TutorJudgement> {
  return settle(c, await checkDistress(deps, c), { judged, claims: [], safeguarded: false });
}

/** The reply she gets when no check could read her words: the fixed help line after it. */
export function withHelpLine(c: AnswerCase, reply: string): string {
  const line = safeguardingText(c.learner.locale, isMinor(c.learner, c.now), 'unchecked');
  return reply.trim() ? `${reply} ${line}` : line;
}
