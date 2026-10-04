// Questions about diagrams (issue #247): a diagram that does not hold costs its question, and a
// gap's key may stand nowhere else in its picture (Regel 0: rejected, never repaired).

import { describe, expect, it } from 'vitest';

import {
  controlLoop,
  DIAGRAM_ITEMS,
  foodChain,
  waterCycle,
} from '../../../testing/scenarios/diagrams.js';
import { ItemDraft, itemsOneByOne, usableItems } from '../items.js';
import { figureIsRejected } from '../wholeFigure.js';

const [gapA, , wordBank] = DIAGRAM_ITEMS as [
  (typeof DIAGRAM_ITEMS)[number],
  ...(typeof DIAGRAM_ITEMS)[number][],
];

/** What survives of one written item, through the same path a generated set takes. */
function kept(raw: Record<string, unknown>) {
  return usableItems(itemsOneByOne(ItemDraft, 25).parse([raw]), { locale: 'de' });
}

describe('diagram questions', () => {
  it('keeps every question of the walkthrough', () => {
    expect(
      usableItems(itemsOneByOne(ItemDraft, 25).parse(DIAGRAM_ITEMS), { locale: 'de' }),
    ).toHaveLength(DIAGRAM_ITEMS.length);
  });

  it('drops a broken diagram with its question, not just the drawing', () => {
    const orphan = { ...waterCycle, e: waterCycle.e.slice(0, 3) };
    expect(figureIsRejected(orphan)).toBe(true);
    expect(kept({ ...gapA, figure: orphan })).toHaveLength(0);
    // An arrow to a box that is not there does not even parse; still the question goes.
    const nowhere = { ...foodChain, e: [...foodChain.e, { a: 3, b: 9, l: '' }] };
    expect(figureIsRejected(nowhere)).toBe(true);
    expect(kept({ ...wordBank, figure: nowhere })).toHaveLength(0);
    expect(figureIsRejected(controlLoop)).toBe(false);
    expect(figureIsRejected({ type: 'fraction' })).toBe(false);
  });

  it('drops a gap whose answer the picture already shows', () => {
    // "Niederschlag" stands in a box of its own figure.
    expect(kept({ ...gapA, answer: 'Niederschlag' })).toHaveLength(0);
    expect(kept({ ...gapA, accepted_answers: ['Kondensation', 'Verdunstung'] })).toHaveLength(0);
    // On an arrow too: the control loop's sensor reports the "Istwert".
    expect(
      kept({ ...gapA, prompt: 'Was fehlt?', answer: 'Istwert', figure: controlLoop }),
    ).toHaveLength(0);
    // A word bank's right option counts as its key.
    expect(
      kept({ ...wordBank, answer: 'Fuchs', choices: ['Fuchs', 'Hai'], correct_choice: 0 }),
    ).toHaveLength(0);
  });

  it('asks a gap only as a short answer or a word bank', () => {
    expect(kept({ ...gapA, kind: 'long' })).toHaveLength(0);
    expect(kept({ ...gapA, kind: 'numeric', answer: '3' })).toHaveLength(0);
  });

  it('lets a question without a gap name what the diagram shows', () => {
    const noGap = { ...waterCycle, n: ['Verdunstung', 'Kondensation', 'Niederschlag', 'Abfluss'] };
    const asked = {
      ...gapA,
      prompt: 'Was folgt im Wasserkreislauf auf die Verdunstung?',
      answer: 'Kondensation',
      accepted_answers: [],
      figure: noGap,
    };
    expect(kept(asked)).toHaveLength(1);
  });
});
