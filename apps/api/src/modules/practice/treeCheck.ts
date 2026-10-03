// A question about a tree (issue #256): a probability tree, a pedigree or an automaton. Its key
// is COMPUTED from the figure, and the model's key must agree with it — or the question is not
// asked (Regel 0, "reject, never repair"; docs/architecture.md §Practice, Trees).
//
// The figure says what its key is (`ask`, or the word `w` of an automaton); code computes it in
// @learnbuddy/shared-math (`trees.ts`, `pedigree.ts`) and holds the question to it:
//
//   · a probability (a path, a sum of paths, the "?" branch) is a number question, and its key
//     must be the computed fraction — written as the fraction, as the decimal, or rounded at the
//     precision it is written in (`numberKeyTolerance`, the chart rule);
//   · "Welcher Erbgang?", "Welchen Genotyp hat Person 5?" and "Wird das Wort akzeptiert?" are
//     multiple choice whose options code WRITES, in the question's language, and the model's
//     `correct_choice` must point at the computed one. A genotype is an option, not typed text:
//     "AA" and "aa" differ only in case, and a written answer is compared without case where
//     spelling does not count (`evaluate.ts`) — "AA" would pass for "aa";
//   · a number asked about a tree that declares no key is dropped: its key could not be checked.
//
// Why the figure declares its key instead of code reading the question: what a sentence asks
// for is language understanding, and a word list standing in for it is what CLAUDE.md rule 3
// forbids. The declaration can be checked; a guess cannot.

import {
  genotypeOptions,
  isTreeFigure,
  MODES,
  accepts,
  possibleGenotypes,
  ratioValue,
  TREE_TYPE_NAMES,
  treeKey,
  treeProblem,
} from '@learnbuddy/shared-math';
import { ModelFigure } from '@learnbuddy/shared-types/contracts';

import { t } from '../../i18n/index.js';
import { asLocale, numberKeyTolerance } from './chartRead.js';
import type { ItemDraft } from './items.js';

/**
 * Whether a raw figure is a tree figure that may not be shown: one whose shape does not parse or
 * that breaks a rule `treeProblem` knows. Read before the item is parsed, because the item's own
 * parse catches a broken figure to null and would hide it (`clipDraft`): "Welcher Erbgang liegt
 * vor?" without its pedigree is no question.
 */
export function figureIsRejectedTree(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return false;
  const type = (raw as { type?: unknown }).type;
  if (typeof type !== 'string' || !(TREE_TYPE_NAMES as readonly string[]).includes(type)) {
    return false;
  }
  const parsed = ModelFigure.safeParse(raw);
  if (!parsed.success) return true;
  return isTreeFigure(parsed.data) && treeProblem(parsed.data) !== null;
}

/** The item with its options and key as code wrote them, if `correct` is the model's choice. */
function fixedChoice<T extends ItemDraft>(it: T, choices: string[], correct: number): T | null {
  if (it.kind !== 'multiple_choice' || it.correct_choice !== correct) return null;
  const right = choices[correct];
  if (right === undefined) return null;
  return { ...it, choices, answer: right, accepted_answers: [], tolerance: null };
}

/**
 * The item with its tree question checked, the item unchanged when it asks nothing code could
 * compute, or null when it is not asked at all.
 */
export function checkedTree<T extends ItemDraft>(it: T, locale: string | null): T | null {
  const f = it.figure;
  if (f === null || !isTreeFigure(f)) return it;
  if (treeProblem(f) !== null) return null;
  const lang = asLocale(it.prompt_lang) ?? asLocale(locale);

  switch (f.type) {
    case 'tree': {
      if (f.ask === 'none') return it.kind === 'numeric' ? null : it;
      const key = treeKey(f);
      if (key === null || it.kind !== 'numeric') return null;
      if (it.unit !== null && it.unit !== '%') return null;
      const value = ratioValue(key) * (it.unit === '%' ? 100 : 1);
      const tolerance = numberKeyTolerance(it.answer, value, 0);
      return tolerance === undefined ? null : { ...it, tolerance };
    }
    case 'pedigree': {
      if (f.ask === 'none') return it.kind === 'numeric' ? null : it;
      if (f.ask === 'mode') {
        if (lang === null) return null;
        const choices = MODES.map((m) => t(lang, `practice.tree.mode_${m}`));
        return fixedChoice(it, choices, MODES.indexOf(f.md));
      }
      const person = f.p[f.at];
      const fits = possibleGenotypes(f.p, f.md, f.at);
      if (!person || fits?.length !== 1) return null;
      const options = genotypeOptions(f.md, person);
      return fixedChoice(
        it,
        options.map((o) => o.text),
        options.findIndex((o) => o.k === fits[0]),
      );
    }
    case 'automaton': {
      if (f.w === '') return it.kind === 'numeric' ? null : it;
      const yes = accepts(f, f.w);
      if (yes === null || lang === null) return null;
      const choices = [t(lang, 'practice.tree.accepted'), t(lang, 'practice.tree.rejected')];
      return fixedChoice(it, choices, yes ? 0 : 1);
    }
  }
}
