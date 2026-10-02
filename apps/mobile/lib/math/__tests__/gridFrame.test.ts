// Where the interactive figures stand and what she has set (issues #248, #249). The promise
// held here: every target is ≥ 44 pt — directly, or after the magnifying first tap — on the
// smallest phone, for the largest grid the contract allows; and a kept drawing comes back
// after a remount with nothing in it that does not fit the grid.

import type { GridDrawTaskView, PlaneGrid } from '@learnbuddy/shared-types/contracts';
import { PLANE_STEPS_MAX } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import {
  cellAt,
  drawDraftFrom,
  drawingComplete,
  emptyDrawing,
  fullWindow,
  lineFrame,
  lineValueAt,
  lineZoom,
  needsZoom,
  planeFrame,
  pushDrawing,
  snapPoint,
  squaresFrom,
  tapFrom,
  toggleCell,
  togglePoint,
  toPx,
  undoDrawing,
  zoomWindow,
} from '../gridFrame.js';

/** The room a figure gets on a 360×740 phone after Buddy's reply (measured in the walkthrough). */
const SMALL = { width: 328, height: 250 };

const GRID: PlaneGrid = { x_min: -4, x_max: 4, y_min: -3, y_max: 3, step: 1, axes: true };

describe('the plane on screen', () => {
  it('maps grid values to points and a touch back to the nearest grid point', () => {
    const f = planeFrame(fullWindow(GRID), 1, { width: 328, height: 300 }, true);
    expect(f.sx).toBe(f.sy);
    const p = toPx(f, { x: 2, y: -1 });
    expect(snapPoint(f, p.px + f.pitch * 0.4, p.py - f.pitch * 0.4)).toEqual({ x: 2, y: -1 });
    expect(snapPoint(f, p.px + f.pitch * 0.6, p.py)).toEqual({ x: 3, y: -1 });
    // Outside the plot it is the nearest edge, never a value off the grid.
    expect(snapPoint(f, -50, -50)).toEqual({ x: -4, y: 3 });
    expect(cellAt(f, p.px + 2, p.py - 2)).toEqual({ x: 2, y: -1 });
    expect(cellAt(f, -50, -50)).toBeNull();
  });

  it('magnifies a grid too fine for a finger, so every target is at least 44 pt', () => {
    const biggest: PlaneGrid = {
      x_min: -10,
      x_max: 10,
      y_min: -10,
      y_max: 10,
      step: 1,
      axes: true,
    };
    expect(biggest.x_max - biggest.x_min).toBe(PLANE_STEPS_MAX);
    const f = planeFrame(fullWindow(biggest), 1, SMALL, true);
    expect(needsZoom(f)).toBe(true);
    for (const at of [
      { x: -10, y: -10 },
      { x: 0, y: 0 },
      { x: 10, y: 7 },
    ]) {
      const win = zoomWindow(biggest, SMALL, at);
      const z = planeFrame(win, 1, SMALL, true);
      expect(z.pitch).toBeGreaterThanOrEqual(44);
      expect(needsZoom(z)).toBe(false);
      // The point she aimed at is inside the magnified part, and the part inside the grid.
      expect(at.x).toBeGreaterThanOrEqual(win.x0);
      expect(at.x).toBeLessThanOrEqual(win.x1);
      expect(at.y).toBeGreaterThanOrEqual(win.y0);
      expect(at.y).toBeLessThanOrEqual(win.y1);
      expect(win.x0).toBeGreaterThanOrEqual(biggest.x_min);
      expect(win.y1).toBeLessThanOrEqual(biggest.y_max);
    }
  });

  it('does not magnify a grid whose steps are big enough already', () => {
    const small: PlaneGrid = { x_min: 0, x_max: 5, y_min: 0, y_max: 4, step: 1, axes: true };
    expect(needsZoom(planeFrame(fullWindow(small), 1, SMALL, true))).toBe(false);
  });

  it('a bar chart fills the width with its bars', () => {
    const bars: PlaneGrid = { x_min: 0, x_max: 3, y_min: 0, y_max: 10, step: 1, axes: true };
    const f = planeFrame(fullWindow(bars), 1, SMALL, true, false);
    expect(f.sx * 3).toBeCloseTo(328 - 36);
    expect(f.sx).toBeGreaterThan(44);
  });
});

describe('the number line on screen', () => {
  const fig = {
    kind: 'number_line' as const,
    min: -10,
    max: 10,
    step: 1,
    snap: 0.5,
    marks: [],
  };

  it('snaps a touch to the nearest mark', () => {
    const f = lineFrame(-3, 3, 0.5, 328);
    expect(lineValueAt(f, f.left + f.pitch * 3.4)).toBe(-1.5);
    expect(lineValueAt(f, -40)).toBe(-3);
  });

  it('magnifies a fine line to whole ticks with 44 pt per mark', () => {
    const full = lineFrame(fig.min, fig.max, fig.snap, 328);
    expect(full.pitch).toBeLessThan(44);
    const win = lineZoom(fig, 328, 3.5);
    expect(Number.isInteger(win.v0) && Number.isInteger(win.v1)).toBe(true);
    expect(win.v0).toBeLessThanOrEqual(3.5);
    expect(win.v1).toBeGreaterThanOrEqual(3.5);
    expect(lineFrame(win.v0, win.v1, fig.snap, 328).pitch).toBeGreaterThanOrEqual(44);
  });
});

describe('squared paper, counted', () => {
  it('a place is squares from the bottom-left corner, also on a grid of half squares', () => {
    expect(squaresFrom(0, 9, 1)).toBe(9);
    expect(squaresFrom(-2, 1, 1)).toBe(3);
    expect(squaresFrom(0, 2.5, 0.5)).toBe(5);
  });
});

describe('what she tapped, kept', () => {
  const view = {
    type: 'figure_tap' as const,
    figure: { kind: 'plane' as const, grid: GRID, marks: [] },
  };
  it('reads back a tap on the figure, and nothing else', () => {
    expect(tapFrom('{"kind":"plane","x":2,"y":-1}', view)).toEqual({ kind: 'plane', x: 2, y: -1 });
    expect(tapFrom('{"kind":"plane","x":2.5,"y":-1}', view)).toBeNull();
    expect(tapFrom('{"kind":"clock","h":3,"m":0}', view)).toBeNull();
    expect(tapFrom('kaputt', view)).toBeNull();
    expect(tapFrom('', view)).toBeNull();
  });
});

describe('what she drew, kept', () => {
  const view: GridDrawTaskView = {
    type: 'grid_draw',
    grid: GRID,
    given: { marks: [], closed: false, cells: [], mirror: null },
    tool: 'line',
    needs: 2,
    bars: [],
  };

  it('a tap sets a point, again takes it away; when full, the newest moves', () => {
    let pts = togglePoint([], { x: 0, y: -1 }, 1, 2);
    pts = togglePoint(pts, { x: 1, y: 1 }, 1, 2);
    expect(pts).toHaveLength(2);
    expect(togglePoint(pts, { x: 3, y: 3 }, 1, 2)).toEqual([
      { x: 0, y: -1 },
      { x: 3, y: 3 },
    ]);
    expect(togglePoint(pts, { x: 0, y: -1 }, 1, 2)).toEqual([{ x: 1, y: 1 }]);
    expect(toggleCell(toggleCell([], { x: 0, y: 0 }, 1), { x: 0, y: 0 }, 1)).toEqual([]);
  });

  it('survives a remount through the draft, without anything off the grid', () => {
    const d = pushDrawing(
      { now: emptyDrawing(view), before: [] },
      { points: [{ x: 0, y: -1 }], cells: [], bars: [] },
    );
    const kept = JSON.stringify(d);
    expect(drawDraftFrom(kept, view)).toEqual(d);
    const tampered = JSON.stringify({
      now: {
        points: [
          { x: 0.5, y: 0 },
          { x: 1, y: 1 },
          { x: 2, y: 3 },
          { x: 3, y: 5 },
        ],
      },
      before: 'x',
    });
    expect(drawDraftFrom(tampered, view).now.points).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 3 },
    ]);
    expect(drawDraftFrom('kaputt', view)).toEqual({ now: emptyDrawing(view), before: [] });
  });

  it('undo goes back one step at a time, and "Prüfen" waits for the line', () => {
    let d = { now: emptyDrawing(view), before: [] as ReturnType<typeof emptyDrawing>[] };
    d = pushDrawing(d, { ...d.now, points: [{ x: 0, y: -1 }] });
    expect(drawingComplete(view, d.now)).toBe(false);
    d = pushDrawing(d, {
      ...d.now,
      points: [
        { x: 0, y: -1 },
        { x: 1, y: 1 },
      ],
    });
    expect(drawingComplete(view, d.now)).toBe(true);
    d = undoDrawing(d);
    expect(d.now.points).toEqual([{ x: 0, y: -1 }]);
    d = undoDrawing(undoDrawing(d));
    expect(d.now.points).toEqual([]);
  });
});
