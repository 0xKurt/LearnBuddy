// Cube nets and points in space (issue #255, docs/architecture.md §Practice, Solids). Solids
// themselves are in `solids.ts`.
//
//   - A cube net is six squares on a 5 × 5 grid. Whether it folds into a cube is decided by
//     FOLDING it: the squares are rolled over their shared edges, and a net is one exactly when
//     the six squares land on six different faces. Which square ends up opposite which comes out
//     of the same fold. (All 11 nets fold, the other 24 hexominoes do not — a unit test
//     enumerates them.)
//   - A point in space is drawn in the schoolbook's oblique system: the x axis to the front
//     left at 45°, one unit half a box diagonal; y to the right, z up. Its coordinates, the
//     vector between two points and their distance are computed here.
// A figure that breaks a rule is rejected, never repaired (`netProblem`, `axesProblem`).
//
// Dependency-free on purpose: the app imports this file by path.

import { cubesProblem, type Cubes } from './cubes.js';
import { solidProblem, type Solid } from './solids.js';

// ─────────────── cube nets ───────────────

export const NET_GRID = 5;
export type NetCell = { x: number; y: number };
export type CubeNet = {
  type: 'cube_net';
  c: readonly NetCell[];
  ask: 'none' | 'fold' | 'opposite';
  at: number;
};

export type NetProblem =
  /** Not six different squares inside the grid, or squares that do not hang together. */
  | 'structure'
  /** "Which square is opposite?" on six squares that fold into no cube, or `at` outside. */
  | 'ask';

type V3 = [number, number, number];
const neg = (v: V3): V3 => [-v[0], -v[1], -v[2]];
const key3 = (v: V3) => v.join(',');

/** Edge-neighbours in the grid: right, left, down, up. */
const STEPS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Folds the squares: the face of the cube each square lands on (its outward normal), in the
 * order of `c`; null when the squares do not hang together over shared edges.
 *
 * Each square carries a frame — the cube directions its "right" (u) and "down" (v) point to and
 * the face it lies on (n). Rolling over the right edge, the square to the right lands on the
 * face `u` points to; its own right then points where the first one's face was going down
 * through (−n). The same for the other three edges.
 */
export function foldNet(cells: readonly NetCell[]): V3[] | null {
  const at = new Map(cells.map((c, i) => [`${c.x},${c.y}`, i]));
  if (at.size !== cells.length || cells.length === 0) return null;
  const frame: ({ u: V3; v: V3; n: V3 } | undefined)[] = cells.map(() => undefined);
  frame[0] = { u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, -1] };
  const queue = [0];
  while (queue.length > 0) {
    const i = queue.shift() as number;
    const f = frame[i]!;
    const c = cells[i]!;
    for (const [dx, dy] of STEPS) {
      const j = at.get(`${c.x + dx},${c.y + dy}`);
      if (j === undefined || frame[j] !== undefined) continue;
      if (dx === 1) frame[j] = { u: neg(f.n), v: f.v, n: f.u };
      else if (dx === -1) frame[j] = { u: f.n, v: f.v, n: neg(f.u) };
      else if (dy === 1) frame[j] = { u: f.u, v: neg(f.n), n: f.v };
      else frame[j] = { u: f.u, v: f.n, n: neg(f.v) };
      queue.push(j);
    }
  }
  if (frame.some((f) => f === undefined)) return null;
  return frame.map((f) => f!.n);
}

/** Whether six squares fold into a cube: six squares on six different faces. */
export function isCubeNet(cells: readonly NetCell[]): boolean {
  const faces = foldNet(cells);
  return cells.length === 6 && faces !== null && new Set(faces.map(key3)).size === 6;
}

/** For each square, the square opposite it on the folded cube (indices); null for no net. */
export function oppositeSquares(cells: readonly NetCell[]): number[] | null {
  const faces = foldNet(cells);
  if (faces === null || !isCubeNet(cells)) return null;
  const index = new Map(faces.map((f, i) => [key3(f), i]));
  return faces.map((f) => index.get(key3(neg(f))) ?? -1);
}

/** The first rule a net breaks, or null. */
export function netProblem(net: CubeNet): NetProblem | null {
  const inGrid = (c: NetCell) =>
    Number.isInteger(c.x) &&
    Number.isInteger(c.y) &&
    c.x >= 0 &&
    c.y >= 0 &&
    c.x < NET_GRID &&
    c.y < NET_GRID;
  if (net.c.length !== 6 || !net.c.every(inGrid)) return 'structure';
  if (foldNet(net.c) === null) return 'structure';
  if (net.ask === 'opposite' && (!isCubeNet(net.c) || net.at < 0 || net.at > 5)) return 'ask';
  return null;
}

export type NetKey = { kind: 'fold'; folds: boolean } | { kind: 'opposite'; n: number };

/** The key a net declares (`ask`): folds or not, or the NUMBER (1–6) of the opposite square. */
export function netKey(net: CubeNet): NetKey | null {
  if (net.ask === 'none' || netProblem(net) !== null) return null;
  if (net.ask === 'fold') return { kind: 'fold', folds: isCubeNet(net.c) };
  const opposite = oppositeSquares(net.c)?.[net.at];
  return opposite === undefined || opposite < 0 ? null : { kind: 'opposite', n: opposite + 1 };
}

// ─────────────── points and vectors in space ───────────────

export const SPACE_MIN = -4;
export const SPACE_MAX = 6;
export type SpacePoint = { l: string; x: number; y: number; z: number };
export type Axes3d = {
  type: 'axes3d';
  p: readonly SpacePoint[];
  v: readonly { a: number; b: number }[];
  ask: 'none' | 'point' | 'vector' | 'distance';
  i: number;
  j: number;
};

export type AxesProblem =
  /** A name that is not one capital letter, two points with one name, an arrow to nowhere. */
  | 'structure'
  /** Two points drawn on the same spot: the drawing could not tell them apart. */
  | 'overlap'
  /** The key it declares names a point that is not there (or the same point twice). */
  | 'ask';

/** Screen position of a point in units (y downwards): x to the front left, y right, z up. */
export function spaceProject(x: number, y: number, z: number): { x: number; y: number } {
  return { x: y - 0.5 * x, y: -z + 0.5 * x };
}

/** The first rule a coordinate system breaks, or null. */
export function axesProblem(f: Axes3d): AxesProblem | null {
  const names = new Set(f.p.map((q) => q.l));
  if (names.size !== f.p.length || f.p.some((q) => !/^[A-Z]$/.test(q.l))) return 'structure';
  const inRange = (c: number) => Number.isInteger(c) && c >= SPACE_MIN && c <= SPACE_MAX;
  if (!f.p.every((q) => inRange(q.x) && inRange(q.y) && inRange(q.z))) return 'structure';
  const valid = (k: number) => Number.isInteger(k) && k >= 0 && k < f.p.length;
  if (f.v.some((arrow) => !valid(arrow.a) || !valid(arrow.b) || arrow.a === arrow.b)) {
    return 'structure';
  }
  const spots = f.p.map((q) => {
    const s = spaceProject(q.x, q.y, q.z);
    return `${s.x},${s.y}`;
  });
  if (new Set(spots).size !== spots.length) return 'overlap';
  if (f.ask === 'point' && !valid(f.i)) return 'ask';
  if ((f.ask === 'vector' || f.ask === 'distance') && (!valid(f.i) || !valid(f.j) || f.i === f.j)) {
    return 'ask';
  }
  return null;
}

export type AxesKey =
  | { kind: 'coords'; c: [number, number, number] }
  | { kind: 'distance'; value: number };

/** The key the coordinate system declares: a point's coordinates, a vector, a distance. */
export function axesKey(f: Axes3d): AxesKey | null {
  if (f.ask === 'none' || axesProblem(f) !== null) return null;
  const p = f.p[f.i]!;
  if (f.ask === 'point') return { kind: 'coords', c: [p.x, p.y, p.z] };
  const q = f.p[f.j]!;
  const d: [number, number, number] = [q.x - p.x, q.y - p.y, q.z - p.z];
  if (f.ask === 'vector') return { kind: 'coords', c: d };
  return { kind: 'distance', value: Math.hypot(...d) };
}

/** The drawn range of each axis: from the smallest coordinate (or 0) to one past the largest. */
export function axesRange(f: Axes3d): Record<'x' | 'y' | 'z', [number, number]> {
  const range = (k: 'x' | 'y' | 'z'): [number, number] => {
    const cs = f.p.map((q) => q[k]);
    return [Math.min(0, ...cs), Math.max(2, ...cs) + 1];
  };
  return { x: range('x'), y: range('y'), z: range('z') };
}

// ─────────────── all three ───────────────

export type SpaceFigureData = Solid | CubeNet | Axes3d | Cubes;
const SPACE_TYPE_NAMES: readonly SpaceFigureData['type'][] = [
  'solid',
  'cube_net',
  'axes3d',
  'cubes',
];

export function isSpaceFigure(f: { type: string }): f is SpaceFigureData {
  return (SPACE_TYPE_NAMES as readonly string[]).includes(f.type);
}

/** The first rule a solid, a net, a coordinate system or a cube building breaks, or null. */
export function spaceProblem(f: SpaceFigureData): string | null {
  switch (f.type) {
    case 'solid':
      return solidProblem(f);
    case 'cube_net':
      return netProblem(f);
    case 'axes3d':
      return axesProblem(f);
    case 'cubes':
      return cubesProblem(f);
  }
}
