// The tap-to-reaction spans (issue #66), now also around the talk loop (issue #41):
// a span only counts when the reaction really happened; a dropped mark never lets a
// later, unrelated reaction count her own time as the app's. Virtual clock.
// Since issue #169 they leave the device only summed up into fixed buckets.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  counted,
  dropped,
  giveBack,
  measured,
  onMeasured,
  reacted,
  takeReport,
  tapped,
} from '../perf.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
  takeReport('web', 'dev');
});
afterEach(() => {
  vi.useRealTimers();
});

const last = () => measured()[measured().length - 1];

describe('perf spans', () => {
  it('measures from the mark to the reaction', () => {
    tapped('relisten');
    vi.setSystemTime(1_450);
    reacted('relisten');
    expect(last()).toEqual({ action: 'relisten', ms: 450 });
  });

  it('a dropped mark never completes: the loop paused, her later tap is her own time', () => {
    tapped('first_audio');
    vi.setSystemTime(2_000);
    dropped('first_audio');
    vi.setSystemTime(9_000);
    reacted('first_audio');
    expect(measured().some((s) => s.action === 'first_audio')).toBe(false);
  });

  it('a second mark replaces the first: the newer turn is the one measured', () => {
    tapped('send');
    vi.setSystemTime(3_000);
    tapped('send');
    vi.setSystemTime(3_200);
    reacted('send');
    expect(last()).toEqual({ action: 'send', ms: 200 });
  });
});

describe('the summed-up report (issue #169)', () => {
  const span = (action: 'reply' | 'next_question', ms: number) => {
    tapped(action);
    vi.advanceTimersByTime(ms);
    reacted(action);
  };

  it('counts each wait in its bucket and forgets it once taken', () => {
    span('reply', 2_600);
    span('reply', 2_700);
    span('next_question', 30);
    counted('speech_ahead_used');
    const report = takeReport('android', 'release');
    expect(report).toEqual({
      platform: 'android',
      build: 'release',
      spans: [
        { action: 'reply', bucket_ms: 3000, count: 2 },
        { action: 'next_question', bucket_ms: 50, count: 1 },
      ],
      counters: [{ counter: 'speech_ahead_used', count: 1 }],
    });
    expect(takeReport('android', 'release')).toBeNull();
  });

  it('a report that could not be sent travels with the next one', () => {
    span('reply', 2_600);
    const failed = takeReport('ios', 'release')!;
    giveBack(failed);
    span('reply', 2_900);
    expect(takeReport('ios', 'release')?.spans).toEqual([
      { action: 'reply', bucket_ms: 3000, count: 2 },
    ]);
  });

  it('tells the sender how much is waiting', () => {
    const seen: number[] = [];
    const off = onMeasured((n) => seen.push(n));
    span('next_question', 10);
    counted('speech_ahead_wasted');
    off();
    expect(seen).toEqual([1, 2]);
  });

  it('carries no text: only the fixed actions and bounds', () => {
    span('reply', 99_000);
    const report = takeReport('web', 'dev')!;
    expect(report.spans).toEqual([{ action: 'reply', bucket_ms: 0, count: 1 }]);
  });
});
