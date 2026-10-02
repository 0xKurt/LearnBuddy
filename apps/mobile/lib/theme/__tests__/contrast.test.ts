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
  // A waiting <Btn>'s muted skin (issue #97): the label must stay readable on the muted
  // fill. (The stepped-back ghost/danger label is `placeholder` on paper/bg — above.)
  ['ink2', 'canvas'],
];
const SHAPES: Array<[keyof Palette, keyof Palette]> = [
  ['primary', 'paper'],
  ['primary', 'bg'],
  // The ready button against the waiting skin (issue #97): two states no one can mix up
  // on a screenshot, in every palette including night.
  ['primary', 'canvas'],
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

// A program on screen (issue #262): every word colour is text on the block's own ground.
for (const [name, palette] of Object.entries(PALETTES)) {
  describe(`palette ${name}: code`, () => {
    const { bg, ...inks } = palette.code;
    for (const [kind, ink] of Object.entries(inks)) {
      it(`reads: ${kind} on the code ground`, () => {
        expect(contrast(ink, bg)).toBeGreaterThanOrEqual(4.5);
      });
    }
    it('sets the block off from the card it stands in', () => {
      expect(bg).not.toBe(palette.lavender);
    });
  });
}
