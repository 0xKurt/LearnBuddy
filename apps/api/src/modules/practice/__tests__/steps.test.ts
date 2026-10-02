// Checking a written path step by step (issue #209). The two halves that matter:
// a wrong step must be found at the RIGHT line, and a step written differently but worth the
// same must NOT be reported — a tutor that cries wolf about correct work is worse than one that
// says nothing.

import { describe, expect, it } from 'vitest';

import { checkPath, lastLine, pathLines } from '../steps.js';

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
  it('leaves more than one variable alone', () => {
    expect(checkPath(path('2a + b = 7', '2a = 7 - b'))).toEqual({ kind: 'unknown' });
  });

  it('leaves an inequality alone', () => {
    expect(checkPath(path('2x + 3 < 7', '2x < 4'))).toEqual({ kind: 'unknown' });
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
