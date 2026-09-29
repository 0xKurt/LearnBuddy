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
});
