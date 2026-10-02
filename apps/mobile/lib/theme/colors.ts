// Which palette is applied right now, and the live token objects that follow it
// (lib/theme/palettes.ts, issue #29).
//
// Screens and components do NOT read from here any more — they take their colours from
// `useTheme()` (lib/theme/ThemeProvider.tsx), and the lint rule in eslint.config.mjs keeps
// it that way (issue #29, layer 3). What is left here is the machinery behind that hook:
// the applied palette, and the objects that must stay live because they are still imported
// as modules (TYPE in type.ts, SHADOW in shadow.ts).
//
// `LB`, `TONE_BG`, `TONE_DEEP` and `FIGURE` are the last pieces of the old bridge. They are
// refilled in place like TYPE and SHADOW, and the guard in __tests__/frozen-colors.test.ts
// proves that contract; dropping the exports is the final step of the issue.

import {
  DEFAULT_THEME,
  figureOf,
  paletteOf,
  toneBgOf,
  toneDeepOf,
  type Figure,
  type Palette,
  type SubjectTone,
  type ThemeName,
} from './palettes.js';
import { applyShadows } from './shadow.js';
import { applyType } from './type.js';

const active: { name: ThemeName; palette: Palette } = {
  name: DEFAULT_THEME,
  palette: paletteOf(DEFAULT_THEME),
};

/** The colours in use. Read at render time; never destructured into a module constant. */
export const LB: Record<ColorToken, string> = colorsOf(active.palette);

export const TONE_BG: Record<SubjectTone, string> = toneBgOf(active.palette);
export const TONE_DEEP: Record<SubjectTone, string> = toneDeepOf(active.palette);
export const FIGURE: Figure = figureOf(active.palette);

/** The colour tokens of a palette (everything but the derived maps). */
type ColorToken = Exclude<
  keyof Palette,
  'figure' | 'code' | 'shadowColor' | 'shadowOpacity' | 'glow' | 'buddyLight'
>;

function colorsOf(p: Palette): Record<ColorToken, string> {
  const {
    figure: _figure,
    code: _code,
    shadowColor: _sc,
    shadowOpacity: _so,
    glow: _glow,
    buddyLight: _bl,
    ...colors
  } = p;
  return colors;
}

/** Which palette is showing. */
export function activeTheme(): ThemeName {
  return active.name;
}

export function activePalette(): Palette {
  return active.palette;
}

const watchers = new Set<() => void>();

/**
 * Called whenever the applied palette changes — the provider follows this instead of
 * keeping its own copy, so a palette restored from the device after the provider mounted
 * (`restoreTheme`, app/_layout.tsx) still reaches the screens.
 */
export function onPaletteApplied(watch: () => void): () => void {
  watchers.add(watch);
  return () => {
    watchers.delete(watch);
  };
}

/**
 * Switches the palette in place: every token object above is refilled, so a component that
 * holds `TYPE.body` sees the new colour on its next render. Then the watchers hear of it and
 * the provider re-renders the tree.
 */
export function applyPalette(name: ThemeName): void {
  const palette = paletteOf(name);
  active.name = name;
  active.palette = palette;
  Object.assign(LB, colorsOf(palette));
  Object.assign(TONE_BG, toneBgOf(palette));
  Object.assign(TONE_DEEP, toneDeepOf(palette));
  Object.assign(FIGURE, figureOf(palette));
  applyShadows(palette);
  applyType(palette);
  for (const watch of watchers) watch();
}
