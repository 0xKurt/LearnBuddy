// A pie's slice named after a colour is drawn in that colour (#724): on the phone a fraction
// circle's legend said "Blau" over a violet slice, and its question asked for "den blau gefärbten
// Anteil". Every colour word a pie can carry, in every language the app speaks, is checked against
// the colour actually drawn in every look, light and dark.

import { describe, expect, it } from 'vitest';

import { ITTEN_HUES } from '../../../../../packages/shared-math/src/itten.js';
import { resources, SUPPORTED_LOCALES } from '../../i18n/resources.js';
import { figureOf, paletteOf, THEME_NAMES } from '../../theme/palettes.js';
import { colorNames, namedColor, sliceColors, type NamedColor } from '../pieColors.js';

/** Hue in degrees, lightness and saturation 0–1 (HSL) of a `#rrggbb` colour. */
function hsl(hex: string): { h: number; l: number; s: number } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return { h: (h * 60 + 360) % 360, l, s };
}

/** Where a colour of that name may stand on the hue circle (from, to; across 0 when from > to). */
const BANDS: Record<(typeof ITTEN_HUES)[number], [number, number]> = {
  yellow: [44, 64],
  yellow_orange: [30, 44],
  orange: [18, 32],
  red_orange: [5, 20],
  red: [340, 5],
  red_violet: [305, 340],
  violet: [262, 305],
  blue_violet: [228, 262],
  blue: [195, 228],
  blue_green: [160, 195],
  green: [100, 160],
  yellow_green: [64, 100],
};

function looksLike(color: NamedColor, hex: string): boolean {
  const { h, l, s } = hsl(hex);
  if (color === 'white') return l > 0.95;
  if (color === 'black') return l < 0.2;
  if (color === 'grey') return s < 0.12 && l > 0.35 && l < 0.75;
  const [from, to] = BANDS[color];
  return s > 0.3 && (from <= to ? h >= from && h <= to : h >= from || h <= to);
}

describe('a slice named after a colour (#724)', () => {
  it('knows every colour word the app writes, in every language', () => {
    const names = colorNames();
    for (const lang of SUPPORTED_LOCALES) {
      const figure: Record<string, string> = resources[lang].math.figure;
      for (const h of ITTEN_HUES) expect(namedColor(figure[`hue_${h}`] ?? '')).toBe(h);
      for (const c of ['white', 'grey', 'black'] as const)
        expect(namedColor(figure[`color_${c}`] ?? '')).toBe(c);
    }
    // No word stands for two colours across the languages.
    expect(names.size).toBeGreaterThanOrEqual(15 * 3);
  });

  it('is drawn in the colour it names, in every look, light and dark', () => {
    const wrong: string[] = [];
    for (const theme of THEME_NAMES) {
      const ink = figureOf(paletteOf(theme));
      for (const [word, color] of colorNames()) {
        const [drawn] = sliceColors([word], ink);
        if (!drawn || !looksLike(color, drawn)) wrong.push(`${theme}: ${word} → ${drawn}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('reads the label as written, case, spaces, hyphens and ß aside', () => {
    expect(namedColor('blau')).toBe('blue');
    expect(namedColor(' WEISS ')).toBe('white');
    expect(namedColor('Blau-Grün')).toBe('blue_green');
    expect(namedColor('Blau gefärbt')).toBeNull();
    expect(namedColor('Äpfel')).toBeNull();
  });

  it('keeps the palette for every other label, without giving a slot twice', () => {
    const ink = figureOf(paletteOf('pastell'));
    expect(sliceColors(['Äpfel', 'Birnen'], ink)).toEqual([ink.slices[0], ink.slices[1]]);
    expect(sliceColors(['Blau', 'Äpfel', 'Weiß', 'Birnen'], ink)).toEqual([
      ink.hues[ITTEN_HUES.indexOf('blue')],
      ink.slices[0],
      ink.plain.white,
      ink.slices[1],
    ]);
  });
});
