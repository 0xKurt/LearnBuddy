// Which keys a question gets, and what a raise/lower key does to what she types (issue #239;
// the row's defect from #286 finding 5: math keys over whole numbers, cut off and sliding).

import { describe, expect, it } from 'vitest';

import { pagesOf } from '../../keyRow.js';
import {
  cellKeys,
  glyphOf,
  insertionOf,
  isLetterKey,
  keysFor,
  modeFor,
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

describe('keysFor: the design’s rows, chosen from the question (#599)', () => {
  it('gives a chemistry formula the design’s row and no math keys (Tasks.jsx:162)', () => {
    const keys = keysFor(
      ask({ kind: 'formula', subjectKind: 'chemistry', prompt: 'Stelle die Gleichung auf.' }),
    );
    // ₂ → + ⁺, and the equilibrium arrow no phone keyboard has; brackets are the device's.
    expect(keys).toEqual(['sub', 'reacts', 'plus', 'charge', 'equilibrium']);
    expect(modeFor(ask({ kind: 'formula', subjectKind: 'chemistry', prompt: '' }))).toBe('chem');
  });

  it('leads the chemistry row with the elements the question itself writes', () => {
    const keys = keysFor(
      ask({
        kind: 'formula',
        subjectKind: 'chemistry',
        prompt: 'Gleiche aus: $N_{2} + 3H_{2} \\rightleftharpoons 2NH_{3}$',
      }),
    );
    expect(keys.slice(0, 4)).toEqual(['letter:N', 'letter:H', 'sub', 'reacts']);
    expect(glyphOf('letter:N')).toBe('N');
    expect(insertionOf('letter:H')).toEqual({ text: 'H' });
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

  it('gives an equation `x = + − / ( )` (Practice.jsx:39), its variable from the question', () => {
    const plain = ask({ kind: 'formula', subjectKind: 'math', prompt: 'Löse $2x + 3 = 11$.' });
    expect(keysFor(plain).slice(0, 7)).toEqual([
      'newline',
      'letter:x',
      'equals',
      'plus',
      'minus',
      'fraction',
      'brackets',
    ]);
    expect(modeFor(plain)).toBe('formula');
    // Another letter is another key; a unit or a command names no variable.
    expect(keysFor({ ...plain, prompt: 'Löse $3a = 12$.' })).toContain('letter:a');
    expect(
      keysFor({ ...plain, prompt: 'Rechne $\\frac{1}{2} \\cdot 4\\,\\text{cm}$.' }).filter(
        isLetterKey,
      ),
    ).toEqual([]);
  });

  it('gives an inequality `x xⁿ ≤ ≥ / √` first (Tasks.jsx:156), the equation row after it', () => {
    const ineq = keysFor(
      ask({ kind: 'formula', subjectKind: 'math', prompt: 'Löse $x^{2} \\le 3$.' }),
    );
    expect(ineq.slice(0, 7)).toEqual([
      'newline',
      'letter:x',
      'power',
      'le',
      'ge',
      'fraction',
      'sqrt',
    ]);
    // Nothing a formula may need is lost: the other row follows on the next page.
    expect(ineq).toEqual(expect.arrayContaining(['equals', 'plus', 'minus', 'brackets']));
  });

  it('offers no key the phone’s own keyboard has: digits, the comma, < and >', () => {
    const all = [
      ...keysFor(ask({})),
      ...keysFor(ask({ unit: 'cm²' })),
      ...keysFor(ask({ kind: 'formula', subjectKind: 'math', prompt: 'Löse $x < 3$.' })),
    ];
    for (const gone of ['decimal', 'lt', 'gt', 'degree']) expect(all).not.toContain(gone);
  });

  it('gives a measure `· : + − =` (Flows.jsx:57), and a root or π only where it is shown', () => {
    const measure = ask({ unit: 'cm²', prompt: 'Berechne den Flächeninhalt.' });
    expect(keysFor(measure)).toEqual(['newline', 'times', 'divide', 'plus', 'minus', 'equals']);
    expect(modeFor(measure)).toBe('calc');
    // The unit itself is no key: a path line with a unit in it is refused by the step check.
    expect(keysFor(measure).filter(isLetterKey)).toEqual([]);
    expect(insertionOf('divide')).toEqual({ text: ':' });
    const n = keysFor(ask({}));
    expect(n).not.toContain('sqrt');
    expect(n).not.toContain('pi');
    expect(keysFor(ask({ prompt: 'Berechne $\\sqrt{2} \\cdot \\pi$.' }))).toEqual(
      expect.arrayContaining(['sqrt', 'pi']),
    );
  });

  it('gives a word answer and the other kinds no row and no mode chip', () => {
    for (const none of [
      ask({ kind: 'short', prompt: 'Wie heißt die Hauptstadt?' }),
      ask({ kind: 'vocab' }),
      ask({ kind: 'long' }),
      ask({ kind: 'multiple_choice' }),
    ]) {
      expect(keysFor(none)).toEqual([]);
      expect(modeFor(none)).toBeNull();
    }
  });

  it('gives a table gap only what its keyboard lacks (#286 finding 5)', () => {
    // A whole number on the number pad: its sign.
    expect(cellKeys('math', true)).toEqual(['minus']);
    expect(cellKeys('text', false)).toEqual([]);
    expect(cellKeys('math', false)).toEqual(['minus', 'power']);
  });
});

describe('the math keys on one line (lib/keyRow.ts)', () => {
  it('pages a long row so every page keeps one place for "…"', () => {
    const keys = keysFor(ask({ kind: 'formula', subjectKind: 'math', prompt: '$x^{2}$' }));
    for (const slots of [6, 7]) {
      const pages = pagesOf(keys, slots, slotsOf);
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
