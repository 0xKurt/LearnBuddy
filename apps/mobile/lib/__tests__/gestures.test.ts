import { describe, expect, it } from 'vitest';

import {
  clampOffset,
  CLOSE_DISTANCE,
  dismissedBySwipe,
  maxOffset,
  offsetAroundFocal,
  rubberBand,
} from '../gestures.js';

describe('swipe down to close', () => {
  it('closes after a long enough pull', () => {
    expect(dismissedBySwipe(CLOSE_DISTANCE, 0)).toBe(true);
    expect(dismissedBySwipe(CLOSE_DISTANCE - 1, 0)).toBe(false);
  });

  it('closes on a quick flick down, not on a tremble or a flick up', () => {
    expect(dismissedBySwipe(40, 1200)).toBe(true);
    expect(dismissedBySwipe(5, 1200)).toBe(false);
    expect(dismissedBySwipe(-40, -1200)).toBe(false);
  });
});

describe('zoom', () => {
  it('lets zoomed content move only as far as its edges', () => {
    expect(maxOffset(1, 300)).toBe(0);
    expect(maxOffset(2, 300)).toBe(150);
    expect(clampOffset(400, 2, 300)).toBe(150);
    expect(clampOffset(-400, 2, 300)).toBe(-150);
    expect(clampOffset(20, 1, 300)).toBe(0);
  });

  it('keeps the point under the fingers in place while zooming', () => {
    // A point 100 px right of the centre, unmoved content, zoomed 1× → 2×.
    const offset = offsetAroundFocal(100, 0, 1, 2);
    expect(offset).toBe(-100);
    // The point's position on screen: centre + offset + focal × scale ratio stays 100.
    expect(offset + 100 * 2).toBe(100);
    // Zooming back out returns to where it was.
    expect(offsetAroundFocal(100, offset, 2, 1)).toBe(0);
  });

  it('gives way softly past the edge', () => {
    expect(rubberBand(50, 100)).toBe(50);
    expect(rubberBand(200, 100)).toBeCloseTo(135);
    expect(rubberBand(-200, 100)).toBeCloseTo(-135);
  });
});
