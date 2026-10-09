// How a figure is fitted into the room it is given (components/math/FigureView.tsx).
// Pure, because getting it wrong is expensive: the room a question card grants comes
// out of a measuring loop (card ↔ conversation), and a figure that answers a smaller
// room by measuring itself again feeds that loop — in voice mode the drawing stood at
// full size while the card had long been granted 39 px less (issue #96).
//
// The rule that ends the loop: the natural height is measured ONCE per width, and the
// scale is DERIVED from whatever room there is at that moment. Nothing the scale
// produces is measured again, so more room gives the figure its full size back
// without a second measurement, and less room shrinks it without one either.

// Imported by path: the mobile bundle takes only this dependency-free module of shared-math.
import { CHART_WIDTH, isChart } from '../../../../packages/shared-math/src/charts.js';
import { SPACE } from '../theme/space.js';

/** Never smaller than this: below it the drawing stops being readable. */
export const MIN_FIGURE_SCALE = 0.4;
/** The card's padding and border, taken off the width before the drawing gets it. */
export const FIGURE_CHROME = 26;
/** A drawing this much over the room is left alone (a rounding pixel is not an overflow). */
const SLACK = 2;

/**
 * The width to measure at, or null when the layout says nothing new. A jitter of a
 * single pixel must not count: it would throw the measured height away and start the
 * loop again.
 */
export function newFigureWidth(current: number, measured: number): number | null {
  const w = Math.floor(measured);
  return w > 0 && Math.abs(w - current) > 1 ? w : null;
}

/**
 * The natural height to keep from a layout, or null. Only the first layout after a
 * width change counts: it is the one rendered at scale 1, and every later one is a
 * height the scale itself produced.
 */
export function naturalFigureHeight(fullHeight: number, measured: number): number | null {
  const h = Math.round(measured);
  return fullHeight === 0 && h > 0 ? h : null;
}

/**
 * How much the drawing is shrunk: 1 until the natural height is known, 1 while it
 * fits, and otherwise exactly the share of the room it has — derived, never stored —
 * but never below `least` (`leastFigureScale`).
 */
export function figureScale(
  fullHeight: number,
  maxHeight: number | undefined,
  least = MIN_FIGURE_SCALE,
): number {
  return fullHeight > 0 && maxHeight && fullHeight > maxHeight + SLACK
    ? Math.max(least, maxHeight / fullHeight)
    : 1;
}

/**
 * The least a drawing `width` wide (its frame included) may be shrunk to. A chart read off its
 * axes keeps `CHART_WIDTH`: every label rule the API checks a chart against is measured at that
 * width (packages/shared-math/src/charts.ts). Below it the labels run into each other — the
 * climate chart, answered, stood at 0.4, its month initials on top of each other ("JMMJASOND",
 * issue #501) — and narrower did not even make it shorter: its height has a floor of its own. A
 * pie is read from its legend, not off an axis: it shrinks like any drawing. The half pixel lets
 * `figureBodyWidth`'s rounding down land on the width, not one below it. Any other drawing:
 * `MIN_FIGURE_SCALE`.
 */
export function leastFigureScale(
  figure: { type: string },
  width: number,
  chrome = FIGURE_CHROME,
): number {
  const room = width - chrome;
  if (!isChart(figure) || figure.type === 'pie_chart' || room <= 0) return MIN_FIGURE_SCALE;
  return Math.min(1, Math.max(MIN_FIGURE_SCALE, (CHART_WIDTH + 0.5) / room));
}

/** The padding on each side of a bare figure (an answer option's picture: the option card is its frame). */
export const BARE_FIGURE_PAD = SPACE.xs;
/** Both sides of it, taken off the width like FIGURE_CHROME. */
export const BARE_FIGURE_CHROME = 2 * BARE_FIGURE_PAD;

/** The width the drawing itself is given inside the card. */
export function figureBodyWidth(width: number, scale: number, chrome = FIGURE_CHROME): number {
  return Math.floor((width - chrome) * scale);
}
