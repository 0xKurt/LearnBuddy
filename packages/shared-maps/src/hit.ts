// Where her finger lands on a map, and what is a fair target (issue #251, with the tap
// mechanism of #248: one tap is the answer, a figure too fine for a finger is magnified on the
// first tap).
//
// Every feature has a target of at least 44 pt (MAP_TOUCH):
//   - a shape wide enough is its own target;
//   - a shape too small (Berlin, Luxembourg), a city, a thin zone: a disc of 44 pt round its
//     anchor, which wins over the larger shape around it (Berlin over Brandenburg);
//   - a river: a band of 44 pt along its line.
// Small targets near each other cannot be told apart at the size the whole map is drawn. A
// tap near one of them therefore magnifies the map round the tap (`MAP_ZOOM` times, at least
// what the smallest phone gets), and the second tap chooses. Whether a feature can be chosen
// at all is decided once, at that magnification on the smallest phone (`isTappable`): the
// server stores no question whose key could not be tapped.

import {
  mapArea,
  mapFeatures,
  type MapAreaId,
  type MapFeature,
  type MapLayer,
} from './features.js';

export const MAP_TOUCH = 44;

/**
 * The smallest box a map is drawn in: a 360 pt phone less its 16 pt margins, and the height
 * the practice screen leaves on 360×740 with Buddy's reply above it (measured in the
 * walkthrough, `tests/web/maps.spec.ts`). Every box is at least this large, so a target
 * proven here is a target everywhere.
 */
export const MAP_MIN_BOX = { width: 328, height: 236 } as const;

/** How much the first tap near a small target magnifies, per area. */
export const MAP_ZOOM: Record<MapAreaId, number> = { world: 12, europe: 5, germany: 6.5 };

export type Pt = { x: number; y: number };

/** Points of an SVG path as rings (absolute M, relative l, H/V, z) — the data's own syntax. */
export function pathRings(d: string): Pt[][] {
  const rings: Pt[][] = [];
  const re = /([MlHVzL])|(-?\d+(?:\.\d+)?)/g;
  let cmd = '';
  const nums: number[] = [];
  let cur: Pt[] = [];
  let x = 0;
  let y = 0;
  const flush = () => {
    if (cmd === 'M' && nums.length >= 2) {
      if (cur.length) rings.push(cur);
      x = nums[0]!;
      y = nums[1]!;
      cur = [{ x, y }];
      for (let i = 2; i + 1 < nums.length; i += 2) {
        x = nums[i]!;
        y = nums[i + 1]!;
        cur.push({ x, y });
      }
    } else if (cmd === 'l') {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        x += nums[i]!;
        y += nums[i + 1]!;
        cur.push({ x, y });
      }
    } else if (cmd === 'L') {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        x = nums[i]!;
        y = nums[i + 1]!;
        cur.push({ x, y });
      }
    } else if (cmd === 'H') {
      for (const n of nums) {
        x = n;
        cur.push({ x, y });
      }
    } else if (cmd === 'V') {
      for (const n of nums) {
        y = n;
        cur.push({ x, y });
      }
    }
    nums.length = 0;
  };
  for (const m of d.matchAll(re)) {
    if (m[1]) {
      flush();
      cmd = m[1];
      if (cmd === 'z') {
        if (cur.length) rings.push(cur);
        cur = [];
      }
    } else nums.push(Number(m[2]));
  }
  flush();
  if (cur.length) rings.push(cur);
  return rings;
}

const ringCache = new Map<string, Pt[][]>();
function ringsOf(f: MapFeature): Pt[][] {
  let r = ringCache.get(f.d);
  if (!r) {
    r = pathRings(f.d);
    ringCache.set(f.d, r);
  }
  return r;
}

function inRing(p: Pt, r: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i]!;
    const b = r[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

/** Inside a shape: an odd number of its rings round the point (holes count). */
export function insideShape(f: MapFeature, p: Pt): boolean {
  if (f.form !== 'shape') return false;
  const [x0, y0, x1, y1] = f.box;
  if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) return false;
  let n = 0;
  for (const r of ringsOf(f)) if (inRing(p, r)) n++;
  return n % 2 === 1;
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** Distance (units) from a point to a feature's outline, its line, or its position. */
export function distanceTo(f: MapFeature, p: Pt): number {
  if (f.form === 'point') return Math.hypot(p.x - f.anchor[0], p.y - f.anchor[1]);
  let d = Infinity;
  for (const r of ringsOf(f)) {
    const n = r.length;
    const closed = f.form === 'shape';
    for (let i = 0; i + 1 < n + (closed ? 1 : 0); i++)
      d = Math.min(d, segDist(p, r[i]!, r[(i + 1) % n]!));
  }
  return d;
}

/** Fitting scale (pt per unit) of an area in a box. */
export function fitScale(area: MapAreaId, box: { width: number; height: number }): number {
  const a = mapArea(area);
  return Math.min(box.width / a.width, box.height / a.height);
}

/** The scale after the first tap: the area's zoom of this box, never less than on the smallest phone. */
export function zoomScale(area: MapAreaId, box: { width: number; height: number }): number {
  return Math.max(fitScale(area, box), fitScale(area, MAP_MIN_BOX)) * MAP_ZOOM[area];
}

/** Too small to be its own target at this scale: a disc round the anchor stands in. */
export function isSmall(f: MapFeature, scale: number): boolean {
  if (f.form === 'point') return true;
  if (f.form === 'line') return false;
  return 2 * f.r * scale < MAP_TOUCH;
}

export type MapTap = { kind: 'feature'; id: string } | { kind: 'zoom' } | { kind: 'none' };

/**
 * What a tap at `p` (units) means on a layer drawn at `scale` (pt per unit). `zoomed`: the map
 * is already magnified, so the tap chooses.
 */
export function mapTap(
  area: MapAreaId,
  layer: MapLayer,
  scale: number,
  p: Pt,
  zoomed: boolean,
  /** The scale a zoom would give; a tap that cannot get clearer chooses right away. */
  zoomTo: number,
): MapTap {
  const fs = mapFeatures(area, layer);
  const half = MAP_TOUCH / 2 / scale;
  const small = fs.filter((f) => isSmall(f, scale));
  if (!zoomed && zoomTo > scale * 1.01) {
    // A small target within a finger's reach of the tap: magnify first.
    const near = small.filter(
      (f) => Math.hypot(p.x - f.anchor[0], p.y - f.anchor[1]) <= MAP_TOUCH / scale,
    );
    if (near.length > 0) return { kind: 'zoom' };
  }
  // 1. A small target's disc.
  let best: MapFeature | null = null;
  let bestD = Infinity;
  for (const f of small) {
    const d = Math.hypot(p.x - f.anchor[0], p.y - f.anchor[1]);
    if (d <= half && d < bestD) {
      best = f;
      bestD = d;
    }
  }
  if (best) return { kind: 'feature', id: best.id };
  // 2. The shape under the finger (the smaller one where shapes nest).
  const under = fs.filter((f) => f.form === 'shape' && insideShape(f, p));
  if (under.length) {
    const f = under.reduce((a, b) => (a.r <= b.r ? a : b));
    return { kind: 'feature', id: f.id };
  }
  // 3. A line or an outline within half a finger.
  for (const f of fs) {
    if (f.form === 'point') continue;
    const d = distanceTo(f, p);
    if (d <= half && d < bestD) {
      best = f;
      bestD = d;
    }
  }
  return best ? { kind: 'feature', id: best.id } : { kind: 'none' };
}

/**
 * Can she choose this feature on the smallest phone? Checked at the magnified scale: a small
 * target's disc must not overlap another small target's disc (two features in one finger's
 * reach), and a feature must not lie wholly outside the drawing.
 */
export function isTappable(area: MapAreaId, layer: MapLayer, id: string): boolean {
  const fs = mapFeatures(area, layer);
  const f = fs.find((x) => x.id === id);
  if (!f) return false;
  const a = mapArea(area);
  const [ax, ay] = f.anchor;
  if (ax < 0 || ay < 0 || ax > a.width || ay > a.height) return false;
  const s = fitScale(area, MAP_MIN_BOX) * MAP_ZOOM[area];
  if (!isSmall(f, s)) return true;
  return fs.every(
    (g) =>
      g.id === f.id ||
      !isSmall(g, s) ||
      Math.hypot(g.anchor[0] - ax, g.anchor[1] - ay) * s >= MAP_TOUCH,
  );
}

/**
 * Can she SEE the marked feature on the smallest phone without a zoom (a marked shape she has
 * to name): at least a few points across, or it is drawn as a marked disc.
 */
export function isVisible(area: MapAreaId, layer: MapLayer, id: string): boolean {
  const f = mapFeatures(area, layer).find((x) => x.id === id);
  if (!f) return false;
  const a = mapArea(area);
  const [x0, y0, x1, y1] = f.box;
  return x1 >= 0 && y1 >= 0 && x0 <= a.width && y0 <= a.height;
}

/** The part of the map a zoom shows: centred on the tap, inside the map. In units. */
export function zoomWindow(
  area: MapAreaId,
  box: { width: number; height: number },
  p: Pt,
): { x: number; y: number; width: number; height: number } {
  const a = mapArea(area);
  const s = zoomScale(area, box);
  const w = Math.min(a.width, box.width / s);
  const h = Math.min(a.height, box.height / s);
  const x = Math.max(0, Math.min(a.width - w, p.x - w / 2));
  const y = Math.max(0, Math.min(a.height - h, p.y - h / 2));
  return { x, y, width: w, height: h };
}

/**
 * Which way from one feature to another, in eight directions (north up): for the reply after
 * a second miss — "weiter nördlich". From the data's anchors, never a guess.
 */
export type Compass = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export function compass(from: Pick<MapFeature, 'anchor'>, to: Pick<MapFeature, 'anchor'>): Compass {
  const dx = to.anchor[0] - from.anchor[0];
  const dy = from.anchor[1] - to.anchor[1];
  const angle = (Math.atan2(dx, dy) * 180) / Math.PI;
  const dirs: Compass[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
  return dirs[Math.round(((angle + 360) % 360) / 45) % 8] ?? 'n';
}
