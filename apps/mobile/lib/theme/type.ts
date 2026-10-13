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
  const input = { ...fontFace('400'), fontSize: 16, lineHeight: 23, color: p.ink };
  return {
    display,
    pageHeadline: { ...display, fontSize: 30, lineHeight: 36, letterSpacing: -0.8 },
    question,
    title,
    body,
    /** Live and pending recognized words keep body geometry and the current face. */
    voiceTranscript: { ...body, fontStyle: 'italic', color: p.ink2 },
    meta,
    reviewTitle: { ...fontFace('700'), fontSize: 16, lineHeight: 22, color: p.ink },
    reviewDetail: { ...fontFace('400'), fontSize: 15, lineHeight: 22, color: p.ink2 },
    profileExplanation: { ...fontFace('400'), fontSize: 13, lineHeight: 19, color: p.ink2 },
    label,
    /** A Kopfrechnen task and its slot: `800 52px/1`, −1 (design ui_kits/app/Flows.jsx:83). */
    questionBig: {
      ...fontFace('800'),
      fontSize: 52,
      lineHeight: 52,
      letterSpacing: -1,
      color: p.ink,
    },
    questionMedium: { ...fontFace('800'), fontSize: 44, lineHeight: 53, color: p.ink },
    questionLong: { ...fontFace('800'), fontSize: 34, lineHeight: 41, color: p.ink },
    questionFeedback: {
      ...fontFace('400'),
      fontSize: 15,
      lineHeight: 21,
      letterSpacing: 0,
      color: p.ink2,
    },
    questionCompact: { ...fontFace('500'), fontSize: 18, lineHeight: 25, color: p.ink },
    option: { ...fontFace('600'), fontSize: 16, lineHeight: 22, color: p.ink },
    optionBadge: { ...fontFace('700'), fontSize: 14, lineHeight: 14, color: p.ink },
    /** A side of a pair, a table's first column (components/practice/Tasks.jsx Pairs, FillTable). */
    boardCompact: { ...fontFace('600'), fontSize: 15, lineHeight: 20, color: p.ink },
    /** A table's head, a group's name (Tasks.jsx FillTable, Groups). */
    boardLabel: { ...fontFace('700'), fontSize: 14, lineHeight: 18, color: p.ink2 },
    bodyStrong: { ...body, ...fontFace('600') },
    quote: { ...meta, fontStyle: 'italic', color: p.primaryDk },
    metaMedium: { ...meta, ...fontFace('500') },
    metaSemibold: { ...meta, ...fontFace('600') },
    markPunctuation: { ...body, ...fontFace('800') },
    markLetter: { ...fontFace('500'), fontSize: 28, lineHeight: 34, color: p.ink },
    musicSymbol: { ...fontFace('700'), fontSize: 21, lineHeight: 28, color: p.ink },
    identity: {
      ...fontFace('800'),
      fontSize: 22,
      lineHeight: 28,
      letterSpacing: -0.3,
      color: p.ink,
    },
    voiceChoice: { ...fontFace('600'), fontSize: 15, lineHeight: 20, color: p.ink },
    /** A list row's value at its end and the letter on its tile (components/core/List.jsx). */
    listValue: { ...fontFace('400'), fontSize: 15, lineHeight: 20, color: p.ink2 },
    listTile: { ...fontFace('700'), fontSize: 15, lineHeight: 15, color: p.ink },
    /** The composer's text: one step under body so five lines still fit. */
    input,
    paragraph: input,
    paragraphStrong: { ...input, ...fontFace('700') },
    action: { ...fontFace('700'), fontSize: 16, lineHeight: 23, letterSpacing: -0.1, color: p.ink },
    cell: { ...fontFace('600'), fontSize: 16, lineHeight: 23, color: p.ink },
    brand: { ...fontFace('800'), fontSize: 20, lineHeight: 26, letterSpacing: -0.4, color: p.ink },
    headerMeta: { ...fontFace('600'), fontSize: 13, lineHeight: 18, color: p.ink2 },
    voiceStatus: { ...body, ...fontFace('600') },
    chip: { ...fontFace('600'), fontSize: 14, lineHeight: 14, color: p.ink },
    metaStrong: { ...fontFace('700'), fontSize: 14, lineHeight: 20, color: p.ink2 },
    /** The Composer's own words (components/composer/Composer.jsx): pill and key. */
    composerPill: {
      ...fontFace('700'),
      fontSize: 15,
      lineHeight: 15,
      letterSpacing: -0.1,
      color: p.ink,
    },
    composerKey: { ...fontFace('600'), fontSize: 17, lineHeight: 17, color: p.primaryDk },

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
