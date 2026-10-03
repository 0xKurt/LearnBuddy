// The fixed replies the rules give before any model call: which near miss goes to the tutor,
// which reply names a place and which names the answer, and the sentence for each (issues #146,
// #207, #209, #212, #274). Their own file so `service.ts` stays within its size
// (docs/engineering-guards.md, rule 4).

import { t, type MessageKey } from '../../i18n/index.js';
import { equationDetail, type RuleVerdict, type TypoShape } from './evaluate.js';
import type { ItemRow } from './service.js';
import { checkPath } from './steps.js';

/**
 * A vocabulary answer that is only missing its first word goes to the tutor (issue #146).
 *
 * The rules can see THAT a word is missing, never WHICH: "vélo" for "le vélo" forgot the
 * article and is what the owner wants counted right — "du sport" for "faire du sport"
 * dropped the verb and is not. Telling those apart needs the language, not a list of
 * articles per language the app would have to keep for every language a child might learn
 * (CLAUDE.md rule 3). So the model judges, as it does for every other undecidable case,
 * and the fixed reply ("da fehlt noch ein Wort") stops being the answer — it never said
 * which word, which is exactly why "sie wusste nicht was los ist" (owner, 30.09.).
 */
export function articleMissing(rule: RuleVerdict, item: { kind: string }): boolean {
  return rule === 'missing_word' && item.kind === 'vocab';
}

/** The fixed, kind reply to a near miss the rules found (a slip shows the spelling instead). */
/**
 * Near misses whose fixed reply names a PLACE and nothing else: which line of her path stopped
 * following (issue #209), which atom does not add up or which factor is still in every coefficient
 * (issue #212). They carry no solution — a line number is not a calculation, and "count the H
 * again: 4 on the left, 2 on the right" is not the balanced equation.
 */
const LOCATED = new Set<RuleVerdict>([
  'step_broke',
  'unbalanced',
  'not_lowest',
  // "That is still the task's own term" names no solution either: it says what is NOT done yet,
  // so it holds in homework help too (issue #235).
  'not_transformed',
]);

/**
 * Whether the fixed near-miss reply may be used here (issue #274).
 *
 * Homework help never shows the solution, so the fixed replies that DO show it — the spelling of a
 * slip above all — stay out of that mode and the tutor judges instead. That was written as "no
 * fixed reply in homework at all", and it threw away the most precise hint there is: the server
 * knew which step broke and answered with a general question from the hint ladder instead, at the
 * cost of a model call it did not need.
 *
 * So the line is drawn where it belongs: a reply that names a PLACE is a hint and holds in every
 * mode; a reply that names the ANSWER still never reaches homework help.
 */
export function locatedOrNotHelp(rule: RuleVerdict, session: { mode: string }): boolean {
  return LOCATED.has(rule) || session.mode !== 'help';
}

export const NEAR_MISS_REPLY: Partial<Record<RuleVerdict, MessageKey>> = {
  spelling: 'practice.spelling',
  close: 'practice.accents',
  missing_word: 'practice.missing_word',
  not_transformed: 'practice.not_transformed',
};

/**
 * Where a written path stops following itself (issue #209). The line numbers are the ones she
 * sees; the last step gets its own sentence, because "bis Zeile 2 stimmt alles" reads oddly
 * when there are only three lines and the one that broke is the final one.
 */
export function pathReply(locale: string, text: string): string | null {
  const path = checkPath(text);
  if (path.kind !== 'broke') return null;
  return path.line === path.lines - 1
    ? t(locale, 'practice.step_broke_last')
    : t(locale, 'practice.step_broke', { line: String(path.line) });
}

/**
 * What a counted equation says, with the place in it (issue #212). The element symbol is the
 * same in every language, so it goes in as it stands.
 */
export function equationReply(locale: string, item: ItemRow, text: string): string | null {
  const d = equationDetail(item, text);
  if (!d) return null;
  if (d.verdict === 'not_lowest') {
    return t(locale, 'practice.not_lowest', { factor: String(d.factor) });
  }
  const i = d.imbalance;
  const sides = { left: String(i.left), right: String(i.right) };
  switch (i.kind) {
    case 'charge':
      return t(locale, 'practice.unbalanced_charge', sides);
    // A nuclear equation (issue #263): the place is which of the two numbers does not add up.
    case 'mass_number':
      return t(locale, 'practice.unbalanced_mass', sides);
    case 'atomic_number':
      return t(locale, 'practice.unbalanced_atomic', sides);
    case 'element':
      return t(locale, 'practice.unbalanced_element', { element: i.element, ...sides });
  }
}

/**
 * The FIRST answer to a typo: what slipped, not the word (issue #207). A missing accent was
 * always answered this way ("schau nochmal auf die Akzente") and a typo was not — it was
 * answered with the correct spelling at once, so what followed was copying and the "Richtig"
 * after it claimed more than had happened.
 */
export const TYPO_REPLY: Record<TypoShape, MessageKey> = {
  missing: 'practice.typo_missing',
  extra: 'practice.typo_extra',
  swapped: 'practice.typo_swapped',
  wrong: 'practice.typo_wrong',
};
