import { describe, expect, it } from 'vitest';

import { nextReadinessPoll, READINESS_EVERY_MS } from '../offerReady.js';

describe('nextReadinessPoll', () => {
  it('stops once it is ready', () => {
    const ready = { state: 'ready' } as Parameters<typeof nextReadinessPoll>[0];
    expect(nextReadinessPoll(ready, 1)).toBe(false);
  });
  it('keeps asking while Buddy prepares, for about a minute', () => {
    expect(nextReadinessPoll({ state: 'preparing' }, 1)).toBe(READINESS_EVERY_MS);
    expect(nextReadinessPoll({ state: 'preparing' }, 39)).toBe(READINESS_EVERY_MS);
    expect(nextReadinessPoll({ state: 'preparing' }, 40)).toBe(false);
  });
  it('asks about an unprepared offer only a few times', () => {
    expect(nextReadinessPoll({ state: 'none' }, 1)).toBe(READINESS_EVERY_MS);
    expect(nextReadinessPoll({ state: 'none' }, 3)).toBe(false);
  });
  it('does not ask again after an error', () => {
    expect(nextReadinessPoll(undefined, 1)).toBe(false);
  });
});
