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

  it('a loud room that never falls quiet never ends it: the tap is the way', () => {
    const p = new PauseEnd();
    expect(run(p, 0.6, 1000, 1000)).toBe(false);
    expect(run(p, 0.2, 2100, 10_000)).toBe(false);
  });

  it('silence before she has said anything does not end it', () => {
    const p = new PauseEnd();
    expect(run(p, 0, 1000, 5000)).toBe(false);
  });

  it('a word too short to count does not arm the pause', () => {
    const p = new PauseEnd();
    expect(run(p, 0.6, 1000, 300)).toBe(false);
    expect(run(p, 0, 1400, 3000)).toBe(false);
  });

  it('a stalled poll is not counted as speech', () => {
    const p = new PauseEnd();
    p.observe(0.6, 1000);
    // One reading two seconds later counts as at most 400 ms of speech.
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
