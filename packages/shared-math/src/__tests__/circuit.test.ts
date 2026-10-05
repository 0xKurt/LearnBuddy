// Circuits (issue #261): what lights, what a meter reads and the equivalent resistance, computed
// exactly from the parts — series and parallel with a switch open, a lamp bridged by a closed
// switch, a battery short-circuited — and the layout every learner sees: every part inside the
// narrowest phone (`TREE_WIDTH`), none over another.

import { describe, expect, it } from 'vitest';

import {
  AXIS,
  CELL,
  circuitKey,
  circuitKind,
  circuitLayout,
  circuitParts,
  circuitProblem,
  litLamps,
  solveCircuit,
  type Circuit,
  type CircuitPart,
} from '../circuit.js';
import { ratioOf, ratioValue } from '../ratio.js';
import { TREE_WIDTH } from '../trees.js';

const L = (r = 0): CircuitPart => ({ k: 'lamp', r, o: false });
const R = (r: number): CircuitPart => ({ k: 'resistor', r, o: false });
const S = (open: boolean): CircuitPart => ({ k: 'switch', r: 0, o: open });

const circuit = (b: Circuit['b'], over: Partial<Circuit> = {}): Circuit => ({
  type: 'circuit',
  u: 0,
  b,
  m: 'none',
  mt: '',
  ask: 'none',
  at: '',
  ...over,
});

const value = (c: Circuit) => {
  const key = circuitKey(c);
  return key?.kind === 'measure' ? { v: ratioValue(key.value), unit: key.unit } : key;
};

describe('which lamps light', () => {
  it('series with an open switch: none', () => {
    expect(litLamps(circuit([[[L()]], [[S(true)]], [[L()]]]))).toEqual([false, false]);
    expect(litLamps(circuit([[[L()]], [[S(false)]], [[L()]]]))).toEqual([true, true]);
  });

  it('parallel with one switch open: only the other branch', () => {
    const c = circuit([
      [
        [L(), S(false)],
        [L(), S(true)],
      ],
    ]);
    expect(litLamps(c)).toEqual([true, false]);
    expect(circuitKey({ ...c, ask: 'lit', at: 'L2' })).toEqual({ kind: 'lit', lit: false });
    expect(circuitKey({ ...c, ask: 'lit_count' })).toEqual({ kind: 'count', n: 1 });
  });

  it('a closed switch beside a lamp bridges it; the lamp after it still lights', () => {
    const c = circuit([[[L()], [S(false)]], [[L()]]]);
    expect(litLamps(c)).toEqual([false, true]);
  });

  it('two switches side by side (an OR): one closed is enough, both closed too', () => {
    expect(litLamps(circuit([[[S(true)], [S(false)]], [[L()]]]))).toEqual([true]);
    expect(litLamps(circuit([[[S(false)], [S(false)]], [[L()]]]))).toEqual([true]);
    expect(litLamps(circuit([[[S(true)], [S(true)]], [[L()]]]))).toEqual([false]);
  });

  it('a battery with nothing but wire between its poles is a short circuit', () => {
    expect(solveCircuit(circuit([[[S(false)]]]))).toBe('short');
    expect(circuitProblem(circuit([[[L()], [S(false)]]]))).toBe('short');
  });
});

describe('equivalent resistance and meters, exactly', () => {
  it('series, parallel and mixed', () => {
    const r = (b: Circuit['b']) => value(circuit(b, { ask: 'r_total' }));
    expect(r([[[R(100)]], [[R(200)]]])).toEqual({ v: 300, unit: 'Ω' });
    expect(r([[[R(100)], [R(300)]]])).toEqual({ v: 75, unit: 'Ω' });
    expect(r([[[R(6)], [R(6)], [R(6)]]])).toEqual({ v: 2, unit: 'Ω' });
    expect(r([[[R(100)]], [[R(200)], [R(200)]]])).toEqual({ v: 200, unit: 'Ω' });
    // 1/(1/3 + 1/6) = 2 exactly; 10 + 2 = 12, no floating-point remainder.
    const net = solveCircuit(circuit([[[R(10)]], [[R(3)], [R(6)]]]));
    expect(net !== 'short' && net.total).toEqual(ratioOf(BigInt(12)));
  });

  it('an open branch does not count; a lamp without a value gives no number', () => {
    const r = (b: Circuit['b']) => value(circuit(b, { ask: 'r_total' }));
    expect(r([[[R(100)], [R(100), S(true)]]])).toEqual({ v: 100, unit: 'Ω' });
    expect(r([[[L()]], [[R(100)]]])).toBeNull();
  });

  it('the ammeter in the main wire and after a part in a branch', () => {
    const main = circuit([[[R(100)]], [[R(200)]]], { u: 12, m: 'ammeter', ask: 'current' });
    expect(value(main)).toEqual({ v: 0.04, unit: 'A' });
    const branch = circuit([[[R(200)], [R(300)]]], {
      u: 12,
      m: 'ammeter',
      mt: 'R1',
      ask: 'current',
    });
    expect(value(branch)).toEqual({ v: 0.06, unit: 'A' });
  });

  it('the voltmeter across a part, across the battery, across an open switch', () => {
    const series = (mt: string) =>
      circuit([[[R(100)]], [[R(200)]]], { u: 12, m: 'voltmeter', mt, ask: 'voltage' });
    expect(value(series('R1'))).toEqual({ v: 4, unit: 'V' });
    expect(value(series('R2'))).toEqual({ v: 8, unit: 'V' });
    expect(value(series(''))).toEqual({ v: 12, unit: 'V' });
    // No current through the open branch, so its switch sees the whole voltage of its block.
    const open = circuit([[[L(10)], [S(true), L(10)]]], {
      u: 6,
      m: 'voltmeter',
      mt: 'S1',
      ask: 'voltage',
    });
    expect(value(open)).toEqual({ v: 6, unit: 'V' });
  });

  it('no reading without the values it needs, or with the loop open', () => {
    const noU = circuit([[[R(100)]]], { m: 'ammeter', ask: 'current' });
    expect(circuitKey(noU)).toBeNull();
    const openLoop = circuit([[[R(100)]], [[S(true)]]], {
      u: 6,
      m: 'voltmeter',
      mt: 'R1',
      ask: 'voltage',
    });
    expect(circuitKey(openLoop)).toBeNull();
  });
});

describe('series or parallel', () => {
  it('only where the circuit plainly is one of them', () => {
    expect(circuitKind(circuit([[[L()]], [[S(false)]], [[L()]]]))).toBe('series');
    expect(circuitKind(circuit([[[S(false)]], [[L()], [L()]]]))).toBe('parallel');
    expect(circuitKind(circuit([[[L()]], [[L()], [L()]]]))).toBeNull();
    expect(circuitKind(circuit([[[L(), L()], [L()]]]))).toBeNull();
    expect(circuitKind(circuit([[[L()]]]))).toBeNull();
  });
});

describe('rules', () => {
  it('names the parts in reading order, per kind', () => {
    const c = circuit([[[S(false)]], [[L(), R(5)], [L()]]]);
    expect(circuitParts(c).map((p) => p.name)).toEqual(['S1', 'L1', 'R1', 'L2']);
  });

  it('rejects what does not hold', () => {
    expect(circuitProblem(circuit([[[{ k: 'lamp', r: 0, o: true }]]]))).toBe('structure');
    expect(circuitProblem(circuit([[[{ k: 'switch', r: 5, o: false }, L()]]]))).toBe('structure');
    expect(circuitProblem(circuit([[[L()]]], { m: 'ammeter', mt: 'R4' }))).toBe('meter');
    expect(circuitProblem(circuit([[[L()]]], { mt: 'L1' }))).toBe('meter');
    expect(circuitProblem(circuit([[[L()]]], { ask: 'lit', at: 'L3' }))).toBe('ask');
    expect(circuitProblem(circuit([[[L()]]], { ask: 'kind' }))).toBe('ask');
    expect(circuitProblem(circuit([[[L(), L(), L()]], [[R(1), R(2), R(3)]]]))).toBe('too_wide');
    expect(circuitProblem(circuit([[[L()], [L(), S(true)]]], { ask: 'lit', at: 'L2' }))).toBeNull();
  });
});

describe('layout on the narrowest phone', () => {
  const shapes: Circuit[] = [
    circuit([[[L()]]], { u: 4.5 }),
    circuit(
      [
        [
          [L(), S(false)],
          [L(), S(true)],
        ],
      ],
      { u: 4.5 },
    ),
    circuit([[[R(100)]], [[R(200)], [R(200)]]], { m: 'voltmeter', mt: 'R2' }),
    circuit([[[S(false)]], [[L(), L()], [L()], [R(4700)]]], { u: 12, m: 'ammeter', mt: 'L3' }),
    circuit([[[R(100)]], [[R(200)]]], { u: 12, m: 'voltmeter', mt: '' }),
    circuit([[[R(100)]], [[R(200)]]], { u: 12, m: 'ammeter', mt: '' }),
  ];

  it.each(shapes.map((c, i) => [i, c] as const))('shape %i fits and nothing overlaps', (_, c) => {
    expect(circuitProblem(c)).toBeNull();
    const layout = circuitLayout(c, TREE_WIDTH)!;
    for (const p of layout.parts) {
      expect(p.at.x - CELL / 2).toBeGreaterThanOrEqual(0);
      expect(p.at.x + CELL / 2).toBeLessThanOrEqual(TREE_WIDTH);
      expect(p.at.y).toBeLessThan(layout.height);
    }
    for (const [i, a] of layout.parts.entries()) {
      for (const b of layout.parts.slice(i + 1)) {
        // A part's name stands above it and its value below: two labelled parts in one column
        // stand a whole row apart, so a value never touches the next branch's name.
        const labelled = (p: typeof a) => p.name !== '' || p.ohm > 0;
        const gap = labelled(a) && labelled(b) ? 2 * AXIS + 6 : 30;
        const apart = Math.abs(a.at.x - b.at.x) >= CELL - 1 || Math.abs(a.at.y - b.at.y) >= gap;
        expect(apart).toBe(true);
      }
    }
    for (const w of layout.wires) {
      for (const x of [w.from.x, w.to.x]) expect(x).toBeGreaterThanOrEqual(0);
      for (const y of [w.from.y, w.to.y]) expect(y).toBeLessThanOrEqual(layout.height);
    }
  });

  it('draws the meters it was given, and every lamp the same whatever it does', () => {
    const c = shapes[3]!;
    const kinds = circuitLayout(c, TREE_WIDTH)!.parts.map((p) => p.kind);
    expect(kinds.filter((k) => k === 'ammeter')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'lamp')).toHaveLength(3);
  });

  it('a wider phone draws the same circuit, centred', () => {
    const narrow = circuitLayout(shapes[1]!, TREE_WIDTH)!;
    const wide = circuitLayout(shapes[1]!, TREE_WIDTH + 100)!;
    expect(wide.height).toBe(narrow.height);
    expect(wide.parts[0]!.at.x - narrow.parts[0]!.at.x).toBe(50);
  });
});
