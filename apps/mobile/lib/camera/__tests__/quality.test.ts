// requires live verification in Claude Code session
//
// Unit tests for the local photo quality scorers. The mobile workspace has
// no vitest runner yet — these are colocated so that when the runner lands
// the slice only has to wire it up, not rewrite the cases.

import { describe, expect, it } from 'vitest';

import { classify, scoreBlur, scoreBrightness, scoreTilt } from '../quality.js';

function uniform(width: number, height: number, v: number) {
  const data = new Uint8Array(width * height);
  data.fill(v);
  return { data, width, height };
}

function checkerboard(width: number, height: number) {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data[y * width + x] = (x + y) % 2 === 0 ? 0 : 255;
    }
  }
  return { data, width, height };
}

describe('scoreBlur', () => {
  it('returns ~0 for a uniform image', () => {
    expect(scoreBlur(uniform(32, 32, 128))).toBeLessThan(1);
  });

  it('returns a large value for a high-frequency checkerboard', () => {
    expect(scoreBlur(checkerboard(32, 32))).toBeGreaterThan(1000);
  });
});

describe('scoreBrightness', () => {
  it('matches a uniform fill', () => {
    expect(scoreBrightness(uniform(8, 8, 130))).toBe(130);
  });

  it('returns 0 for an empty buffer', () => {
    expect(scoreBrightness({ data: new Uint8Array(0), width: 0, height: 0 })).toBe(0);
  });
});

describe('scoreTilt', () => {
  it('returns 0 when gravity is aligned with one axis', () => {
    expect(scoreTilt({ x: 0, y: 0, z: -9.81 })).toBeCloseTo(0, 4);
    expect(scoreTilt({ x: 0, y: -9.81, z: 0 })).toBeCloseTo(0, 4);
  });

  it('returns ~45° at the worst diagonal', () => {
    const angle = scoreTilt({ x: 0, y: 6.93, z: 6.93 });
    expect(angle).toBeGreaterThan(40);
    expect(angle).toBeLessThan(50);
  });
});

describe('classify', () => {
  const base = { width: 1024, height: 768 };

  it('returns green when everything is in band', () => {
    expect(classify({ ...base, blur: 120, brightness: 140, tilt: 5 })).toEqual({
      status: 'green',
      reason: null,
    });
  });

  it('returns red with reason="blur" when blur is below 60', () => {
    expect(classify({ ...base, blur: 45, brightness: 140, tilt: 0 })).toEqual({
      status: 'red',
      reason: 'blur',
    });
  });

  it('returns yellow with reason="blur_ok" in the 60–100 band', () => {
    expect(classify({ ...base, blur: 80, brightness: 140, tilt: 0 })).toEqual({
      status: 'yellow',
      reason: 'blur_ok',
    });
  });

  it('returns red with reason="too_dark" when brightness < 50', () => {
    expect(classify({ ...base, blur: 120, brightness: 30, tilt: 0 })).toEqual({
      status: 'red',
      reason: 'too_dark',
    });
  });

  it('returns red with reason="too_bright" when brightness > 220', () => {
    expect(classify({ ...base, blur: 120, brightness: 235, tilt: 0 })).toEqual({
      status: 'red',
      reason: 'too_bright',
    });
  });

  it('flags tilt as yellow when other metrics are green', () => {
    expect(classify({ ...base, blur: 120, brightness: 140, tilt: 32 })).toEqual({
      status: 'yellow',
      reason: 'tilt',
    });
  });

  it('returns red with reason="too_small" when resolution gate fails', () => {
    expect(classify({ blur: 120, brightness: 140, tilt: 0, width: 640, height: 480 })).toEqual({
      status: 'red',
      reason: 'too_small',
    });
  });

  // Boundary cases pinned by Doc 05 §Capture (blur 60/100, brightness 50/220,
  // tilt 25). The thresholds are inclusive on the green side per the spec
  // ("60–100" yellow, "50–220" green, "warn at > 25°").
  it('treats blur exactly 60 as yellow (not red)', () => {
    expect(classify({ ...base, blur: 60, brightness: 140, tilt: 0 })).toEqual({
      status: 'yellow',
      reason: 'blur_ok',
    });
  });

  it('treats blur exactly 100 as green (no longer yellow)', () => {
    expect(classify({ ...base, blur: 100, brightness: 140, tilt: 0 })).toEqual({
      status: 'green',
      reason: null,
    });
  });

  it('treats brightness exactly 50 as in-band (green)', () => {
    expect(classify({ ...base, blur: 120, brightness: 50, tilt: 0 })).toEqual({
      status: 'green',
      reason: null,
    });
  });

  it('treats brightness exactly 220 as in-band (green)', () => {
    expect(classify({ ...base, blur: 120, brightness: 220, tilt: 0 })).toEqual({
      status: 'green',
      reason: null,
    });
  });

  it('treats tilt exactly 25° as not-flagged (warn is > 25°)', () => {
    expect(classify({ ...base, blur: 120, brightness: 140, tilt: 25 })).toEqual({
      status: 'green',
      reason: null,
    });
  });

  it('treats null tilt (sensor unavailable) as green', () => {
    expect(classify({ ...base, blur: 120, brightness: 140, tilt: null })).toEqual({
      status: 'green',
      reason: null,
    });
  });
});
