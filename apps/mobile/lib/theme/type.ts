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

/**
 * The OS was asked for heavier type (issue #133 position 13). Someone who turns Bold Text
 * on is saying thin type is hard to read; the app's hierarchy is carried by weight, so
 * every style moves up one step and the scale stays intact. Kept in the module, like the
 * palette, so a theme change does not quietly undo it.
 */
let bold = false;

const HEAVIER: Record<string, TextStyle['fontWeight']> = {
  '300': '500',
  '400': '600',
  '500': '700',
  '600': '800',
  '700': '800',
};

/** Styles without a weight are 400 by default: they get one too. */
function weightOf(weight: TextStyle['fontWeight']): TextStyle['fontWeight'] {
  if (!bold) return weight;
  return HEAVIER[String(weight ?? '400')] ?? weight;
}

function typeOf(p: Palette) {
  return {
    display: {
      fontSize: 30,
      lineHeight: 36,
      fontWeight: weightOf('700'),
      color: p.ink,
      letterSpacing: -0.6,
    },
    /** A screen's headline where the full display size would crowd it (detail screens). */
    displaySm: {
      fontSize: 28,
      lineHeight: 34,
      fontWeight: weightOf('700'),
      color: p.ink,
      letterSpacing: -0.5,
    },
    title: {
      fontSize: 19,
      lineHeight: 25,
      fontWeight: weightOf('600'),
      color: p.ink,
      letterSpacing: -0.2,
    },
    /** The one thing being asked right now (a question, a word to speak). */
    prompt: {
      fontSize: 21,
      lineHeight: 28,
      fontWeight: weightOf('600'),
      color: p.ink,
      letterSpacing: -0.2,
    },
    body: { fontSize: 16, lineHeight: 23, fontWeight: weightOf(undefined), color: p.ink },
    small: { fontSize: 15, lineHeight: 21, fontWeight: weightOf(undefined), color: p.ink2 },
    caption: { fontSize: 14, lineHeight: 19, fontWeight: weightOf(undefined), color: p.ink2 },
    label: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: weightOf('600'),
      color: p.ink2,
      letterSpacing: 0.2,
    },
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

/**
 * The OS's Bold Text setting, applied to the whole scale at once (issue #133 position 13).
 * The style objects are refilled in place, exactly like a palette change, so every screen
 * that reads `TYPE.body` at render time follows without a single component knowing.
 */
export function applyBoldText(on: boolean, palette: Palette): void {
  if (bold === on) return;
  bold = on;
  applyType(palette);
}
