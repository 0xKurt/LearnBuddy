// Several values in one answer, and the system behind a key (issues #263, #227 A7 and B4).
// What matters: the separators are read without guessing ("2,5" is a number, not a list), and a
// key is only ever rejected on a proof — a system it cannot solve proves nothing.

import { describe, expect, it } from 'vitest';

import {
  assignmentsOf,
  equationContradicts,
  sameAssignments,
  sameList,
  samePoint,
  systemContradicts,
} from '../systems.js';

describe('named values: the solution of a system', () => {
  it('reads them with ";", ", " before the next name, or one per line', () => {
    expect(assignmentsOf('x = 2, y = 3')).toEqual(
      new Map([
        ['x', '2'],
        ['y', '3'],
      ]),
    );
    expect(assignmentsOf('x=2;y=3')).toEqual(
      new Map([
        ['x', '2'],
        ['y', '3'],
      ]),
    );
    expect(assignmentsOf('x = 2\ny = 3')).toEqual(
      new Map([
        ['x', '2'],
        ['y', '3'],
      ]),
    );
    // The decimal comma stays inside its value.
    expect(assignmentsOf('x = 2,5, y = 3')).toEqual(
      new Map([
        ['x', '2,5'],
        ['y', '3'],
      ]),
    );
  });

  it('refuses what is not a list of values', () => {
    expect(assignmentsOf('x = 2')).toBeNull();
    expect(assignmentsOf('x = 2, x = 3')).toBeNull();
    expect(assignmentsOf('y = 2x, x = 1')).toBeNull();
  });

  it('compares value by value, in any order', () => {
    expect(sameAssignments('x = 2, y = 3', 'y = 3; x = 2')).toBe('correct');
    expect(sameAssignments('x = 0.5, y = 3', 'x = 1/2, y = 3')).toBe('other_form');
    // Swapped values, one value off, a sign lost: wrong, without a model.
    expect(sameAssignments('x = 2, y = 3', 'x = 3, y = 2')).toBe('incorrect');
    expect(sameAssignments('x = 2, y = 3', 'x = 2, y = 4')).toBe('incorrect');
    expect(sameAssignments('x = 2, y = -3', 'x = 2, y = 3')).toBe('incorrect');
    // Other variables: not this module's to decide.
    expect(sameAssignments('x = 2, y = 3', 'a = 2, b = 3')).toBeNull();
  });
});

describe('a point', () => {
  it('compares coordinates in order', () => {
    expect(samePoint('(2|3)', 'S(2 | 3)')).toBe('correct');
    expect(samePoint('(2|3)', '(3|2)')).toBe('incorrect');
    expect(samePoint('(0,5|3)', '(1/2|3)')).toBe('other_form');
    expect(samePoint('(2|3)', '(2|3|0)')).toBeNull();
  });
});

describe('a list of numbers', () => {
  it('treats a set in braces as unordered', () => {
    expect(sameList('L = {2; 5}', '{5; 2}')).toBe('correct');
    expect(sameList('L = {-1; 4}', 'L = {4; -1}')).toBe('correct');
  });

  it('leaves the order of a bare list to the tutor, but not a wrong value', () => {
    expect(sameList('2; 5', '2; 5')).toBe('correct');
    expect(sameList('2; 5', '5; 2')).toBe('other_form');
    expect(sameList('2; 5', '5; 3')).toBe('incorrect');
    expect(sameList('{2; 5}', '{2; 5; 7}')).toBe('incorrect');
  });

  it('leaves a missing value open, and refuses a comma list', () => {
    // What is there may be right; the tutor says what is missing.
    expect(sameList('{2; 5}', '{2}')).toBeNull();
    // "2, 5" is how German writes 2,5.
    expect(sameList('2, 5', '5, 2')).toBeNull();
  });
});

describe('a system printed in the question, against its key', () => {
  const lgs = 'Löse das Gleichungssystem: $x + y = 5$ und $x - y = 1$.';

  it('keeps a key that solves the system', () => {
    expect(systemContradicts(lgs, 'x = 3, y = 2')).toBe(false);
    expect(systemContradicts('$I: 2x + 3y = 12$; $II: x - y = 1$', 'x = 3, y = 2')).toBe(false);
    // A key rounded to its last decimal still solves it.
    expect(systemContradicts('$3x + 0y = 1$, $x + y = 1$', 'x = 0.33, y = 0.67')).toBe(false);
  });

  it('rejects a key that does not solve it', () => {
    expect(systemContradicts(lgs, 'x = 2, y = 3')).toBe(true);
    expect(systemContradicts(lgs, 'x = 3, y = 3')).toBe(true);
  });

  it('rejects a single-solution key on a system without one', () => {
    // The second equation is the first one doubled: infinitely many solutions.
    expect(systemContradicts('$2x + y = 7$; $4x + 2y = 14$', 'x = 2, y = 3')).toBe(true);
    // Parallel: no solution at all.
    expect(systemContradicts('$x + y = 1$; $x + y = 2$', 'x = 0, y = 1')).toBe(true);
  });

  it('proves nothing where it cannot read the system completely', () => {
    expect(systemContradicts('Anna ist doppelt so alt wie Ben.', 'x = 2, y = 3')).toBe(false);
    expect(systemContradicts('$x \\cdot y = 6$; $x + y = 5$', 'x = 2, y = 3')).toBe(false);
    expect(systemContradicts('$x + y = 5$', 'x = 2, y = 3')).toBe(false);
  });
});

describe('a single equation printed in the question, against its key (#227 B4)', () => {
  it('rejects a value that does not satisfy it', () => {
    expect(equationContradicts('Löse $2x + 3 = 7$.', 'x = 3')).toBe(true);
    expect(equationContradicts('Löse $x^2 = 2$.', 'x = 1.5')).toBe(true);
  });

  it('keeps a root, a rounded root and a double root', () => {
    expect(equationContradicts('Löse $2x + 3 = 7$.', 'x = 2')).toBe(false);
    expect(equationContradicts('Löse $x^2 = 2$.', 'x = 1.41')).toBe(false);
    expect(equationContradicts('Löse $(x-2)^2 = 0$.', 'x = 2')).toBe(false);
    // One root of two is no contradiction: whether both were asked is not arithmetic.
    expect(equationContradicts('Löse $x^2 = 9$.', 'x = 3')).toBe(false);
  });

  it('proves nothing with two equations, another variable or a bare key', () => {
    expect(equationContradicts('$2x = 4$ und $3x = 9$', 'x = 5')).toBe(false);
    expect(equationContradicts('Löse $2a = 4$.', 'x = 5')).toBe(false);
    expect(equationContradicts('Löse $2x = 4$.', '5')).toBe(false);
  });
});
