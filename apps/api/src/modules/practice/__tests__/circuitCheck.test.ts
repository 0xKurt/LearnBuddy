// Questions about circuits, logic nets and Itten's colour wheel (issue #261): each one held to the
// key code computes, each broken one dropped for its own reason (Regel 0: rejected, never
// repaired) — through the same path a generated set takes.

import { describe, expect, it } from 'vitest';

import {
  CIRCUIT_ITEMS,
  logicNet,
  mixedResistors,
  parallelLamps,
  seriesMeter,
  wheelComplement,
} from '../../../testing/scenarios/circuits.js';
import { ItemDraft, itemsOneByOne, usableItems } from '../items.js';
import { figureIsRejected } from '../wholeFigure.js';

const [lit, current, rTotal, out, ones, complement, mix] = CIRCUIT_ITEMS as [
  (typeof CIRCUIT_ITEMS)[number],
  ...(typeof CIRCUIT_ITEMS)[number][],
];

/** What survives of one written item. */
function kept(raw: Record<string, unknown>, locale = 'de') {
  return usableItems(itemsOneByOne(ItemDraft, 25).parse([raw]), { locale });
}

describe('circuit questions are held to the key code computes', () => {
  it('keeps every question of the walkthrough', () => {
    expect(
      usableItems(itemsOneByOne(ItemDraft, 25).parse(CIRCUIT_ITEMS), { locale: 'de' }),
    ).toHaveLength(CIRCUIT_ITEMS.length);
  });

  it('"Leuchtet L2?": code writes the options, the index must point at what code computes', () => {
    const [it0] = kept(lit!);
    expect(it0?.choices).toEqual(['Ja, L2 leuchtet', 'Nein, L2 leuchtet nicht']);
    expect(it0?.answer).toBe('Nein, L2 leuchtet nicht');
    expect(kept({ ...lit, correct_choice: 0 })).toHaveLength(0);
    // In English, the options are English.
    expect(kept({ ...lit, prompt_lang: 'en' }, 'en')[0]?.choices?.[1]).toBe(
      'No, L2 does not light up',
    );
    // L1's switch is closed: it lights.
    expect(kept({ ...lit, figure: parallelLamps('lit', 'L1'), correct_choice: 0 })).toHaveLength(1);
  });

  it('series or parallel only of a circuit that is plainly one', () => {
    const kind = {
      ...lit,
      prompt: 'Ist das eine Reihen- oder eine Parallelschaltung?',
      answer: 'Parallelschaltung',
      choices: ['Reihenschaltung', 'Parallelschaltung'],
      correct_choice: 1,
      figure: parallelLamps('kind'),
    };
    expect(kept(kind)[0]?.choices).toEqual(['Reihenschaltung', 'Parallelschaltung']);
    expect(kept({ ...kind, correct_choice: 0 })).toHaveLength(0);
    // R1 before R2 ∥ R3 is mixed: the question is not asked.
    expect(kept({ ...kind, figure: { ...mixedResistors, ask: 'kind' } })).toHaveLength(0);
  });

  it('a reading: in its unit or converted, exact or rounded at its precision', () => {
    expect(kept(current!)[0]?.tolerance).toBeNull();
    expect(kept({ ...current, answer: '40', unit: 'mA' })).toHaveLength(1);
    expect(kept({ ...current, answer: '0.4' })).toHaveLength(0);
    // A current is not a voltage.
    expect(kept({ ...current, unit: 'V' })).toHaveLength(0);
    expect(kept(rTotal!)).toHaveLength(1);
    expect(kept({ ...rTotal, answer: '500' })).toHaveLength(0);
    // Without the battery's voltage there is no current to compute: dropped.
    expect(kept({ ...current, figure: { ...seriesMeter, u: 0 } })).toHaveLength(0);
  });

  it('a lamp count is a whole number, exactly', () => {
    const count = {
      ...ones,
      prompt: 'Wie viele Lampen leuchten?',
      answer: '1',
      figure: parallelLamps('lit_count'),
    };
    expect(kept(count)).toHaveLength(1);
    expect(kept({ ...count, answer: '2' })).toHaveLength(0);
  });

  it('a circuit that does not hold costs its question before it is parsed', () => {
    const short = { ...parallelLamps('lit_count'), b: [[[{ k: 'switch', r: 0, o: false }]]] };
    expect(figureIsRejected(short)).toBe(true);
    expect(figureIsRejected({ ...seriesMeter, mt: 'R7' })).toBe(true);
    expect(kept({ ...rTotal, figure: short })).toHaveLength(0);
  });

  it('a number about a circuit that declares no key is dropped', () => {
    expect(kept({ ...rTotal, figure: { ...mixedResistors, ask: 'none' } })).toHaveLength(0);
  });
});

describe('logic questions are held to the truth table', () => {
  it('Q for given inputs: the two options code writes, or the number typed', () => {
    expect(kept(out!)[0]?.choices).toEqual(['0', '1']);
    expect(kept({ ...out, correct_choice: 0 })).toHaveLength(0);
    const typed = {
      ...ones,
      prompt: 'Welchen Wert hat Q?',
      answer: '0',
      figure: logicNet('out', [1, 0, 1]),
    };
    expect(kept(typed)).toHaveLength(1);
    expect(kept({ ...typed, answer: '1' })).toHaveLength(0);
  });

  it('how many rows give Q = 1, exactly', () => {
    expect(kept(ones!)).toHaveLength(1);
    expect(kept({ ...ones, answer: '4' })).toHaveLength(0);
  });

  it('a net whose inputs the question does not match is not asked', () => {
    expect(figureIsRejected(logicNet('out', [1, 0]))).toBe(true);
  });
});

describe('colour-wheel questions are held to Itten', () => {
  it('a complement typed: the name the wheel shows, in the question language', () => {
    expect(kept(complement!)[0]?.answer).toBe('Grün');
    expect(kept({ ...complement, answer: 'grün' })[0]?.answer).toBe('Grün');
    expect(kept({ ...complement, answer: 'Cyan' })).toHaveLength(0);
    // An accepted answer that names another field would grade a wrong colour right.
    expect(kept({ ...complement, accepted_answers: ['Blaugrün'] })).toHaveLength(0);
    expect(kept({ ...complement, prompt_lang: 'en', answer: 'Green' }, 'en')[0]?.answer).toBe(
      'Green',
    );
  });

  it('a mixture among the marked fields: their names are the options, in their order', () => {
    const [it0] = kept(mix!);
    expect(it0?.choices).toEqual(['Orange', 'Violett', 'Grün']);
    expect(kept({ ...mix, correct_choice: 0 })).toHaveLength(0);
  });

  it('primary, secondary or tertiary: code writes the three options', () => {
    const cls = {
      ...mix,
      prompt: 'Was für eine Farbe ist Orange?',
      answer: 'Sekundärfarbe',
      choices: ['Primärfarbe', 'Sekundärfarbe', 'Tertiärfarbe'],
      correct_choice: 1,
      figure: { ...wheelComplement, hl: ['orange'], ask: 'class', at: ['orange'] },
    };
    expect(kept(cls)[0]?.choices).toEqual(['Primärfarbe', 'Sekundärfarbe', 'Tertiärfarbe']);
    expect(kept({ ...cls, correct_choice: 0 })).toHaveLength(0);
  });

  it('two colours the wheel shows no mixture of cost the question', () => {
    expect(figureIsRejected({ ...wheelComplement, ask: 'mix', at: ['orange', 'violet'] })).toBe(
      true,
    );
    expect(kept({ ...complement, unit: null, kind: 'numeric', answer: '3' })).toHaveLength(0);
  });
});
