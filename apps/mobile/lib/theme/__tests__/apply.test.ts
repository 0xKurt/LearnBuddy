// The provider mirrors the applied palette instead of keeping its own copy (issue #29).
// It mounts with the app, but `restoreTheme()` reads the device only afterwards, from the
// root screen's effect — so a palette applied after that mount must still reach the tree.
// `useSyncExternalStore(onPaletteApplied, activeTheme)` is what carries it; this proves the
// store half of that contract.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { activePalette, activeTheme, applyPalette, onPaletteApplied } from '../colors.js';
import { DEFAULT_THEME, paletteOf } from '../palettes.js';

afterEach(() => applyPalette(DEFAULT_THEME));

describe('the applied palette is the one truth', () => {
  it('tells its watchers about a change, and forgets them when they leave', () => {
    const heard = vi.fn();
    const stop = onPaletteApplied(heard);

    applyPalette('night');
    expect(heard).toHaveBeenCalledTimes(1);
    expect(activeTheme()).toBe('night');
    expect(activePalette()).toEqual(paletteOf('night'));

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
