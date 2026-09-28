// LB design tokens — the colours of the palette that is active right now
// (lib/theme/palettes.ts, issue #29).
//
// `LB` stays the one place every screen reads colours from, so nothing had to be rewritten
// when themes arrived: it is a live object whose values are replaced when the palette
// changes (`applyPalette`), and the provider re-renders the app in the same breath
// (lib/theme/ThemeProvider.tsx). The derived maps below (tones, figures, shadows) are
// rebuilt from the same palette, so a screen can never show half of the old theme.
//
// Layer 2 of the issue moves screens to `useTheme()` and drops this mutable object; until
// then this is the bridge — deliberate, not an accident.

import { DEFAULT_THEME, paletteOf, type Palette, type ThemeName } from './palettes.js';
import { applyShadows } from './shadow.js';

const active: { name: ThemeName; palette: Palette } = {
  name: DEFAULT_THEME,
  palette: paletteOf(DEFAULT_THEME),
};

/** The colours in use. Read at render time; never destructured into a module constant. */
export const LB: Record<ColorToken, string> = colorsOf(active.palette);

export const SUBJECT_TONES = [
  'lavender',
  'peach',
  'mint',
  'blush',
  'sky',
  'butter',
  'rose',
] as const;
export type SubjectTone = (typeof SUBJECT_TONES)[number];

export const TONE_BG: Record<SubjectTone, string> = toneBg(active.palette);
export const TONE_DEEP: Record<SubjectTone, string> = toneDeep(active.palette);

// Figures in questions (components/math/FigureView.tsx): calm, printed-schoolbook look.
// Series colors stay distinguishable for common colour-vision deficiencies and are
// never the only signal (each graph also has a label and its own dash pattern).
export const FIGURE: {
  paper: string;
  axis: string;
  grid: string;
  gridStrong: string;
  stroke: string;
  label: string;
  /** Shaded parts of a fraction, bars, filled polygons. */
  fill: string;
  fillSoft: string;
  empty: string;
  point: string;
  series: string[];
} = figureOf(active.palette);

/** The colour tokens of a palette (everything but the derived maps). */
type ColorToken = Exclude<keyof Palette, 'figure' | 'shadowColor' | 'shadowOpacity'>;

function colorsOf(p: Palette): Record<ColorToken, string> {
  const { figure: _figure, shadowColor: _sc, shadowOpacity: _so, ...colors } = p;
  return colors;
}

function toneBg(p: Palette): Record<SubjectTone, string> {
  return {
    lavender: p.lavender,
    peach: p.peach,
    mint: p.mint,
    blush: p.blush,
    sky: p.sky,
    butter: p.butter,
    rose: p.rose,
  };
}

function toneDeep(p: Palette): Record<SubjectTone, string> {
  return {
    lavender: p.lavenderDeep,
    peach: p.peachDeep,
    mint: p.mintDeep,
    blush: p.blushDeep,
    sky: p.skyDeep,
    butter: p.butterDeep,
    rose: p.lavenderDeep, // no rose-deep in the palette; reuse lavender-deep
  };
}

function figureOf(p: Palette): typeof FIGURE {
  return {
    paper: p.paper,
    axis: p.ink2,
    grid: p.figure.grid,
    gridStrong: p.figure.gridStrong,
    stroke: p.ink,
    label: p.ink2,
    fill: p.figure.fill,
    fillSoft: p.figure.fillSoft,
    empty: p.paper,
    point: p.primaryDk,
    series: [...p.figure.series],
  };
}

/** Which palette is showing (the provider's state is the one the learner chose). */
export function activeTheme(): ThemeName {
  return active.name;
}

export function activePalette(): Palette {
  return active.palette;
}

/**
 * Switches the palette in place: every token object above is refilled, so a component
 * that reads `LB.primary` in its next render gets the new colour. Only the provider calls
 * this — it re-renders the tree right after.
 */
export function applyPalette(name: ThemeName): void {
  const palette = paletteOf(name);
  active.name = name;
  active.palette = palette;
  Object.assign(LB, colorsOf(palette));
  Object.assign(TONE_BG, toneBg(palette));
  Object.assign(TONE_DEEP, toneDeep(palette));
  Object.assign(FIGURE, figureOf(palette));
  applyShadows(palette);
}
