// The shapes the one drawing the picture library still draws itself is made of — the circuit
// (issue #252; every other picture is an image since #599, `schematicAnchors.data.ts`): circles,
// rounded boxes and thick strokes, each written as a ring of "x y x y …" in the frame 1000 wide
// that every region is drawn in (`regions.ts`), and the tones its parts are drawn in. Pure
// arithmetic; the drawing (`schematicShapes.data.ts`) is made of nothing else.

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
 * part that overlap stay filled (nonzero winding, `inside` in regions.ts).
 */
function ringOf(pts: readonly Pt[]): string {
  let a = 0;
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  });
  const ordered = a > 0 ? pts : [...pts].reverse();
  return ordered.map(([x, y]) => `${Math.round(x)} ${Math.round(y)}`).join(' ');
}

/** An ellipse around (cx, cy), turned by `deg`; `wobble` (0 … 0.1) makes it a living cell. */
function ellipse(cx: number, cy: number, rx: number, ry: number, deg = 0, wobble = 0): string {
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
