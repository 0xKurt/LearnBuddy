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
} as const;

/**
 * The corner of a box with `inset` of padding around boxes with `inner` corners: concentric, so
 * the gap between the two edges is even all the way round (a table's frame around its cells).
 */
export function around(inner: number, inset: number): number {
  return inner + inset;
}
