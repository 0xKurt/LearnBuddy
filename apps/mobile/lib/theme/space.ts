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
