// Drop-in for apps/mobile/lib/theme/space.ts (design system 2026-10).
// One scale: 4 · 8 · 12 · 16 · 24 · 32. RHYTHM and CARD_PAD stay as aliases onto it (MIGRATION.md §4).
import type { ViewStyle } from 'react-native';

export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Side margin of every page, in and outside the app. Was 20 outside, 16 inside. */
export const GUTTER = SPACE.lg;

/** ── aliases (old → scale) ── */
export const CARD_PAD = { snug: SPACE.md, base: SPACE.lg, roomy: SPACE.xl } as const;
export const RHYTHM = { parts: SPACE.sm, stack: SPACE.md, sections: SPACE.xl } as const;

export const TOUCH = 44;
export const CONTROL = { sm: TOUCH, md: 48, lg: 54 } as const;
export const PROGRESS_BAR_MIN = 48;

export function bottomRoom(safeBottom: number, gap: number = SPACE.lg): number {
  return safeBottom + gap;
}

export function pinnedBar(safeBottom: number): ViewStyle {
  return { paddingHorizontal: GUTTER, paddingTop: SPACE.sm, paddingBottom: bottomRoom(safeBottom) };
}
