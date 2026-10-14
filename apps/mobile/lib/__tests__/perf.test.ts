// The tap-to-reaction spans (issue #66), now also around the talk loop (issue #41):
// a span only counts when the reaction really happened; a dropped mark never lets a
// later, unrelated reaction count her own time as the app's. Virtual clock.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dropped, measured, reacted, tapped } from '../perf.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
});
afterEach(() => {
  vi.useRealTimers();
});

const last = () => measured()[measured().length - 1];

describe('perf spans', () => {
  it('measures from the mark to the reaction', () => {
    tapped('t-relisten');
    vi.setSystemTime(1_450);
    reacted('t-relisten');
    expect(last()).toEqual({ action: 't-relisten', ms: 450 });
  });

  it('a dropped mark never completes: the loop paused, her later tap is her own time', () => {
    tapped('t-dropped');
    vi.setSystemTime(2_000);
    dropped('t-dropped');
    vi.setSystemTime(9_000);
    reacted('t-dropped');
    expect(measured().some((s) => s.action === 't-dropped')).toBe(false);
  });

  it('a second mark replaces the first: the newer turn is the one measured', () => {
    tapped('t-replaced');
    vi.setSystemTime(3_000);
    tapped('t-replaced');
    vi.setSystemTime(3_200);
    reacted('t-replaced');
    expect(last()).toEqual({ action: 't-replaced', ms: 200 });
  });

  // A device measurement runs release-mode JS (issue #711): no __DEV__, so the spans need the
  // flag to reach the log, and stay quiet without it.
  it('logs a span on the phone only in development or when asked for a measurement', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      tapped('t-quiet');
      reacted('t-quiet');
      vi.stubEnv('EXPO_PUBLIC_PERF_LOG', '1');
      tapped('t-logged');
      vi.setSystemTime(1_120);
      reacted('t-logged');
      const lines = log.mock.calls.map((c) => String(c[0]));
      expect(lines).toEqual(['[lb-perf] t-logged 120ms']);
    } finally {
      vi.unstubAllEnvs();
      log.mockRestore();
    }
  });
});
