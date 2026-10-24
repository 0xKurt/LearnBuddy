import { describe, expect, it } from 'vitest';
import { PauseEnd } from '../pauseEnd.js';

function run(p: PauseEnd, level: number, from: number, ms: number): boolean {
  let ended = false;
  for (let t = from; t <= from + ms; t += 50) ended = p.observe(level, t) || ended;
  return ended;
}
function calibrated(room = 0.02): PauseEnd {
  const p = new PauseEnd();
  expect(run(p, room, 0, 1000)).toBe(false);
  return p;
}

describe('adaptive end of her turn (#932)', () => {
  it('ends 650 ms after the last speech, including a quiet voice', () => {
    for (const voice of [0.2, 0.6]) {
      const p = calibrated();
      expect(run(p, voice, 1050, 500)).toBe(false);
      expect(run(p, 0.02, 1600, 600)).toBe(false);
      expect(p.observe(0.02, 2250)).toBe(true);
    }
  });
  it('retains the quiet POCO syllable regression after room calibration', () => {
    const p = calibrated();
    for (const [at, level] of [
      [1050, 0.172],
      [1183, 0.2],
      [1317, 0.117],
      [1451, 0.181],
    ])
      expect(p.observe(level!, at!)).toBe(false);
    expect(run(p, 0.02, 1585, 600)).toBe(false);
    expect(p.observe(0.02, 2235)).toBe(true);
  });
  it('reports readiness only after measuring the room, and resets it', () => {
    const p = new PauseEnd();
    expect(p.ready).toBe(false);
    run(p, 0.02, 0, 550);
    expect(p.ready).toBe(false);
    p.observe(0.02, 600);
    expect(p.ready).toBe(true);
    p.reset();
    expect(p.ready).toBe(false);
  });
  it('steady background above the old fixed boundary never arms a turn', () => {
    const p = calibrated(0.35);
    expect(run(p, 0.35, 1050, 3000)).toBe(false);
    expect(run(p, 0.02, 4100, 3000)).toBe(false);
  });
  it('a voice above a loud background ends when she returns to that background', () => {
    const p = calibrated(0.35);
    run(p, 0.7, 1050, 600);
    expect(run(p, 0.35, 1700, 600)).toBe(false);
    expect(p.observe(0.35, 2350)).toBe(true);
  });
  it('silence, clicks, and separated clicks never arm a turn', () => {
    const p = calibrated();
    for (let at = 1050; at < 6000; at += 500) {
      expect(run(p, 0.8, at, 50)).toBe(false);
      expect(run(p, 0.02, at + 100, 350)).toBe(false);
    }
    expect(run(p, 0.02, 6100, 2000)).toBe(false);
  });
  it('a stalled poll does not count as continuous speech', () => {
    const p = calibrated();
    p.observe(0.6, 1050);
    p.observe(0.6, 3000);
    expect(run(p, 0.02, 3050, 2000)).toBe(false);
  });
  it('resuming speech before the deadline restarts the pause', () => {
    const p = calibrated();
    run(p, 0.6, 1050, 500);
    expect(run(p, 0.02, 1600, 500)).toBe(false);
    p.observe(0.6, 2150);
    expect(run(p, 0.02, 2200, 600)).toBe(false);
    expect(p.observe(0.02, 2850)).toBe(true);
  });
  it('invalid levels do not arm a turn', () => {
    const p = calibrated();
    expect(run(p, Number.NaN, 1050, 1000)).toBe(false);
    expect(run(p, Infinity, 2100, 1000)).toBe(false);
    expect(run(p, 0.02, 3150, 2000)).toBe(false);
  });
  it('reset forgets speech and the previous room', () => {
    const p = calibrated();
    run(p, 0.6, 1050, 500);
    p.reset();
    expect(run(p, 0.35, 2000, 2000)).toBe(false);
    expect(run(p, 0.02, 4050, 2000)).toBe(false);
  });
});

it('retains the original POCO onset even when she speaks during initial calibration', () => {
  const p = new PauseEnd();
  for (const [at, level] of [
    [0, 0],
    [135, 0],
    [268, 0.172],
    [401, 0.2],
    [535, 0.117],
    [669, 0.181],
  ] as const)
    expect(p.observe(level, 1000 + at)).toBe(false);
  expect(run(p, 0.02, 1803, 600)).toBe(false);
  expect(p.observe(0.02, 2453)).toBe(true);
});
