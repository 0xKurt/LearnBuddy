import { describe, expect, it } from 'vitest';

import { dayPart, greetingVariant, SESSION_GAP_MS, startsNewSession } from '../sessionAnchor.js';

const at = (iso: string) => new Date(iso);

describe('startsNewSession', () => {
  it('is a new page after a long break', () => {
    expect(startsNewSession(at('2026-09-28T08:00:00Z'), at('2026-09-28T13:00:00Z'))).toBe(true);
  });

  it('keeps the same page while she is still in it', () => {
    expect(startsNewSession(at('2026-09-28T12:30:00Z'), at('2026-09-28T13:00:00Z'))).toBe(false);
    // Exactly at the gap it starts — one rule, no grey zone.
    const last = at('2026-09-28T09:00:00Z');
    expect(startsNewSession(last, new Date(last.getTime() + SESSION_GAP_MS))).toBe(true);
  });

  it('says no for an empty conversation (the first visit has its own screen)', () => {
    expect(startsNewSession(null, at('2026-09-28T13:00:00Z'))).toBe(false);
  });
});

describe('dayPart', () => {
  it('splits the day the way people talk about it', () => {
    expect([5, 8, 10].map(dayPart)).toEqual(['morning', 'morning', 'morning']);
    expect([11, 14, 16].map(dayPart)).toEqual(['day', 'day', 'day']);
    expect([17, 20, 21].map(dayPart)).toEqual(['evening', 'evening', 'evening']);
    expect([22, 0, 4].map(dayPart)).toEqual(['night', 'night', 'night']);
  });
});

describe('greetingVariant', () => {
  it('rotates and never leaves the range', () => {
    expect([0, 1, 2, 3, 4].map(greetingVariant)).toEqual([0, 1, 2, 0, 1]);
    expect(greetingVariant(-1)).toBe(2);
  });
});
