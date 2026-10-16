// A turn that takes longer than usual says so (#686): the hint comes after the delay of one
// unbroken wait, never before it, and goes the moment the wait ends.

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAfterDelay } from '../../../lib/useAfterDelay.js';

describe('useAfterDelay (#686)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('turns true only after an unbroken wait of the delay', () => {
    const { result, rerender } = renderHook(({ on }) => useAfterDelay(on, 20_000), {
      initialProps: { on: true },
    });
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(19_999));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(true);
    // The answer came: gone at once.
    rerender({ on: false });
    expect(result.current).toBe(false);
  });

  it('starts over with every new wait', () => {
    const { result, rerender } = renderHook(({ on }) => useAfterDelay(on, 20_000), {
      initialProps: { on: true },
    });
    act(() => vi.advanceTimersByTime(15_000));
    rerender({ on: false });
    rerender({ on: true });
    act(() => vi.advanceTimersByTime(15_000));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current).toBe(true);
  });
});
