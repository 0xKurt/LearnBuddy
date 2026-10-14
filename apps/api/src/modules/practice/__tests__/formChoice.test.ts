// What the filter after a choice of forms takes out, and that it says so (#664, audit F10; the
// Zweitaudit probe `codex/probes.mts`).

import { FractionFigure } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { keepChosen, keptAndLost } from '../formChoice.js';

const figure = { type: 'fraction', shape: 'bar', fractions: [{ parts: 4, filled: 3 }] };
const before = {
  items: [
    { prompt: 'Berechne 2+2', answer: '4' },
    { prompt: 'Welcher Bruch ist markiert?', answer: '3/4', figure },
  ],
  structured: [{ type: 'order', prompt: 'Ordne', elements: ['a', 'b'] }],
  part_tasks: [{ prompt: 'Teil a' }],
  more_items: false,
  not_practicable: [],
  unclear: [],
};

describe('keptAndLost (#664)', () => {
  it('names every task it drops: a valid figure not chosen, a form not chosen', () => {
    expect(FractionFigure.safeParse(figure).success).toBe(true);
    const { kept, lost } = keptAndLost(before, { forms: new Set(), figures: new Set() });
    expect((kept as typeof before).items).toEqual([before.items[0]]);
    expect(lost).toEqual([
      { at: 'items[1]', kind: 'figure', name: 'fraction' },
      { at: 'part_tasks[0]', kind: 'form', name: 'part_tasks' },
      { at: 'structured[0]', kind: 'form', name: 'order' },
    ]);
  });

  it('loses nothing when everything written was chosen, or nothing was narrowed', () => {
    const all = { forms: new Set(['order', 'part_tasks']), figures: new Set(['fraction']) };
    expect(keptAndLost(before, all).lost).toEqual([]);
    expect(keptAndLost(before, null)).toEqual({ kept: before, lost: [] });
  });

  it('keepChosen keeps what it kept before', () => {
    const keep = { forms: new Set<string>(), figures: new Set<string>() };
    expect(keepChosen(before, keep)).toEqual(keptAndLost(before, keep).kept);
  });
});
