// Drop-in for apps/mobile/lib/theme/radius.ts (design system 2026-10): 8 values → 5.
// Old keys stay as aliases; MIGRATION.md §3 lists the renames.

export const RADIUS = {
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
  // ── aliases ──
  cell: 12,
  tile: 16,
  frame: 16,
  note: 20,
  item: 20,
  card: 20,
} as const;

export function around(inner: number, inset: number): number {
  return inner + inset;
}

export function circle(size: number): number {
  return size / 2;
}
