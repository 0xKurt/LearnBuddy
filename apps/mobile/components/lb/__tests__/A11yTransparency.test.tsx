import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useA11ySettings } from '../../../lib/a11ySettings.js';

function mediaPreference(matches: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches,
    addEventListener: vi.fn((_event: string, callback: () => void) => listeners.add(callback)),
    removeEventListener: vi.fn((_event: string, callback: () => void) =>
      listeners.delete(callback),
    ),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => media),
  );
  return {
    media,
    change(on: boolean) {
      media.matches = on;
      listeners.forEach((callback) => callback());
    },
  };
}
afterEach(() => vi.unstubAllGlobals());

it('reads the web reduced-transparency preference on mount', () => {
  mediaPreference(true);
  const { result } = renderHook(useA11ySettings);
  expect(result.current.reduceTransparency).toBe(true);
});

it('follows both live media directions and removes its listener on unmount', () => {
  const preference = mediaPreference(false);
  const { result, unmount } = renderHook(useA11ySettings);
  act(() => preference.change(true));
  expect(result.current.reduceTransparency).toBe(true);
  act(() => preference.change(false));
  expect(result.current.reduceTransparency).toBe(false);
  unmount();
  expect(preference.media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
});

it('keeps the false fallback when web matchMedia is unavailable', () => {
  vi.stubGlobal('matchMedia', undefined);
  const { result } = renderHook(useA11ySettings);
  expect(result.current.reduceTransparency).toBe(false);
});
