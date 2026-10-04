// A question about a diagram (issue #247): boxes with arrows, a gap lettered A, B, C in a box.
// docs/architecture.md §Practice, Diagrams. Regel 0, "reject, never repair":
//
//   · the diagram itself must hold (`diagramProblem`, @learnbuddy/shared-math `diagram.ts`) —
//     a broken one costs the question before the item is even parsed (`wholeFigure.ts`);
//   · a diagram with a gap is a gap question: a short answer or a word bank (multiple choice),
//     and its key — the right option, the answer and every accepted answer — may stand nowhere
//     else in the picture, neither in a box nor on an arrow. "Was gehört in Lücke A?" with the
//     answer printed next to it asks nothing.
//
// Which gap the prompt names is language and is not checked here (CLAUDE.md rule 3): the key is
// held to what code can see — that it is not already shown.

import { diagramProblem, diagramShows, isDiagram, isGap } from '@learnbuddy/shared-math';

import type { ItemDraft } from './items.js';

/** The item when its diagram and gap hold (or it has no diagram), else null. */
export function checkedDiagram<T extends ItemDraft>(it: T | null): T | null {
  const f = it?.figure;
  if (!it || !f || !isDiagram(f)) return it;
  if (diagramProblem(f) !== null) return null;
  if (!f.n.some(isGap)) return it;
  if (it.kind !== 'short' && it.kind !== 'multiple_choice') return null;
  const right =
    it.kind === 'multiple_choice' && it.choices && it.correct_choice !== null
      ? it.choices[it.correct_choice]
      : undefined;
  const keys = [it.answer, ...it.accepted_answers, ...(right === undefined ? [] : [right])];
  return keys.some((key) => diagramShows(f, key)) ? null : it;
}
