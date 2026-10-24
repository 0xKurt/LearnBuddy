import { describe, expect, it } from 'vitest';
import { partition } from '../meter.js';

describe('endpoint wait partition', () => {
  it('counts parallel model waits once and clips work that outlives the response', () => {
    expect(
      partition(
        [
          { kind: 'db', start: 0, end: 20 },
          { kind: 'model', start: 10, end: 80 },
          { kind: 'model', start: 30, end: 120 },
          { kind: 'db', start: 60, end: 75 },
        ],
        0,
        100,
      ),
    ).toEqual({ db: 10, model: 90, other: 0 });
  });
  it('retains application overhead and excludes work outside the measured window', () => {
    expect(
      partition(
        [
          { kind: 'db', start: 5, end: 15 },
          { kind: 'model', start: 30, end: 40 },
          { kind: 'db', start: 100, end: 110 },
        ],
        10,
        50,
      ),
    ).toEqual({ db: 5, model: 10, other: 25 });
  });
});
