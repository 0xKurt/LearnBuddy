// Solids, cube nets and points in space (issue #255): what code computes and what it refuses.

import { describe, expect, it } from 'vitest';

import {
  isPolyhedron,
  SOLID_KINDS,
  solidCounts,
  solidDrawing,
  solidKey,
  solidMeasures,
  solidProblem,
  type Solid,
  type SolidKind,
} from '../solids.js';
import {
  axesKey,
  axesProblem,
  foldNet,
  isCubeNet,
  netKey,
  netProblem,
  oppositeSquares,
  type Axes3d,
  type CubeNet,
  type NetCell,
} from '../space.js';

const solid = (k: SolidKind, m: Partial<Solid> = {}): Solid => ({
  type: 'solid',
  k,
  n: 0,
  a: 0,
  b: 0,
  h: 0,
  r: 0,
  u: 'cm',
  ask: 'none',
  ...m,
});

describe('solids', () => {
  it('counts vertices, edges and faces so that Euler holds for every polyhedron', () => {
    for (const k of ['prism', 'pyramid'] as const) {
      for (let n = 3; n <= 8; n++) {
        const c = solidCounts(k, n)!;
        expect(c.vertices - c.edges + c.faces).toBe(2);
      }
    }
    expect(solidCounts('cube', 0)).toEqual({ vertices: 8, edges: 12, faces: 6 });
    expect(solidCounts('prism', 3)).toEqual({ vertices: 6, edges: 9, faces: 5 });
    expect(solidCounts('pyramid', 4)).toEqual({ vertices: 5, edges: 8, faces: 5 });
    expect(solidCounts('cylinder', 0)).toBeNull();
  });

  it('computes volume and surface area from the measures', () => {
    const close = (x: number, y: number) => expect(x).toBeCloseTo(y, 9);
    expect(solidMeasures(solid('cube', { a: 3 }))).toEqual({ volume: 27, surface: 54 });
    expect(solidMeasures(solid('cuboid', { a: 5, b: 3, h: 2 }))).toEqual({
      volume: 30,
      surface: 62,
    });
    // A square prism is a cuboid.
    const sq = solidMeasures(solid('prism', { n: 4, a: 3, h: 5 }));
    close(sq.volume, 45);
    close(sq.surface, 78);
    // A triangular prism: base √3/4 · a².
    const tri = solidMeasures(solid('prism', { n: 3, a: 2, h: 10 }));
    close(tri.volume, Math.sqrt(3) * 10);
    close(tri.surface, 2 * Math.sqrt(3) + 60);
    // A square pyramid 6 × 6, height 4: slant height 5, V = 48, O = 36 + 4 · 15 = 96.
    const pyr = solidMeasures(solid('pyramid', { n: 4, a: 6, h: 4 }));
    close(pyr.volume, 48);
    close(pyr.surface, 96);
    const cyl = solidMeasures(solid('cylinder', { r: 2, h: 5 }));
    close(cyl.volume, 20 * Math.PI);
    close(cyl.surface, 28 * Math.PI);
    // Cone r 3, h 4: s = 5, O = 9π + 15π.
    const cone = solidMeasures(solid('cone', { r: 3, h: 4 }));
    close(cone.volume, 12 * Math.PI);
    close(cone.surface, 24 * Math.PI);
    const ball = solidMeasures(solid('sphere', { r: 3 }));
    close(ball.volume, 36 * Math.PI);
    close(ball.surface, 36 * Math.PI);
  });

  it('names the key the figure declares, with its unit', () => {
    expect(solidKey(solid('cuboid', { a: 5, b: 3, h: 2, ask: 'volume' }))).toEqual({
      kind: 'volume',
      value: 30,
      unit: 'cm³',
    });
    expect(solidKey(solid('cube', { a: 2, u: 'm', ask: 'surface' }))).toEqual({
      kind: 'area',
      value: 24,
      unit: 'm²',
    });
    expect(solidKey(solid('pyramid', { n: 5, a: 2, h: 3, ask: 'edges' }))).toEqual({
      kind: 'count',
      n: 10,
    });
    expect(solidKey(solid('cube', { a: 2 }))).toBeNull();
  });

  it('refuses missing or extra measures, odd proportions and counts on round solids', () => {
    expect(solidProblem(solid('cuboid', { a: 5, b: 3 }))).toBe('measures');
    expect(solidProblem(solid('cube', { a: 5, h: 5 }))).toBe('measures');
    expect(solidProblem(solid('prism', { a: 5, h: 3 }))).toBe('measures');
    expect(solidProblem(solid('cylinder', { n: 4, r: 2, h: 3 }))).toBe('measures');
    expect(solidProblem(solid('cuboid', { a: 50, b: 3, h: 2 }))).toBe('proportion');
    expect(solidProblem(solid('cone', { r: 4, h: 1 }))).toBe('proportion');
    expect(solidProblem(solid('cylinder', { r: 2, h: 3, ask: 'edges' }))).toBe('ask');
    expect(solidProblem(solid('sphere', { r: 2, ask: 'volume' }))).toBeNull();
  });

  it('dashes exactly the edges a solid hides', () => {
    const hidden = (s: Solid) => solidDrawing(s).strokes.filter((st) => st.hidden).length;
    const edges = (s: Solid) => solidDrawing(s).strokes.length;
    const cube = solid('cube', { a: 2 });
    expect(edges(cube)).toBe(12);
    expect(hidden(cube)).toBe(3);
    expect(hidden(solid('cuboid', { a: 4, b: 3, h: 2 }))).toBe(3);
    const prism = solid('prism', { n: 6, a: 2, h: 4 });
    expect(edges(prism)).toBe(18);
    expect(hidden(prism)).toBeGreaterThan(0);
    // Every polyhedron's drawing has exactly its edges (plus the pyramid's height line).
    for (const k of SOLID_KINDS.filter(isPolyhedron)) {
      for (const n of k === 'prism' || k === 'pyramid' ? [3, 4, 5, 6, 8] : [0]) {
        const s = solid(k, { n, a: 3, b: k === 'cuboid' ? 2 : 0, h: k === 'cube' ? 0 : 4 });
        expect(solidProblem(s)).toBeNull();
        const extra = k === 'pyramid' ? 1 : 0;
        expect(edges(s)).toBe(solidCounts(k, n)!.edges + extra);
      }
    }
    // A cylinder hides half its bottom circle; a cone the back of its base.
    expect(hidden(solid('cylinder', { r: 2, h: 3 }))).toBe(1);
    expect(hidden(solid('cone', { r: 2, h: 4 }))).toBe(3);
  });
});

// ─────────────── cube nets ───────────────

const key = (cells: readonly NetCell[]) =>
  cells
    .map((c) => `${c.x},${c.y}`)
    .sort()
    .join(' ');

/** The shape moved to the corner, in its smallest form under rotation and reflection. */
function canonical(cells: readonly NetCell[]): string {
  const forms: string[] = [];
  let cur = cells.map((c) => ({ ...c }));
  for (let r = 0; r < 4; r++) {
    cur = cur.map((c) => ({ x: c.y, y: -c.x }));
    for (const mirror of [false, true]) {
      const m = cur.map((c) => ({ x: mirror ? -c.x : c.x, y: c.y }));
      const x0 = Math.min(...m.map((c) => c.x));
      const y0 = Math.min(...m.map((c) => c.y));
      forms.push(key(m.map((c) => ({ x: c.x - x0, y: c.y - y0 }))));
    }
  }
  return forms.sort()[0]!;
}

/** Every free hexomino (35), grown square by square from one square. */
function hexominoes(): NetCell[][] {
  let level = new Map<string, NetCell[]>([['0,0', [{ x: 0, y: 0 }]]]);
  for (let size = 2; size <= 6; size++) {
    const next = new Map<string, NetCell[]>();
    for (const shape of level.values()) {
      for (const c of shape) {
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const add = { x: c.x + dx, y: c.y + dy };
          if (shape.some((s) => s.x === add.x && s.y === add.y)) continue;
          const grown = [...shape, add];
          const k = canonical(grown);
          if (!next.has(k)) {
            next.set(
              k,
              k.split(' ').map((p) => {
                const [x, y] = p.split(',').map(Number);
                return { x: x!, y: y! };
              }),
            );
          }
        }
      }
    }
    level = next;
  }
  return [...level.values()];
}

const net = (rows: string[], ask: CubeNet['ask'] = 'none', at = 0): CubeNet => ({
  type: 'cube_net',
  c: rows.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === '#' ? [{ x, y }] : []))),
  ask,
  at,
});

describe('cube nets', () => {
  it('folds exactly the 11 cube nets among the 35 hexominoes', () => {
    const all = hexominoes();
    expect(all).toHaveLength(35);
    const nets = all.filter(isCubeNet);
    expect(nets).toHaveLength(11);
    // Every hexomino but the straight six fits the 5 × 5 grid and passes the figure's own
    // rules; the straight six (no net either) does not fit.
    const fits = all.filter((cells) => cells.every((c) => c.x < 5 && c.y < 5));
    expect(fits).toHaveLength(34);
    expect(nets.every((cells) => fits.includes(cells))).toBe(true);
    for (const cells of fits) {
      expect(netProblem({ type: 'cube_net', c: cells, ask: 'fold', at: 0 })).toBeNull();
      expect(netKey({ type: 'cube_net', c: cells, ask: 'fold', at: 0 })).toEqual({
        kind: 'fold',
        folds: isCubeNet(cells),
      });
    }
  });

  it('finds the square opposite each square', () => {
    // The cross: 1 on top, 2 3 4 5 across, 6 below. Opposite: 1–6, 2–4, 3–5.
    const cross = net(['.#..', '####', '.#..']);
    // Order of `c`: (1,0) (0,1) (1,1) (2,1) (3,1) (1,2).
    expect(oppositeSquares(cross.c)).toEqual([5, 3, 4, 1, 2, 0]);
    expect(netKey({ ...cross, ask: 'opposite', at: 2 })).toEqual({ kind: 'opposite', n: 5 });
    // The 3-3 staircase is five squares wide and still a net.
    expect(isCubeNet(net(['###..', '..###']).c)).toBe(true);
    // Four in a row with two on one side at the same end: no net (two squares meet).
    expect(isCubeNet(net(['##..', '####']).c)).toBe(false);
  });

  it('refuses squares that do not hang together or are not six', () => {
    expect(netProblem(net(['##.##', '.#..#']))).toBe('structure');
    expect(netProblem(net(['#####']))).toBe('structure');
    expect(
      foldNet([
        { x: 0, y: 0 },
        { x: 2, y: 0 },
      ]),
    ).toBeNull();
    expect(netProblem(net(['##..', '####'], 'opposite', 0))).toBe('ask');
  });
});

// ─────────────── points in space ───────────────

const axes = (over: Partial<Axes3d> = {}): Axes3d => ({
  type: 'axes3d',
  p: [
    { l: 'A', x: 2, y: 1, z: 0 },
    { l: 'B', x: 0, y: 4, z: 4 },
  ],
  v: [{ a: 0, b: 1 }],
  ask: 'none',
  i: 0,
  j: 0,
  ...over,
});

describe('points in space', () => {
  it('computes a point, a vector and a distance', () => {
    expect(axesKey(axes({ ask: 'point', i: 1 }))).toEqual({ kind: 'coords', c: [0, 4, 4] });
    expect(axesKey(axes({ ask: 'vector', i: 0, j: 1 }))).toEqual({
      kind: 'coords',
      c: [-2, 3, 4],
    });
    const d = axesKey(axes({ ask: 'distance', i: 0, j: 1 }));
    expect(d?.kind === 'distance' && d.value).toBeCloseTo(Math.sqrt(29), 12);
    expect(axesKey(axes())).toBeNull();
  });

  it('refuses two points on one spot, bad names and keys that name no point', () => {
    // (2|1|1) is drawn exactly where (0|0|0) is.
    expect(
      axesProblem(
        axes({
          p: [
            { l: 'O', x: 0, y: 0, z: 0 },
            { l: 'P', x: 2, y: 1, z: 1 },
          ],
          v: [],
        }),
      ),
    ).toBe('overlap');
    expect(axesProblem(axes({ p: [{ l: 'a', x: 1, y: 1, z: 1 }], v: [] }))).toBe('structure');
    expect(axesProblem(axes({ v: [{ a: 0, b: 3 }] }))).toBe('structure');
    expect(axesProblem(axes({ ask: 'vector', i: 1, j: 1 }))).toBe('ask');
    expect(axesProblem(axes({ ask: 'point', i: 4 }))).toBe('ask');
  });
});
