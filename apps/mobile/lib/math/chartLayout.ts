// The frame every chart with a y-axis shares (components/math/LineCharts.tsx, StatCharts.tsx): the
// room above the plot for the axes' units, under it for the x labels and an axis title, the
// plot's width beside its axes (`plotWidth`, the same the API measures labels against) and where a
// value of an axis stands (`plotX` / `plotY`, the function plot's own placement). Pure, so it is
// tested without drawing.

// Imported by path, like expression.ts: the mobile bundle takes only this dependency-free module.
import {
  AXIS_ROOM,
  plotWidth,
  TICK_CHAR,
  type Axis,
} from '../../../../packages/shared-math/src/charts.js';
import { clamp } from '../gestures.js';
import { plotX, plotY } from './plotLayout.js';

/** Room above the plot for the units of the axes. */
export const TOP = 22;
/** Room under the plot for the x labels. */
const X_LABELS = 22;
/** Room for an x-axis title under the labels. */
const X_TITLE = 16;

/** Labels along an axis that stand apart: every k-th, where k keeps them from touching. */
export function every(labels: readonly string[], room: number): number {
  const longest = Math.max(1, ...labels.map((l) => l.length));
  return Math.max(1, Math.ceil((longest * TICK_CHAR + 6) / Math.max(1, room)));
}

export type ChartFrame = {
  /** The y-axis' x: the plot starts here. */
  left: number;
  height: number;
  /** Plot area width and height. */
  pw: number;
  ph: number;
  /** Where a value of `axis` stands across the plot, and up it. */
  X: (axis: Axis) => (v: number) => number;
  Y: (axis: Axis) => (v: number) => number;
};

/**
 * A chart `width` wide: as tall as `size` = [share of the width, least, most] allows, a y-axis'
 * labels left of the plot and, with `rightAxis`, a second axis' right of it (else only the last
 * x label's half), the x labels under it and, with `xTitle`, the x-axis' title under those.
 */
export function chartFrame(
  width: number,
  opts: { size: readonly [number, number, number]; rightAxis: boolean; xTitle: boolean },
): ChartFrame {
  const [share, least, most] = opts.size;
  const height = Math.round(clamp(width * share, least, most));
  const pw = plotWidth(width, opts.rightAxis);
  const ph = height - TOP - (X_LABELS + (opts.xTitle ? X_TITLE : 0));
  return {
    left: AXIS_ROOM,
    height,
    pw,
    ph,
    X: (axis) => (v) => plotX({ left: AXIS_ROOM, pw, x0: axis.lo, x1: axis.hi }, v),
    Y: (axis) => (v) => plotY({ top: TOP, ph, y0: axis.lo, y1: axis.hi }, v),
  };
}
