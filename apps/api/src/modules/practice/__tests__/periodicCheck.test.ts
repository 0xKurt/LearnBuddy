// Questions about the periodic table (issue #250): each one held to the key code computes from
// the element data, each broken one dropped for its own reason (Regel 0: rejected, never repaired).

import { describe, expect, it } from 'vitest';

import { PERIODIC_ITEMS, table } from '../../../testing/scenarios/periodic.js';
import { ItemDraft, itemsOneByOne, usableItems } from '../items.js';
import { figureIsRejectedPeriodic } from '../periodicCheck.js';

const [neutrons, , cls, en, radius, protons] = PERIODIC_ITEMS as [
  (typeof PERIODIC_ITEMS)[number],
  ...(typeof PERIODIC_ITEMS)[number][],
];

/** What survives of one written item, through the same path a generated set takes. */
function kept(raw: Record<string, unknown>, locale = 'de') {
  return usableItems(itemsOneByOne(ItemDraft, 25).parse([raw]), { locale });
}

describe('periodic-table questions are held to the key code computes', () => {
  it('keeps every question of the walkthrough', () => {
    expect(
      usableItems(itemsOneByOne(ItemDraft, 25).parse(PERIODIC_ITEMS), { locale: 'de' }),
    ).toHaveLength(PERIODIC_ITEMS.length);
  });

  it('a count: exactly the whole number, no unit, no rounding', () => {
    expect(kept(neutrons!)[0]?.tolerance).toBeNull();
    expect(kept({ ...neutrons, answer: '17' })).toHaveLength(0);
    expect(kept({ ...neutrons, answer: '18.4' })).toHaveLength(0);
    expect(kept({ ...neutrons, unit: 'u' })).toHaveLength(0);
    // A count asked as a short text is not a number question: its key is not checked, so it goes.
    expect(kept({ ...neutrons, kind: 'short' })).toHaveLength(0);
    // Hydrogen's most common atom has no neutron at all.
    expect(
      kept({ ...neutrons, answer: '0', figure: table('main', ['H'], 'neutrons', 'H') }),
    ).toHaveLength(1);
  });

  it('the group as the drawn table numbers it', () => {
    const group = (v: 'main' | 'full', answer: string) =>
      kept({ ...protons, answer, figure: table(v, ['S'], 'group', 'S') });
    expect(group('main', '6')).toHaveLength(1);
    expect(group('main', '16')).toHaveLength(0);
    expect(group('full', '16')).toHaveLength(1);
    expect(group('full', '6')).toHaveLength(0);
  });

  it('a class: code writes the three options, the model only points', () => {
    expect(kept(cls!)[0]?.choices).toEqual(['Metall', 'Halbmetall', 'Nichtmetall']);
    expect(kept({ ...cls, correct_choice: 0 })).toHaveLength(0);
    expect(kept({ ...cls, prompt_lang: 'fr' })[0]?.choices).toEqual([
      'métal',
      'métalloïde',
      'non-métal',
    ]);
  });

  it('a trend: the options are the marked elements, the key is computed', () => {
    expect(kept(en!)[0]).toMatchObject({ choices: ['Na', 'Mg', 'Cl'], answer: 'Cl' });
    expect(kept({ ...en, correct_choice: 1 })).toHaveLength(0);
    expect(kept(radius!)[0]).toMatchObject({ choices: ['Li', 'Na', 'K'], answer: 'K' });
    // Across a group and a period, the position does not decide it.
    expect(
      kept({ ...radius, figure: table('main', ['Li', 'Mg', 'K'], 'radius_max') }),
    ).toHaveLength(0);
  });

  it('drops a question whose table does not hold, and only a periodic table', () => {
    expect(figureIsRejectedPeriodic(table('main', ['Fe'], 'protons', 'Fe'))).toBe(true);
    expect(figureIsRejectedPeriodic(table('full', ['Xy']))).toBe(true);
    expect(figureIsRejectedPeriodic({ ...table('full', []), v: 'all' })).toBe(true);
    expect(figureIsRejectedPeriodic(table('full', ['Fe'], 'protons', 'Fe'))).toBe(false);
    expect(figureIsRejectedPeriodic({ type: 'table', header: ['a'], rows: [['b']] })).toBe(false);
    expect(kept({ ...protons, figure: table('main', ['Fe'], 'protons', 'Fe') })).toHaveLength(0);
  });

  it('keeps a plain table to look at, but no number about it', () => {
    const look = { ...cls, prompt: 'Welches Element steht links von Kohlenstoff?', answer: 'B' };
    expect(
      kept({
        ...look,
        kind: 'short',
        choices: null,
        correct_choice: null,
        figure: table('main', ['C']),
      }),
    ).toHaveLength(1);
    expect(kept({ ...protons, figure: table('full', ['Fe']) })).toHaveLength(0);
  });
});
