// A question about a solid, a cube net or a point in space (issue #255). Its key is COMPUTED
// from the figure, and the model's key must agree with it — or the question is not asked
// (Regel 0, "reject, never repair"; docs/architecture.md §Practice, Solids).
//
// The figure says what its key is (`ask`); code computes it in @learnbuddy/shared-math
// (`solids.ts`, `space.ts`) and holds the question to it:
//
//   · vertices, edges, faces (a polyhedron, by its kind) and the number of the square opposite
//     another one on a cube net are whole numbers, and the key must be exactly that number;
//   · volume and surface area are number questions WITH a unit: the key's unit (its own or the
//     item's) must be a volume or an area, and its number the computed one in that unit —
//     written exactly or rounded at the precision it is written in (`numberKeyTolerance`, the
//     chart rule), so 113,1 cm³ for a cylinder of 113,097… cm³;
//   · "Ist das ein Würfelnetz?" is multiple choice whose options code WRITES, in the question's
//     language, and the model's `correct_choice` must point at what folding says;
//   · a point's coordinates and a vector are written as a point, "(2|3|1)", and must be the
//     computed ones; a distance is a number like a volume, without a unit;
//   · a number asked about such a figure that declares no key is dropped: it could not be
//     checked.
// Four cube nets as the OPTIONS of a multiple choice ("Welches ist ein Würfelnetz?") hold only
// when exactly one of them is the odd one out — the only one that folds, or the only one that
// does not — and `correct_choice` points at it (`netChoiceHolds`).
//
// Since #368: "Welcher Körper entsteht aus diesem Netz?" is multiple choice whose options code
// WRITES (the four solids of `NET_KINDS`, in that order, in the question's language) and
// the model's `correct_choice` must point at the net's own kind. A Würfelgebäude's cube count is
// a whole number like a vertex count; "Welche Ansicht …?" is multiple choice whose OPTIONS are
// views, exactly one of them the building's (`viewsHold`).

import {
  axesKey,
  cubesKey,
  isCubeNet,
  isNetKind,
  isSpaceFigure,
  NET_KINDS,
  netKey,
  solidKey,
  spaceProblem,
  viewChoiceHolds,
  type SolidKind,
} from '@learnbuddy/shared-math';
import type { Figure } from '@learnbuddy/shared-types/contracts';

import { t } from '../../i18n/index.js';
import { asLocale } from './chartRead.js';
import { exactCount, measured } from './figureKey.js';
import type { ItemDraft } from './items.js';
import { samePoint } from './systems.js';

/**
 * The item with its solid, net or point question checked, the item unchanged when it asks
 * nothing code could compute, or null when it is not asked at all.
 */
export function checkedSpace<T extends ItemDraft>(it: T, locale: string | null): T | null {
  const f = it.figure;
  if (f === null || !isSpaceFigure(f)) return it;
  if (spaceProblem(f) !== null) return null;
  if (f.ask === 'none') return it.kind === 'numeric' ? null : it;

  switch (f.type) {
    case 'solid': {
      const key = solidKey(f);
      if (key === null) return null;
      if (key.kind === 'count') return exactCount(it, key.n);
      if (key.kind === 'kind') return whichSolid(it, key.k, locale);
      return measured(it, key.value, key.unit);
    }
    case 'cubes': {
      const key = cubesKey(f);
      if (key === null) return null;
      if (key.kind === 'count') return exactCount(it, key.n);
      // A view: the options are its pictures, held by `choiceProblem` (`viewsHold`).
      return it.kind === 'multiple_choice' && (it.choice_figures?.length ?? 0) > 0 ? it : null;
    }
    case 'cube_net': {
      const key = netKey(f);
      if (key === null) return null;
      if (key.kind === 'opposite') return exactCount(it, key.n);
      const lang = asLocale(it.prompt_lang) ?? asLocale(locale);
      if (lang === null || it.kind !== 'multiple_choice') return null;
      const correct = key.folds ? 0 : 1;
      if (it.correct_choice !== correct) return null;
      const choices = [t(lang, 'practice.solid.net_yes'), t(lang, 'practice.solid.net_no')];
      return { ...it, choices, answer: choices[correct]!, accepted_answers: [], tolerance: null };
    }
    case 'axes3d': {
      const key = axesKey(f);
      if (key === null) return null;
      if (key.kind === 'distance') return measured(it, key.value, null);
      if (it.kind !== 'short') return null;
      const same = samePoint(`(${key.c.join('|')})`, it.answer);
      return same === 'correct' || same === 'other_form' ? it : null;
    }
  }
}

/** "Welcher Körper entsteht?": the options written here, the model's index held to the net's kind. */
function whichSolid<T extends ItemDraft>(it: T, k: SolidKind, locale: string | null): T | null {
  const lang = asLocale(it.prompt_lang) ?? asLocale(locale);
  if (!isNetKind(k)) return null;
  const correct = NET_KINDS.indexOf(k);
  if (lang === null || it.kind !== 'multiple_choice' || it.correct_choice !== correct) return null;
  const choices = NET_KINDS.map((kind) => t(lang, `practice.solid.kind_${kind}`));
  return {
    ...it,
    choices,
    answer: choices[correct]!,
    accepted_answers: [],
    tolerance: null,
    choice_figures: null,
  };
}

/**
 * Views as the options of a multiple choice about a Würfelgebäude (#368): the question's own
 * figure is the building, every option a view, exactly one of them the building's in the asked
 * direction, and the right option that one (`viewChoiceHolds`).
 */
export function viewsHold(
  building: Figure | null | undefined,
  figures: readonly Figure[],
  correct: number,
): boolean {
  if (!building || building.type !== 'cubes') return false;
  const views = figures.flatMap((f) => (f.type === 'cubes' ? [f] : []));
  return views.length === figures.length && viewChoiceHolds(building, views, correct);
}

/**
 * Cube nets as the options of a multiple choice: every option a net that holds, exactly one of
 * them the odd one out (the only one that folds, or the only one that does not), and the right
 * option that one. Which of the two the question asks for is language; the odd one out is the
 * one answer either reading has.
 */
export function netChoiceHolds(figures: readonly Figure[], correct: number): boolean {
  const folds: boolean[] = [];
  for (const f of figures) {
    if (f.type !== 'cube_net' || spaceProblem(f) !== null) return false;
    folds.push(isCubeNet(f.c));
  }
  const yes = folds.filter(Boolean).length;
  const odd =
    yes === 1 ? folds.indexOf(true) : yes === folds.length - 1 ? folds.indexOf(false) : -1;
  return folds.length >= 3 && odd === correct;
}
