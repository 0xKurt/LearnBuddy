// Minutes and questions (#311): the estimate a prepared practice, an agreed reminder and a
// fallback before a test show, written once next to its inverse. And the shape of a set: a task in
// parts stays together and whole (#297).

import { describe, expect, it } from 'vitest';

import { minutesFor, questionCountFor, wholeTasksFirst } from '../selection.js';

describe('how long a set of questions takes', () => {
  it('is never under five minutes', () => {
    expect(minutesFor(0)).toBe(5);
    expect(minutesFor(6)).toBe(5);
  });

  it('counts about 1.2 questions a minute', () => {
    expect(minutesFor(12)).toBe(10);
    expect(minutesFor(13)).toBe(11);
    expect(minutesFor(50)).toBe(42);
  });

  it('gives back the minutes a minute estimate asked for', () => {
    expect(minutesFor(questionCountFor(10))).toBe(10);
  });
});

const q = (id: string) => ({ id, task: null, part: null });
const p = (id: string, task: string, part: string) => ({ id, task, part });
const ids = (list: ReadonlyArray<{ id: string }>) => list.map((c) => c.id);

describe('a set keeps a task in parts whole (#297)', () => {
  it('takes the rest of a task the cut falls into', () => {
    const pool = [q('x'), p('a', 't', 'a'), p('b', 't', 'b'), p('c', 't', 'c'), q('y')];
    expect(ids(wholeTasksFirst(pool, 2))).toEqual(['x', 'a', 'b', 'c']);
    expect(ids(wholeTasksFirst(pool, 1))).toEqual(['x']);
    expect(ids(wholeTasksFirst(pool, 4))).toEqual(['x', 'a', 'b', 'c']);
    expect(ids(wholeTasksFirst(pool, 'all'))).toEqual(['x', 'a', 'b', 'c', 'y']);
  });

  it('puts the parts together, in letter order, where the first of them stands', () => {
    const pool = [p('b', 't', 'b'), q('x'), p('a', 't', 'a'), q('y'), p('c', 't', 'c')];
    expect(ids(wholeTasksFirst(pool, 'all'))).toEqual(['a', 'b', 'c', 'x', 'y']);
  });

  it('leaves a part alone when its task has no other part in the pool, and two tasks apart', () => {
    const pool = [p('b', 't', 'b'), p('d', 'u', 'a'), p('e', 'u', 'b'), q('x')];
    expect(ids(wholeTasksFirst(pool, 2))).toEqual(['b', 'd', 'e']);
  });
});
