// A tap that opens something is measured to the first frame after it shows (issue #711).

import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { measured, tapped } from '../../../lib/perf.js';
import { useShown } from '../../../lib/perfShown.js';

afterEach(() => {
  vi.useRealTimers();
});

const last = () => measured()[measured().length - 1];

describe('useShown', () => {
  it('ends the span on the first frame after it shows, not before', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    tapped('t-sheet');
    const { rerender } = renderHook(({ shown }) => useShown('t-sheet', shown), {
      initialProps: { shown: false },
    });
    vi.setSystemTime(10_300);
    vi.advanceTimersByTime(50);
    expect(measured().some((s) => s.action === 't-sheet')).toBe(false);
    rerender({ shown: true });
    vi.setSystemTime(10_400);
    vi.advanceTimersByTime(20);
    expect(last()?.action).toBe('t-sheet');
    expect(last()?.ms).toBeGreaterThanOrEqual(400);
  });
});
