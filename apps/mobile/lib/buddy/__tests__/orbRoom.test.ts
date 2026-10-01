// The orb's room and when it moves (issue #182).

import { describe, expect, it } from 'vitest';

import { MOON_STATES } from '../moon.js';
import { orbMoves, orbSlot } from '../orbRoom.js';

describe('the room the orb needs', () => {
  it('is wider than the orb itself, because the moon leaves the box', () => {
    // 36 pt in the head: the moon reaches ~33 pt from the centre, the box only 18.
    expect(orbSlot(36)).toBeGreaterThanOrEqual(66);
    expect(orbSlot(72)).toBeGreaterThanOrEqual(132);
    // Whole pixels: half a pixel of slot is half a pixel of the moon cut off.
    expect(Number.isInteger(orbSlot(26))).toBe(true);
  });
});

describe('when the moon moves', () => {
  it('moves in every state when motion is allowed', () => {
    for (const state of MOON_STATES) expect(orbMoves(true, false, state)).toBe(true);
  });

  it('keeps moving with reduce motion on — in EVERY state (owner decision, twice)', () => {
    // "der mond bewegt sich trotzdem nicht. wenn die app nichts tut gibts ja den idle
    // zustand." Buddy is not decoration on his own screen; a frozen Buddy reads as a
    // broken app. Everything else still obeys the setting (lib/theme/enter.ts).
    for (const state of MOON_STATES) expect(orbMoves(true, true, state)).toBe(true);
  });

  it('stays still wherever the caller asked for stillness', () => {
    for (const state of MOON_STATES) expect(orbMoves(false, false, state)).toBe(false);
  });
});
