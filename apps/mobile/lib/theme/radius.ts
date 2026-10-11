// Drop-in for apps/mobile/lib/theme/radius.ts (design system 2026-10): 8 values → 5.
// Old keys stay as aliases; MIGRATION.md §3 lists the renames.

const CORNERS = {
  /** Cell, key, small tile. */
  sm: 12,
  /** Option, tile, frame. */
  md: 16,
  /** Card, note, item. */
  lg: 20,
  /** The composer (half its one-line height). */
  bar: 26,
  /** Button, chip, pill, circle. */
  round: 999,
} as const;

/** Existing component keys stay aliases of the canonical scale. */
export const RADIUS = {
  ...CORNERS,
  cell: CORNERS.sm,
  tile: CORNERS.md,
  frame: CORNERS.md,
  note: CORNERS.lg,
  item: CORNERS.lg,
  card: CORNERS.lg,
} as const;

export function around(inner: number, inset: number): number {
  return inner + inset;
}

export function circle(size: number): number {
  return size / 2;
}
