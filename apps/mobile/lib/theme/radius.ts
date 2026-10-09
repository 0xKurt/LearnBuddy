// Corner radii (issue #310), the same treatment the spacing scale got in #64: before this every
// answer form picked its own corner — 8, 10, 14, 16 and `SPACE.lg` used as a radius — so the same
// kind of thing was rounder here than there. Steps, not free numbers; a corner that is none of
// these says why in a comment (a round badge is half its size, a pill half its height).

export const RADIUS = {
  /** A cell to type into: a table's gap, a brick of a number wall. */
  cell: 8,
  /** A thing to tap: a button that is not a pill, an option, an order's place. */
  tile: 14,
  /** A frame that holds things: a group's row, a drawing's frame. */
  frame: 16,
  /** A card on the page (`components/lb/Card.tsx`). */
  card: 22,
  /**
   * The input bar's pill (`components/lb/InputBar.tsx`, issue #365): half its one-line height
   * (a touch target and its padding), so it stays a pill on one line and a soft box on five.
   */
  bar: 26,
  /**
   * Fully round ends whatever size the thing grows to: a chip, a badge, a letter's circle that
   * grows with the system text (audit M-84). Where the size is fixed, `circle(size)` says it.
   */
  round: 999,
} as const;

/**
 * The corner of a box with `inset` of padding around boxes with `inner` corners: concentric, so
 * the gap between the two edges is even all the way round (a table's frame around its cells).
 */
export function around(inner: number, inset: number): number {
  return inner + inset;
}

/**
 * The corner that makes a box round at its ends: half its size (issue #311). A square of `size`
 * becomes a circle (a disc, a dot, a round button), a box `size` high a pill. One helper, so a
 * circle never needs a free `/ 2` of its own.
 */
export function circle(size: number): number {
  return size / 2;
}
