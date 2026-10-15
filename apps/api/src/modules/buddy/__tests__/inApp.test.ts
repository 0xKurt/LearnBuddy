// "She is in the app" holds three minutes after her last request (#671 follow-up). Her presence
// is written at most once a minute (http/context.ts), so the stored `last_seen_at` can be up to a
// minute older than her last request; the window is wider by exactly that interval.

import { describe, expect, it } from 'vitest';

import { inAppNow, PRESENCE_EVERY_S } from '../inApp.js';

const at = (s: number) => new Date(Date.UTC(2026, 9, 15, 8, 0, s));

describe('in the app now', () => {
  it('holds three minutes after her last request, whose presence was written a minute earlier', () => {
    // Written at 0 s; her last request at 59 s wrote nothing (inside the minute).
    const written = at(0);
    const lastRequest = 59;
    expect(inAppNow(written, at(lastRequest + 3 * 60 - 1))).toBe(true);
  });

  it('ends one write interval after the classic three minutes', () => {
    const written = at(0);
    expect(inAppNow(written, at(3 * 60 + PRESENCE_EVERY_S - 1))).toBe(true);
    expect(inAppNow(written, at(3 * 60 + PRESENCE_EVERY_S))).toBe(false);
    expect(inAppNow(null, at(0))).toBe(false);
  });
});
