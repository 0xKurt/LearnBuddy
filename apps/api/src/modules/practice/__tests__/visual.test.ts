// What a picture says is computed, both ways (issues #254, #255, Abnahme):
//
//   1. **Zeiger ↔ Uhrzeit**, incl. Viertel und Halb: "halb acht", 7:30 and 19:30 are one time.
//   2. **Betrag aus Münzen**; a sum that is not whole cents, or that disagrees with the pieces,
//      is no question.
//   3. **Alle 11 Würfelnetze** are recognised — counted over every one of the 35 hexominoes, so a
//      folding bug that accepts a 12th or loses one cannot hide — and non-nets are rejected.
//   4. **Volumen/Oberfläche je Körper**, Ecken/Kanten/Flächen by Euler; a model claim that
//      differs drops the item.
//   5. Her answer: a time, an amount, coins, three numbers — read by a closed grammar; what the
//      grammar does not read is null, never "wrong".

import { describe, expect, it } from 'vitest';

import type { NetCell, VisualTask } from '@learnbuddy/shared-types/contracts';

import { checkVisual, usableVisualTask, visualItem, visualSurfaceOf } from '../visual.js';
import {
  amountMatches,
  connected,
  foldsToCube,
  parseClockAnswer,
  parseTriple,
  solidCounts,
  solidMeasure,
} from '../visualMath.js';

// ─────────────── the clock ───────────────

describe('clock', () => {
  const at = (text: string, locale = 'de') => parseClockAnswer(text, locale);

  it('reads digital times in every notation', () => {
    expect(at('7:45')).toEqual({ hour: 7, minute: 45 });
    expect(at('07.45 Uhr')).toEqual({ hour: 7, minute: 45 });
    expect(at('7 Uhr 45')).toEqual({ hour: 7, minute: 45 });
    expect(at('19:30', 'fr')).toEqual({ hour: 19, minute: 30 });
    expect(at('7 Uhr')).toEqual({ hour: 7, minute: 0 });
  });

  it('reads the German spoken forms, quarter and half included', () => {
    expect(at('halb acht')).toEqual({ hour: 7, minute: 30 });
    expect(at('Halb 8')).toEqual({ hour: 7, minute: 30 });
    expect(at('viertel nach sieben')).toEqual({ hour: 7, minute: 15 });
    expect(at('Viertel vor acht')).toEqual({ hour: 7, minute: 45 });
    expect(at('dreiviertel acht')).toEqual({ hour: 7, minute: 45 });
    expect(at('viertel acht')).toEqual({ hour: 7, minute: 15 });
    expect(at('fünf nach halb acht')).toEqual({ hour: 7, minute: 35 });
    expect(at('zehn vor halb acht')).toEqual({ hour: 7, minute: 20 });
    expect(at('zehn vor acht')).toEqual({ hour: 7, minute: 50 });
    expect(at('zwanzig nach drei')).toEqual({ hour: 3, minute: 20 });
    expect(at('halb eins')).toEqual({ hour: 12, minute: 30 });
    expect(at('Es ist halb acht.')).toEqual({ hour: 7, minute: 30 });
  });

  it('reads the English spoken forms', () => {
    expect(at('half past seven', 'en')).toEqual({ hour: 7, minute: 30 });
    expect(at('quarter to eight', 'en')).toEqual({ hour: 7, minute: 45 });
    expect(at('ten past three', 'en')).toEqual({ hour: 3, minute: 10 });
    expect(at("seven o'clock", 'en')).toEqual({ hour: 7, minute: 0 });
  });

  it('says nothing about what it cannot read whole', () => {
    expect(at('kurz vor acht')).toBeNull();
    expect(at('ungefähr halb acht')).toBeNull();
    expect(at('7:75')).toBeNull();
    expect(at('halb acht', 'en')).toBeNull();
  });

  const read: VisualTask = { task: 'clock', hour: 7, minute: 30 };
  it('halb acht, 7:30 and 19:30 are the same position of the hands', () => {
    expect(checkVisual(read, 'halb acht', 'de')).toBe('correct');
    expect(checkVisual(read, '7:30', 'de')).toBe('correct');
    expect(checkVisual(read, '19:30', 'de')).toBe('correct');
    expect(checkVisual(read, 'halb sieben', 'de')).toBe('incorrect');
    expect(checkVisual(read, '6:30', 'de')).toBe('incorrect');
    expect(checkVisual(read, 'so gegen acht', 'de')).toBeNull();
  });

  it('draws the time it asks for and keys it', () => {
    const item = visualItem({ task: 'clock', hour: 7, minute: 45 }, 'de');
    expect(item?.figure).toEqual({ type: 'clock', hour: 7, minute: 45 });
    expect(item?.answer).toBe('7:45');
    expect(item?.accepted_answers).toEqual(['19:45']);
  });

  it('reads any minute off its sixty marks, and is never a surface (setting is #248)', () => {
    const odd: VisualTask = { task: 'clock', hour: 7, minute: 43 };
    expect(usableVisualTask(odd)).not.toBeNull();
    expect(visualSurfaceOf(odd)).toBeNull();
    expect(checkVisual(odd, 'siebzehn vor acht', 'de')).toBe('correct');
  });
});

// ─────────────── money ───────────────

describe('money', () => {
  const count: VisualTask = {
    task: 'money',
    pieces: [200, 100, 20, 20, 5],
    total: 3.45,
    set: false,
  };

  it('computes the amount from the pieces and drops a claim that differs', () => {
    expect(usableVisualTask(count)).not.toBeNull();
    expect(usableVisualTask({ ...count, total: 3.4 })).toBeNull();
    // Not whole cents: no real euro amount.
    expect(usableVisualTask({ ...count, total: 3.455 })).toBeNull();
    const item = visualItem(count, 'de');
    expect(item?.answer).toBe('3.45');
    expect(item?.unit).toBe('€');
    expect(item?.figure).toEqual({ type: 'money', pieces: [200, 100, 20, 20, 5] });
    expect(item?.worked_solution).toBe('2 € + 1 € + 20 ct + 20 ct + 5 ct = 3,45 €.');
  });

  it('takes an amount in euros or in cent', () => {
    expect(amountMatches('3,45 €', 345)).toBe(true);
    expect(amountMatches('3.45', 345)).toBe(true);
    expect(amountMatches('345 ct', 345)).toBe(true);
    expect(amountMatches('3 € 45', 345)).toBe(true);
    expect(amountMatches('€3.45', 345)).toBe(true);
    expect(amountMatches('3,5 €', 350)).toBe(true);
    expect(amountMatches('345', 345)).toBe(true);
    expect(amountMatches('3,40 €', 345)).toBe(false);
    expect(amountMatches('drei Euro', 345)).toBeNull();
    expect(checkVisual(count, '3,45 €', 'de')).toBe('correct');
    expect(checkVisual(count, '3,54 €', 'de')).toBe('incorrect');
  });

  it('laying an amount compares the SUM of her coins, any way she lays it', () => {
    const lay: VisualTask = {
      task: 'money',
      pieces: [200, 100, 20, 20, 5],
      total: 3.45,
      set: true,
    };
    const item = visualItem(lay, 'de');
    expect(item?.prompt).toBe('Lege 3,45 €.');
    expect(item?.figure).toBeNull();
    // Notes only from 5 € on: none of them fits 3,45 €.
    expect(visualSurfaceOf(lay)).toEqual({
      mode: 'coins',
      offer: [1, 2, 5, 10, 20, 50, 100, 200],
    });
    expect(checkVisual(lay, '200 100 20 20 5', 'de')).toBe('correct');
    expect(checkVisual(lay, '100 100 100 20 10 10 5', 'de')).toBe('correct');
    expect(checkVisual(lay, '200 100 20 20', 'de')).toBe('incorrect');
    // Over 100 € is more than a Grundschule lays.
    expect(
      usableVisualTask({ task: 'money', pieces: [5000, 5000, 5000], total: 150, set: true }),
    ).toBeNull();
  });
});

// ─────────────── quantities ───────────────

describe('quantity', () => {
  it('draws the number in a field or in bundles and keys it', () => {
    const field = visualItem({ task: 'quantity', look: 'twenty_field', number: 13 }, 'de');
    expect(field?.figure).toEqual({ type: 'dot_field', size: 20, filled: 13 });
    expect(field?.answer).toBe('13');
    const chart = visualItem({ task: 'quantity', look: 'chart', number: 2047 }, 'de');
    expect(chart?.figure).toEqual({
      type: 'base_ten',
      look: 'chart',
      thousands: 2,
      hundreds: 0,
      tens: 4,
      ones: 7,
    });
    expect(usableVisualTask({ task: 'quantity', look: 'twenty_field', number: 21 })).toBeNull();
    expect(usableVisualTask({ task: 'quantity', look: 'blocks', number: 1000 })).toBeNull();
  });
});

// ─────────────── cube nets ───────────────

/** Every fixed polyomino of `n` cells, as sorted, normalised cell lists. */
function polyominoes(n: number): NetCell[][] {
  let shapes = new Map<string, NetCell[]>([['0,0', [{ col: 0, row: 0 }]]]);
  for (let size = 1; size < n; size++) {
    const next = new Map<string, NetCell[]>();
    for (const cells of shapes.values()) {
      for (const c of cells) {
        for (const [dc, dr] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const cell = { col: c.col + dc, row: c.row + dr };
          if (cells.some((x) => x.col === cell.col && x.row === cell.row)) continue;
          const grown = normalise([...cells, cell]);
          next.set(keyOf(grown), grown);
        }
      }
    }
    shapes = next;
  }
  return [...shapes.values()];
}

function normalise(cells: NetCell[]): NetCell[] {
  const minC = Math.min(...cells.map((c) => c.col));
  const minR = Math.min(...cells.map((c) => c.row));
  return cells
    .map((c) => ({ col: c.col - minC, row: c.row - minR }))
    .sort((a, b) => a.row - b.row || a.col - b.col);
}

function keyOf(cells: NetCell[]): string {
  return cells.map((c) => `${c.col},${c.row}`).join(' ');
}

/** The same shape turned or mirrored: one key for all eight. */
function freeKey(cells: NetCell[]): string {
  const forms: NetCell[][] = [];
  let cur = cells;
  for (let i = 0; i < 4; i++) {
    cur = cur.map((c) => ({ col: c.row, row: -c.col }));
    forms.push(normalise(cur), normalise(cur.map((c) => ({ col: -c.col, row: c.row }))));
  }
  return forms.map(keyOf).sort()[0] as string;
}

describe('cube nets', () => {
  const fixed = polyominoes(6);
  const free = new Map<string, NetCell[]>();
  for (const cells of fixed) free.set(freeKey(cells), cells);

  it('there are 35 hexominoes (216 fixed), and exactly 11 of them fold into a cube', () => {
    expect(fixed).toHaveLength(216);
    expect(free.size).toBe(35);
    expect([...free.values()].filter(foldsToCube)).toHaveLength(11);
  });

  it('a net folds in every rotation and mirror image, a non-net in none', () => {
    const byShape = new Map<string, boolean[]>();
    for (const cells of fixed) {
      const k = freeKey(cells);
      byShape.set(k, [...(byShape.get(k) ?? []), foldsToCube(cells)]);
    }
    for (const results of byShape.values()) expect(new Set(results).size).toBe(1);
  });

  it('knows the textbook cases', () => {
    const cells = (rows: string[]) =>
      rows.flatMap((r, row) => [...r].flatMap((ch, col) => (ch === '#' ? [{ col, row }] : [])));
    // The cross: a net.
    expect(foldsToCube(cells(['.#..', '####', '.#..']))).toBe(true);
    // 2 × 3: not a net.
    expect(foldsToCube(cells(['###', '###']))).toBe(false);
    // Five in a row: not a net.
    expect(foldsToCube(cells(['#####', '#....']))).toBe(false);
    // The staircase: a net.
    expect(foldsToCube(cells(['##..', '.##.', '..##']))).toBe(true);
    // Squares that only touch at a corner are not one piece.
    expect(connected(cells(['#.', '.#']))).toBe(false);
  });

  it('a model claim that differs from the folding drops the item', () => {
    const cross = [
      { col: 1, row: 0 },
      { col: 0, row: 1 },
      { col: 1, row: 1 },
      { col: 2, row: 1 },
      { col: 3, row: 1 },
      { col: 1, row: 2 },
    ];
    expect(usableVisualTask({ task: 'cube_net', cells: cross, is_net: false })).toBeNull();
    const item = visualItem({ task: 'cube_net', cells: cross, is_net: true }, 'de');
    expect(item?.choices).toEqual(['Ja', 'Nein']);
    expect(item?.correct_choice).toBe(0);
    // Loose squares are no net to ask about, whatever the claim.
    const loose = [...cross.slice(0, 5), { col: 4, row: 4 }];
    expect(usableVisualTask({ task: 'cube_net', cells: loose, is_net: false })).toBeNull();
  });
});

// ─────────────── solids ───────────────

describe('solids', () => {
  it('counts by Euler: V − E + F = 2 for every polyhedron', () => {
    for (const solid of [
      'cube',
      'cuboid',
      'prism_3',
      'prism_5',
      'prism_6',
      'prism_8',
      'pyramid_3',
      'pyramid_4',
      'pyramid_5',
      'pyramid_6',
    ] as const) {
      const c = solidCounts(solid);
      expect(c).not.toBeNull();
      if (c) expect(c.vertices - c.edges + c.faces).toBe(2);
    }
    expect(solidCounts('cube')).toEqual({ vertices: 8, edges: 12, faces: 6 });
    expect(solidCounts('prism_6')).toEqual({ vertices: 12, edges: 18, faces: 8 });
    expect(solidCounts('pyramid_4')).toEqual({ vertices: 5, edges: 8, faces: 5 });
    expect(solidCounts('cylinder')).toBeNull();
  });

  it('volume and surface per solid', () => {
    const d = (o: Record<string, number>) =>
      Object.entries(o).map(([name, value]) => ({ name: name as 'a' | 'b' | 'h' | 'r', value }));
    expect(solidMeasure('cube', 'volume', d({ a: 3 }))).toBe(27);
    expect(solidMeasure('cube', 'surface', d({ a: 3 }))).toBe(54);
    expect(solidMeasure('cuboid', 'volume', d({ a: 2, b: 3, h: 4 }))).toBe(24);
    expect(solidMeasure('cuboid', 'surface', d({ a: 2, b: 3, h: 4 }))).toBe(52);
    expect(solidMeasure('cylinder', 'volume', d({ r: 3, h: 5 }))).toBeCloseTo(141.372, 3);
    expect(solidMeasure('cylinder', 'surface', d({ r: 3, h: 5 }))).toBeCloseTo(150.796, 3);
    expect(solidMeasure('cone', 'volume', d({ r: 3, h: 4 }))).toBeCloseTo(37.699, 3);
    expect(solidMeasure('cone', 'surface', d({ r: 3, h: 4 }))).toBeCloseTo(75.398, 3);
    expect(solidMeasure('sphere', 'volume', d({ r: 3 }))).toBeCloseTo(113.097, 3);
    expect(solidMeasure('sphere', 'surface', d({ r: 3 }))).toBeCloseTo(113.097, 3);
    expect(solidMeasure('pyramid_4', 'volume', d({ a: 6, h: 4 }))).toBeCloseTo(48, 9);
    expect(solidMeasure('pyramid_4', 'surface', d({ a: 6, h: 4 }))).toBeCloseTo(96, 9);
    expect(solidMeasure('prism_3', 'volume', d({ a: 2, h: 5 }))).toBeCloseTo(8.66, 3);
    expect(solidMeasure('prism_6', 'surface', d({ a: 2, h: 5 }))).toBeCloseTo(80.785, 3);
  });

  it('a counting question only for polyhedra, and only with the model counting right', () => {
    expect(
      usableVisualTask({
        task: 'solid',
        solid: 'prism_6',
        ask: 'edges',
        dims: [],
        unit: 'cm',
        claim: 18,
      }),
    ).not.toBeNull();
    expect(
      usableVisualTask({
        task: 'solid',
        solid: 'prism_6',
        ask: 'edges',
        dims: [],
        unit: 'cm',
        claim: 12,
      }),
    ).toBeNull();
    expect(
      usableVisualTask({
        task: 'solid',
        solid: 'cylinder',
        ask: 'edges',
        dims: [],
        unit: 'cm',
        claim: 2,
      }),
    ).toBeNull();
  });

  it("a measure question needs exactly its measures and the model's result", () => {
    const dims = [
      { name: 'r' as const, value: 3 },
      { name: 'h' as const, value: 5 },
    ];
    const cyl: VisualTask = {
      task: 'solid',
      solid: 'cylinder',
      ask: 'volume',
      dims,
      unit: 'cm',
      claim: 141.4,
    };
    const item = visualItem(cyl, 'de');
    expect(item?.answer).toBe('141.4');
    // Computed with π = 3.14 as many textbooks do.
    expect(item?.accepted_answers).toEqual(['141.3']);
    expect(item?.unit).toBe('cm³');
    expect(item?.tolerance).toBe(0.05);
    expect(item?.prompt).toBe(
      'Berechne das Volumen (Zylinder, r = 3 cm, h = 5 cm). Runde auf eine Nachkommastelle.',
    );
    // With π = 3.14 the model is still within half a percent.
    expect(usableVisualTask({ ...cyl, claim: 141.3 })).not.toBeNull();
    expect(usableVisualTask({ ...cyl, claim: 150 })).toBeNull();
    expect(usableVisualTask({ ...cyl, dims: [{ name: 'r', value: 3 }] })).toBeNull();
    expect(usableVisualTask({ ...cyl, dims: [...dims, { name: 'a', value: 1 }] })).toBeNull();
    // A whole result is exact: no rounding said, no tolerance.
    const cube = visualItem(
      {
        task: 'solid',
        solid: 'cube',
        ask: 'volume',
        dims: [{ name: 'a', value: 3 }],
        unit: 'm',
        claim: 27,
      },
      'de',
    );
    expect(cube?.answer).toBe('27');
    expect(cube?.tolerance).toBeNull();
    expect(cube?.unit).toBe('m³');
  });
});

// ─────────────── space ───────────────

describe('points and vectors in space', () => {
  it('reads three numbers in every school notation', () => {
    expect(parseTriple('(2|3|1)')).toEqual([2, 3, 1]);
    expect(parseTriple('P(2 | 3 | 1)')).toEqual([2, 3, 1]);
    expect(parseTriple('(2;3;1)')).toEqual([2, 3, 1]);
    expect(parseTriple('2, 3, 1')).toEqual([2, 3, 1]);
    expect(parseTriple('2 3 1')).toEqual([2, 3, 1]);
    expect(parseTriple('(1|−2|0,5)')).toEqual([1, -2, 0.5]);
    expect(parseTriple('(2|3)')).toBeNull();
    expect(parseTriple('zwei drei eins')).toBeNull();
  });

  it('a point is read off its drawn path; a vector is end minus start', () => {
    const p: VisualTask = { task: 'point3d', p: { x: 2, y: 3, z: 2 } };
    const item = visualItem(p, 'de');
    expect(item?.answer).toBe('(2|3|2)');
    expect(item?.figure).toEqual({
      type: 'axes3d',
      size: 3,
      points: [{ name: 'P', at: { x: 2, y: 3, z: 2 } }],
      arrow: false,
    });
    expect(checkVisual(p, '(2|3|2)', 'de')).toBe('correct');
    expect(checkVisual(p, '(3|2|2)', 'de')).toBe('incorrect');
    // Drawn onto an axis (x₁ goes half a unit down per unit, x₃ one up): no question.
    expect(usableVisualTask({ task: 'point3d', p: { x: 2, y: 3, z: 1 } })).toBeNull();
    expect(usableVisualTask({ task: 'point3d', p: { x: 2, y: 1, z: 3 } })).toBeNull();
    const v: VisualTask = { task: 'vector3d', a: { x: 1, y: 1, z: 0 }, b: { x: 3, y: 0, z: 2 } };
    expect(visualItem(v, 'en')?.answer).toBe('(2, -1, 2)');
    expect(checkVisual(v, '(2|-1|2)', 'de')).toBe('correct');
    // B's coordinates instead of the vector: the classic slip, and wrong.
    expect(checkVisual(v, '(3|0|2)', 'de')).toBe('incorrect');
    expect(usableVisualTask({ task: 'vector3d', a: v.a, b: v.a })).toBeNull();
  });
});
