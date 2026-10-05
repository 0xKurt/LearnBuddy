// Würfelgebäude (#368, the rest of #255; docs/architecture.md §Practice, Solids): a building of
// unit cubes as a Bauplan — the height of every column on a grid — drawn as a Schrägbild, as the
// Bauplan with its numbers, or as one of its three views (Vorderansicht, Seitenansicht von links,
// Draufsicht).
//
// The model writes the heights and what is asked; code computes every key from them and holds the
// question to it (Regel 0, reject — never repair):
//   - how many cubes: the sum of the heights. From a Schrägbild only when every column can be
//     seen — nothing in front of it, in its own column or the one to its right, is taller
//     (`allSeen`): a column hidden behind a taller one could be any height, so the count would be
//     a guess. From the Bauplan always.
//   - which view: multiple choice whose options are views (`v` front, side or top), each computed
//     from its own heights; exactly one of them is the building's view in the asked direction,
//     no two options look alike, and the right option is that one (`viewChoiceHolds`).
//
// Rows run from the FRONT (row 0) to the back, columns from left to right. Dependency-free on
// purpose: the app imports this file by path, so what the server checked is what the app draws.

export type CubesView = 'oblique' | 'plan' | 'front' | 'side' | 'top';
export type CubesAsk = 'none' | 'count' | 'front' | 'side' | 'top';
export type Cubes = {
  type: 'cubes';
  /** Heights, row by row from the front to the back, each row from left to right. */
  g: readonly (readonly number[])[];
  /** How it is drawn: a Schrägbild, the Bauplan, or one view of it. */
  v: CubesView;
  ask: CubesAsk;
};

/** A phone draws four rows and columns of up to four cubes readably. */
export const CUBES_GRID_MAX = 4;
export const CUBES_HEIGHT_MAX = 4;

export type CubesProblem =
  /** Rows of different length, a height that is no whole number 0–4, no cube at all. */
  | 'structure'
  /** A count asked of a Schrägbild that hides a column, or a key asked of a view. */
  | 'ask';

/** Can every column of the Schrägbild be seen? Nothing in front of it is taller (see header). */
export function allSeen(g: Cubes['g']): boolean {
  for (let r = 1; r < g.length; r++) {
    for (let c = 0; c < g[r]!.length; c++) {
      const h = g[r]![c]!;
      if (h === 0) continue;
      for (let front = 0; front < r; front++) {
        if ((g[front]![c] ?? 0) > h || (g[front]![c + 1] ?? 0) > h) return false;
      }
    }
  }
  return true;
}

/** The first rule a building breaks, or null. */
export function cubesProblem(f: Cubes): CubesProblem | null {
  const rows = f.g.length;
  const cols = f.g[0]?.length ?? 0;
  if (rows < 1 || rows > CUBES_GRID_MAX || cols < 1 || cols > CUBES_GRID_MAX) return 'structure';
  for (const row of f.g) {
    if (row.length !== cols) return 'structure';
    if (row.some((h) => !Number.isInteger(h) || h < 0 || h > CUBES_HEIGHT_MAX)) return 'structure';
  }
  if (cubeCount(f.g) === 0) return 'structure';
  const shown = f.v === 'oblique' || f.v === 'plan';
  // A view is an option's picture: it asks nothing; a building may be asked about.
  if (!shown && f.ask !== 'none') return 'ask';
  if (f.ask === 'count' && f.v === 'oblique' && !allSeen(f.g)) return 'ask';
  return null;
}

/** How many cubes the building has. */
export function cubeCount(g: Cubes['g']): number {
  return g.reduce((sum, row) => sum + row.reduce((a, b) => a + b, 0), 0);
}

export type CubesDirection = 'front' | 'side' | 'top';

/**
 * A view as the squares one sees, as rows of 0/1 from the top row down, trimmed to its squares:
 * from the front each column shows its tallest stack; from the left each row (front on the left)
 * its tallest; from above every occupied cell (the front row at the bottom).
 */
export function cubesView(g: Cubes['g'], dir: CubesDirection): number[][] {
  const rows = g.length;
  const cols = g[0]?.length ?? 0;
  let grid: number[][];
  if (dir === 'top') {
    grid = Array.from({ length: rows }, (_, i) =>
      (g[rows - 1 - i] ?? []).map((h) => (h > 0 ? 1 : 0)),
    );
  } else {
    const stacks =
      dir === 'front'
        ? Array.from({ length: cols }, (_, c) => Math.max(...g.map((row) => row[c] ?? 0)))
        : g.map((row) => Math.max(...row));
    const tall = Math.max(...stacks);
    grid = Array.from({ length: tall }, (_, i) => stacks.map((s) => (s >= tall - i ? 1 : 0)));
  }
  return trim(grid);
}

/** The grid without empty rows and columns at its edges. */
function trim(grid: number[][]): number[][] {
  const used = (xs: number[]) => xs.some((x) => x > 0);
  const rows = grid.filter(used);
  if (rows.length === 0) return [];
  const width = rows[0]!.length;
  const cols = Array.from({ length: width }, (_, c) => rows.some((row) => row[c]! > 0));
  const from = cols.indexOf(true);
  const to = cols.lastIndexOf(true);
  return rows.map((row) => row.slice(from, to + 1));
}

const sameGrid = (a: number[][], b: number[][]) => JSON.stringify(a) === JSON.stringify(b);

/** The squares an option of `v` front, side or top shows. */
export function shownView(f: Cubes): number[][] | null {
  return f.v === 'front' || f.v === 'side' || f.v === 'top' ? cubesView(f.g, f.v) : null;
}

export type CubesKey = { kind: 'count'; n: number } | { kind: 'view'; dir: CubesDirection };

/** The key a building declares (`ask`): its count, or which view the options are about. */
export function cubesKey(f: Cubes): CubesKey | null {
  if (f.ask === 'none' || cubesProblem(f) !== null) return null;
  return f.ask === 'count' ? { kind: 'count', n: cubeCount(f.g) } : { kind: 'view', dir: f.ask };
}

/**
 * Views as the OPTIONS of a multiple choice about a building: every option a view of the asked
 * direction, no two alike, exactly one of them the building's own — and the right option is it.
 */
export function viewChoiceHolds(
  building: Cubes,
  options: readonly Cubes[],
  correct: number,
): boolean {
  const key = cubesKey(building);
  if (key === null || key.kind !== 'view' || options.length < 2) return false;
  const views: number[][][] = [];
  for (const o of options) {
    if (cubesProblem(o) !== null || o.v !== key.dir) return false;
    views.push(cubesView(o.g, key.dir));
  }
  for (let i = 0; i < views.length; i++) {
    for (let j = i + 1; j < views.length; j++) if (sameGrid(views[i]!, views[j]!)) return false;
  }
  const own = cubesView(building.g, key.dir);
  const matches = views.flatMap((v, i) => (sameGrid(v, own) ? [i] : []));
  return matches.length === 1 && matches[0] === correct;
}
