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
  /** A height (#424): with no clear place inside `within`, it stands at a dimension line along `along`. */
  dimension?: boolean;
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
 * A dimension line (Maßlinie, #424) for a measure that has no room on its line: an extension line
 * from each end of the measured line, the dimension line between them outside the drawing, and an
 * arrowhead at each of its ends — `arrows` as [from, tip] pairs.
 */
export type Dimension = { lines: XY[][]; arrows: [XY, XY][] };

/** A placed label: its box, and its dimension line when it stands at one. */
export type PlacedLabel = { box: Rect; dimension: Dimension | null };

type Segment = readonly [XY, XY];

/** How far an extension line starts from the drawing, how far past the dimension line it runs. */
const EXT_GAP = 3;
const EXT_OVER = 4;
/** How far the dimension line stands from everything drawn and written before it. */
const DIM_GAP = 10;

const dotXY = (p: XY, q: XY) => p.x * q.x + p.y * q.y;
const step = (p: XY, n: XY, t: number): XY => ({ x: p.x + n.x * t, y: p.y + n.y * t });

/** How far the ray from `p` in the direction `n` runs before it has left every segment behind. */
function lastHit(p: XY, n: XY, segments: readonly Segment[]): number {
  let last = 0;
  for (const [a, b] of segments) {
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const det = n.x * -ey - n.y * -ex;
    if (Math.abs(det) < 1e-12) continue;
    const rx = a.x - p.x;
    const ry = a.y - p.y;
    const t = (rx * -ey - ry * -ex) / det;
    const v = (n.x * ry - n.y * rx) / det;
    if (t > 1e-6 && v >= -1e-9 && v <= 1 + 1e-9) last = Math.max(last, t);
  }
  return last;
}

/**
 * The dimension line of the measured line `ab` on the side `n` (a unit normal), clear of every
 * segment and every placed box, and how much extension line it needs (the shorter, the better).
 */
function dimensionOn(
  ab: readonly [XY, XY],
  n: XY,
  segments: readonly Segment[],
  placed: readonly Rect[],
): { dimension: Dimension; reach: number } {
  const [a, b] = ab;
  const corners = placed.flatMap((r) => [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x + r.w, y: r.y },
    { x: r.x, y: r.y + r.h },
  ]);
  const points = [...segments.flatMap(([p, q]) => [p, q]), ...corners];
  const offset =
    Math.max(0, ...points.map((q) => dotXY({ x: q.x - a.x, y: q.y - a.y }, n))) + DIM_GAP;
  const starts = [a, b].map((p) => lastHit(p, n, segments) + EXT_GAP);
  const ends = [step(a, n, offset), step(b, n, offset)] as [XY, XY];
  return {
    dimension: {
      lines: [
        [step(a, n, starts[0]!), step(a, n, offset + EXT_OVER)],
        [step(b, n, starts[1]!), step(b, n, offset + EXT_OVER)],
        [ends[0], ends[1]],
      ],
      arrows: [
        [ends[1], ends[0]],
        [ends[0], ends[1]],
      ],
    },
    reach: 2 * offset - starts[0]! - starts[1]!,
  };
}

/** The dimension line of the measured line `ab`, on the side that needs the shorter extension lines. */
function dimensionFor(
  ab: readonly [XY, XY],
  segments: readonly Segment[],
  placed: readonly Rect[],
): Dimension {
  const [a, b] = ab;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  const sides = [n, { x: -n.x, y: -n.y }].map((side) => dimensionOn(ab, side, segments, placed));
  return sides.reduce((best, side) => (side.reach < best.reach ? side : best)).dimension;
}

/**
 * Where each label stands: the nearest place, on its wished side if it can, whose box — `clear` px
 * larger all round — crosses none of the `lines` (polylines, drawn or dashed), covers no label
 * placed before it and, if it can, stands inside its `within`. A height (`dimension`) that finds
 * no clear place inside gets a dimension line outside the drawing instead
 * (#424) — written beside a slant, a cone's height reads as the slant's length — and stands at
 * that line. Where no place is clear at all, the one that covers the fewest (the app's layout test
 * holds every drawing it makes to never needing that). The caller fits the drawing, the boxes and
 * the dimension lines into its room together.
 */
export function placeLabels(
  wishes: readonly LabelWish[],
  lines: readonly (readonly XY[])[],
  clear = 3,
): PlacedLabel[] {
  const segments: Segment[] = lines.flatMap((pts) =>
    pts.slice(1).map((p, i) => [pts[i]!, p] as const),
  );
  const out: PlacedLabel[] = [];
  const boxes = () => out.map((p) => p.box);
  const best = (wish: LabelWish) => {
    const covers = (box: Rect) => {
      const r = grow(box, clear);
      const middle = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
      return (
        (wish.within && !inside(middle, wish.within) ? 0.5 : 0) +
        boxes().filter((other) => overlaps(r, other)).length * 10 +
        segments.filter(([a, b]) => crosses(a, b, r)).length
      );
    };
    let found: { box: Rect; n: number } | null = null;
    for (const box of candidates(wish)) {
      const n = covers(box);
      if (found === null || n < found.n) found = { box, n };
      if (n === 0) break;
    }
    return found!;
  };
  for (const wish of wishes) {
    const found = best(wish);
    if (found.n === 0 || !wish.dimension || !wish.along) {
      out.push({ box: found.box, dimension: null });
      continue;
    }
    const dimension = dimensionFor(wish.along, segments, boxes());
    segments.push(...dimension.lines.flatMap((pts) => [[pts[0]!, pts[1]!] as const]));
    const [from, to] = dimension.lines[2]!;
    const len = Math.hypot(to!.x - from!.x, to!.y - from!.y) || 1;
    // Beside the dimension line, away from the drawing: its normal pointing out.
    const ext = dimension.lines[0]!;
    const away = { x: ext[1]!.x - ext[0]!.x, y: ext[1]!.y - ext[0]!.y };
    const awayLen = Math.hypot(away.x, away.y) || 1;
    const placed = best({
      at: { x: (from!.x + to!.x) / 2, y: (from!.y + to!.y) / 2 },
      dx: away.x / awayLen,
      dy: away.y / awayLen,
      w: wish.w,
      h: wish.h,
      along: len > 0 ? [from!, to!] : undefined,
    });
    out.push({ box: placed.box, dimension });
  }
  return out;
}

/**
 * Numbers as a schoolbook prints them (#252): in a column left and right of a drawing, each joined
 * to its point by a leader line. `placeLabels` puts a label right beside its point, which on a
 * picture covers the very parts being labelled; here no number stands on the drawing at all.
 *
 * Each point goes to the column on its own side — while that column has room, else the points
 * nearest the middle cross over — and stands as near its own height as the numbers above and
 * below it allow (`pitch` apart, between `top` and `bottom`). Two leader lines of a column that
 * cross trade their places, until none does.
 */
export type Columns = { left: number; right: number; top: number; bottom: number; pitch: number };

export function columnLabels(points: readonly XY[], c: Columns): XY[] {
  const middle = (c.left + c.right) / 2;
  const room = Math.max(1, Math.floor((c.bottom - c.top) / c.pitch) + 1);
  const left = points.map((p) => p.x < middle);
  for (const side of [true, false]) {
    // Too many on one side: the ones nearest the middle cross over.
    const mine = points
      .map((p, i) => ({ i, d: Math.abs(p.x - middle) }))
      .filter(({ i }) => left[i] === side)
      .sort((a, b) => a.d - b.d);
    let other = left.filter((s) => s !== side).length;
    for (const { i } of mine.slice(0, Math.max(0, mine.length - room))) {
      if (other >= room) break;
      left[i] = !side;
      other += 1;
    }
  }
  const out: XY[] = points.map((p, i) => ({ x: left[i] ? c.left : c.right, y: p.y }));
  for (const x of [c.left, c.right]) {
    const column = out
      .map((s, i) => ({ s, p: points[i]! }))
      .filter(({ s }) => s.x === x)
      .sort((a, b) => a.s.y - b.s.y);
    // Down from the top, then back up from the bottom: each as near its point as its neighbours allow.
    column.forEach(({ s }, k) => {
      s.y = Math.max(s.y, c.top, k > 0 ? column[k - 1]!.s.y + c.pitch : c.top);
    });
    for (let k = column.length - 1; k >= 0; k--) {
      const below = k < column.length - 1 ? column[k + 1]!.s.y - c.pitch : c.bottom;
      const s = column[k]!.s;
      s.y = Math.max(c.top + k * c.pitch, Math.min(s.y, below, c.bottom));
    }
    // Crossing leaders trade places: each trade shortens the two, so it ends.
    for (let swapped = true, rounds = 0; swapped && rounds < 50; rounds++) {
      swapped = false;
      for (const a of column) {
        for (const b of column) {
          if (a === b || !segmentsCross(a.p, a.s, b.p, b.s)) continue;
          [a.s.y, b.s.y] = [b.s.y, a.s.y];
          swapped = true;
        }
      }
    }
  }
  return out;
}

/** Whether the segments p→s and q→t cross (touching ends do not). */
function segmentsCross(p: XY, s: XY, q: XY, t: XY): boolean {
  const side = (a: XY, b: XY, r: XY) =>
    Math.sign((b.x - a.x) * (r.y - a.y) - (b.y - a.y) * (r.x - a.x));
  return side(p, s, q) * side(p, s, t) < 0 && side(q, t, p) * side(q, t, s) < 0;
}
