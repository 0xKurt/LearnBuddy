import { describe, expect, it } from 'vitest';

import { levelFromDb, levelFromRecognizer, meterShown, type Meter } from '../level.js';

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

  // Talk drew itself anew on every 120 ms reading (#637): a reading that changes nothing shown
  // must keep the very same object, so React draws nothing for it.
  it('keeps the same meter while nothing shown changes', () => {
    const silent: Meter = meterShown({ elapsedMs: 0, level: 0 }, 1_240, -70);
    expect(silent).toEqual({ elapsedMs: 1_000, level: 0 });
    expect(meterShown(silent, 1_360, -80)).toBe(silent);
    expect(meterShown(silent, 1_960, -160)).toBe(silent);
    // The room's hum (levelFromDb ≤ 0.12) is silence, not a flicker the screen must draw.
    expect(meterShown(silent, 1_500, -45)).toBe(silent);
  });

  it('moves on with the next whole second and the next level step', () => {
    const at = meterShown({ elapsedMs: 0, level: 0 }, 1_100, -70);
    expect(meterShown(at, 2_010, -70)).toEqual({ elapsedMs: 2_000, level: 0 });
    expect(meterShown(at, 1_200, -27.5).level).toBe(0.5);
  });
});
