// Margins, ticks and labels of a coordinate system: the function plot she reads
// (components/math/FunctionPlotFigure.tsx) and the grid she draws on (issue #249) are one
// drawing, `components/math/PlotAxes.tsx`, laid out here. Pure, so the placement can be tested without
// drawing. Y-axis labels sit left of the y-axis (anchored at their right end); when that axis runs
// along the left edge (x_min ≥ 0: distance-time, growth, proportional functions) the left margin
// must be as wide as the widest label, or every value is drawn outside the SVG and clipped (audit
// H-36 p2-function-plot-y-labels-offscreen).

// Imported by path: the mobile bundle takes only this small, dependency-free module of
// @learnbuddy/shared-math (its index also pulls in mathjs).
import { niceStep } from '../../../../packages/shared-math/src/charts.js';

/** Gap between the y-axis and the right end of its labels. */
export const Y_LABEL_GAP = 6;
const MIN_LEFT = 8;
const RIGHT = 12;
const TOP = 12;
const BOTTOM = 8;

/** A generous width estimate for a label of digits, signs and a decimal comma. */
export function labelWidth(text: string, fontSize: number): number {
  return Math.ceil(text.length * fontSize * 0.62) + 2;
}

export type PlotFrame = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** Plot area width and height. */
  pw: number;
  ph: number;
  /** x position of the y-axis (through 0 when 0 is in range, else the left edge). */
  axisY: number;
};

/**
 * The frame for a plot of [x0, x1] × … at `width`, given the y labels that will be drawn left
 * of the y-axis. The left margin grows just enough that the widest label starts at x ≥ 0.
 */
export function plotFrame(opts: {
  width: number;
  height: number;
  x0: number;
  x1: number;
  yLabels: readonly string[];
  fontSize: number;
  /** Room under the plot (default 8): the grid's first-quadrant labels and bar names stand there. */
  bottom?: number;
}): PlotFrame {
  const { width, height, x0, x1 } = opts;
  const xs = x1 - x0 || 1;
  const axisValue = x0 <= 0 && x1 >= 0 ? 0 : x0;
  // Where the y-axis sits as a share of the plot width (0 = left edge, 1 = right edge).
  const f = (axisValue - x0) / xs;
  const widest = opts.yLabels.reduce((w, l) => Math.max(w, labelWidth(l, opts.fontSize)), 0);
  const need = Y_LABEL_GAP + widest;
  // axisY = left + f·(width − left − right) must be ≥ need.
  const left =
    f >= 1 ? MIN_LEFT : Math.max(MIN_LEFT, Math.ceil((need - f * (width - RIGHT)) / (1 - f)));
  const bottom = opts.bottom ?? BOTTOM;
  const pw = width - left - RIGHT;
  const ph = height - TOP - bottom;
  return { left, right: RIGHT, top: TOP, bottom, pw, ph, axisY: left + f * pw };
}

/** The multiples of `step` in [lo, hi], at most 60. */
function ticksFor(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  const start = Math.ceil(lo / step - 1e-9) * step;
  for (let v = start; v <= hi + 1e-9 && out.length < 60; v += step)
    out.push(Math.round(v / step) * step);
  return out;
}

/** A tick label as it is drawn: its value, its anchor point (SVG baseline) and its text. */
export type TickLabel = { v: number; x: number; y: number; text: string };

/** How far the paper-coloured halo behind a label reaches (`HaloText`, stroke 4). */
const HALO = 2;

/** The box a label covers with its halo; x labels are centred, y labels end at their x. */
function boxOf(l: TickLabel, anchor: 'middle' | 'end', fontSize: number) {
  const w = labelWidth(l.text, fontSize);
  const left = anchor === 'middle' ? l.x - w / 2 : l.x - w;
  return { x0: left - HALO, x1: left + w + HALO, y0: l.y - fontSize * 0.75 - HALO, y1: l.y + HALO };
}

/**
 * The y labels that stay clear of every x label (issue #326). In a small option picture the
 * x-axis' "−2" under the axis and the y-axis' "−2" left of it land on each other next to the
 * origin. Two labels are never drawn over each other: where they would touch, the y label gives
 * way — its grid line and tick stay, and the x labels along the axis are read first.
 */
export function yLabelsClearOf(
  xLabels: readonly TickLabel[],
  yLabels: readonly TickLabel[],
  fontSize: number,
): TickLabel[] {
  const taken = xLabels.map((l) => boxOf(l, 'middle', fontSize));
  return yLabels.filter((l) => {
    const b = boxOf(l, 'end', fontSize);
    return !taken.some((a) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1);
  });
}

/**
 * A coordinate system laid out at a size: its frame, where the axes run, which grid lines and
 * tick labels it has. Everything `PlotAxes` draws and everything a drawing on it needs to place a
 * value (`plotX`, `plotY`) — or, the other way round, to find the value under a finger.
 */
export type PlotGeometry = PlotFrame & {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Where the x-axis runs (screen y): through 0 when 0 is in range, else along the bottom. */
  axisX: number;
  /** Grid lines, and how far apart they are. */
  xTicks: number[];
  yTicks: number[];
  xStep: number;
  yStep: number;
  /** The y ticks that get a mark on the axis (the one at the x-axis gives way to it). */
  yMarks: number[];
  xLabels: TickLabel[];
  yLabels: TickLabel[];
  /** 0 lies in both ranges: the origin may carry its "0". */
  origin: boolean;
};

/** What it takes to place a value: the plot area and the ranges it shows. */
type PlotScale = Pick<PlotGeometry, 'left' | 'top' | 'pw' | 'ph' | 'x0' | 'x1' | 'y0' | 'y1'>;

/** Where a value stands on the plot, across and down (a chart's axes too, `chartLayout.ts`). */
export const plotX = (g: Pick<PlotScale, 'left' | 'pw' | 'x0' | 'x1'>, v: number) =>
  g.left + ((v - g.x0) / (g.x1 - g.x0 || 1)) * g.pw;
export const plotY = (g: Pick<PlotScale, 'top' | 'ph' | 'y0' | 'y1'>, v: number) =>
  g.top + (1 - (v - g.y0) / (g.y1 - g.y0 || 1)) * g.ph;

/** How far under the x-axis its labels stand (baseline). */
const X_LABEL_DROP = 15;

/**
 * The layout of a coordinate system of [x0, x1] × [y0, y1] at `width` × `height`.
 *
 * Without `steps` the grid follows the room (about one line per 40 pt across and 32 pt up), as a
 * function plot does; the grid she draws on has a line at every whole unit (`steps: {x: 1, y: 1}`).
 * `square` makes a unit as long across as up, the plot then as large as both directions allow.
 * `xLabel` / `yLabel` write a tick's label, or null for none (the bars' columns are named apart).
 */
export function plotGeometry(opts: {
  width: number;
  height: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  fontSize: number;
  label: (v: number) => string;
  steps?: { x: number; y: number };
  square?: boolean;
  /** With `square`: the longest a unit may be, however much room there is. */
  maxUnit?: number;
  bottom?: number;
  xLabel?: (v: number) => string | null;
  yLabel?: (v: number) => string | null;
}): PlotGeometry {
  const x0 = Math.min(opts.x0, opts.x1);
  const x1 = Math.max(opts.x0, opts.x1);
  const y0 = Math.min(opts.y0, opts.y1);
  const y1 = Math.max(opts.y0, opts.y1);
  const xs = x1 - x0 || 1;
  const ys = y1 - y0 || 1;
  const xLabel = opts.xLabel ?? opts.label;
  const yLabel = opts.yLabel ?? opts.label;
  const ph0 = opts.height - TOP - (opts.bottom ?? BOTTOM);
  const yStep = opts.steps?.y ?? niceStep(ys, Math.max(4, Math.min(10, Math.floor(ph0 / 32))));
  const yTicks = ticksFor(y0, y1, yStep);
  const frame = plotFrame({
    width: opts.width,
    height: opts.height,
    x0,
    x1,
    yLabels: [...yTicks.map((v) => yLabel(v) ?? ''), '0'],
    fontSize: opts.fontSize,
    ...(opts.bottom === undefined ? {} : { bottom: opts.bottom }),
  });
  if (opts.square) {
    const unit = Math.min(frame.pw / xs, frame.ph / ys, opts.maxUnit ?? Infinity);
    const f = (frame.axisY - frame.left) / (frame.pw || 1);
    frame.pw = unit * xs;
    frame.ph = unit * ys;
    frame.axisY = frame.left + f * frame.pw;
  }
  const g0 = { ...frame, x0, x1, y0, y1 };
  const X = (v: number) => plotX(g0, v);
  const Y = (v: number) => plotY(g0, v);
  const xStep = opts.steps?.x ?? niceStep(xs, Math.max(4, Math.min(10, Math.floor(frame.pw / 40))));
  const xTicks = ticksFor(x0, x1, xStep);
  const axisX = Y(y0 <= 0 && y1 >= 0 ? 0 : y0);
  // Every tick label where it is drawn, so a y label that would sit on an x label can give way
  // (issue #326: "−2" and "−2" on each other next to the origin of a small option graph).
  const yMarks = yTicks.filter((v) => Math.abs(v) > yStep / 2 || axisX !== Y(0));
  const xLabels = xTicks
    .filter((v) => Math.abs(v) > xStep / 2 || frame.axisY !== X(0))
    .flatMap((v) => {
      const text = xLabel(v);
      const y = Math.min(axisX + X_LABEL_DROP, frame.top + frame.ph + frame.bottom - 10);
      return text === null ? [] : [{ v, x: X(v), y, text }];
    });
  const yLabels = yLabelsClearOf(
    xLabels,
    yMarks.flatMap((v) => {
      const text = yLabel(v);
      return text === null ? [] : [{ v, x: frame.axisY - Y_LABEL_GAP, y: Y(v) + 4, text }];
    }),
    opts.fontSize,
  );
  return {
    ...g0,
    axisX,
    xTicks,
    yTicks,
    xStep,
    yStep,
    yMarks,
    xLabels,
    yLabels,
    origin: x0 <= 0 && x1 >= 0 && y0 <= 0 && y1 >= 0,
  };
}

/**
 * The value under a point of the plot — the other way round from `plotX` / `plotY`: where a finger
 * lands on the grid she draws on (issue #249). Not rounded: the caller snaps.
 */
export function plotValueAt(g: PlotScale, at: { x: number; y: number }): { x: number; y: number } {
  return {
    x: g.x0 + ((at.x - g.left) / (g.pw || 1)) * (g.x1 - g.x0),
    y: g.y0 + (1 - (at.y - g.top) / (g.ph || 1)) * (g.y1 - g.y0),
  };
}

/**
 * The whole frame of a function plot at `width` (components/math/FunctionPlotFigure.tsx): its
 * height — an option's graph is small by design, four of them share a phone (issue #231) — and
 * the coordinate system `plotGeometry` lays out in it, with the screen position of a value. One
 * function for the drawer and for the tap layer that finds the grid point under a finger (issue
 * #248, `tapLayout.ts`), so the two cannot drift by a pixel. `format` writes a tick label as it is
 * drawn.
 */
export function functionPlotGeometry(
  fig: { x_min: number; x_max: number; y_min: number; y_max: number },
  width: number,
  opts: { bare: boolean; format: (n: number) => string; fontSize: number },
) {
  const height = opts.bare
    ? Math.round(Math.max(width * 0.8, 60))
    : Math.round(Math.min(Math.max(width * 0.8, 220), 380));
  const g = plotGeometry({
    width,
    height,
    x0: fig.x_min,
    x1: fig.x_max,
    y0: fig.y_min,
    y1: fig.y_max,
    fontSize: opts.fontSize,
    label: opts.format,
  });
  return { ...g, height, X: (v: number) => plotX(g, v), Y: (v: number) => plotY(g, v) };
}
