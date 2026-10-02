// The geometry behind a solid drawn obliquely (issue #255): Kavalierperspektive, the way a
// German textbook draws a Schrägbild — the depth axis at 45°, halved. Pure functions, so the
// drawing in components/math/VisualFigures.tsx stays a drawing and this stays testable.
//
// Coordinates: X to the right, Y up, Z into the page (away from the viewer).

import type { SolidDim, SolidKind } from '@learnbuddy/shared-types/contracts';

export type V3 = readonly [number, number, number];
export type V2 = readonly [number, number];

/** How much shorter the depth is drawn, and its angle. */
export const DEPTH = 0.5;
const C = Math.SQRT1_2;

/** A point of space on the page (y up). */
export function project(p: V3): V2 {
  return [p[0] + DEPTH * p[2] * C, p[1] + DEPTH * p[2] * C];
}

/** The direction the viewer looks along: every point on it lands on the same spot of the page. */
const VIEW: V3 = [-DEPTH * C, -DEPTH * C, 1];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export type Polyhedron = { vertices: V3[]; faces: number[][] };

/** The measures a solid is drawn with: its own when labelled, a calm standard shape otherwise. */
export function drawnDims(solid: SolidKind, dims: readonly SolidDim[]): Record<string, number> {
  const given = Object.fromEntries(dims.map((d) => [d.name, d.value]));
  const standard: Record<SolidKind, Record<string, number>> = {
    cube: { a: 1 },
    cuboid: { a: 1.6, b: 1, h: 1 },
    prism_3: { a: 1.3, h: 1.3 },
    prism_5: { a: 0.8, h: 1.3 },
    prism_6: { a: 0.7, h: 1.3 },
    prism_8: { a: 0.55, h: 1.3 },
    pyramid_3: { a: 1.4, h: 1.3 },
    pyramid_4: { a: 1.3, h: 1.3 },
    pyramid_5: { a: 0.9, h: 1.3 },
    pyramid_6: { a: 0.8, h: 1.3 },
    cylinder: { r: 0.7, h: 1.4 },
    cone: { r: 0.8, h: 1.5 },
    sphere: { r: 1 },
  };
  return dims.length > 0 ? given : standard[solid];
}

/** The corners of a regular n-gon in the ground plane, one edge to the front and level. */
function ring(n: number, side: number, y: number): V3[] {
  const r = side / (2 * Math.sin(Math.PI / n));
  return Array.from({ length: n }, (_, i) => {
    const phi = -Math.PI / 2 - Math.PI / n + (2 * Math.PI * i) / n;
    return [r * Math.cos(phi), y, r * Math.sin(phi)] as V3;
  });
}

/** A prism or pyramid (cube and cuboid included) as vertices and faces; null for round ones. */
export function polyhedronOf(solid: SolidKind, d: Record<string, number>): Polyhedron | null {
  const a = d.a ?? 1;
  const h = d.h ?? a;
  if (solid === 'cube' || solid === 'cuboid') {
    const w = a;
    const depth = solid === 'cube' ? a : (d.b ?? a);
    const height = solid === 'cube' ? a : h;
    const v: V3[] = [
      [0, 0, 0],
      [w, 0, 0],
      [w, 0, depth],
      [0, 0, depth],
      [0, height, 0],
      [w, height, 0],
      [w, height, depth],
      [0, height, depth],
    ];
    return {
      vertices: v,
      faces: [
        [0, 1, 2, 3],
        [4, 5, 6, 7],
        [0, 1, 5, 4],
        [1, 2, 6, 5],
        [2, 3, 7, 6],
        [3, 0, 4, 7],
      ],
    };
  }
  const m = /^(prism|pyramid)_(\d)$/.exec(solid);
  if (!m) return null;
  const n = Number(m[2]);
  const base = ring(n, a, 0);
  if (m[1] === 'prism') {
    const top = ring(n, a, h);
    const faces = [
      base.map((_, i) => i),
      top.map((_, i) => n + i),
      ...base.map((_, i) => [i, (i + 1) % n, n + ((i + 1) % n), n + i]),
    ];
    return { vertices: [...base, ...top], faces };
  }
  const apex: V3 = [0, h, 0];
  return {
    vertices: [...base, apex],
    faces: [base.map((_, i) => i), ...base.map((_, i) => [i, (i + 1) % n, n])],
  };
}

function centroid(points: readonly V3[]): V3 {
  const s = points.reduce<V3>((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]);
  return [s[0] / points.length, s[1] / points.length, s[2] / points.length];
}

/** Which faces the viewer sees: the outward normal points against the viewing direction. */
export function visibleFaces(p: Polyhedron): boolean[] {
  const middle = centroid(p.vertices);
  return p.faces.map((face) => {
    const pts = face.map((i) => p.vertices[i] as V3);
    const [a, b, c] = pts as [V3, V3, V3];
    let normal = cross(sub(b, a), sub(c, a));
    if (dot(normal, sub(centroid(pts), middle)) < 0) normal = [-normal[0], -normal[1], -normal[2]];
    return dot(normal, VIEW) < 0;
  });
}

export type Edge = { from: number; to: number; hidden: boolean };

/** Every edge once; hidden when both faces it borders are turned away. */
export function edgesOf(p: Polyhedron): Edge[] {
  const seen = visibleFaces(p);
  const byKey = new Map<string, { from: number; to: number; visible: boolean }>();
  p.faces.forEach((face, f) => {
    face.forEach((from, k) => {
      const to = face[(k + 1) % face.length] as number;
      const key = from < to ? `${from}-${to}` : `${to}-${from}`;
      const was = byKey.get(key);
      byKey.set(key, { from, to, visible: (was?.visible ?? false) || (seen[f] ?? false) });
    });
  });
  return [...byKey.values()].map((e) => ({ from: e.from, to: e.to, hidden: !e.visible }));
}

/** A circle of radius r in the ground plane at height y, sampled. */
export function rim(r: number, y: number, steps = 96): { phi: number; at: V3 }[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const phi = (2 * Math.PI * i) / steps;
    return { phi, at: [r * Math.cos(phi), y, r * Math.sin(phi)] as V3 };
  });
}

/**
 * Where the outline of a cylinder touches its rim: the two angles whose drawn point lies
 * furthest left and right. The back arc between them is hidden behind the body.
 */
export function cylinderTangents(): [number, number] {
  const phi = Math.atan(DEPTH * C);
  return [phi, phi + Math.PI];
}

/** Is a rim angle on the back half, between the tangents `from` and `from + π`? */
export function onBackArc(phi: number, from: number): boolean {
  const t = (((phi - from) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return t > 0 && t < Math.PI;
}

/**
 * Where the lines from a cone's apex touch its rim on the page, or null when the apex lies
 * inside the drawn rim. Found by the sign change of the cross product along the rim.
 */
export function coneTangents(r: number, h: number): [number, number] | null {
  const apex = project([0, h, 0]);
  const steps = 720;
  const found: number[] = [];
  let prev: number | null = null;
  for (let i = 0; i <= steps; i++) {
    const phi = (2 * Math.PI * i) / steps;
    const p = project([r * Math.cos(phi), 0, r * Math.sin(phi)]);
    const dp = project([-r * Math.sin(phi), 0, r * Math.cos(phi)]);
    const c = (p[0] - apex[0]) * dp[1] - (p[1] - apex[1]) * dp[0];
    if (prev !== null && Math.sign(c) !== Math.sign(prev) && c !== 0) found.push(phi);
    prev = c;
  }
  if (found.length < 2) return null;
  const [a, b] = found as [number, number];
  // The hidden arc is the one through the back (sin φ > 0): start it there.
  return Math.sin((a + b) / 2) > 0 ? [a, b] : [b, a + 2 * Math.PI];
}

/** The convex hull of some points on the page (Andrew's monotone chain). */
export function hull(points: readonly V2[]): V2[] {
  const pts = [...points].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  if (pts.length < 3) return pts;
  const turn = (o: V2, a: V2, b: V2) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: V2[] = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      turn(lower[lower.length - 2] as V2, lower[lower.length - 1] as V2, p) <= 0
    )
      lower.pop();
    lower.push(p);
  }
  const upper: V2[] = [];
  for (const p of [...pts].reverse()) {
    while (
      upper.length >= 2 &&
      turn(upper[upper.length - 2] as V2, upper[upper.length - 1] as V2, p) <= 0
    )
      upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
