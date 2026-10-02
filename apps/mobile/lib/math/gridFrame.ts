// Where the grids of the interactive figures stand on screen (issues #248, #249), and what she
// has tapped or drawn so far. Pure, so every rule can be tested without drawing.
//
// The one promise: every target is at least 44 pt (`TOUCH`). A tap snaps to the nearest grid
// point, so a point's target is the whole square around it — `pitch` × `pitch`. When the
// grid is too fine for that on this phone, the first tap MAGNIFIES the part she aims at
// (`zoomWindow`): the same figure, fewer steps in the same room, until a step is
// `ZOOM_PITCH` wide. The second tap then sets the point. Nothing lies between grid points
// (packages/shared-math/src/grid.ts), so the zoom never changes what can be answered — only
// how big it is under the finger.

import type {
  FigureTapTaskView,
  GridDrawTaskView,
  PlaneGrid,
  TapFigure,
  TapValue,
} from '@learnbuddy/shared-types/contracts';

// Imported by path: the mobile bundle takes only this small, dependency-free module.
import {
  cellOnPlane,
  gridIndex,
  gridValue,
  onPlane,
  samePoint,
  snap,
  stepsBetween,
  type Pt,
} from '../../../../packages/shared-math/src/grid.js';
import { TOUCH } from '../theme/space.js';

/** How wide a step becomes when the figure is magnified: a target with room around the finger. */
export const ZOOM_PITCH = 56;

/** The part of a plane that is drawn, in grid values. */
export type Window = { x0: number; x1: number; y0: number; y1: number };

export type Box = { width: number; height: number };

/** Room around the plot for the numbers on the axes (none on squared paper). */
export function padOf(axes: boolean): { l: number; r: number; t: number; b: number } {
  return axes ? { l: 26, r: 10, t: 10, b: 22 } : { l: 6, r: 6, t: 6, b: 6 };
}

export type Frame = {
  window: Window;
  step: number;
  /** Width and height of one step, in pt — the size of a target (the smaller of the two). */
  pitch: number;
  /** One step across and one step up, in pt: equal on a plane, not on a bar chart. */
  sx: number;
  sy: number;
  /** Where the plot starts (left, top) and how big it is. */
  left: number;
  top: number;
  plotW: number;
  plotH: number;
  /** The drawing's whole size (plot plus the room for numbers). */
  width: number;
  height: number;
};

export function fullWindow(g: PlaneGrid): Window {
  return { x0: g.x_min, x1: g.x_max, y0: g.y_min, y1: g.y_max };
}

/**
 * The frame for a window of a grid in a box, as large as the box allows. A plane has square
 * steps (a circle stays a circle); a bar chart (`square: false`) fills the width with its bars
 * and the height with its scale.
 */
export function planeFrame(
  win: Window,
  step: number,
  box: Box,
  axes: boolean,
  square: boolean = true,
): Frame {
  const pad = padOf(axes);
  const nx = Math.max(1, Math.round((win.x1 - win.x0) / step));
  const ny = Math.max(1, Math.round((win.y1 - win.y0) / step));
  const fx = Math.max(1, (box.width - pad.l - pad.r) / nx);
  const fy = Math.max(1, (box.height - pad.t - pad.b) / ny);
  const sx = square ? Math.min(fx, fy) : fx;
  const sy = square ? Math.min(fx, fy) : fy;
  const plotW = sx * nx;
  const plotH = sy * ny;
  const width = plotW + pad.l + pad.r;
  return {
    window: win,
    step,
    pitch: Math.min(sx, sy),
    sx,
    sy,
    // Centred in the box: the figure stands in the middle of the card, not on its left edge.
    left: Math.max(0, (box.width - width) / 2) + pad.l,
    top: pad.t,
    plotW,
    plotH,
    width: box.width,
    height: plotH + pad.t + pad.b,
  };
}

export function toPx(f: Frame, p: Pt): { px: number; py: number } {
  return {
    px: f.left + ((p.x - f.window.x0) / f.step) * f.sx,
    py: f.top + ((f.window.y1 - p.y) / f.step) * f.sy,
  };
}

/** Where a touch at (px, py) is in grid values — not yet snapped. */
export function fromPx(f: Frame, px: number, py: number): Pt {
  return {
    x: f.window.x0 + ((px - f.left) / f.sx) * f.step,
    y: f.window.y1 - ((py - f.top) / f.sy) * f.step,
  };
}

/** A touch as the grid point it means: the nearest one inside the window. */
export function snapPoint(f: Frame, px: number, py: number): Pt {
  const p = fromPx(f, px, py);
  return {
    x: snap(p.x, f.window.x0, f.window.x1, f.step),
    y: snap(p.y, f.window.y0, f.window.y1, f.step),
  };
}

/** A touch as the square it lands in (by its lower-left corner), or null outside the plot. */
export function cellAt(f: Frame, px: number, py: number): Pt | null {
  const p = fromPx(f, px, py);
  if (p.x < f.window.x0 || p.x >= f.window.x1 || p.y < f.window.y0 || p.y >= f.window.y1)
    return null;
  const cx = f.window.x0 + Math.floor((p.x - f.window.x0) / f.step) * f.step;
  const cy = f.window.y0 + Math.floor((p.y - f.window.y0) / f.step) * f.step;
  return { x: Math.round(cx * 1e9) / 1e9, y: Math.round(cy * 1e9) / 1e9 };
}

/** Are the targets of this frame too small for a finger? Then the first tap magnifies. */
export function needsZoom(f: Frame): boolean {
  return f.pitch < TOUCH;
}

/**
 * The part of the grid to magnify around `at`: as many steps as fit the box at ZOOM_PITCH,
 * never fewer than two, centred on `at` and moved inside the grid at its edges.
 */
export function zoomWindow(g: PlaneGrid, box: Box, at: Pt): Window {
  const pad = padOf(g.axes);
  const kx = Math.max(2, Math.floor((box.width - pad.l - pad.r) / ZOOM_PITCH));
  const ky = Math.max(2, Math.floor((box.height - pad.t - pad.b) / ZOOM_PITCH));
  const span = (lo: number, hi: number, k: number, c: number): [number, number] => {
    const n = stepsBetween(lo, hi, g.step) ?? 1;
    if (k >= n) return [lo, hi];
    const ci = Math.round((c - lo) / g.step);
    const start = Math.min(n - k, Math.max(0, ci - Math.floor(k / 2)));
    return [gridValue(lo, g.step, start), gridValue(lo, g.step, start + k)];
  };
  const [x0, x1] = span(g.x_min, g.x_max, kx, at.x);
  const [y0, y1] = span(g.y_min, g.y_max, ky, at.y);
  return { x0, x1, y0, y1 };
}

/**
 * Squared paper has no numbers: a place on it is counted in squares from the bottom-left
 * corner (2 squares to the right, 3 up), the way she would count them with her finger.
 */
export function squaresFrom(min: number, v: number, step: number): number {
  return Math.round((v - min) / step);
}

/**
 * The grid lines whose numbers are written: every one, or every 2nd, 5th … A number like "−4"
 * is ~16 pt wide at 11 pt; below 28 pt per line the numbers of neighbouring lines (and the one
 * at the origin) run into each other — measured on 360×740, shot 50.
 */
export function labelEvery(pitch: number): number {
  for (const n of [1, 2, 5, 10]) if (pitch * n >= 28) return n;
  return 20;
}

// ─────────────── number line ───────────────

export type LineFrame = {
  v0: number;
  v1: number;
  snap: number;
  left: number;
  right: number;
  /** Width of one snap step in pt. */
  pitch: number;
};

export const LINE_PAD = 22;

export function lineFrame(v0: number, v1: number, snapStep: number, width: number): LineFrame {
  const left = LINE_PAD;
  const right = width - LINE_PAD;
  const n = Math.max(1, Math.round((v1 - v0) / snapStep));
  return { v0, v1, snap: snapStep, left, right, pitch: (right - left) / n };
}

export function lineX(f: LineFrame, v: number): number {
  return f.left + ((v - f.v0) / (f.v1 - f.v0)) * (f.right - f.left);
}

export function lineValueAt(f: LineFrame, px: number): number {
  const v = f.v0 + ((px - f.left) / (f.right - f.left)) * (f.v1 - f.v0);
  return snap(v, f.v0, f.v1, f.snap);
}

/** The part of a number line to magnify around `at`, in whole ticks of `step`. */
export function lineZoom(
  fig: Extract<TapFigure, { kind: 'number_line' }>,
  width: number,
  at: number,
): { v0: number; v1: number } {
  const places = Math.max(2, Math.floor((width - 2 * LINE_PAD) / ZOOM_PITCH));
  // Whole ticks, so the numbered marks stay at their place: as many as hold `places` snaps.
  const perTick = Math.round(fig.step / fig.snap);
  const ticks = Math.max(1, Math.floor(places / perTick));
  const n = stepsBetween(fig.min, fig.max, fig.step) ?? 1;
  if (ticks >= n) return { v0: fig.min, v1: fig.max };
  const ci = Math.floor((at - fig.min) / fig.step);
  const start = Math.min(n - ticks, Math.max(0, ci - Math.floor((ticks - 1) / 2)));
  return {
    v0: gridValue(fig.min, fig.step, start),
    v1: gridValue(fig.min, fig.step, start + ticks),
  };
}

// ─────────────── what she has tapped (figure_tap) ───────────────

/** Does this value stand on a place of the figure? (The server refuses anything else.) */
export function onFigure(figure: TapFigure, v: TapValue): boolean {
  switch (figure.kind) {
    case 'plane':
      return v.kind === 'plane' && onPlane(v, figure.grid);
    case 'number_line':
      return (
        v.kind === 'number_line' && gridIndex(v.value, figure.min, figure.max, figure.snap) !== null
      );
    case 'bars':
      return v.kind === 'bars' && figure.bars.some((b) => b.id === v.id);
    case 'clock':
      return (
        v.kind === 'clock' &&
        Number.isInteger(v.h) &&
        v.h >= 1 &&
        v.h <= 12 &&
        Number.isInteger(v.m) &&
        v.m >= 0 &&
        v.m < 60 &&
        v.m % figure.snap === 0
      );
  }
}

/** Her tap as kept in the draft, or null for nothing (yet) or anything that does not fit. */
export function tapFrom(kept: string, view: FigureTapTaskView): TapValue | null {
  try {
    const v: unknown = JSON.parse(kept || 'null');
    if (v === null || typeof v !== 'object' || !('kind' in v)) return null;
    const value = v as TapValue;
    return onFigure(view.figure, value) ? value : null;
  } catch {
    return null;
  }
}

// ─────────────── what she has drawn (grid_draw) ───────────────

export type Drawing = {
  points: Pt[];
  cells: Pt[];
  bars: Array<{ id: string; value: number }>;
};

/** The empty drawing: no points, no squares, every bar at the bottom of the grid. */
export function emptyDrawing(view: GridDrawTaskView): Drawing {
  return {
    points: [],
    cells: [],
    bars: view.bars.map((b) => ({ id: b.id, value: view.grid.y_min })),
  };
}

/** What is kept: the drawing and the drawings before it (for "Rückgängig"). */
export type DrawDraft = { now: Drawing; before: Drawing[] };

/** How many steps back "Rückgängig" remembers. */
export const UNDO_DEPTH = 30;

function drawingFrom(raw: unknown, view: GridDrawTaskView): Drawing | null {
  if (raw === null || typeof raw !== 'object') return null;
  const d = raw as Partial<Drawing>;
  const g = view.grid;
  const isPt = (p: unknown): p is Pt =>
    p !== null &&
    typeof p === 'object' &&
    typeof (p as Pt).x === 'number' &&
    typeof (p as Pt).y === 'number';
  const points = Array.isArray(d.points) ? d.points.filter(isPt).filter((p) => onPlane(p, g)) : [];
  const cells = Array.isArray(d.cells) ? d.cells.filter(isPt).filter((c) => cellOnPlane(c, g)) : [];
  const kept = new Map(
    (Array.isArray(d.bars) ? d.bars : [])
      .filter(
        (b): b is { id: string; value: number } =>
          b !== null &&
          typeof b === 'object' &&
          typeof b.id === 'string' &&
          typeof b.value === 'number',
      )
      .map((b) => [b.id, b.value]),
  );
  const bars = view.bars.map((b) => {
    const v = kept.get(b.id);
    return {
      id: b.id,
      value: v !== undefined && gridIndex(v, g.y_min, g.y_max, g.step) !== null ? v : g.y_min,
    };
  });
  return { points: points.slice(0, view.needs ?? points.length), cells, bars };
}

/** Her drawing as kept in the draft; anything that does not fit this grid is left out. */
export function drawDraftFrom(kept: string, view: GridDrawTaskView): DrawDraft {
  try {
    const raw: unknown = JSON.parse(kept || 'null');
    if (raw === null || typeof raw !== 'object') return { now: emptyDrawing(view), before: [] };
    const r = raw as { now?: unknown; before?: unknown };
    const now = drawingFrom(r.now, view) ?? emptyDrawing(view);
    const before = (Array.isArray(r.before) ? r.before : [])
      .map((b) => drawingFrom(b, view))
      .filter((b): b is Drawing => b !== null)
      .slice(-UNDO_DEPTH);
    return { now, before };
  } catch {
    return { now: emptyDrawing(view), before: [] };
  }
}

/** A new drawing on top of the kept ones; nothing changes when nothing changed. */
export function pushDrawing(d: DrawDraft, next: Drawing): DrawDraft {
  if (JSON.stringify(next) === JSON.stringify(d.now)) return d;
  return { now: next, before: [...d.before, d.now].slice(-UNDO_DEPTH) };
}

export function undoDrawing(d: DrawDraft): DrawDraft {
  const prev = d.before[d.before.length - 1];
  return prev ? { now: prev, before: d.before.slice(0, -1) } : d;
}

/**
 * A tap on a grid point with the points tool: a set point goes away, a free one is set. When
 * she already has as many as the task needs, the newest one MOVES there instead — the drawing
 * never holds more than can be right, and "Prüfen" never waits on a point to take away.
 */
export function togglePoint(
  points: readonly Pt[],
  p: Pt,
  step: number,
  needs: number | null,
): Pt[] {
  const at = points.findIndex((q) => samePoint(q, p, step));
  if (at !== -1) return points.filter((_, i) => i !== at);
  if (needs !== null && points.length >= needs) return [...points.slice(0, needs - 1), p];
  return [...points, p];
}

export function toggleCell(cells: readonly Pt[], c: Pt, step: number): Pt[] {
  const at = cells.findIndex((q) => samePoint(q, c, step));
  return at !== -1 ? cells.filter((_, i) => i !== at) : [...cells, c];
}

/** Is the drawing ready for "Prüfen"? */
export function drawingComplete(view: GridDrawTaskView, d: Drawing): boolean {
  switch (view.tool) {
    case 'points':
    case 'line':
      return view.needs === null ? d.points.length > 0 : d.points.length === view.needs;
    case 'cells':
      return d.cells.length > 0;
    case 'bars':
      return d.bars.some((b) => b.value !== view.grid.y_min);
  }
}

/** The bar a touch at plot x is over (bars stand one step wide, from x = 0). */
export function barAt(view: GridDrawTaskView, x: number): string | null {
  const i = Math.floor((x - view.grid.x_min) / view.grid.step);
  return view.bars[i]?.id ?? null;
}
