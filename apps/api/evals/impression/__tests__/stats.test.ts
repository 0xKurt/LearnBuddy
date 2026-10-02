// The statistics of the overall-impression comparison (issue #127), against values that can
// be checked by hand or in any statistics table — no model, no database.

import { describe, expect, it } from 'vitest';

import {
  bootstrapMean,
  pairedMetric,
  permutationTest,
  scenarioPreference,
  seeded,
  signTest,
  verdict,
  wilson,
  winsNeeded,
} from '../stats.js';

describe('sign test', () => {
  it('matches the exact binomial values', () => {
    // 10 of 10: 2 · 0.5^10.
    expect(signTest(10, 0)).toBeCloseTo(2 / 1024, 12);
    // 8 of 10: 2 · (1 + 10 + 45) / 1024 = 0.109375.
    expect(signTest(8, 2)).toBeCloseTo(0.109375, 12);
    // Symmetric, and an even split is no evidence at all.
    expect(signTest(2, 8)).toBeCloseTo(signTest(8, 2), 12);
    expect(signTest(5, 5)).toBe(1);
    expect(signTest(0, 0)).toBe(1);
  });

  it('says how many wins it takes, and when nothing could be enough', () => {
    // Five decided scenarios: even 5 of 5 gives p = 0.0625. No result could be significant.
    expect(winsNeeded(5)).toBeNull();
    expect(winsNeeded(6)).toBe(6);
    expect(winsNeeded(10)).toBe(9);
    expect(signTest(9, 1)).toBeLessThan(0.05);
    expect(signTest(8, 2)).toBeGreaterThan(0.05);
  });
});

describe('verdict', () => {
  it('names a winner only below the fixed level, else says what would have been needed', () => {
    expect(verdict(0, 9)).toMatchObject({ kind: 'B_better' });
    expect(verdict(9, 1)).toMatchObject({ kind: 'A_better' });
    expect(verdict(2, 7)).toMatchObject({ kind: 'undetectable', decisive: 9, needed: 8 });
    expect(verdict(1, 3)).toMatchObject({ kind: 'undetectable', decisive: 4, needed: null });
  });

  it('decides a scenario by the majority of its own runs', () => {
    expect(scenarioPreference(1, 2)).toBe('B');
    expect(scenarioPreference(2, 0)).toBe('A');
    expect(scenarioPreference(1, 1)).toBe('even');
  });
});

describe('Wilson interval', () => {
  it('matches the textbook value and stays inside [0, 1] at the edges', () => {
    // 8 of 10: 0.4902 … 0.9433.
    const w = wilson(8, 10);
    expect(w.low).toBeCloseTo(0.4902, 3);
    expect(w.high).toBeCloseTo(0.9433, 3);
    expect(wilson(0, 5).low).toBe(0);
    expect(wilson(5, 5).high).toBe(1);
    expect(wilson(0, 0)).toEqual({ low: 0, high: 1 });
  });
});

describe('paired measures', () => {
  it('enumerates the sign-flip test exactly for few scenarios', () => {
    // All four differences positive and equal: only "all +" and "all −" are as extreme.
    expect(permutationTest([1, 1, 1, 1], seeded(1))).toBeCloseTo(2 / 16, 12);
    // No difference at all: every pattern is as extreme.
    expect(permutationTest([0, 0, 0], seeded(1))).toBe(1);
    expect(permutationTest([], seeded(1))).toBe(1);
  });

  it('never reports p = 0 when it has to sample', () => {
    const many = Array.from({ length: 30 }, () => 1);
    const p = permutationTest(many, seeded(7));
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(0.001);
  });

  it('gives the same interval for the same seed, and one that covers the mean', () => {
    const xs = [3, 1, 4, 1, 5, 9, 2, 6];
    const one = bootstrapMean(xs, seeded(42));
    expect(bootstrapMean(xs, seeded(42))).toEqual(one);
    expect(one.low).toBeLessThan(3.875);
    expect(one.high).toBeGreaterThan(3.875);
    // A constant difference has no spread.
    expect(bootstrapMean([2, 2, 2], seeded(1))).toEqual({ low: 2, high: 2 });
  });

  it('reports B − A per scenario', () => {
    const m = pairedMetric(
      [
        { a: 2, b: 1 },
        { a: 3, b: 1 },
        { a: 1, b: 0 },
      ],
      5,
    );
    expect(m.scenarios).toBe(3);
    expect(m.meanA).toBe(2);
    expect(m.meanB).toBeCloseTo(2 / 3, 12);
    expect(m.meanDiff).toBeCloseTo(-4 / 3, 12);
    expect(m.ci.high).toBeLessThan(0);
    // Three scenarios: the smallest possible two-sided p is 2/8.
    expect(m.p).toBeCloseTo(0.25, 12);
  });
});
