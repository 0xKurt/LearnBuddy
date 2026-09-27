import { describe, expect, it } from 'vitest';

import { dayBreaks, localDateOf } from '../time.js';

// Device-local calendar days (the tests build instants from local wall times).
const at = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h).toISOString();

describe('new day in the conversation (user feedback #22)', () => {
  const now = new Date(2026, 8, 28, 16);

  it('shows nothing for a conversation from today', () => {
    expect(dayBreaks([at(2026, 9, 28, 9), at(2026, 9, 28, 15)], now)).toEqual([null, null]);
  });

  it("marks yesterday's messages and where today starts", () => {
    const y1 = at(2026, 9, 27, 17);
    const y2 = at(2026, 9, 27, 18);
    const t1 = at(2026, 9, 28, 16);
    expect(dayBreaks([y1, y2, t1], now)).toEqual(['2026-09-27', null, '2026-09-28']);
  });

  it('uses the device calendar', () => {
    expect(localDateOf(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});
