import { describe, expect, it } from 'vitest';

import { barHeights, levelFromDb, levelFromRecognizer } from '../level.js';

describe('voice level', () => {
  it('maps recorder metering to 0…1', () => {
    expect(levelFromDb(-160)).toBe(0);
    expect(levelFromDb(-5)).toBe(1);
    expect(levelFromDb(-27.5)).toBeCloseTo(0.5);
    expect(levelFromDb(undefined)).toBe(0);
    expect(levelFromDb(Number.NaN)).toBe(0);
  });

  it('maps the recogniser volume to 0…1', () => {
    expect(levelFromRecognizer(-2)).toBe(0);
    expect(levelFromRecognizer(5)).toBe(0.5);
    expect(levelFromRecognizer(12)).toBe(1);
  });

  it('keeps bars visible when silent and taller when loud, middle first', () => {
    const quiet = barHeights(0);
    const loud = barHeights(1);
    expect(Math.min(...quiet)).toBeGreaterThan(0.2);
    expect(loud[2]).toBe(1);
    for (let i = 0; i < 5; i++) expect(loud[i]!).toBeGreaterThan(quiet[i]!);
    expect(loud[2]!).toBeGreaterThan(loud[0]!);
  });
});
