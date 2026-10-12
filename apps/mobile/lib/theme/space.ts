// The spacing scale of the design system 2026-10 (tokens/space.css, #599):
// 4 · 8 · 12 · 16 · 20 · 24 · 32. Where the supplied drop-in file and the design tokens
// disagree, the tokens win (owner 12.10.): the 20 step, the card padding and the margin before
// the app come from tokens/space.css and guidelines/spacing.html.
import type { ViewStyle } from 'react-native';

/** `--space-*`. `gutter` is the 20 step: the margin before the app and a card's inside. */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, gutter: 20, xl: 24, xxl: 32 } as const;

/** Page margin inside the app (`--space-lg`, "Seitenrand in der App"). */
export const GUTTER_APP = SPACE.lg;
/** Page margin before the app (`--space-gutter`): sign-in, privacy, PIN, onboarding. */
export const GUTTER_OUTER = SPACE.gutter;

/**
 * Alias (owner rule 6): the one margin every page used so far, 16. A page inside the app takes
 * `GUTTER_APP`, a page before the app `GUTTER_OUTER`; this name goes when the last one moved.
 */
export const GUTTER = SPACE.lg;

/**
 * A card's padding. The design has two: `card` (`--card-pad`: Card, QuestionCard, a skeleton's
 * card) and `thread` (`--space-lg`: the cards Buddy puts into the conversation —
 * components/buddy/Cards.jsx, practice/Modes.jsx, practice/PracticeReady.jsx).
 * `snug` and `base` are aliases (owner rule 6) that still serve cards of both kinds, so they keep
 * their values until each caller names its kind; `roomy` only ever held content cards.
 */
export const CARD_PAD = {
  card: SPACE.gutter,
  thread: SPACE.lg,
  // ── aliases ──
  snug: SPACE.md,
  base: SPACE.lg,
  roomy: SPACE.gutter,
} as const;

/** ── aliases (old → scale) ── */
export const RHYTHM = { parts: SPACE.sm, stack: SPACE.md, sections: SPACE.xl } as const;

/** `--touch`, `--control-sm|md|lg`. */
export const TOUCH = 44;
export const CONTROL = { sm: TOUCH, md: 48, lg: 54 } as const;
export const PROGRESS_BAR_MIN = 48;

export function bottomRoom(safeBottom: number, gap: number = SPACE.lg): number {
  return safeBottom + gap;
}

export function pinnedBar(safeBottom: number): ViewStyle {
  return { paddingHorizontal: GUTTER, paddingTop: SPACE.sm, paddingBottom: bottomRoom(safeBottom) };
}
