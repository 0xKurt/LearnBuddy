import { describe, expect, it } from 'vitest';

import { clockLine, leftNow, SOON_MS, timeUpLines } from '../practice/testClock.js';

describe('the clock of a test with time (issue #241)', () => {
  it('says whole minutes, rounded up, and nothing once the time is up', () => {
    expect(clockLine(45 * 60_000)).toEqual({ count: 45, soon: false });
    expect(clockLine(44 * 60_000 + 1)).toEqual({ count: 45, soon: false });
    expect(clockLine(1_000)).toEqual({ count: 1, soon: true });
    expect(clockLine(0)).toBeNull();
    expect(clockLine(-5)).toBeNull();
  });

  it('turns to the quiet hint at five minutes, not before', () => {
    expect(clockLine(SOON_MS + 30_000)).toEqual({ count: 6, soon: false });
    expect(clockLine(SOON_MS)).toEqual({ count: 5, soon: true });
  });

  it('counts down from when the view arrived, never from the phone clock against a deadline', () => {
    expect(leftNow(60_000, 1_000, 21_000)).toBe(40_000);
    expect(leftNow(60_000, 1_000, 999_000)).toBe(0);
    // A clock that jumped backwards never adds time.
    expect(leftNow(60_000, 1_000, 500)).toBe(60_000);
  });

  it('says how far she got; what stayed open is not answered, never "0 of 5"', () => {
    expect(timeUpLines({ answered: 3 }, 5)).toEqual([
      { key: 'summary_test.time_up_line', count: 5, answered: 3 },
      { key: 'summary_test.time_up_rest' },
    ]);
    expect(timeUpLines({ answered: 0 }, 5)).toEqual([{ key: 'summary_test.time_up_rest' }]);
    expect(timeUpLines({ answered: 5 }, 5)).toEqual([
      { key: 'summary_test.time_up_line', count: 5, answered: 5 },
    ]);
  });
});
