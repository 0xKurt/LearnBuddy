// The ground the page shows before any of the app has run (issue #194).
//
// `app/+html.tsx` runs this rule as an inline script with no bundle loaded, where it is a
// string that no type checker reads. These cases are the same rule in TypeScript, and
// every one of them is a state a real device can be in.

import { describe, expect, it } from 'vitest';

import { groundFor } from '../ground.js';
import { PALETTES } from '../palettes.js';

describe('the ground before the first paint', () => {
  it('uses her colour and her mode', () => {
    expect(groundFor('ocean', 'dark', false)).toBe(PALETTES.oceanDark.bg);
    expect(groundFor('ocean', 'light', true)).toBe(PALETTES.ocean.bg);
    expect(groundFor('sunset', 'dark', false)).toBe(PALETTES.sunsetDark.bg);
    expect(groundFor('forest', 'light', false)).toBe(PALETTES.forest.bg);
  });

  it('follows the browser when she asked it to', () => {
    // "system" is the default, so this is what most devices do.
    expect(groundFor('ocean', 'system', true)).toBe(PALETTES.oceanDark.bg);
    expect(groundFor('ocean', 'system', false)).toBe(PALETTES.ocean.bg);
    expect(groundFor(null, null, true)).toBe(PALETTES.pastellDark.bg);
    expect(groundFor(null, null, false)).toBe(PALETTES.pastell.bg);
  });

  it('reads a device from before the two axes as what it was showing', () => {
    // Before #140 "night" was a family, not a mode.
    expect(groundFor('night', null, false)).toBe(PALETTES.pastellDark.bg);
  });

  it('falls back instead of breaking on anything it does not know', () => {
    // What is in storage is text, and text can be anything (issue #172).
    for (const junk of ['', 'Nacht', '{}', 'pastellDark', '../../etc']) {
      expect(groundFor(junk, 'light', false)).toBe(PALETTES.pastell.bg);
    }
    expect(groundFor('ocean', 'nonsense', true)).toBe(PALETTES.oceanDark.bg);
  });

  it('never answers with something that is not one of our colours', () => {
    const grounds = new Set(Object.values(PALETTES).map((p) => p.bg));
    for (const family of [null, 'night', 'ocean', 'forest', 'sunset', 'pastell', 'xx'])
      for (const mode of [null, 'light', 'dark', 'system', 'xx'])
        for (const dark of [true, false])
          expect(grounds.has(groundFor(family, mode, dark))).toBe(true);
  });
});
