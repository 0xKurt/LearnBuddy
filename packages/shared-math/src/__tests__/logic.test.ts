// Logic nets (issue #261): the truth table code computes for every gate and for a net of three,
// the shape rules, and the layout — no tap from a rail through a gate, inside the narrowest phone.

import { describe, expect, it } from 'vitest';

import {
  GATE_H,
  GATE_W,
  LOGIC_OPS,
  logicKey,
  logicLayout,
  logicProblem,
  truthTable,
  type Gate,
  type LogicNet,
} from '../logic.js';
import { TREE_WIDTH } from '../trees.js';

const net = (g: Gate[], over: Partial<LogicNet> = {}): LogicNet => ({
  type: 'logic',
  g,
  ask: 'none',
  v: [],
  ...over,
});
const gate = (o: Gate['o'], a: Gate['a'], b: Gate['b'] = ''): Gate => ({ o, a, b });

/** Q = (A ∧ B) ∨ ¬C. */
const classic = net([gate('and', 'A', 'B'), gate('not', 'C'), gate('or', 'G1', 'G2')]);

describe('truth tables', () => {
  it('every gate on its own (rows 00, 01, 10, 11)', () => {
    const table = (o: Gate['o']) => truthTable(net([gate(o, 'A', o === 'not' ? '' : 'B')]));
    expect(table('and')).toEqual([0, 0, 0, 1]);
    expect(table('or')).toEqual([0, 1, 1, 1]);
    expect(table('nand')).toEqual([1, 1, 1, 0]);
    expect(table('nor')).toEqual([1, 0, 0, 0]);
    expect(table('xor')).toEqual([0, 1, 1, 0]);
    expect(table('xnor')).toEqual([1, 0, 0, 1]);
    expect(table('not')).toEqual([1, 0]);
  });

  it('a net of three: (A ∧ B) ∨ ¬C', () => {
    expect(truthTable(classic)).toEqual([1, 0, 1, 0, 1, 0, 1, 1]);
    expect(logicKey({ ...classic, ask: 'ones' })).toBe(5);
    expect(logicKey({ ...classic, ask: 'out', v: [1, 1, 1] })).toBe(1);
    expect(logicKey({ ...classic, ask: 'out', v: [1, 0, 1] })).toBe(0);
  });

  it('a gate after one gate and a rail: (A ⊕ B) ∧ C', () => {
    const n = net([gate('xor', 'A', 'B'), gate('and', 'G1', 'C')]);
    expect(truthTable(n)).toEqual([0, 0, 0, 1, 0, 1, 0, 0]);
  });
});

describe('rules', () => {
  it('rejects what does not hold', () => {
    // A first gate takes a gate; a gate that does not feed the last one.
    expect(logicProblem(net([gate('and', 'G2', 'A'), gate('not', 'G1')]))).toBe('structure');
    expect(logicProblem(net([gate('and', 'A', 'B'), gate('or', 'A', 'B')]))).toBe('structure');
    // NOT with two inputs, AND with one, a gate on the same input twice.
    expect(logicProblem(net([gate('not', 'A', 'B')]))).toBe('structure');
    expect(logicProblem(net([gate('and', 'A')]))).toBe('structure');
    expect(logicProblem(net([gate('and', 'A', 'A')]))).toBe('structure');
    // C without B.
    expect(logicProblem(net([gate('and', 'A', 'C')]))).toBe('inputs');
    // The question's inputs do not match the net's.
    expect(logicProblem({ ...classic, ask: 'out', v: [1, 0] })).toBe('ask');
    expect(logicProblem({ ...classic, ask: 'ones', v: [1] })).toBe('ask');
    expect(logicProblem({ ...classic, ask: 'out', v: [0, 1, 1] })).toBeNull();
  });
});

describe('layout on the narrowest phone', () => {
  const shapes: LogicNet[] = [
    ...LOGIC_OPS.map((o) => net([gate(o, 'A', o === 'not' ? '' : 'B')])),
    classic,
    net([gate('xor', 'A', 'B'), gate('and', 'G1', 'C')]),
    net([gate('or', 'A', 'B'), gate('not', 'G1')]),
    net([gate('nand', 'A', 'B'), gate('nor', 'B', 'C'), gate('xnor', 'G2', 'G1')]),
  ];

  it.each(shapes.map((n, i) => [i, n] as const))('shape %i fits, no tap through a gate', (_, n) => {
    expect(logicProblem(n)).toBeNull();
    const layout = logicLayout(n, TREE_WIDTH)!;
    expect(layout.out.x).toBeLessThanOrEqual(TREE_WIDTH - 10);
    const boxes = layout.gates.map((g) => ({
      x0: g.at.x,
      x1: g.at.x + GATE_W,
      y0: g.at.y - GATE_H / 2,
      y1: g.at.y + GATE_H / 2,
    }));
    for (const w of layout.wires) {
      for (const b of boxes) {
        const horizontal = w.from.y === w.to.y;
        const [lo, hi] = horizontal
          ? [Math.min(w.from.x, w.to.x), Math.max(w.from.x, w.to.x)]
          : [Math.min(w.from.y, w.to.y), Math.max(w.from.y, w.to.y)];
        const through = horizontal
          ? w.from.y > b.y0 && w.from.y < b.y1 && lo < b.x0 && hi > b.x1
          : w.from.x > b.x0 && w.from.x < b.x1 && lo < b.y0 && hi > b.y1;
        expect(through).toBe(false);
      }
    }
    // Every pin is reached by exactly one wire.
    for (const g of layout.gates) {
      for (const pin of g.pins) {
        const ends = layout.wires.filter((w) => w.to.x === pin.x && w.to.y === pin.y);
        expect(ends).toHaveLength(1);
      }
    }
  });
});
