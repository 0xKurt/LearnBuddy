// One spacing scale for the whole app (issue #64). Before this every screen picked its own
// numbers, so the same gap was 8 here and 14 there and the app looked padded in places where
// the content was what mattered.
//
// Steps, not free numbers: xs 4 · sm 8 · md 12 · lg 16 · xl 24. Anything that is not one of
// these needs a reason in a comment (an optical correction, a touch target).
export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

/** The smallest a tappable thing may be (design brief); never trimmed to save space. */
export const TOUCH = 44;

/**
 * The bottom padding of a bar or a page that ends at the screen's edge (issue #142).
 *
 * The safe-area inset is what the SYSTEM takes from the edge — a gesture bar, a
 * navigation bar, a home indicator. The gap is what the DESIGN needs on top of it. The
 * app used to write `Math.max(insets.bottom, 16)` in ten places, which gives a phone
 * with a 48 pt navigation bar its 48 and then no gap at all: the bar sits ON the system
 * bar, and the composer's shadow runs into the screen edge. On the web, with no inset,
 * the same line looked perfectly fine — which is why it survived until someone held a
 * real phone ("das input field minimal nach unten abgeschnitten", owner 30.09.).
 *
 * So: past the system first, then room to breathe.
 */
export function bottomRoom(safeBottom: number, gap: number = SPACE.lg): number {
  return safeBottom + gap;
}
