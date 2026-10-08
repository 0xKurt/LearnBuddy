import { describe, expect, it } from 'vitest';

import { wholeTasksFirst } from '../selection.js';

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
