// Margins of a function plot (components/math/FigureView.tsx). Pure, so the placement can be
// tested without drawing. Y-axis labels sit left of the y-axis (anchored at their right end);
// when that axis runs along the left edge (x_min ≥ 0: distance-time, growth, proportional
// functions) the left margin must be as wide as the widest label, or every value is drawn
// outside the SVG and clipped (audit H-36 p2-function-plot-y-labels-offscreen).

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
  const pw = width - left - RIGHT;
  const ph = height - TOP - BOTTOM;
  return { left, right: RIGHT, top: TOP, bottom: BOTTOM, pw, ph, axisY: left + f * pw };
}

/** The multiples of `step` in [lo, hi], at most 60. */
export function ticksFor(lo: number, hi: number, step: number): number[] {
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
