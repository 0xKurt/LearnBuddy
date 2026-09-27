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
