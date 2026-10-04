// Solids as data (issue #255, docs/architecture.md §Practice, Solids): a solid's kind and its
// measures, drawn as a Schrägbild (cavalier projection: the depth at 45° to the back right,
// shortened by half, as in the schoolbook).
//
// The model writes the kind and the measures, nothing else. Everything a question's key depends
// on is COMPUTED here, once, for the server and the app alike:
//   - vertices, edges and faces of a polyhedron from its kind (and Euler's V − E + F = 2 holds
//     for every one of them — a unit test says so);
//   - volume and surface area from the measures;
//   - the drawing: projected corners, which edges the solid hides (dashed), where the measures
//     are written.
// A figure that breaks a rule is rejected, never repaired (`solidProblem`). Cube nets and points
// in space are in `space.ts`.
//
// Dependency-free on purpose: the app imports this file by path (like `trees.ts`), so what the
// server checked is exactly what the app draws.

export type SolidKind = 'cube' | 'cuboid' | 'prism' | 'pyramid' | 'cylinder' | 'cone' | 'sphere';
export const SOLID_KINDS: readonly SolidKind[] = [
  'cube',
  'cuboid',
  'prism',
  'pyramid',
  'cylinder',
  'cone',
  'sphere',
];
export type LengthUnit = 'mm' | 'cm' | 'dm' | 'm';
export const LENGTH_UNITS: readonly LengthUnit[] = ['mm', 'cm', 'dm', 'm'];
export type SolidAsk = 'none' | 'vertices' | 'edges' | 'faces' | 'volume' | 'surface';

/**
 * A solid. `n` = the corners of a prism's or a pyramid's base (a regular n-gon with side `a`);
 * `a`, `b`, `h`, `r` = length, depth, height, radius — each kind uses its own (`SOLID_MEASURES`),
 * every other one is 0. `u` = the unit of all of them.
 */
export type Solid = {
  type: 'solid';
  k: SolidKind;
  n: number;
  a: number;
  b: number;
  h: number;
  r: number;
  u: LengthUnit;
  ask: SolidAsk;
};

export type Measure = 'a' | 'b' | 'h' | 'r';

/** The measures each kind is drawn and computed from, in the order they are labelled. */
export const SOLID_MEASURES: Record<SolidKind, readonly Measure[]> = {
  cube: ['a'],
  cuboid: ['a', 'b', 'h'],
  prism: ['a', 'h'],
  pyramid: ['a', 'h'],
  cylinder: ['r', 'h'],
  cone: ['r', 'h'],
  sphere: ['r'],
};

export type SolidProblem =
  /** A measure the kind needs is missing, one it does not use is set, or `n` does not fit. */
  | 'measures'
  /** Too flat or too thin to draw readably on a phone (longest : shortest above 8). */
  | 'proportion'
  /** Vertices, edges or faces of a solid with a curved surface: not one schoolbook answer. */
  | 'ask';

/** Longest : shortest measure a phone still draws readably. */
const MAX_RATIO = 8;

const hasBase = (k: SolidKind) => k === 'prism' || k === 'pyramid';
export const isPolyhedron = (k: SolidKind) =>
  k === 'cube' || k === 'cuboid' || k === 'prism' || k === 'pyramid';

/** The first rule this solid breaks, or null. */
export function solidProblem(s: Solid): SolidProblem | null {
  const used = SOLID_MEASURES[s.k];
  for (const m of ['a', 'b', 'h', 'r'] as const) {
    const v = s[m];
    if (!Number.isFinite(v) || v < 0) return 'measures';
    if (used.includes(m) !== v > 0) return 'measures';
  }
  if (hasBase(s.k) ? !Number.isInteger(s.n) || s.n < 3 || s.n > 8 : s.n !== 0) return 'measures';
  const lengths = used.map((m) => s[m]);
  if (Math.max(...lengths) > MAX_RATIO * Math.min(...lengths)) return 'proportion';
  // A cone flatter than this has its tip inside the drawn base: no outline to draw.
  if (s.k === 'cone' && s.h < s.r / 2) return 'proportion';
  if ((s.ask === 'vertices' || s.ask === 'edges' || s.ask === 'faces') && !isPolyhedron(s.k)) {
    return 'ask';
  }
  return null;
}

/** Vertices, edges and faces of a polyhedron (null for a solid with a curved surface). */
export function solidCounts(
  k: SolidKind,
  n: number,
): { vertices: number; edges: number; faces: number } | null {
  if (k === 'cube' || k === 'cuboid') return { vertices: 8, edges: 12, faces: 6 };
  if (k === 'prism') return { vertices: 2 * n, edges: 3 * n, faces: n + 2 };
  if (k === 'pyramid') return { vertices: n + 1, edges: 2 * n, faces: n + 1 };
  return null;
}

/** Area of the regular n-gon with side a, and its inradius. */
function regularBase(n: number, a: number): { area: number; inradius: number } {
  const inradius = a / (2 * Math.tan(Math.PI / n));
  return { area: (n * a * inradius) / 2, inradius };
}

/** Volume (in u³) and surface area (in u²), computed from the measures. */
export function solidMeasures(s: Solid): { volume: number; surface: number } {
  const { a, b, h, r, n } = s;
  const pi = Math.PI;
  switch (s.k) {
    case 'cube':
      return { volume: a ** 3, surface: 6 * a ** 2 };
    case 'cuboid':
      return { volume: a * b * h, surface: 2 * (a * b + a * h + b * h) };
    case 'prism': {
      const g = regularBase(n, a).area;
      return { volume: g * h, surface: 2 * g + n * a * h };
    }
    case 'pyramid': {
      const base = regularBase(n, a);
      const slant = Math.hypot(h, base.inradius);
      return { volume: (base.area * h) / 3, surface: base.area + (n * a * slant) / 2 };
    }
    case 'cylinder':
      return { volume: pi * r * r * h, surface: 2 * pi * r * r + 2 * pi * r * h };
    case 'cone':
      return { volume: (pi * r * r * h) / 3, surface: pi * r * r + pi * r * Math.hypot(r, h) };
    case 'sphere':
      return { volume: (4 / 3) * pi * r ** 3, surface: 4 * pi * r * r };
  }
}

export type SolidKey =
  | { kind: 'count'; n: number }
  | { kind: 'volume'; value: number; unit: string }
  | { kind: 'area'; value: number; unit: string };

/** The key a solid declares it computes (`ask`); null when it declares none or does not hold. */
export function solidKey(s: Solid): SolidKey | null {
  if (s.ask === 'none' || solidProblem(s) !== null) return null;
  if (s.ask === 'volume')
    return { kind: 'volume', value: solidMeasures(s).volume, unit: `${s.u}³` };
  if (s.ask === 'surface')
    return { kind: 'area', value: solidMeasures(s).surface, unit: `${s.u}²` };
  const c = solidCounts(s.k, s.n);
  return c === null ? null : { kind: 'count', n: c[s.ask] };
}

// ─────────────── the drawing (Schrägbild) ───────────────

export type SolidXY = { x: number; y: number };
type V3 = readonly [number, number, number];

/** The depth axis: 45°, shortened by half (each screen component is ½·cos 45°). */
export const DEPTH = 0.5 * Math.SQRT1_2;

/** Screen point (y downwards) of a point in space: x right, y up, z into the page. */
export const projectSolid = ([x, y, z]: V3): SolidXY => ({ x: x + DEPTH * z, y: -(y + DEPTH * z) });

/** Towards the viewer: a face whose outward normal points this way is seen. */
const VIEW: V3 = [DEPTH, DEPTH, -1];

export type Stroke = { pts: SolidXY[]; hidden: boolean };
/** A measure written next to a line: where, on which side (`dx`, `dy` = −1 … 1), which one. */
export type SolidLabel = { at: SolidXY; dx: number; dy: number; m: Measure };
export type SolidDrawing = { strokes: Stroke[]; labels: SolidLabel[]; dots: SolidXY[] };

const sub = (p: V3, q: V3): V3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const dot = (p: V3, q: V3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const cross = (p: V3, q: V3): V3 => [
  p[1] * q[2] - p[2] * q[1],
  p[2] * q[0] - p[0] * q[2],
  p[0] * q[1] - p[1] * q[0],
];

/**
 * The edges of a convex polyhedron, each dashed when both its faces turn away from the viewer.
 * Faces are vertex index lists in any orientation; the outward side is the one away from the
 * centroid.
 */
function polyhedronStrokes(v: readonly V3[], faces: readonly number[][]): Stroke[] {
  const c = v.reduce<V3>((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]);
  const centre: V3 = [c[0] / v.length, c[1] / v.length, c[2] / v.length];
  const seen = faces.map((f) => {
    const [p0, p1, p2] = [v[f[0]!]!, v[f[1]!]!, v[f[2]!]!];
    let nrm = cross(sub(p1, p0), sub(p2, p0));
    if (dot(nrm, sub(p0, centre)) < 0) nrm = [-nrm[0], -nrm[1], -nrm[2]];
    return dot(nrm, VIEW) > 1e-9;
  });
  const edges = new Map<string, boolean>();
  faces.forEach((f, fi) => {
    f.forEach((a, i) => {
      const b = f[(i + 1) % f.length]!;
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      edges.set(key, (edges.get(key) ?? false) || seen[fi]!);
    });
  });
  return [...edges].map(([key, visible]) => {
    const [a, b] = key.split('-').map(Number) as [number, number];
    return { pts: [projectSolid(v[a]!), projectSolid(v[b]!)], hidden: !visible };
  });
}

/** The corners of the regular n-gon base with side a, the front edge parallel to the x axis. */
function basePolygon(n: number, a: number, y: number): V3[] {
  const radius = a / (2 * Math.sin(Math.PI / n));
  const start = -Math.PI / 2 - Math.PI / n;
  return Array.from({ length: n }, (_, i) => {
    const t = start + (2 * Math.PI * i) / n;
    return [radius * Math.cos(t), y, radius * Math.sin(t)] as V3;
  });
}

const mid = (p: SolidXY, q: SolidXY): SolidXY => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });

/**
 * The base circle of radius r at height y, as a function of the angle — drawn as the schoolbook
 * draws it: an upright ellipse, its depth shortened like every depth (a strict cavalier circle
 * would be a tilted ellipse, which reads as a skewed solid). The angle 90° is the back.
 */
const circle = (r: number, y: number) => (t: number) => ({
  x: r * Math.cos(t),
  y: -(y + DEPTH * r * Math.sin(t)),
});

function arc(f: (t: number) => SolidXY, from: number, to: number, hidden: boolean): Stroke {
  const steps = Math.max(8, Math.ceil(Math.abs(to - from) / (Math.PI / 36)));
  return {
    pts: Array.from({ length: steps + 1 }, (_, i) => f(from + ((to - from) * i) / steps)),
    hidden,
  };
}

/** Where the lines from the apex touch the base outline (the cone's two side lines). */
function tangentAngles(f: (t: number) => SolidXY, apex: SolidXY): [number, number] {
  const side = (t: number) => {
    const p = f(t);
    const q = f(t + 1e-4);
    return (p.x - apex.x) * (q.y - p.y) - (p.y - apex.y) * (q.x - p.x);
  };
  const roots: number[] = [];
  const N = 720;
  for (let i = 0; i < N && roots.length < 2; i++) {
    let lo = (2 * Math.PI * i) / N;
    let hi = (2 * Math.PI * (i + 1)) / N;
    if (side(lo) * side(hi) > 0) continue;
    for (let k = 0; k < 40; k++) {
      const m = (lo + hi) / 2;
      if (side(lo) * side(m) <= 0) hi = m;
      else lo = m;
    }
    roots.push((lo + hi) / 2);
  }
  return [roots[0] ?? 0, roots[1] ?? Math.PI];
}

/** The Schrägbild of a solid that holds, in its own units (y downwards). */
export function solidDrawing(s: Solid): SolidDrawing {
  const { a, b, h, r, n } = s;
  switch (s.k) {
    case 'cube':
    case 'cuboid': {
      const [w, d, t] = s.k === 'cube' ? [a, a, a] : [a, b, h];
      const v: V3[] = [
        [0, 0, 0],
        [w, 0, 0],
        [w, 0, d],
        [0, 0, d],
        [0, t, 0],
        [w, t, 0],
        [w, t, d],
        [0, t, d],
      ];
      const faces = [
        [0, 1, 2, 3],
        [4, 5, 6, 7],
        [0, 1, 5, 4],
        [3, 2, 6, 7],
        [0, 3, 7, 4],
        [1, 2, 6, 5],
      ];
      const labels: SolidLabel[] = [
        { at: mid(projectSolid(v[0]!), projectSolid(v[1]!)), dx: 0, dy: 1, m: 'a' },
      ];
      if (s.k === 'cuboid') {
        labels.push({ at: mid(projectSolid(v[1]!), projectSolid(v[2]!)), dx: 1, dy: 0.6, m: 'b' });
        labels.push({ at: mid(projectSolid(v[0]!), projectSolid(v[4]!)), dx: -1, dy: 0, m: 'h' });
      }
      return { strokes: polyhedronStrokes(v, faces), labels, dots: [] };
    }
    case 'prism':
    case 'pyramid': {
      const base = basePolygon(n, a, 0);
      const v: V3[] = [...base];
      const faces: number[][] = [base.map((_, i) => i)];
      if (s.k === 'prism') {
        v.push(...basePolygon(n, a, h));
        faces.push(base.map((_, i) => n + i));
        for (let i = 0; i < n; i++) faces.push([i, (i + 1) % n, n + ((i + 1) % n), n + i]);
      } else {
        v.push([0, h, 0]);
        for (let i = 0; i < n; i++) faces.push([i, (i + 1) % n, n]);
      }
      const strokes = polyhedronStrokes(v, faces);
      const labels: SolidLabel[] = [
        { at: mid(projectSolid(v[0]!), projectSolid(v[1]!)), dx: 0, dy: 1, m: 'a' },
      ];
      if (s.k === 'prism') {
        // The height on the leftmost vertical edge, outside the solid.
        const left = base.reduce(
          (best, p, i) => (projectSolid(p).x < projectSolid(base[best]!).x ? i : best),
          0,
        );
        labels.push({
          at: mid(projectSolid(v[left]!), projectSolid(v[n + left]!)),
          dx: -1,
          dy: 0,
          m: 'h',
        });
      } else {
        strokes.push({ pts: [projectSolid([0, 0, 0]), projectSolid([0, h, 0])], hidden: true });
        labels.push({ at: projectSolid([0, h * 0.6, 0]), dx: 1, dy: 0, m: 'h' });
      }
      return { strokes, labels, dots: s.k === 'pyramid' ? [projectSolid([0, 0, 0])] : [] };
    }
    case 'cylinder': {
      const bottom = circle(r, 0);
      const top = circle(r, h);
      const right = 0;
      const strokes: Stroke[] = [
        arc(top, 0, 2 * Math.PI, false),
        arc(bottom, right + Math.PI, right + 2 * Math.PI, false),
        arc(bottom, right, right + Math.PI, true),
        { pts: [bottom(right), top(right)], hidden: false },
        { pts: [bottom(right + Math.PI), top(right + Math.PI)], hidden: false },
        { pts: [projectSolid([0, h, 0]), projectSolid([r, h, 0])], hidden: false },
      ];
      const labels: SolidLabel[] = [
        // Beside the rim, where no line runs: the radius ends there.
        { at: top(0), dx: 1, dy: 0, m: 'r' },
        { at: mid(bottom(right), top(right)), dx: 1, dy: 0, m: 'h' },
      ];
      return { strokes, labels, dots: [projectSolid([0, h, 0])] };
    }
    case 'cone': {
      const base = circle(r, 0);
      const apex = projectSolid([0, h, 0]);
      const [t1, t2] = tangentAngles(base, apex);
      // The arc between the touch points that runs through the back (90°) is hidden.
      const backFirst = t1 < Math.PI / 2 && Math.PI / 2 < t2;
      const strokes: Stroke[] = [
        arc(base, t1, t2, backFirst),
        arc(base, t2, t1 + 2 * Math.PI, !backFirst),
        { pts: [base(t1), apex], hidden: false },
        { pts: [base(t2), apex], hidden: false },
        { pts: [projectSolid([0, 0, 0]), apex], hidden: true },
        { pts: [projectSolid([0, 0, 0]), projectSolid([r, 0, 0])], hidden: true },
      ];
      const labels: SolidLabel[] = [
        // Below the base and beside the upper height: apart however small the cone is drawn.
        { at: { x: r / 2, y: DEPTH * r }, dx: 0, dy: 1, m: 'r' },
        { at: projectSolid([0, h * 0.6, 0]), dx: 1, dy: 0, m: 'h' },
      ];
      return { strokes, labels, dots: [projectSolid([0, 0, 0])] };
    }
    case 'sphere': {
      // The outline is a circle, the equator a flat ellipse: the front half drawn, the back
      // half dashed — the schoolbook picture of a ball.
      const outline = (t: number): SolidXY => ({ x: r * Math.cos(t), y: -r * Math.sin(t) });
      const equator = (t: number): SolidXY => ({ x: r * Math.cos(t), y: -DEPTH * r * Math.sin(t) });
      const strokes: Stroke[] = [
        arc(outline, 0, 2 * Math.PI, false),
        arc(equator, Math.PI, 2 * Math.PI, false),
        arc(equator, 0, Math.PI, true),
        {
          pts: [
            { x: 0, y: 0 },
            { x: r, y: 0 },
          ],
          hidden: false,
        },
      ];
      return {
        strokes,
        labels: [{ at: { x: r, y: 0 }, dx: 1, dy: 0, m: 'r' }],
        dots: [{ x: 0, y: 0 }],
      };
    }
  }
}

/** The smallest box around every stroke of a drawing. */
export function drawingBox(d: SolidDrawing): { x0: number; y0: number; x1: number; y1: number } {
  const pts = d.strokes.flatMap((st) => st.pts);
  return {
    x0: Math.min(...pts.map((p) => p.x)),
    y0: Math.min(...pts.map((p) => p.y)),
    x1: Math.max(...pts.map((p) => p.x)),
    y1: Math.max(...pts.map((p) => p.y)),
  };
}
