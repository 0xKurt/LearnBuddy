// The provider mirrors the applied palette instead of keeping its own copy (issue #29).
// It mounts with the app, but `restoreTheme()` reads the device only afterwards, from the
// root screen's effect — so a palette applied after that mount must still reach the tree.
// `useSyncExternalStore(onPaletteApplied, activeTheme)` is what carries it; this proves the
// store half of that contract.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { activePalette, activeTheme, applyPalette, onPaletteApplied } from '../colors.js';
import {
  DEFAULT_FAMILY,
  DEFAULT_THEME,
  FAMILIES,
  familyModeOf,
  PALETTES,
  paletteOf,
  themeNameOf,
} from '../palettes.js';

afterEach(() => applyPalette(DEFAULT_THEME));

describe('the applied palette is the one truth', () => {
  it('tells its watchers about a change, and forgets them when they leave', () => {
    const heard = vi.fn();
    const stop = onPaletteApplied(heard);

    applyPalette('pastellDark');
    expect(heard).toHaveBeenCalledTimes(1);
    expect(activeTheme()).toBe('pastellDark');
    expect(activePalette()).toEqual(paletteOf('pastellDark'));

    applyPalette('forest');
    expect(heard).toHaveBeenCalledTimes(2);

    stop();
    applyPalette('ocean');
    expect(heard).toHaveBeenCalledTimes(2);
    expect(activeTheme()).toBe('ocean');
  });

  it('answers with what was applied last, whenever it is asked', () => {
    // A restore that lands after the provider mounted: the next read must show it.
    applyPalette('sunset');
    expect(activeTheme()).toBe('sunset');
    expect(activePalette().primary).toBe(paletteOf('sunset').primary);
  });
});

// What a device actually holds, and what the app may believe about it (issue #172).
//
// Before #140 the stored value was a PALETTE name ("pastellSoft", "night"). After it, a
// family ("pastell") plus a mode. A device that had chosen a colour before and a mode after
// holds one of each — and the family slot then contains a name that is not a family. Read
// with `as Family`, that name travelled on: `themeNameOf('pastellSoft', true)` is
// 'pastellSoftDark', which is in no palette, `paletteOf` fell back to the light default, and
// the owner's dark mode did nothing at all while every preview showed the wrong palette.
describe('what is read back off the device', () => {
  it('translates a palette name from before the two axes', () => {
    expect(familyModeOf('pastellSoft')).toEqual({ family: 'pastell', mode: 'light' });
    expect(familyModeOf('night')).toEqual({ family: 'pastell', mode: 'dark' });
  });

  it('keeps a family that is still a family', () => {
    for (const f of FAMILIES) expect(familyModeOf(f).family).toBe(f);
  });

  it('falls back rather than carrying an unknown value on', () => {
    expect(familyModeOf('etwas-anderes').family).toBe(DEFAULT_FAMILY);
    expect(familyModeOf(null).family).toBe(DEFAULT_FAMILY);
  });

  it('never names a palette that does not exist', () => {
    // The actual failure: a name no palette has, resolved to the default without a word.
    for (const stored of ['pastellSoft', 'night', 'forest', 'etwas-anderes', null]) {
      const { family } = familyModeOf(stored);
      for (const dark of [false, true]) {
        expect(PALETTES[themeNameOf(family, dark)]).toBeDefined();
      }
    }
  });
});
