// A question about the periodic table (issue #250). Its key is COMPUTED from the element data in
// code, and the model's key must agree with it — or the question is not asked (Regel 0, "reject,
// never repair"; docs/architecture.md §Practice, Periodic table).
//
// The figure declares what is asked (`ask`) and about which element (`at`); code computes the
// key in @learnbuddy/shared-math (`periodic.ts`) and holds the question to it:
//
//   · protons, electrons, neutrons, valence electrons, group, period, shells are number
//     questions, and the key must be exactly the computed whole number (no unit);
//   · "Metall, Halbmetall oder Nichtmetall?" is multiple choice whose three options code WRITES
//     in the question's language;
//   · "Welches Element ist am elektronegativsten / hat das größte Atom?" is multiple choice whose
//     options are the marked elements' symbols, written by code in the order they are marked;
//   · a number asked next to a table that declares no question is dropped: nothing to check it by.
//
// Why the figure declares its question instead of code reading the sentence: what a sentence
// asks for is language understanding, and a word list standing in for it is what CLAUDE.md
// rule 3 forbids. The declaration can be checked; a guess cannot.

import {
  ELEMENT_CLASSES,
  isPeriodicTable,
  periodicAnswerKind,
  periodicKey,
  periodicProblem,
} from '@learnbuddy/shared-math';

import { t } from '../../i18n/index.js';
import { asLocale, numberKeyTolerance } from './chartRead.js';
import type { ItemDraft } from './items.js';
import { fixedChoice } from './treeCheck.js';

/**
 * The item with its periodic-table question checked, the item unchanged when it asks nothing code
 * could compute, or null when it is not asked at all.
 */
export function checkedPeriodic<T extends ItemDraft>(
  it: T | null,
  locale: string | null,
): T | null {
  const f = it?.figure;
  if (!it || !f || !isPeriodicTable(f)) return it;
  if (periodicProblem(f) !== null) return null;
  const kind = periodicAnswerKind(f.ask);
  if (kind === null) return it.kind === 'numeric' ? null : it;
  const key = periodicKey(f);
  if (key === null) return null;
  if (key.kind === 'number') {
    if (kind !== 'number' || it.kind !== 'numeric' || it.unit !== null) return null;
    // A count is a whole number: exactly the computed one, never "about".
    return numberKeyTolerance(it.answer, key.value, 0) === null ? { ...it, tolerance: null } : null;
  }
  if (f.ask === 'class') {
    const lang = asLocale(it.prompt_lang) ?? asLocale(locale);
    if (lang === null) return null;
    const choices = ELEMENT_CLASSES.map((c) => t(lang, `practice.periodic.${c}`));
    return fixedChoice(it, choices, key.index);
  }
  return fixedChoice(it, [...f.hl], key.index);
}
