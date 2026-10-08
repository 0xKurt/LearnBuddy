// Checking a written path step by step (issue #209). The two halves that matter:
// a wrong step must be found at the RIGHT line, and a step written differently but worth the
// same must NOT be reported — a tutor that cries wolf about correct work is worse than one that
// says nothing.

import { describe, expect, it } from 'vitest';

import { checkPath, lastLine, pathLines, sameAlgebra, solvedValue } from '../steps.js';

const path = (...lines: string[]) => lines.join('\n');

describe('the lines of a path', () => {
  it('drops the markers a learner puts in front', () => {
    expect(pathLines('1. 2x + 3 = 7\n2) 2x = 4\n- x = 2')).toEqual([
      '2x + 3 = 7',
      '2x = 4',
      'x = 2',
    ]);
    expect(pathLines('$2x = 4$\n\n  x = 2  ')).toEqual(['2x = 4', 'x = 2']);
  });

  it('drops the step note after a bar and the arrow in front, as a notebook has them (#444)', () => {
    // Was `unknown` before: the note made every line unparseable, so the whole path went to the model.
    const notebook = path('2x + 3 = 7 | −3', '⇔ 2x = 4 |:2', '⇔ x = 2');
    expect(pathLines(notebook)).toEqual(['2x + 3 = 7', '2x = 4', 'x = 2']);
    expect(checkPath(notebook)).toEqual({ kind: 'sound', lines: 3 });
    expect(checkPath(path('2x + 3 = 7 | −3', '2x = 5 | :2', 'x = 2,5'))).toEqual({
      kind: 'broke',
      line: 1,
      lines: 3,
    });
    expect(pathLines('-2x > 6 | :(-2)\n=> x < -3')).toEqual(['-2x > 6', 'x < -3']);
  });

  it('keeps the bars of an absolute value: only an opening bar after a relation is a note', () => {
    expect(pathLines('y = |x| · 2')).toEqual(['y = |x| · 2']);
    expect(pathLines('|x - 3| = 2')).toEqual(['|x - 3| = 2']);
    expect(pathLines('x = |-3|')).toEqual(['x = |-3|']);
    // A term has no step to note: the bar stays.
    expect(pathLines('3x | :3')).toEqual(['3x | :3']);
  });

  it('is not a path below two lines', () => {
    expect(checkPath('x = 2')).toEqual({ kind: 'unknown' });
    expect(lastLine('x = 2')).toBeNull();
    expect(lastLine('2x = 4\nx = 2')).toBe('x = 2');
  });
});

describe('a sound path', () => {
  it('accepts a linear equation solved step by step', () => {
    expect(checkPath(path('2x + 3 = 7', '2x = 4', 'x = 2'))).toEqual({ kind: 'sound', lines: 3 });
  });

  it('accepts dividing the whole equation, which changes the difference by a factor', () => {
    // 4x = 8 → x = 2 halves both sides. The roots are the same, so the step is legal.
    expect(checkPath(path('4x = 8', 'x = 2'))).toEqual({ kind: 'sound', lines: 2 });
    expect(checkPath(path('6x + 12 = 0', '2x + 4 = 0', 'x = -2'))).toMatchObject({ kind: 'sound' });
  });

  it('accepts a term rewritten in another form', () => {
    expect(checkPath(path('(x+1)(x-1)', 'x^2 - 1'))).toEqual({ kind: 'sound', lines: 2 });
    expect(checkPath(path('2(x+3)', '2x + 6'))).toEqual({ kind: 'sound', lines: 2 });
    // The same step with the factors in the other order, and a typographic multiplication sign.
    expect(checkPath(path('3 · (x - 2)', '3x - 6'))).toEqual({ kind: 'sound', lines: 2 });
  });

  it('takes a variable that is not called x', () => {
    expect(checkPath(path('3a + 6 = 12', '3a = 6', 'a = 2'))).toMatchObject({ kind: 'sound' });
    expect(checkPath(path('2t = 10', 't = 5'))).toMatchObject({ kind: 'sound' });
  });

  it('accepts a path of pure numbers', () => {
    expect(checkPath(path('7 · 4', '28'))).toEqual({ kind: 'sound', lines: 2 });
  });
});

describe('a broken step, at the right line', () => {
  it('finds a lost minus sign', () => {
    // From line 2 to line 3 the sign of the 6 flips.
    expect(checkPath(path('2x - 6 = 0', '2x = 6', 'x = -3'))).toEqual({
      kind: 'broke',
      line: 2,
      lines: 3,
    });
  });

  it('finds a wrong expansion in the first step', () => {
    expect(checkPath(path('2(x + 3)', '2x + 3'))).toEqual({ kind: 'broke', line: 1, lines: 2 });
  });

  it('reports only the last step when everything before it holds', () => {
    // The issue's acceptance: the way is right and only the result is mistyped.
    expect(checkPath(path('2x + 3 = 7', '2x = 4', 'x = 4'))).toEqual({
      kind: 'broke',
      line: 2,
      lines: 3,
    });
  });

  it('finds the FIRST break, not a later one', () => {
    // Two things are wrong; pointing at the second would send her to the wrong line.
    const r = checkPath(path('2(x+1)', '2x + 1', '2x + 5'));
    expect(r).toEqual({ kind: 'broke', line: 1, lines: 3 });
  });

  it('calls an equation that lost its task different, not sound', () => {
    // "0 = 0" is true and has thrown the question away.
    expect(checkPath(path('2x = 4', '0 = 0'))).toMatchObject({ kind: 'broke' });
  });
});

describe('what it refuses to judge', () => {
  // Several variables and inequalities were refused here until issue #263; they are read now
  // (see the blocks below). What stays refused is what still cannot be computed exactly.
  it('leaves a non-linear inequality and a chain alone', () => {
    expect(checkPath(path('x^2 < 4', 'x < 2'))).toEqual({ kind: 'unknown' });
    expect(checkPath(path('1 < x + 1 < 3', '0 < x < 2'))).toEqual({ kind: 'unknown' });
    expect(checkPath(path('x ≠ 2', 'x + 1 ≠ 3'))).toEqual({ kind: 'unknown' });
  });

  it('leaves an inequality with several variables alone', () => {
    expect(checkPath(path('x + y < 3', 'x < 3 - y'))).toEqual({ kind: 'unknown' });
  });

  it('leaves two lines about different variables alone — two values, not a step', () => {
    expect(checkPath(path('x = 2', 'y = 3'))).toEqual({ kind: 'unknown' });
    expect(checkPath(path('2x + y = 7', 'x = 2'))).toEqual({ kind: 'unknown' });
  });

  it('leaves a unit or a word inside a line alone', () => {
    expect(checkPath(path('s = 12 cm', 's = 0,12 m'))).toEqual({ kind: 'unknown' });
    expect(checkPath(path('x mal 3 = 6', 'x = 2'))).toEqual({ kind: 'unknown' });
  });

  it('leaves a line it cannot parse alone', () => {
    expect(checkPath(path('2x + 3 = 7', 'dann teile ich durch zwei', 'x = 2'))).toEqual({
      kind: 'unknown',
    });
    expect(checkPath(path('2x = 4', 'x = '))).toEqual({ kind: 'unknown' });
  });

  it('leaves a term turning into an equation alone', () => {
    expect(checkPath(path('2x + 3', '2x + 3 = 7'))).toEqual({ kind: 'unknown' });
  });

  it('is the same answer twice in a row, never a dice roll', () => {
    const p = path('2x + 3 = 7', '2x = 4', 'x = 2');
    const first = checkPath(p);
    for (let i = 0; i < 20; i++) expect(checkPath(p)).toEqual(first);
  });
});

// ── One answer against one key, with the same machinery (issue #227, finding 5). The
// equivalence that decides whether a step follows also decides whether an answer is the key's
// term or equation. The second half matters most: where it says nothing, because a unit that
// happens to be one letter must not become a variable (grading truth table H-4).

describe('an answer against a key, read as algebra', () => {
  it('knows a sign, a summand or a factor that differs', () => {
    expect(sameAlgebra('x = 5', 'x = -5')).toBe('different');
    expect(sameAlgebra('2x+6', '2x+5')).toBe('different');
    expect(sameAlgebra('$x^{2}+2x$', 'x^2-2x')).toBe('different');
    expect(sameAlgebra('2x+0', '3x+0')).toBe('different');
  });

  it('knows the same term and the same equation written differently', () => {
    expect(sameAlgebra('2x+6', '2(x+3)')).toBe('same');
    expect(sameAlgebra('2x+6', '6+2x')).toBe('same');
    expect(sameAlgebra('$x^{2}+2x$', 'x² + 2x')).toBe('same');
    // Dividing the whole equation keeps its solution, so it is the same equation.
    expect(sameAlgebra('x = 5', '2x = 10')).toBe('same');
  });

  it('says nothing where it would have to guess', () => {
    // A measured number: "1250 m" is not 1250 · m, and its unit is the numeric rules' business.
    expect(sameAlgebra('1250 m', '1350 m')).toBeNull();
    expect(sameAlgebra('12 m', '13 m')).toBeNull();
    expect(sameAlgebra('a = 12 cm', 'a = 13 cm')).toBeNull();
    // A single chemical formula is counted, not evaluated (`chemistry.ts`).
    expect(sameAlgebra('O2', 'O3')).toBeNull();
    expect(sameAlgebra('N2', '2N')).toBeNull();
    // X and x are not the same variable, and a and b are not either.
    expect(sameAlgebra('X^2', 'x^2')).toBeNull();
    expect(sameAlgebra('2a+6', '2b+6')).toBeNull();
    // Two numbers without a variable belong to the numeric rules, which own the separators
    // ("1.000" may be one thousand or one) and the tolerances.
    expect(sameAlgebra('-5', '5')).toBeNull();
    expect(sameAlgebra('1000-0', '1.000-0')).toBeNull();
    // Outside what this module reads: words, a line that does not parse, a non-linear inequality.
    expect(sameAlgebra('2x = 4', 'dann teile ich durch zwei')).toBeNull();
    expect(sameAlgebra('x^2 < 4', 'x^2 > 4')).toBeNull();
    // Two letters glued together are a word or a unit, never a product (H-4).
    expect(sameAlgebra('a^2+2ab+b^2', '(a+b)^2')).toBeNull();
  });

  it('is the same answer twice in a row here too', () => {
    for (let i = 0; i < 20; i++) expect(sameAlgebra('2x+6', '2x+5')).toBe('different');
  });
});

describe('the value a key states for its variable', () => {
  it('is the right side when the left side is nothing but the variable', () => {
    expect(solvedValue('x = 5')).toBe('5');
    expect(solvedValue('a = -3,5')).toBe('-3,5');
    expect(solvedValue('$x = \\frac{1}{2}$')).toBe('1/2');
  });

  it('is nothing where the right side is not a bare value', () => {
    // 10 is not the answer to "2x = 10", so its right side must not be read as one.
    expect(solvedValue('2x = 10')).toBeNull();
    expect(solvedValue('x = 2y')).toBeNull();
    // A unit belongs to the numeric rules together with its number.
    expect(solvedValue('a = 12 cm')).toBeNull();
    expect(solvedValue('5')).toBeNull();
    expect(solvedValue('x < 5')).toBeNull();
  });
});

// ── Several variables and inequalities (issue #263) ────────────────────────────────────────

describe('a formula rearranged step by step (several variables)', () => {
  it('accepts multiplying by a variable, which no constant factor describes', () => {
    expect(checkPath(path('v = s/t', 'v·t = s', 's = v·t'))).toEqual({ kind: 'sound', lines: 3 });
    expect(checkPath(path('2a + b = 7', '2a = 7 - b', 'a = (7 - b)/2'))).toMatchObject({
      kind: 'sound',
    });
    expect(checkPath(path('U = R·I', 'I = U/R'))).toMatchObject({ kind: 'sound' });
  });

  it('finds the step that divides where it should multiply', () => {
    expect(checkPath(path('v = s/t', 'v·t = s', 's = v/t'))).toEqual({
      kind: 'broke',
      line: 2,
      lines: 3,
    });
    expect(checkPath(path('x + y = 5', 'x = 5 + y'))).toEqual({ kind: 'broke', line: 1, lines: 2 });
  });

  it('accepts squaring a formula of positive quantities, and says so', () => {
    // v = √(2gh) → v² = 2gh holds for the positive values a formula is about (see steps.ts).
    expect(checkPath(path('v = sqrt(2·g·h)', 'v^2 = 2·g·h'))).toMatchObject({ kind: 'sound' });
  });
});

describe('an inequality step by step', () => {
  it('accepts a correct transformation, turning the sign where it must', () => {
    expect(checkPath(path('2x + 3 < 7', '2x < 4', 'x < 2'))).toEqual({ kind: 'sound', lines: 3 });
    expect(checkPath(path('-2x > 6', 'x < -3'))).toEqual({ kind: 'sound', lines: 2 });
    expect(checkPath(path('5 - x ≥ 2', '-x ≥ -3', 'x ≤ 3'))).toMatchObject({ kind: 'sound' });
  });

  it('finds the sign not turned at the line it happened', () => {
    // The acceptance of issue #263: dividing by −2 without turning "<" round.
    expect(checkPath(path('3 - 2x < 7', '-2x < 4', 'x < -2'))).toEqual({
      kind: 'broke',
      line: 2,
      lines: 3,
    });
    expect(checkPath(path('-2x > 6', 'x > -3'))).toEqual({ kind: 'broke', line: 1, lines: 2 });
  });

  it('finds a boundary that became included', () => {
    expect(checkPath(path('2x < 4', 'x ≤ 2'))).toEqual({ kind: 'broke', line: 1, lines: 2 });
  });

  it('keeps a leading minus: it is a sign, not a bullet', () => {
    expect(pathLines('-2x > 6\n- x < -3')).toEqual(['-2x > 6', 'x < -3']);
    expect(pathLines('2.5x = 5\nx = 2')).toEqual(['2.5x = 5', 'x = 2']);
  });
});

describe('an answer with several variables against a key', () => {
  it('compares formulas', () => {
    expect(sameAlgebra('s = v·t', 's = t·v')).toBe('same');
    expect(sameAlgebra('v = s/t', 'v = t/s')).toBe('different');
    expect(sameAlgebra('a^2 + 2a·b + b^2', '(a+b)^2')).toBe('same');
    expect(sameAlgebra('a^2 + 2a·b + b^2', '(a-b)^2')).toBe('different');
  });

  it('never reads a unit as a product of variables', () => {
    expect(sameAlgebra('a = 12 cm', 'a = 120 mm')).toBeNull();
    expect(sameAlgebra('F = 20 N', 'F = 0,02 kN')).toBeNull();
  });
});
