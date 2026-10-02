// Grids she taps and draws on (issues #248, #249): snapping, the grid's one tolerance, mirror
// images, graphs. The app and the server both rely on these, so they are pinned here.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  axisOnGrid,
  cellOnPlane,
  GRID_EPSILON,
  graphPoints,
  hourAt,
  isMultiple,
  lineOf,
  lineThrough,
  minuteAt,
  mirrorCell,
  mirrorPoint,
  onGraph,
  onGrid,
  onPlane,
  snap,
  stepsBetween,
} from '../grid.js';

const PLANE = { x_min: -5, x_max: 5, y_min: -4, y_max: 4, step: 1 };

describe('snapping', () => {
  it('a tap lands on the nearest grid value, and never outside the grid', () => {
    expect(snap(1.4, -5, 5, 1)).toBe(1);
    expect(snap(1.6, -5, 5, 1)).toBe(2);
    expect(snap(-9, -5, 5, 1)).toBe(-5);
    expect(snap(9, -5, 5, 1)).toBe(5);
    // Halves: 0.3 is nearer 0.5 than 0.
    expect(snap(0.3, 0, 3, 0.5)).toBe(0.5);
    // Floating point does not leak into the value she gives: 0.1 · 3 is 0.3.
    expect(snap(0.29, 0, 1, 0.1)).toBe(0.3);
  });

  it('every snapped value is on the grid (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -20, max: 0 }),
        fc.integer({ min: 2, max: 20 }),
        fc.constantFrom(0.1, 0.25, 0.5, 1, 2, 5),
        fc.double({ min: -100, max: 100, noNaN: true }),
        (lo, steps, step, v) => {
          const min = lo * step;
          const max = min + steps * step;
          expect(onGrid(snap(v, min, max, step), min, max, step)).toBe(true);
        },
      ),
    );
  });

  it('the one tolerance is a sliver of a step, not a neighbour', () => {
    expect(onGrid(2 + GRID_EPSILON / 2, -5, 5, 1)).toBe(true);
    expect(onGrid(2.01, -5, 5, 1)).toBe(false);
    expect(onGrid(2.5, -5, 5, 1)).toBe(false);
    expect(onGrid(6, -5, 5, 1)).toBe(false);
    expect(onGrid(0.1 + 0.2, 0, 1, 0.1)).toBe(true);
  });

  it('a span that is not whole steps is no grid', () => {
    expect(stepsBetween(0, 10, 3)).toBeNull();
    expect(stepsBetween(0, 10, 2.5)).toBe(4);
    expect(stepsBetween(5, 5, 1)).toBeNull();
    expect(isMultiple(-2.5, 0.5)).toBe(true);
    expect(isMultiple(0.3, 0.5)).toBe(false);
  });
});

describe('mirror images', () => {
  it('a point at a vertical and a horizontal line', () => {
    expect(mirrorPoint({ x: 1, y: 2 }, { direction: 'vertical', at: 3 })).toEqual({ x: 5, y: 2 });
    expect(mirrorPoint({ x: 1, y: 2 }, { direction: 'horizontal', at: 0 })).toEqual({
      x: 1,
      y: -2,
    });
    // Halfway between two grid lines maps grid points to grid points.
    expect(mirrorPoint({ x: 1, y: 0 }, { direction: 'vertical', at: 2.5 })).toEqual({
      x: 4,
      y: 0,
    });
  });

  it('a square lands on the square on the far side', () => {
    // The square from x=1 to 2, mirrored at x=3, is the one from 4 to 5.
    expect(mirrorCell({ x: 1, y: 0 }, { direction: 'vertical', at: 3 }, 1)).toEqual({ x: 4, y: 0 });
    // The square from y=0 to 1 at y=0 is the one from −1 to 0.
    expect(mirrorCell({ x: 2, y: 0 }, { direction: 'horizontal', at: 0 }, 1)).toEqual({
      x: 2,
      y: -1,
    });
  });

  it('a mirror line only on a grid line or halfway between two', () => {
    expect(axisOnGrid({ direction: 'vertical', at: 2 }, PLANE)).toBe(true);
    expect(axisOnGrid({ direction: 'vertical', at: 2.5 }, PLANE)).toBe(true);
    expect(axisOnGrid({ direction: 'vertical', at: 2.3 }, PLANE)).toBe(false);
    expect(axisOnGrid({ direction: 'horizontal', at: 7 }, PLANE)).toBe(false);
  });

  it('squares and points of the plane', () => {
    expect(onPlane({ x: 5, y: -4 }, PLANE)).toBe(true);
    expect(onPlane({ x: 5.5, y: 0 }, PLANE)).toBe(false);
    // A square is named by its lower-left corner, so the top row starts one step below y_max.
    expect(cellOnPlane({ x: 4, y: 3 }, PLANE)).toBe(true);
    expect(cellOnPlane({ x: 5, y: 3 }, PLANE)).toBe(false);
  });
});

describe('lines and graphs', () => {
  it('reads slope and intercept of a straight line, and refuses anything else', () => {
    expect(lineOf('2*x-1')).toEqual({ m: 2, b: -1 });
    expect(lineOf('-0.5x+3')).toEqual({ m: -0.5, b: 3 });
    expect(lineOf('x^2')).toBeNull();
    expect(lineOf('2^x')).toBeNull();
    expect(lineOf('hello')).toBeNull();
  });

  it('the line through two points; none through two above each other', () => {
    expect(lineThrough({ x: 0, y: -1 }, { x: 2, y: 3 })).toEqual({ m: 2, b: -1 });
    expect(lineThrough({ x: 1, y: 0 }, { x: 1, y: 3 })).toBeNull();
  });

  it('finds the grid points a graph passes through, in range', () => {
    expect(graphPoints('2x-1', PLANE)).toEqual([
      { x: -1, y: -3 },
      { x: 0, y: -1 },
      { x: 1, y: 1 },
      { x: 2, y: 3 },
    ]);
    expect(graphPoints('x^2', PLANE).map((p) => p.x)).toEqual([-2, -1, 0, 1, 2]);
    expect(onGraph('x^2', { x: 2, y: 4 })).toBe(true);
    expect(onGraph('x^2', { x: 2, y: 3 })).toBe(false);
    expect(onGraph('???', { x: 2, y: 3 })).toBeNull();
  });
});

describe('the clock face', () => {
  it("a tap sets the hand to the nearest step, 12 o'clock at the top", () => {
    expect(minuteAt(0, 5)).toBe(0);
    expect(minuteAt(Math.PI / 2, 5)).toBe(15);
    expect(minuteAt(Math.PI + 0.1, 15)).toBe(30);
    expect(minuteAt(2 * Math.PI - 0.05, 5)).toBe(0);
    expect(hourAt(Math.PI / 2)).toBe(3);
    expect(hourAt(0)).toBe(12);
    expect(hourAt(-Math.PI / 2)).toBe(9);
  });
});
