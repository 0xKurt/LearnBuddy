// Text on a drawing (#418): how wide a label is, whether its box covers a line or another box,
// and where a label stands clear of both. The diagrams check their arrow labels with these
// (`diagram.ts`); the solids and their nets place every measure with `placeLabels` (the app's
// `lib/math/solidLayout.ts`), so no number is written on a line or on another number.
//
// Screen units (px), y downwards. Dependency-free on purpose: the app imports this file by path.

import type { XY } from './trees.js';

export type Rect = { x: number; y: number; w: number; h: number };

export const grow = (r: Rect, m: number): Rect => ({
  x: r.x - m,
  y: r.y - m,
  w: r.w + 2 * m,
  h: r.h + 2 * m,
});

export const overlaps = (p: Rect, q: Rect) =>
  p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;

/** Whether the segment from `a` to `b` runs through the rectangle (Liang–Barsky). */
export function crosses(a: XY, b: XY, r: Rect): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const sides: [number, number][] = [
    [-dx, a.x - r.x],
    [dx, r.x + r.w - a.x],
    [-dy, a.y - r.y],
    [dy, r.y + r.h - a.y],
  ];
  for (const [p, q] of sides) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

/** Character classes and their width in em, widest last (regular weight). */
const NARROW = /[ijlftrI.,:;'!|()[\]\s-]/u;
const WIDE = /[mwMW]/u;
const TALL = /[\p{Lu}\p{N}]/u;

/**
 * An upper bound for a text's width at `size` px in the app's sans-serif, regular weight: i, l,
 * f, t, r and punctuation at 0.35 em, m and w at 1 em, other capitals and digits at 0.75 em, every
 * other character at 0.62 em. Held in the unit test against DejaVu Sans as the walkthrough's
 * Chromium draws it (a wide font; San Francisco and Roboto are narrower — not measured here).
 */
export function textWidth(text: string, size: number): number {
  let em = 0;
  for (const ch of text) {
    em += NARROW.test(ch) ? 0.35 : WIDE.test(ch) ? 1 : TALL.test(ch) ? 0.75 : 0.62;
  }
  return em * size;
}

/**
 * A label to place: the point it belongs to (`at`, the middle of its line), the side it would
 * rather stand on (`dx`, `dy`, −1 … 1, y downwards) and its text's size. `along`: the line it
 * measures, when the label may move along it (a height, a side) to find room. `within`: the
 * outline it belongs inside (a height inside its solid), when it would read as another line's
 * outside it.
 */
export type LabelWish = {
  at: XY;
  dx: number;
  dy: number;
  w: number;
  h: number;
  along?: readonly [XY, XY];
  within?: readonly XY[];
};

/** How far a label stands from its point, nearest first: past that it reads as another line's. */
const GAPS = [4, 7, 11, 16, 22];
/** What turning away from the wished side costs, per eighth of a turn, in px of distance. */
const TURN_COST = 6;
/** Where along its line a label may stand (0.5 = the middle), and what each step away costs. */
const SLIDES = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
const SLIDE_COST = 3;
/** The eight directions a label may stand in, from its point. */
const DIRS: readonly XY[] = Array.from({ length: 8 }, (_, k) => ({
  x: Math.round(Math.cos((k * Math.PI) / 4) * 1e6) / 1e6,
  y: Math.round(Math.sin((k * Math.PI) / 4) * 1e6) / 1e6,
}));

/** The box of a label `gap` px from the point `p` in the direction `d`. */
function boxAt(p: XY, size: { w: number; h: number }, d: XY, gap: number): Rect {
  // From the point to the box's middle: the gap plus half the box, measured along `d`.
  const reach = gap + (Math.abs(d.x) * size.w + Math.abs(d.y) * size.h) / 2;
  return {
    x: p.x + d.x * reach - size.w / 2,
    y: p.y + d.y * reach - size.h / 2,
    w: size.w,
    h: size.h,
  };
}

/** Eighths of a turn between two directions (0–4). */
function turns(a: XY, b: XY): number {
  const diff = Math.abs(Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x));
  return Math.round(Math.min(diff, 2 * Math.PI - diff) / (Math.PI / 4));
}

/** Is the point inside the polygon (even-odd)? */
function inside(p: XY, poly: readonly XY[]): boolean {
  let hit = false;
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length]!;
    if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y))
      hit = !hit;
  });
  return hit;
}

/** Every place a label may stand, cheapest first. */
function candidates(wish: LabelWish): Rect[] {
  const len = Math.hypot(wish.dx, wish.dy) || 1;
  const wished = { x: wish.dx / len, y: wish.dy / len };
  const points = wish.along
    ? SLIDES.map((t, i) => {
        const [a, b] = wish.along!;
        return { p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, cost: SLIDE_COST * i };
      })
    : [{ p: wish.at, cost: 0 }];
  return points
    .flatMap(({ p, cost }) =>
      DIRS.flatMap((d) =>
        GAPS.map((gap) => ({
          box: boxAt(p, wish, d, gap),
          cost: cost + gap + TURN_COST * turns(d, wished),
        })),
      ),
    )
    .sort((p, q) => p.cost - q.cost)
    .map((c) => c.box);
}

/**
 * Where each label stands (its box): the nearest place, on its wished side if it can, whose box —
 * `clear` px larger all round — crosses none of the `lines` (polylines, drawn or dashed), covers
 * no label placed before it and, if it can, stands inside its `within`. Where no place is clear,
 * the one that covers the fewest (the app's layout test holds every drawing it makes to never
 * needing that). The caller fits the drawing and the boxes into its room together.
 */
export function placeLabels(
  wishes: readonly LabelWish[],
  lines: readonly (readonly XY[])[],
  clear = 3,
): Rect[] {
  const segments = lines.flatMap((pts) => pts.slice(1).map((p, i) => [pts[i]!, p] as const));
  const placed: Rect[] = [];
  for (const wish of wishes) {
    const covers = (box: Rect) => {
      const r = grow(box, clear);
      const middle = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
      return (
        (wish.within && !inside(middle, wish.within) ? 0.5 : 0) +
        placed.filter((other) => overlaps(r, other)).length * 10 +
        segments.filter(([a, b]) => crosses(a, b, r)).length
      );
    };
    let best: { box: Rect; n: number } | null = null;
    for (const box of candidates(wish)) {
      const n = covers(box);
      if (best === null || n < best.n) best = { box, n };
      if (n === 0) break;
    }
    placed.push(best!.box);
  }
  return placed;
}
