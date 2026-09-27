import { describe, expect, it } from 'vitest';

import { TurnGuard } from '../turnGuard.js';

describe('TurnGuard (M-78)', () => {
  it('keeps the text of a listening nobody cancelled', () => {
    const g = new TurnGuard();
    const token = g.begin();
    expect(g.current()).toBe(true);
    expect(g.holds(token)).toBe(true);
  });

  it('drops a transcript that arrives after she answered another way', () => {
    const g = new TurnGuard();
    const token = g.begin();
    g.cancel(); // she tapped a choice while the recording ran
    expect(g.current()).toBe(false);
    expect(g.holds(token)).toBe(false);
  });

  it('lets the next listening count again', () => {
    const g = new TurnGuard();
    const old = g.begin();
    g.cancel();
    const next = g.begin();
    expect(g.holds(next)).toBe(true);
    expect(g.holds(old)).toBe(false);
  });
});
