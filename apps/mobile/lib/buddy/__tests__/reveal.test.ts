import { describe, expect, it } from 'vitest';

import { REVEAL_CPS, REVEAL_MAX_LAG_MS, revealNext, revealStart } from '../reveal.js';

describe('revealNext', () => {
  it('never shows more than arrived', () => {
    expect(revealNext(0, 'Hallo', 10_000)).toBe(5);
    expect(revealNext(5, 'Hallo', 16)).toBe(5);
  });
  it('moves at a calm pace and ends on a whole word', () => {
    const text =
      'Ein Bruch hat einen Zähler und einen Nenner, und dazwischen steht der Bruchstrich.';
    const next = revealNext(0, text, 50);
    expect(next).toBeGreaterThanOrEqual(Math.ceil((REVEAL_CPS * 50) / 1000));
    expect(next).toBeLessThan(text.length);
    expect([' ', undefined]).toContain(text[next]);
  });
  it('catches up with a long chunk within the maximal lag', () => {
    const text = 'x'.repeat(10) + ' ' + 'wort '.repeat(200);
    let shown = 0;
    let t = 0;
    while (shown < text.length && t < REVEAL_MAX_LAG_MS * 3) {
      shown = revealNext(shown, text, 16);
      t += 16;
    }
    expect(shown).toBe(text.length);
    expect(t).toBeLessThanOrEqual(REVEAL_MAX_LAG_MS * 1.2);
  });
});

describe('revealStart', () => {
  it('goes on where it was when the text grows', () => {
    expect(revealStart('Hallo', 'Hallo Mia', 5)).toBe(5);
  });
  it('starts over when a new round replaces the text', () => {
    expect(revealStart('Hallo Mia', 'Guten Tag', 7)).toBe(0);
  });
});
