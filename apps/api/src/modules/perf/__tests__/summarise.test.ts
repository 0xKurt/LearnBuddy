import { describe, expect, it } from 'vitest';

import { summarisePerf } from '../service.js';

describe('summarisePerf', () => {
  it('reports the bucket a percentile falls into, never a value in between', () => {
    const s = summarisePerf(
      [
        { bucket_ms: 2500, count: 3 },
        { bucket_ms: 3000, count: 6 },
        { bucket_ms: 5000, count: 1 },
      ],
      3000,
    );
    expect(s).toEqual({ n: 10, p50: 3000, p90: 3000, withinBudget: 0.9 });
  });

  it('says "beyond the last bound" as null and ignores counters', () => {
    const s = summarisePerf([
      { bucket_ms: 0, count: 5 },
      { bucket_ms: 50, count: 1 },
      { bucket_ms: -1, count: 99 },
    ]);
    expect(s).toEqual({ n: 6, p50: null, p90: null, withinBudget: null });
  });

  it('has nothing to say about nothing', () => {
    expect(summarisePerf([], 500)).toEqual({ n: 0, p50: null, p90: null, withinBudget: null });
  });
});
