// The shapes a drawing of the picture library is made of (issue #252): ellipses, rounded boxes,
// polygons, smooth outlines and thick strokes, each written as a ring of "x y x y …" in the frame
// 1000 wide that every region is drawn in (`regions.ts`), and the tones its parts are drawn in.
// Pure arithmetic; the drawings (`schematicShapes.data.ts` and the files it gathers) are made of
// nothing else.

import { REGION_FRAME } from './regions.js';
import type { SchematicPartShape } from './schematics.js';

type Pt = readonly [number, number];

/** The pastels a part is drawn in, by index into the figure's `slices`; INK: its ink (a pupil, a tyre). */
export const TONE = {
  LILAC: 0,
  BLUE: 1,
  GREEN: 2,
  ORANGE: 3,
  PINK: 4,
  YELLOW: 5,
  SAND: 6,
  TEAL: 7,
  INK: -1,
} as const;

/** A part of a drawing: its id, its tone, the point its number points at, its outline. */
export function shape(
  id: string,
  tone: number,
  at: readonly [number, number],
  rings: readonly string[],
): SchematicPartShape {
  return { id, tone, at, rings };
}

/**
 * A ring as "x y x y …", running one way round — every outline the same way, so two shapes of one
 * part that overlap stay filled (nonzero winding, `inside` in regions.ts); `hole` runs the other
 * way and cuts out.
 */
function ringOf(pts: readonly Pt[], hole = false): string {
  let a = 0;
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  });
  const ordered = a > 0 === hole ? [...pts].reverse() : pts;
  return ordered.map(([x, y]) => `${Math.round(x)} ${Math.round(y)}`).join(' ');
}

/** The points of a ring written by the helpers below. */
function pointsOf(ring: string): Pt[] {
  const n = ring.split(' ').map(Number);
  const pts: Pt[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i]!, n[i + 1]!]);
  return pts;
}

/**
 * A shape with holes: a cell wall, a tyre, a membrane, a sign's white symbol — `outer` without the
 * `inner` rings (which must not overlap each other: two holes over one point fill it again).
 */
export function band(outer: string, ...inner: string[]): string[] {
  return [outer, ...inner.map((ring) => ringOf(pointsOf(ring), true))];
}

/** The part of a ring between the radii r0 and r1 from angle `from` to `to` (degrees, y down). */
export function arc(
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  from: number,
  to: number,
): string {
  const pts: Pt[] = [];
  const at = (r: number, deg: number): Pt => [
    cx + r * Math.cos((deg * Math.PI) / 180),
    cy + r * Math.sin((deg * Math.PI) / 180),
  ];
  const steps = Math.max(4, Math.round(Math.abs(to - from) / 6));
  for (let k = 0; k <= steps; k++) pts.push(at(r1, from + ((to - from) * k) / steps));
  for (let k = steps; k >= 0; k--) pts.push(at(r0, from + ((to - from) * k) / steps));
  return ringOf(pts);
}

/** A flower seen from above: `petals` rounded lobes around (cx, cy). */
export function bloom(cx: number, cy: number, r: number, petals: number): string {
  const pts: Pt[] = [];
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * 2 * Math.PI;
    const k = 0.62 + 0.38 * Math.abs(Math.cos((petals * a) / 2));
    pts.push([cx + r * k * Math.cos(a), cy + r * k * Math.sin(a)]);
  }
  return ringOf(pts);
}

/** An ellipse around (cx, cy), turned by `deg`; `wobble` (0 … 0.1) makes it a living cell. */
export function ellipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  deg = 0,
  wobble = 0,
): string {
  const t = (deg * Math.PI) / 180;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * 2 * Math.PI;
    const w = 1 + wobble * Math.sin(3 * a) + wobble * 0.6 * Math.cos(5 * a);
    const x = rx * w * Math.cos(a);
    const y = ry * w * Math.sin(a);
    pts.push([cx + x * Math.cos(t) - y * Math.sin(t), cy + x * Math.sin(t) + y * Math.cos(t)]);
  }
  return ringOf(pts);
}

/** A circle. */
export function circle(cx: number, cy: number, r: number): string {
  return ellipse(cx, cy, r, r);
}

/** A box from (x, y), `w` × `h`, its corners rounded by `r`. */
export function box(x: number, y: number, w: number, h: number, r = 0): string {
  if (r <= 0)
    return ringOf([
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ]);
  const pts: Array<[number, number]> = [];
  const corners: Array<[number, number, number]> = [
    [x + w - r, y + r, -90],
    [x + w - r, y + h - r, 0],
    [x + r, y + h - r, 90],
    [x + r, y + r, 180],
  ];
  for (const [cx, cy, from] of corners) {
    for (let k = 0; k <= 6; k++) {
      const a = ((from + k * 15) * Math.PI) / 180;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return ringOf(pts);
}

/** A polygon through the points x0, y0, x1, y1, … */
export function poly(...xy: number[]): string {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i + 1 < xy.length; i += 2) pts.push([xy[i]!, xy[i + 1]!]);
  return ringOf(pts);
}

/**
 * A stroke `width` wide along the points x0, y0, x1, y1, … — a leg, a stalk, a spoke — as the
 * outline around it (each corner on the bisector, so the stroke keeps its width).
 */
export function stroke(width: number, ...xy: number[]): string {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i + 1 < xy.length; i += 2) pts.push([xy[i]!, xy[i + 1]!]);
  const normal = (a: readonly [number, number], b: readonly [number, number]) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    return [-dy / len, dx / len] as const;
  };
  const side = (sign: number) =>
    pts.map((p, i) => {
      const n1 = normal(pts[Math.max(0, i - 1)]!, pts[Math.max(1, i)]!);
      const n2 = normal(pts[Math.min(pts.length - 2, i)]!, pts[Math.min(pts.length - 1, i + 1)]!);
      const nx = n1[0] + n2[0];
      const ny = n1[1] + n2[1];
      const len = Math.hypot(nx, ny) || 1;
      // The miter: as wide at a bend as on the straight.
      const cos = (nx / len) * n1[0] + (ny / len) * n1[1] || 1;
      const half = width / 2 / Math.max(0.5, cos);
      return [p[0] + (sign * half * nx) / len, p[1] + (sign * half * ny) / len] as [number, number];
    });
  return ringOf([...side(1), ...side(-1).reverse()]);
}

/**
 * A crescent moon around (cx, cy), opening to the right: the outer circle's arc on the left and an
 * inner arc of a circle shifted right, as one outline (a hole would leave the shifted circle's
 * outside filled).
 */
export function moon(cx: number, cy: number, r: number): string {
  const pts: Pt[] = [];
  for (let k = 0; k <= 24; k++) {
    const a = ((60 + (k * 240) / 24) * Math.PI) / 180;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  // Back through the inside, on a circle of the same radius shifted right by r · 0.55.
  const ix = cx + r * 0.55;
  for (let k = 24; k >= 0; k--) {
    const a = ((95 + (k * 170) / 24) * Math.PI) / 180;
    pts.push([ix + r * 0.86 * Math.cos(a), cy + r * 0.86 * Math.sin(a)]);
  }
  return ringOf(pts);
}

/** Points along a Catmull–Rom spline through x0, y0, x1, y1 …, `closed`: back to the first. */
function spline(xy: readonly number[], closed: boolean): Pt[] {
  const p: Pt[] = [];
  for (let i = 0; i + 1 < xy.length; i += 2) p.push([xy[i]!, xy[i + 1]!]);
  const n = p.length;
  const at = (i: number) => (closed ? p[(i + n) % n]! : p[Math.max(0, Math.min(n - 1, i))]!);
  const out: Pt[] = [];
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const [a, b, c, d] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let s = 0; s < 8; s++) {
      const t = s / 8;
      const f = (k: 0 | 1) =>
        b[k] +
        0.5 *
          ((c[k] - a[k]) * t +
            (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t * t +
            (3 * b[k] - a[k] - 3 * c[k] + d[k]) * t * t * t);
      out.push([f(0), f(1)]);
    }
  }
  if (!closed) out.push(p[n - 1]!);
  return out;
}

/** A rounded outline through the points x0, y0, x1, y1 … — a liver, an ear, a heart. */
export function smooth(...xy: number[]): string {
  return ringOf(spline(xy, true));
}

/** The points of a smooth line through x0, y0, x1, y1 …, for a stroke that bends: a vessel, a gut. */
export function curve(...xy: number[]): number[] {
  return spline(xy, false).flat();
}

/** The points x0, y0, x1, y1 … seen in a mirror, left for right: the other arm, the other lung. */
export function mirror(xy: readonly number[]): number[] {
  return xy.map((v, i) => (i % 2 === 0 ? REGION_FRAME - v : v));
}

/** A stroke on both sides — a leg, a bone: the left one and its mirror image. */
export function both(width: number, ...xy: number[]): string[] {
  return [stroke(width, ...xy), stroke(width, ...mirror(xy))];
}
