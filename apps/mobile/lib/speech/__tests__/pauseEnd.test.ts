import { describe, expect, it } from 'vitest';

import { PauseEnd } from '../pauseEnd.js';

/** Readings every 100 ms at one level, from `from` for `ms`; true once any of them ended it. */
function run(p: PauseEnd, level: number, from: number, ms: number): boolean {
  let ended = false;
  for (let t = from; t <= from + ms; t += 100) ended = p.observe(level, t) || ended;
  return ended;
}

describe('the end of her turn on the recording path (issue #523)', () => {
  it('she speaks for a second, then is quiet for 1.6 s: her turn ends', () => {
    const p = new PauseEnd();
    expect(run(p, 0.6, 1000, 1000)).toBe(false);
    expect(run(p, 0.02, 2100, 1500)).toBe(false);
    expect(p.observe(0.02, 3700)).toBe(true);
  });

  it('ends after a quiet sentence above room tone, not only a loud voice', () => {
    const p = new PauseEnd();
    expect(run(p, 0.2, 1000, 1000)).toBe(false);
    expect(run(p, 0.02, 2100, 1500)).toBe(false);
    expect(p.observe(0.02, 3700)).toBe(true);
  });

  it('a loud room that never falls quiet never ends it: the tap is the way', () => {
    const p = new PauseEnd();
    expect(run(p, 0.6, 1000, 1000)).toBe(false);
    expect(run(p, 0.2, 2100, 10_000)).toBe(false);
  });

  it('silence before she has said anything does not end it', () => {
    const p = new PauseEnd();
    expect(run(p, 0, 1000, 5000)).toBe(false);
  });

  it('a brief click does not arm the pause', () => {
    const p = new PauseEnd();
    expect(run(p, 0.6, 1000, 100)).toBe(false);
    expect(run(p, 0, 1400, 3000)).toBe(false);
  });

  it('ends a short quiet sentence captured on the POCO without waiting for a tap', () => {
    const p = new PauseEnd();
    // First 0.8 s of the device recording: a quiet 1.37 s spoken fixture, sampled at ~133 ms.
    for (const [at, level] of [
      [0, 0],
      [135, 0],
      [268, 0.172],
      [401, 0.2],
      [535, 0.117],
      [669, 0.181],
    ] as const)
      expect(p.observe(level, 1000 + at)).toBe(false);
    expect(run(p, 0.02, 1803, 1500)).toBe(false);
    expect(p.observe(0.02, 3403)).toBe(true);
  });

  it('a stalled poll is not counted as speech', () => {
    const p = new PauseEnd();
    p.observe(0.6, 1000);
    // One reading two seconds later cannot count as enough speech to arm the pause.
    p.observe(0.6, 3000);
    expect(run(p, 0, 3100, 3000)).toBe(false);
  });

  it('speech in the pause starts the pause again', () => {
    const p = new PauseEnd();
    run(p, 0.6, 1000, 1000);
    expect(run(p, 0, 2100, 1000)).toBe(false);
    p.observe(0.6, 3200);
    expect(run(p, 0, 3300, 1400)).toBe(false);
    expect(p.observe(0, 4900)).toBe(true);
  });

  it('reset forgets what was heard', () => {
    const p = new PauseEnd();
    run(p, 0.6, 1000, 1000);
    p.reset();
    expect(run(p, 0, 5000, 3000)).toBe(false);
  });
});
