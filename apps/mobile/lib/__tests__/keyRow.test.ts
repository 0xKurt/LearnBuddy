// The one key row's line (issue #310 step 4): what fits, how the places are shared, and how a
// long row turns into pages — the same for the math keys and the note line's keys.

import { describe, expect, it } from 'vitest';

import { KEY_GAP, keyWidth, NARROW_ROW, pagesOf, placesOnLine, slotsIn } from '../keyRow.js';

const one = () => 1;

describe('one line, never sideways', () => {
  it('fits six places on a 360 phone and seven on a 390 phone', () => {
    expect(slotsIn(NARROW_ROW)).toBe(6);
    expect(slotsIn(358)).toBe(7);
  });

  it('puts everything on one page when it fits', () => {
    expect(pagesOf(['a', 'b', 'c'], 6, one)).toEqual([['a', 'b', 'c']]);
    expect(pagesOf([], 6, one)).toEqual([]);
  });

  it('keeps every page within the line, with one place for "…"', () => {
    const keys = ['a', 'bb', 'c', 'd', 'e', 'f', 'g', 'h'];
    const places = (k: string) => k.length;
    for (const slots of [6, 7]) {
      const pages = pagesOf(keys, slots, places);
      expect(pages.length).toBeGreaterThan(1);
      expect(pages.flat()).toEqual(keys);
      for (const page of pages)
        expect(page.reduce((n, k) => n + places(k), 0)).toBeLessThanOrEqual(slots - 1);
    }
  });
});

describe('equal places', () => {
  it('lets a row that nearly fills the line fill it, and a short row keep its size', () => {
    expect(placesOnLine(6, 7)).toBe(6);
    expect(placesOnLine(7, 7)).toBe(7);
    expect(placesOnLine(3, 7)).toBe(7);
    // More than fits: the line keeps what fits, the rest is paged.
    expect(placesOnLine(9, 7)).toBe(7);
  });

  it('spans the line whatever it holds when asked to (the note line)', () => {
    expect(placesOnLine(3, 7, true)).toBe(3);
    expect(placesOnLine(6, 6, true)).toBe(6);
    expect(placesOnLine(9, 7, true)).toBe(7);
  });

  it('never makes a key narrower than a finger on the narrowest phone', () => {
    const slots = slotsIn(NARROW_ROW);
    expect(keyWidth(NARROW_ROW, slots, 1)).toBeGreaterThanOrEqual(44);
    // A two-place key lines up with two one-place keys and the gap between them.
    expect(keyWidth(NARROW_ROW, slots, 2)).toBe(
      Math.floor(2 * ((NARROW_ROW - KEY_GAP * (slots - 1)) / slots) + KEY_GAP),
    );
  });
});
