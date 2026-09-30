// The one rule for what a screen keeps free at its bottom edge (issue #142).

import { describe, expect, it } from 'vitest';

import { bottomRoom, SPACE } from '../space.js';

describe('the room at the bottom edge', () => {
  it('is the design gap where the system takes nothing (web, older phones)', () => {
    expect(bottomRoom(0)).toBe(SPACE.lg);
    expect(bottomRoom(0, SPACE.md)).toBe(SPACE.md);
  });

  it('adds the gap on top of the system inset, never swallows it', () => {
    // The old Math.max(insets.bottom, 16) answered 48 here — the bar ON the nav bar.
    expect(bottomRoom(48)).toBe(48 + SPACE.lg);
    expect(bottomRoom(34, SPACE.md)).toBe(34 + SPACE.md);
  });

  it('grows with the inset, so a gesture bar and a button bar both get their gap', () => {
    expect(bottomRoom(34)).toBeGreaterThan(bottomRoom(16));
  });
});
