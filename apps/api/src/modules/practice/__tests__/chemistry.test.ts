// Counting instead of comparing strings (issue #212). Two halves matter equally: what this
// may decide, and what it must refuse to decide. A parser that guesses produces a confident
// wrong verdict, which is worse than handing the answer to the model (CLAUDE.md rule 5).

import { describe, expect, it } from 'vitest';

import {
  checkEquation,
  sameSubstance,
  imbalanceOf,
  looksLikeEquation,
  needsReducing,
  parseEquation,
  parseFormula,
  sameRatio,
} from '../chemistry.js';
import { ruleCheck, type ItemForCheck } from '../evaluate.js';

const atoms = (s: string) => {
  const p = parseFormula(s);
  return p ? Object.fromEntries([...p.atoms].sort()) : null;
};
const charge = (s: string) => parseFormula(s)?.charge ?? null;

describe('a substance, counted', () => {
  it('counts indices and brackets', () => {
    expect(atoms('H2O')).toEqual({ H: 2, O: 1 });
    expect(atoms('H2SO4')).toEqual({ H: 2, O: 4, S: 1 });
    expect(atoms('Ca(OH)2')).toEqual({ Ca: 1, H: 2, O: 2 });
    expect(atoms('Al2(SO4)3')).toEqual({ Al: 2, O: 12, S: 3 });
    expect(atoms('[Cu(NH3)4]2+')).toEqual({ Cu: 1, H: 12, N: 4 });
  });

  it('reads the charge, however it is written', () => {
    expect(charge('SO4^2-')).toBe(-2);
    expect(charge('SO4 2-')).toBe(-2);
    expect(charge('Fe^3+')).toBe(3);
    expect(charge('Na+')).toBe(1);
    expect(charge('Cl-')).toBe(-1);
    expect(charge('H2O')).toBe(0);
  });

  it('takes the subscripts a phone keyboard produces', () => {
    expect(atoms('H₂O')).toEqual({ H: 2, O: 1 });
    expect(atoms('SO₄²⁻')).toEqual({ O: 4, S: 1 });
    expect(charge('SO₄²⁻')).toBe(-2);
  });

  it('drops the state of matter instead of reading it as elements', () => {
    // "(aq)" is not a group of atoms, and "(s)" is not sulfur.
    expect(atoms('NaCl(aq)')).toEqual({ Cl: 1, Na: 1 });
    expect(atoms('H2O(l)')).toEqual({ H: 2, O: 1 });
    expect(atoms('Fe(s)')).toEqual({ Fe: 1 });
  });

  it('refuses what it cannot account for, rather than guessing', () => {
    expect(parseFormula('')).toBeNull();
    expect(parseFormula('2x + 3')).toBeNull();
    expect(parseFormula('Ca(OH')).toBeNull(); // bracket never closed
    expect(parseFormula('h2o')).toBeNull(); // a symbol starts with a capital
    // A hydrate is a real notation this module cannot count: it must fail, not drop the water.
    expect(parseFormula('CuSO4 · 5H2O')).toBeNull();
  });
});

describe('an equation, counted', () => {
  it('is the same equation in any order', () => {
    const key = '2 H2 + O2 -> 2 H2O';
    expect(checkEquation(key, '2 H2 + O2 → 2 H2O')).toEqual({ verdict: 'correct' });
    // The acceptance criterion from the issue: balanced, written the other way round.
    expect(checkEquation(key, 'O2 + 2 H2 → 2 H2O')).toEqual({ verdict: 'correct' });
    expect(checkEquation(key, '2H2+O2→2H2O')).toEqual({ verdict: 'correct' });
  });

  it('names the element that does not add up, and which side is short', () => {
    // The issue's example: one O missing on the right.
    const r = checkEquation('2 H2 + O2 -> 2 H2O', '2 H2 + O2 → H2O');
    expect(r).toEqual({
      verdict: 'unbalanced',
      imbalance: { kind: 'element', element: 'H', left: 4, right: 2 },
    });
    // With the hydrogen right, the oxygen is what is named.
    const o = checkEquation('CH4 + 2 O2 -> CO2 + 2 H2O', 'CH4 + 2 O2 → CO2 + H2O');
    expect(o).toMatchObject({
      verdict: 'unbalanced',
      imbalance: { kind: 'element', element: 'H' },
    });
  });

  it('says "right, now reduce" when every coefficient shares a factor', () => {
    expect(checkEquation('2 H2 + O2 -> 2 H2O', '4 H2 + 2 O2 → 4 H2O')).toEqual({
      verdict: 'not_lowest',
      factor: 2,
    });
    expect(checkEquation('2 H2 + O2 -> 2 H2O', '6 H2 + 3 O2 → 6 H2O')).toEqual({
      verdict: 'not_lowest',
      factor: 3,
    });
  });

  it('counts the charge in an ionic equation', () => {
    const eq = parseEquation('Fe^3+ + 3 OH- -> Fe(OH)3');
    expect(eq).not.toBeNull();
    expect(imbalanceOf(eq!)).toBeNull();
    const broken = parseEquation('Fe^3+ + 2 OH- -> Fe(OH)3');
    expect(imbalanceOf(broken!)).not.toBeNull();
  });

  it('leaves the chemistry to the model when the substances are not the key’s', () => {
    // A different reaction is a question about chemistry, not about counting.
    expect(checkEquation('2 H2 + O2 -> 2 H2O', 'C + O2 → CO2')).toEqual({ verdict: 'unknown' });
    // Unparseable on either side: no verdict.
    expect(checkEquation('2 H2 + O2 -> 2 H2O', 'irgendwas mit Wasser')).toEqual({
      verdict: 'unknown',
    });
    expect(checkEquation('ganz ohne Pfeil', '2 H2 + O2 → 2 H2O')).toEqual({ verdict: 'unknown' });
  });

  it('never mistakes a physics formula for a reaction', () => {
    // U, R and I are uranium, roentgenium and iodine. With "=" accepted as an arrow this
    // would have been counted as a reaction and called unbalanced — confidently and wrongly.
    expect(looksLikeEquation('U = R * I')).toBe(false);
    expect(looksLikeEquation('E = m c^2')).toBe(false);
    expect(looksLikeEquation('A => B')).toBe(false);
    // Even tighter than planned: without a capital there is no element, so it never even
    // reaches the parser.
    expect(looksLikeEquation('x -> 3')).toBe(false);
    expect(parseEquation('x -> 3')).toBeNull();
  });

  it('needsReducing reports 1 for an equation already in lowest terms', () => {
    expect(needsReducing(parseEquation('2 H2 + O2 -> 2 H2O')!)).toBe(1);
    expect(needsReducing(parseEquation('4 H2 + 2 O2 -> 4 H2O')!)).toBe(2);
  });
});

describe('a ratio, compared reduced', () => {
  it('counts an unreduced ratio as right, from three parts on', () => {
    expect(sameRatio('9:3:3:1', '9:3:3:1')).toBe(true);
    expect(sameRatio('9:3:3:1', '18:6:6:2')).toBe(true);
    expect(sameRatio('1:2:1', '2:4:2')).toBe(true);
  });

  it('knows a different ratio, and one of a different length', () => {
    expect(sameRatio('9:3:3:1', '1:3:3:9')).toBe(false);
    expect(sameRatio('9:3:3:1', '9:3:3:2')).toBe(false);
    expect(sameRatio('1:2:1', '9:3:3:1')).toBe(false);
  });

  it('refuses two parts, because the characters have three readings', () => {
    // "3:1" a ratio, "3:4" a division the way German schools write it, "14:30" a clock time —
    // nothing in the characters says which. The grading truth table has a case that requires
    // "14:30" against "14:50" to stay undecided, and issue #175 closed on the same ground.
    expect(sameRatio('3:1', '3:1')).toBeNull();
    expect(sameRatio('3:1', '1:3')).toBeNull();
    expect(sameRatio('14:30', '14:50')).toBeNull();
    expect(sameRatio('3:4', '6:8')).toBeNull();
  });

  it('says nothing unless BOTH sides are ratios', () => {
    expect(sameRatio('0,75', '3:4:1')).toBeNull();
    expect(sameRatio('9:3:3:1', 'neun zu drei zu drei zu eins')).toBeNull();
  });
});

describe('what the rule check now decides without a model', () => {
  const item = (over: Partial<ItemForCheck>): ItemForCheck => ({
    kind: 'formula',
    answer: '',
    accepted_answers: [],
    unit: null,
    choices: null,
    correct_choice: null,
    tolerance: null,
    spelling: null,
    subject_kind: 'chemistry',
    ...over,
  });
  const check = (i: ItemForCheck, text: string) => ruleCheck(i, { text, choice: null });
  const eq = item({ answer: '2 H2 + O2 -> 2 H2O' });

  it('judges a reaction equation by counting', () => {
    expect(check(eq, 'O2 + 2H2 → 2H2O')).toBe('correct');
    expect(check(eq, '2 H2 + O2 → H2O')).toBe('unbalanced');
    expect(check(eq, '4 H2 + 2 O2 → 4 H2O')).toBe('not_lowest');
    expect(check(eq, 'C + O2 → CO2')).toBe('unknown');
  });

  it('leaves ordinary math alone', () => {
    // The whole point of the arrow restriction: nothing here may go near the chemistry path.
    const frac = item({ kind: 'formula', answer: '$\\frac{3}{4}$', subject_kind: 'math' });
    expect(check(frac, '3/4')).toBe('correct');
    // Not 'correct', and that is the existing decision D-3, unchanged here: for a formula a
    // decimal is ANOTHER FORM, and whether that counts (reduced? asked as a fraction?) is the
    // tutor's call. The point of this case is only that the chemistry path left it alone.
    expect(check(frac, '0,75')).toBe('unknown');
    const num = item({ kind: 'numeric', answer: '28', subject_kind: 'math' });
    expect(check(num, '28')).toBe('correct');
    expect(check(num, '21')).toBe('incorrect');
  });

  it('judges an inheritance ratio by reducing it', () => {
    const cross = item({ kind: 'short', answer: '9:3:3:1', subject_kind: 'biology' });
    expect(check(cross, '9:3:3:1')).toBe('correct');
    expect(check(cross, '18:6:6:2')).toBe('correct');
    expect(check(cross, '1:3:3:9')).toBe('incorrect');
  });

  it('leaves a clock time and a two-part ratio to the tutor', () => {
    const time = item({ kind: 'short', answer: '14:30', subject_kind: 'math' });
    expect(check(time, '14:50')).toBe('unknown');
    const mono = item({ kind: 'short', answer: '3:1', subject_kind: 'biology' });
    expect(check(mono, '1:3')).toBe('unknown');
  });
});

describe('a single substance, counted (#227 finding 6)', () => {
  it('is the same substance however the indices are written', () => {
    expect(sameSubstance('H2SO4', 'H₂SO₄')).toBe('same');
    expect(sameSubstance('H2O', 'H₂O')).toBe('same');
    expect(sameSubstance('Ca(OH)2', 'CaO2H2')).toBe('same');
  });

  it('knows a different substance for certain', () => {
    expect(sameSubstance('H2SO4', 'H2SO3')).toBe('different');
    expect(sameSubstance('CO2', 'CO')).toBe('different');
    expect(sameSubstance('Fe^3+', 'Fe^2+')).toBe('different');
  });

  it('says nothing about a name, a word or a single letter', () => {
    // Code may not turn a word into a substance.
    expect(sameSubstance('H2O', 'Wasser')).toBe('unknown');
    expect(sameSubstance('Wasser', 'H2O')).toBe('unknown');
    // "He" is helium and also an English pronoun; one atom of one element is not unmistakable.
    expect(sameSubstance('He', 'He')).toBe('unknown');
    expect(sameSubstance('A', 'A')).toBe('unknown');
  });

  it('leaves a whole equation to the counting that is meant for it', () => {
    expect(sameSubstance('2 H2 + O2 -> 2 H2O', '2 H2 + O2 → 2 H2O')).toBe('unknown');
  });
});

describe('what the formula keys type, against a key in the app notation (#239)', () => {
  // The chemistry keys write real sub- and superscripts (apps/mobile/lib/math/keys.ts); the
  // model writes its key in the LaTeX subset (MATH_NOTATION_RULE). Both are the same equation.
  const KEY = '$2H_{2} + O_{2} \\longrightarrow 2H_{2}O$';

  it('counts what she typed with the keys against a LaTeX key', () => {
    expect(checkEquation(KEY, '2 H₂ + O₂ → 2 H₂O').verdict).toBe('correct');
    expect(checkEquation(KEY, 'O₂ + 2 H₂ → 2 H₂O').verdict).toBe('correct');
    expect(checkEquation(KEY, '2 H₂ + O₂ ⇌ 2 H₂O').verdict).toBe('correct');
    expect(checkEquation(KEY, 'H₂ + O₂ → H₂O').verdict).toBe('unbalanced');
  });

  it('reads charges written with the charge key and as LaTeX', () => {
    const ions = '$Fe^{3+} + 3OH^{-} \\longrightarrow Fe(OH)_{3}$';
    expect(checkEquation(ions, 'Fe³⁺ + 3 OH⁻ → Fe(OH)₃').verdict).toBe('correct');
    expect(sameSubstance('$SO_{4}^{2-}$', 'SO₄²⁻')).toBe('same');
  });

  it('reads the LaTeX equilibrium arrow as an arrow', () => {
    expect(
      checkEquation('$N_{2} + 3H_{2} \\rightleftharpoons 2NH_{3}$', 'N₂ + 3 H₂ ⇌ 2 NH₃').verdict,
    ).toBe('correct');
  });
});
