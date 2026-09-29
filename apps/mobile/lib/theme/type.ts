// Typography: one clean sans for everything; the one headline per screen is
// large and bold (the "Pastell Soft" look: friendly, not childish).
//
// Built from the palettes alone and refilled in place by applyPalette
// (lib/theme/colors.ts), like SHADOW: importing LB here froze the start
// palette's ink into every style at module load — pastel-dark text stayed on
// the night background and was unreadable (issue #84). The nested style
// objects keep their identity across a theme change, so `TYPE.body` read at
// render time is always the active palette.
import type { TextStyle } from 'react-native';

import { DEFAULT_THEME, paletteOf, type Palette } from './palettes.js';

function typeOf(p: Palette) {
  return {
    display: {
      fontSize: 30,
      lineHeight: 36,
      fontWeight: '700',
      color: p.ink,
      letterSpacing: -0.6,
    },
    /** A screen's headline where the full display size would crowd it (detail screens). */
    displaySm: {
      fontSize: 28,
      lineHeight: 34,
      fontWeight: '700',
      color: p.ink,
      letterSpacing: -0.5,
    },
    title: { fontSize: 19, lineHeight: 25, fontWeight: '600', color: p.ink, letterSpacing: -0.2 },
    /** The one thing being asked right now (a question, a word to speak). */
    prompt: { fontSize: 21, lineHeight: 28, fontWeight: '600', color: p.ink, letterSpacing: -0.2 },
    body: { fontSize: 16, lineHeight: 23, color: p.ink },
    small: { fontSize: 15, lineHeight: 21, color: p.ink2 },
    caption: { fontSize: 14, lineHeight: 19, color: p.ink2 },
    label: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: p.ink2, letterSpacing: 0.2 },
  } satisfies Record<string, TextStyle>;
}

/** Read at render time like LB; the style objects are refilled when the palette changes. */
export const TYPE = typeOf(paletteOf(DEFAULT_THEME));

/** Called by applyPalette only; patches each style in place so held references stay live. */
export function applyType(p: Palette): void {
  const next = typeOf(p);
  for (const key of Object.keys(next) as (keyof typeof TYPE)[]) {
    Object.assign(TYPE[key], next[key]);
  }
}
