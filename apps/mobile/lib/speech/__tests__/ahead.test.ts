// Audio fetched ahead (issue #59): handed over once, fixed sentences kept, little kept for long,
// and what is thrown away unplayed is counted — never silently paid for.

import { describe, expect, it } from 'vitest';

import { AheadCache, type AheadAudio } from '../ahead.js';

const audio: AheadAudio = { base64: 'AAAA', mime: 'audio/mpeg', speed: 0 };

function setup() {
  let t = 0;
  let wasted = 0;
  let fetched = 0;
  const cache = new AheadCache(
    () => wasted++,
    () => t,
  );
  const fetch = () => {
    fetched++;
    return Promise.resolve(audio);
  };
  return {
    cache,
    fetch,
    tick: (ms: number) => (t += ms),
    wasted: () => wasted,
    fetched: () => fetched,
  };
}

describe('AheadCache', () => {
  it('hands one-time audio over once', async () => {
    const s = setup();
    s.cache.prepare('q2', s.fetch, false);
    expect(await s.cache.take('q2')).toEqual(audio);
    expect(s.cache.take('q2')).toBeNull();
  });

  it('keeps a fixed sentence for every time it is needed, fetched once', async () => {
    const s = setup();
    s.cache.prepare('Richtig.', s.fetch, true);
    s.cache.prepare('Richtig.', s.fetch, true);
    expect(await s.cache.take('Richtig.')).toEqual(audio);
    expect(await s.cache.take('Richtig.')).toEqual(audio);
    expect(s.fetched()).toBe(1);
  });

  it('does not fetch the same question twice while it waits', () => {
    const s = setup();
    s.cache.prepare('q2', s.fetch, false);
    s.cache.prepare('q2', s.fetch, false);
    expect(s.fetched()).toBe(1);
  });

  it('counts one-time audio thrown away unplayed: too old, or pushed out', async () => {
    const s = setup();
    s.cache.prepare('q1', s.fetch, false);
    await Promise.resolve();
    await Promise.resolve();
    s.tick(11 * 60_000);
    s.cache.prepare('q2', s.fetch, false);
    expect(s.wasted()).toBe(1);
    for (const q of ['q3', 'q4', 'q5']) s.cache.prepare(q, s.fetch, false);
    await new Promise((r) => setTimeout(r, 0));
    s.cache.prepare('q6', s.fetch, false);
    expect(s.cache.take('q2')).toBeNull(); // the oldest went first
    expect(s.wasted()).toBeGreaterThanOrEqual(2);
  });

  it('a failed fetch is no audio and no waste', async () => {
    let wasted = 0;
    const cache = new AheadCache(() => wasted++);
    cache.prepare('q', () => Promise.reject(new Error('offline')), false);
    expect(await cache.take('q')).toBeNull();
    cache.prepare('r', () => Promise.resolve(null), false);
    await new Promise((r) => setTimeout(r, 0));
    for (const q of ['a', 'b', 'c', 'd']) cache.prepare(q, () => Promise.resolve(null), false);
    expect(wasted).toBe(0);
  });
});
