// Drop-in for apps/mobile/lib/theme/type.ts (design system 2026-10).
// New: Figtree, 6 steps. Every old key stays as an alias, so no screen breaks on day one;
// rename call sites at leisure (see MIGRATION.md §2), then delete the aliases.
import type { TextStyle } from 'react-native';

import { FIGTREE } from './fontNames.js';
import { MONOSPACE } from './monospace.js';
import { DEFAULT_THEME, paletteOf, type Palette } from './palettes.js';

let bold = false;
const HEAVIER: Record<string, TextStyle['fontWeight']> = {
  '400': '600',
  '500': '700',
  '600': '800',
  '700': '800',
  '800': '800',
};

export function fontFace(weight: TextStyle['fontWeight'] = '400'): TextStyle {
  const w = bold ? (HEAVIER[String(weight)] ?? weight) : weight;
  return { fontFamily: FIGTREE[String(w)] ?? FIGTREE['400'], fontWeight: w };
}

function typeOf(p: Palette) {
  const display = {
    ...fontFace('800'),
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.9,
    color: p.ink,
  };
  const question = {
    ...fontFace('600'),
    fontSize: 22,
    lineHeight: 29,
    letterSpacing: -0.3,
    color: p.ink,
  };
  const title = {
    ...fontFace('700'),
    fontSize: 17,
    lineHeight: 23,
    letterSpacing: -0.2,
    color: p.ink,
  };
  const body = { ...fontFace('400'), fontSize: 17, lineHeight: 25, color: p.ink };
  const meta = { ...fontFace('400'), fontSize: 14, lineHeight: 20, color: p.ink2 };
  const label = { ...fontFace('700'), fontSize: 13, lineHeight: 18, color: p.ink2 };
  return {
    display,
    question,
    title,
    body,
    meta,
    label,
    /** The composer's text: one step under body so five lines still fit. */
    input: { ...fontFace('400'), fontSize: 16, lineHeight: 23, color: p.ink },
    action: { ...fontFace('700'), fontSize: 16, lineHeight: 23, letterSpacing: -0.1, color: p.ink },
    cell: { ...fontFace('600'), fontSize: 16, lineHeight: 23, color: p.ink },
    brand: { ...fontFace('800'), fontSize: 20, lineHeight: 26, letterSpacing: -0.4, color: p.ink },
    headerMeta: { ...fontFace('600'), fontSize: 13, lineHeight: 18, color: p.ink2 },
    voiceStatus: { ...body, ...fontFace('600') },
    metaStrong: { ...fontFace('700'), fontSize: 14, lineHeight: 20, color: p.ink2 },
    code: {
      fontFamily: MONOSPACE,
      fontWeight: bold ? '600' : '400',
      fontSize: 14,
      lineHeight: 20,
      color: p.ink,
    },
    // ── aliases (old keys → new step) ──
    displaySm: { ...display },
    header: { ...title },
    prompt: { ...question },
    small: { ...meta },
    caption: { ...meta },
  } satisfies Record<string, TextStyle>;
}

export const TYPE = typeOf(paletteOf(DEFAULT_THEME));

export function applyType(p: Palette): void {
  const next = typeOf(p);
  for (const key of Object.keys(next) as (keyof typeof TYPE)[]) Object.assign(TYPE[key], next[key]);
}

export function applyBoldText(on: boolean, palette: Palette): void {
  if (bold === on) return;
  bold = on;
  applyType(palette);
}
