// Every palette must carry meaning readably (issue #29): a theme is only a theme when the
// pairs that matter keep their contrast. WCAG 2.1 relative luminance, computed here so a
// new palette cannot be shipped on looks alone.

import { describe, expect, it } from 'vitest';

import { PALETTES, type Palette } from '../palettes.js';

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a solid colour: ${hex}`);
  const n = parseInt(m[1]!, 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

export function contrast(a: string, b: string): number {
  const values = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return ((values[0] ?? 0) + 0.05) / ((values[1] ?? 0) + 0.05);
}

/** Text pairs (4.5:1) and shapes that carry meaning (3:1) every palette must hold. */
const TEXT: Array<[keyof Palette, keyof Palette]> = [
  ['ink', 'paper'],
  ['ink', 'bg'],
  ['ink', 'canvas'],
  ['ink2', 'paper'],
  ['ink2', 'bg'],
  ['placeholder', 'paper'],
  ['placeholder', 'bg'],
  ['successText', 'mint'],
  ['warningText', 'butter'],
  ['ink', 'lavender'],
  ['ink', 'primaryLt'],
  ['paper', 'primary'],
  ['onPrimary', 'primary'],
  // A quiet label on the sunken surface: the grey chip (lib/theme/components.ts chipSkin).
  ['ink2', 'canvas'],
  // The hint over a picture in the full-screen viewer (components/lb/ZoomViewer.tsx).
  ['onViewerVeil', 'viewerVeil'],
];
const SHAPES: Array<[keyof Palette, keyof Palette]> = [
  ['primary', 'paper'],
  ['primary', 'bg'],
  // The main action beside a quiet or soft <Btn>, whose fill is canvas (components/lb/Btn.tsx
  // variantStyle): two fills no one can mix up, in every palette including night.
  ['primary', 'canvas'],
  // The "Dunkelmodus" switch (issue #517): its off track on the card and on the onboarding's
  // page, and the light knob on that track. On, the track is primary (above); the knob's
  // place says the state, the track's colour only repeats it.
  ['ink3', 'paper'],
  ['ink3', 'bg'],
  ['knob', 'ink3'],
];

for (const [name, palette] of Object.entries(PALETTES)) {
  describe(`palette ${name}`, () => {
    for (const [fg, bg] of TEXT) {
      it(`reads: ${fg} on ${bg}`, () => {
        const ratio = contrast(palette[fg] as string, palette[bg] as string);
        expect({ pair: `${fg}/${bg}`, ok: ratio >= 4.5, ratio: Number(ratio.toFixed(2)) }).toEqual({
          pair: `${fg}/${bg}`,
          ok: true,
          ratio: Number(ratio.toFixed(2)),
        });
      });
    }
    for (const [fg, bg] of SHAPES) {
      it(`stands out: ${fg} on ${bg}`, () => {
        const ratio = contrast(palette[fg] as string, palette[bg] as string);
        expect({ pair: `${fg}/${bg}`, ok: ratio >= 3, ratio: Number(ratio.toFixed(2)) }).toEqual({
          pair: `${fg}/${bg}`,
          ok: true,
          ratio: Number(ratio.toFixed(2)),
        });
      });
    }
  });
}

// The acceptance line of #599, written out per look: what stands on the one main action reads
// at 4.5:1 or better. The values are tokens/colors.css `--on-primary` / `--primary`.
describe('onPrimary on primary', () => {
  const LOOKS: Array<[keyof typeof PALETTES, string, string]> = [
    ['pastell', '#ffffff', '#6a48d7'],
    ['pastellDark', '#191627', '#9d82f5'],
    ['forest', '#ffffff', '#2f7d5b'],
    ['forestDark', '#121e18', '#5fae86'],
    ['ocean', '#ffffff', '#2a6ab0'],
    ['oceanDark', '#121a26', '#5a9fe0'],
    ['sunset', '#ffffff', '#b45a1f'],
    ['sunsetDark', '#241a14', '#e0925a'],
  ];

  it('covers every look there is', () => {
    expect(LOOKS.map(([name]) => name).sort()).toEqual(Object.keys(PALETTES).sort());
  });

  it.each(LOOKS)('%s: %s on %s is at least 4.5:1', (name, onPrimary, primary) => {
    expect(PALETTES[name].onPrimary).toBe(onPrimary);
    expect(PALETTES[name].primary).toBe(primary);
    expect(contrast(onPrimary, primary)).toBeGreaterThanOrEqual(4.5);
  });
});

it('keeps the image viewer dark in all eight palettes', () => {
  for (const palette of Object.values(PALETTES)) {
    expect(palette.viewerVeil).toBe('#15121f');
    expect(palette.onViewerVeil).toBe('#bdb7d3');
  }
});

it('keeps the modal scrim dark in all eight palettes', () => {
  for (const palette of Object.values(PALETTES)) expect(palette.scrim).toBe('#1f1b2e');
});
