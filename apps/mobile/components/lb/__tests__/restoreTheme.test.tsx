// The palette restored at start follows a dark phone while nothing was chosen (#387): the restore
// lands after the provider applied its first palette, so a light guess here stayed — the setup at
// night stood light from its first screen on.

import { act, renderHook } from '@testing-library/react';
import { Appearance } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_FAMILY, paletteOf, themeNameOf } from '../../../lib/theme/palettes.js';
import { restoreTheme, useAppliedPalette } from '../../../lib/theme/ThemeProvider.js';

async function restoredOn(scheme: 'light' | 'dark') {
  vi.spyOn(Appearance, 'getColorScheme').mockReturnValue(scheme);
  const { result } = renderHook(() => useAppliedPalette());
  await act(() => restoreTheme());
  return result.current;
}

afterEach(async () => {
  // Back to the light start for the files after this one.
  await restoredOn('light');
  vi.restoreAllMocks();
});

describe('the palette restored at start, with nothing chosen on this device', () => {
  it('is dark on a dark phone', async () => {
    expect(await restoredOn('dark')).toEqual(paletteOf(themeNameOf(DEFAULT_FAMILY, true)));
  });

  it('is light on a light phone', async () => {
    await restoredOn('dark');
    expect(await restoredOn('light')).toEqual(paletteOf(themeNameOf(DEFAULT_FAMILY, false)));
  });
});
