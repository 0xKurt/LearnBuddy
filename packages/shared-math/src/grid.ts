// Grids she taps on and draws on (issues #248, #249): the arithmetic the app and the server
// must agree on, in one dependency-free place. The app imports this file by path (like
// `expression.ts`), the server through the package index.
//
// Two rules hold everything together:
//
//   1. Nothing lies BETWEEN grid points. A tap snaps to the nearest one, a key that is not on
//      one is no key (the item is not stored), and an answer that is not on one is no answer
//      (the server refuses it). So "is this right?" never needs a tolerance about where she
//      meant to tap — only about how a decimal is stored.
//   2. That one tolerance is explicit and small: {@link GRID_EPSILON} of a step. It absorbs
//      0.1 + 0.2, nothing a finger could do.

import { compileExpression } from './expression.js';

/**
 * How far from a grid point a value may be and still BE that point, as a share of the step.
 * Floating-point slack only: two neighbouring points are a whole step (1.0) apart.
 */
export const GRID_EPSILON = 1e-6;

/** How far f(x) may be from y and the point still lie ON the graph, absolute plus relative. */
export const GRAPH_EPSILON = 1e-9;

/** The value of grid line `i` (counted from `min`), rounded so that 0.1·3 reads 0.3. */
export function gridValue(min: number, step: number, i: number): number {
  return Math.round((min + i * step) * 1e9) / 1e9;
}

/** How many steps lie between `min` and `max`, or null when `max` is not on the grid. */
export function stepsBetween(min: number, max: number, step: number): number | null {
  if (!(step > 0) || !(max > min)) return null;
  const n = (max - min) / step;
  const r = Math.round(n);
  return Math.abs(n - r) <= GRID_EPSILON ? r : null;
}

/** The index of the grid line `v` lies on, or null when it lies between two (or outside). */
export function gridIndex(v: number, min: number, max: number, step: number): number | null {
  if (!Number.isFinite(v)) return null;
  const n = stepsBetween(min, max, step);
  if (n === null) return null;
  const i = (v - min) / step;
  const r = Math.round(i);
  if (Math.abs(i - r) > GRID_EPSILON) return null;
  return r >= 0 && r <= n ? r : null;
}

/** Is `v` a whole multiple of `step` (so a grid from it has 0 among its lines)? */
export function isMultiple(v: number, step: number): boolean {
  const n = v / step;
  return Math.abs(n - Math.round(n)) <= GRID_EPSILON;
}

/** Is `v` one of the grid values between `min` and `max`? */
export function onGrid(v: number, min: number, max: number, step: number): boolean {
  return gridIndex(v, min, max, step) !== null;
}

/** The grid value nearest to `v`, clamped into [min, max] — what a tap at `v` means. */
export function snap(v: number, min: number, max: number, step: number): number {
  const n = stepsBetween(min, max, step) ?? 0;
  const i = Math.min(n, Math.max(0, Math.round((v - min) / step)));
  return gridValue(min, step, i);
}

/** The same value up to the grid's slack. */
export function sameValue(a: number, b: number, step: number): boolean {
  return Math.abs(a - b) <= step * GRID_EPSILON;
}

/** A rectangular grid of points: both axes from min to max in steps of `step`. */
export type Plane = { x_min: number; x_max: number; y_min: number; y_max: number; step: number };

export type Pt = { x: number; y: number };

/** Is the point one of the plane's grid points? */
export function onPlane(p: Pt, g: Plane): boolean {
  return onGrid(p.x, g.x_min, g.x_max, g.step) && onGrid(p.y, g.y_min, g.y_max, g.step);
}

export function samePoint(a: Pt, b: Pt, step: number): boolean {
  return sameValue(a.x, b.x, step) && sameValue(a.y, b.y, step);
}

/** A mirror line parallel to an axis: x = at (vertical) or y = at (horizontal). */
export type MirrorAxis = { direction: 'vertical' | 'horizontal'; at: number };

/**
 * May a mirror line stand here? On a grid line or halfway between two: only then does every
 * grid point have its image on a grid point.
 */
export function axisOnGrid(axis: MirrorAxis, g: Plane): boolean {
  const half = g.step / 2;
  return axis.direction === 'vertical'
    ? onGrid(axis.at, g.x_min, g.x_max, half)
    : onGrid(axis.at, g.y_min, g.y_max, half);
}

/** The image of `p` in the mirror line, rounded like every grid value. */
export function mirrorPoint(p: Pt, axis: MirrorAxis): Pt {
  const r = (v: number) => Math.round(v * 1e9) / 1e9;
  return axis.direction === 'vertical'
    ? { x: r(2 * axis.at - p.x), y: p.y }
    : { x: p.x, y: r(2 * axis.at - p.y) };
}

/** A square of the grid, named by its lower-left corner. */
export type Cell = { x: number; y: number };

/**
 * The image of a cell: the square whose lower-left corner is the image of the corner on the
 * far side (the square from x to x+step lands on 2a−x−step to 2a−x).
 */
export function mirrorCell(c: Cell, axis: MirrorAxis, step: number): Cell {
  const far = mirrorPoint({ x: c.x + step, y: c.y + step }, axis);
  return axis.direction === 'vertical' ? { x: far.x, y: c.y } : { x: c.x, y: far.y };
}

/** Is the square with this lower-left corner inside the grid? */
export function cellOnPlane(c: Cell, g: Plane): boolean {
  return (
    onGrid(c.x, g.x_min, g.x_max - g.step, g.step) && onGrid(c.y, g.y_min, g.y_max - g.step, g.step)
  );
}

/** Does the graph of `fn` pass through `p`? Null when `fn` cannot be read. */
export function onGraph(fn: string, p: Pt): boolean | null {
  const f = compileExpression(fn);
  if (!f) return null;
  const y = f(p.x);
  if (!Number.isFinite(y)) return false;
  return Math.abs(y - p.y) <= GRAPH_EPSILON * (1 + Math.abs(p.y));
}

/** The grid points of the plane the graph of `fn` passes through (left to right). */
export function graphPoints(fn: string, g: Plane): Pt[] {
  const f = compileExpression(fn);
  const nx = stepsBetween(g.x_min, g.x_max, g.step);
  if (!f || nx === null) return [];
  const out: Pt[] = [];
  for (let i = 0; i <= nx; i++) {
    const x = gridValue(g.x_min, g.step, i);
    const y = f(x);
    if (!Number.isFinite(y)) continue;
    const ys = snap(y, g.y_min, g.y_max, g.step);
    if (
      Math.abs(ys - y) <= GRAPH_EPSILON * (1 + Math.abs(y)) &&
      onGrid(ys, g.y_min, g.y_max, g.step)
    )
      out.push({ x, y: ys });
  }
  return out;
}

/** Slope and y-intercept of a straight line, or null when `fn` is not one (or unreadable). */
export function lineOf(fn: string): { m: number; b: number } | null {
  const f = compileExpression(fn);
  if (!f) return null;
  const y0 = f(0);
  const y1 = f(1);
  const y2 = f(2);
  const y5 = f(-5);
  if (![y0, y1, y2, y5].every(Number.isFinite)) return null;
  const m = y1 - y0;
  const tol = GRAPH_EPSILON * (1 + Math.abs(y0) + Math.abs(m));
  // A straight line has the same rise everywhere (checked away from 0 and 1 as well).
  if (Math.abs(y2 - y1 - m) > tol || Math.abs(y0 - y5 - 5 * m) > tol * 5) return null;
  return { m, b: y0 };
}

/** Slope and y-intercept of the line through two points; null for a vertical one. */
export function lineThrough(a: Pt, b: Pt): { m: number; b: number } | null {
  if (a.x === b.x) return null;
  const m = (b.y - a.y) / (b.x - a.x);
  return { m, b: a.y - m * a.x };
}

/** Two numbers equal up to the graph tolerance. */
export function closeTo(a: number, b: number): boolean {
  return Math.abs(a - b) <= GRAPH_EPSILON * (1 + Math.abs(a) + Math.abs(b));
}

/** Minutes a clock hand may stand on: 12 positions round the face at 5, fewer at 15 or 30. */
export const CLOCK_SNAPS = [5, 15, 30] as const;

/** A clock reading: hour 1–12 on the face, minute 0–59. */
export type ClockTime = { h: number; m: number };

/** The time a tap at `angle` (radians, 0 = 12 o'clock, clockwise) sets for the minute hand. */
export function minuteAt(angle: number, snapMinutes: number): number {
  const turn = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const m = Math.round((turn / (2 * Math.PI)) * (60 / snapMinutes)) * snapMinutes;
  return m % 60;
}

/** The hour a tap at `angle` sets for the hour hand (1–12). */
export function hourAt(angle: number): number {
  const turn = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const h = Math.round((turn / (2 * Math.PI)) * 12) % 12;
  return h === 0 ? 12 : h;
}
