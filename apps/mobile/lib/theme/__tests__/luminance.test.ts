import { describe, expect, it } from 'vitest';

import { PALETTES, THEME_NAMES } from '../palettes.js';
import { barStyleFor, isDarkBackground, relativeLuminance } from '../luminance.js';

describe('relativeLuminance', () => {
  it('spans black to white', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBe(1);
  });

  it('reads short hex like long hex', () => {
    expect(relativeLuminance('#fff')).toBe(relativeLuminance('#ffffff'));
    expect(relativeLuminance('#19f')).toBeCloseTo(relativeLuminance('#1199ff'), 10);
  });

  it('treats an unreadable value as light, so the bars keep dark icons', () => {
    expect(barStyleFor('not a colour')).toBe('dark');
    expect(barStyleFor('rgba(0,0,0,0.5)')).toBe('dark');
  });
});

describe('barStyleFor', () => {
  it('puts light icons on a dark bar and dark icons on a light one', () => {
    expect(barStyleFor('#191627')).toBe('light');
    expect(barStyleFor('#faf7fd')).toBe('dark');
  });

  it('decides for every shipped palette', () => {
    for (const name of THEME_NAMES) {
      const bg = PALETTES[name].bg;
      expect(barStyleFor(bg)).toBe(isDarkBackground(bg) ? 'light' : 'dark');
    }
  });

  it('agrees with the palette that was built dark', () => {
    // The one dark palette must not end up with dark icons on a dark bar (issue #84).
    const dark = THEME_NAMES.filter((name) => isDarkBackground(PALETTES[name].bg));
    expect(dark.length).toBeGreaterThan(0);
    for (const name of dark) expect(barStyleFor(PALETTES[name].bg)).toBe('light');
  });
});
