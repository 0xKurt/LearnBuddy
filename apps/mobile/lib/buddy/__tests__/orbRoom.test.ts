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

  it('keeps moving where the movement IS the message, even with reduce motion', () => {
    // An activity indicator keeps spinning under reduce motion on every platform, and
    // this is the app's only "Buddy is working" signal.
    for (const state of ['think', 'speak', 'listen'] as const) {
      expect(orbMoves(true, true, state)).toBe(true);
    }
  });

  it('stops the decorative drift when reduce motion is on', () => {
    for (const state of ['idle', 'wait', 'happy'] as const) {
      expect(orbMoves(true, true, state)).toBe(false);
    }
  });

  it('stays still wherever the caller asked for stillness', () => {
    for (const state of MOON_STATES) expect(orbMoves(false, false, state)).toBe(false);
  });
});
