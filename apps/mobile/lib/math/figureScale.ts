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
 * fits, and otherwise exactly the share of the room it has — derived, never stored.
 */
export function figureScale(fullHeight: number, maxHeight: number | undefined): number {
  return fullHeight > 0 && maxHeight && fullHeight > maxHeight + SLACK
    ? Math.max(MIN_FIGURE_SCALE, maxHeight / fullHeight)
    : 1;
}

/** The padding on each side of a bare figure (an answer option's picture: the option card is its frame). */
export const BARE_FIGURE_PAD = SPACE.xs;
/** Both sides of it, taken off the width like FIGURE_CHROME. */
export const BARE_FIGURE_CHROME = 2 * BARE_FIGURE_PAD;

/** The width the drawing itself is given inside the card. */
export function figureBodyWidth(width: number, scale: number, chrome = FIGURE_CHROME): number {
  return Math.floor((width - chrome) * scale);
}
