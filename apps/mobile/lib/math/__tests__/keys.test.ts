// Which keys a question gets, and what a raise/lower key does to what she types (issue #239;
// the row's defect from #286 finding 5: math keys over whole numbers, cut off and sliding).

import { describe, expect, it } from 'vitest';

import {
  cellKeys,
  keysFor,
  pagesOf,
  slotsIn,
  slotsOf,
  typedUnder,
  type KeyContext,
} from '../keys.js';

const ask = (over: Partial<KeyContext>): KeyContext => ({
  kind: 'numeric',
  unit: null,
  subjectKind: null,
  prompt: 'Wie viel ist $3 \\cdot 4$?',
  path: true,
  ...over,
});

describe('keysFor: what the question needs, chosen from the question', () => {
  it('gives a chemistry formula the index, charge and arrow keys, and no math keys', () => {
    const keys = keysFor(
      ask({ kind: 'formula', subjectKind: 'chemistry', prompt: 'Stelle die Gleichung auf.' }),
    );
    expect(keys).toEqual(['sub', 'charge', 'plus', 'reacts', 'equilibrium', 'brackets']);
  });

  it('knows a reaction by the arrow in the question, whatever the subject', () => {
    const decay = ask({
      kind: 'formula',
      subjectKind: 'physics',
      prompt: 'Ergänze: $^{238}U \\longrightarrow$ ___',
    });
    expect(keysFor(decay)).toContain('reacts');
    // A mapping arrow is not a reaction.
    const limit = ask({ kind: 'formula', subjectKind: 'math', prompt: 'Was ist $x \\to 0$?' });
    expect(keysFor(limit)).not.toContain('reacts');
  });

  it('gives a math formula the exponent, =, and the comparisons first when it shows one', () => {
    const plain = keysFor(
      ask({ kind: 'formula', subjectKind: 'math', prompt: 'Löse $x^{2} = 9$.' }),
    );
    expect(plain.slice(0, 4)).toEqual(['newline', 'power', 'fraction', 'equals']);
    const ineq = keysFor(
      ask({ kind: 'formula', subjectKind: 'math', prompt: 'Löse $x^{2} \\le 3$.' }),
    );
    expect(ineq.slice(0, 6)).toEqual(['newline', 'power', 'lt', 'le', 'gt', 'ge']);
  });

  it('gives a number its signs, and a root or π only where the question shows one', () => {
    const n = keysFor(ask({}));
    expect(n.slice(0, 4)).toEqual(['newline', 'fraction', 'decimal', 'minus']);
    expect(n).not.toContain('sqrt');
    expect(n).not.toContain('pi');
    expect(keysFor(ask({ prompt: 'Berechne $\\sqrt{2} \\cdot \\pi$.' }))).toEqual(
      expect.arrayContaining(['sqrt', 'pi']),
    );
    // A measure is computed and written with a decimal separator: those come first.
    expect(keysFor(ask({ unit: 'cm²' })).slice(1, 4)).toEqual(['decimal', 'times', 'minus']);
  });

  it('gives a word answer and the other kinds no row at all', () => {
    expect(keysFor(ask({ kind: 'short', prompt: 'Wie heißt die Hauptstadt?' }))).toEqual([]);
    expect(keysFor(ask({ kind: 'vocab' }))).toEqual([]);
    expect(keysFor(ask({ kind: 'long' }))).toEqual([]);
    expect(keysFor(ask({ kind: 'multiple_choice' }))).toEqual([]);
  });

  it('gives a table gap with a whole number no row (#286 finding 5)', () => {
    expect(cellKeys('math', true)).toEqual([]);
    expect(cellKeys('text', false)).toEqual([]);
    expect(cellKeys('math', false)).toEqual(['decimal', 'fraction', 'minus', 'power', 'brackets']);
  });
});

describe('one line, never sideways', () => {
  it('fits six places on a 360 phone and seven on a 390 phone', () => {
    expect(slotsIn(328)).toBe(6);
    expect(slotsIn(358)).toBe(7);
  });

  it('puts everything on one page when it fits', () => {
    expect(pagesOf(['sub', 'charge', 'plus'], 6)).toEqual([['sub', 'charge', 'plus']]);
    expect(pagesOf([], 6)).toEqual([]);
  });

  it('keeps every page within the line, with one place for "…"', () => {
    const keys = keysFor(ask({ kind: 'formula', subjectKind: 'math', prompt: '$x^{2}$' }));
    for (const slots of [6, 7]) {
      const pages = pagesOf(keys, slots);
      expect(pages.length).toBeGreaterThan(1);
      expect(pages.flat()).toEqual(keys);
      for (const page of pages)
        expect(page.reduce((n, id) => n + slotsOf(id), 0)).toBeLessThanOrEqual(slots - 1);
    }
  });
});

describe('typedUnder: the digit she just typed, raised or lowered', () => {
  /** Types one character after another the way the field reports it. */
  function typeAll(chars: string, mode: Parameters<typeof typedUnder>[2], start = '') {
    let value = start;
    let m = mode;
    for (const ch of chars) {
      const r = typedUnder(value, value + ch, m);
      value = r.value;
      m = r.mode;
    }
    return { value, mode: m };
  }

  it('lowers the digits of an index and stops at the next letter', () => {
    expect(typeAll('2O', 'sub', 'H')).toEqual({ value: 'H₂O', mode: null });
    expect(typeAll('12', 'sub', 'C₆H')).toEqual({ value: 'C₆H₁₂', mode: 'sub' });
  });

  it('raises a charge and closes it with its sign', () => {
    expect(typeAll('2-', 'charge', 'SO₄')).toEqual({ value: 'SO₄²⁻', mode: null });
    expect(typeAll('3+', 'charge', 'Fe')).toEqual({ value: 'Fe³⁺', mode: null });
  });

  it('raises the digits of an exponent, never the sign after it', () => {
    expect(typeAll('12', 'power', '10')).toEqual({ value: '10¹²', mode: 'power' });
    expect(typeAll('2-', 'power', 'x')).toEqual({ value: 'x²-', mode: null });
  });

  it('leaves text it did not just type alone: a paste, a deletion, an edit in the middle', () => {
    expect(typedUnder('H', 'H2O', 'sub')).toEqual({ value: 'H2O', mode: null, at: null });
    expect(typedUnder('H2', 'H', 'sub')).toEqual({ value: 'H', mode: null, at: null });
    // A digit typed in the middle is lowered where it was typed, the cursor right after it.
    expect(typedUnder('HO', 'H2O', 'sub')).toEqual({ value: 'H₂O', mode: 'sub', at: 2 });
    expect(typedUnder('x', 'x2', null)).toEqual({ value: 'x2', mode: null, at: null });
  });

  it('writes what the chemistry check reads: "2 H₂ + O₂ → 2 H₂O"', () => {
    // 2 · space · H · [x₂] 2 · " + " · O · [x₂] 2 · " → " · 2 · space · H · [x₂] 2 · O
    let v = typeAll('2 H', null).value;
    v = typeAll('2', 'sub', v).value;
    v += ' + ';
    v = typeAll('O', null, v).value;
    v = typeAll('2', 'sub', v).value;
    v += ' → ';
    v = typeAll('2 H', null, v).value;
    v = typeAll('2O', 'sub', v).value;
    expect(v).toBe('2 H₂ + O₂ → 2 H₂O');
  });
});
