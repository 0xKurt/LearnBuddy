import { describe, expect, it } from 'vitest';

import { clock, lengthVerdict, wordsToPractise } from '../result.js';

describe('what a rehearsal says', () => {
  it('compares the length with the one she was given, with some slack', () => {
    expect(lengthVerdict(300, 300)).toBe('fits');
    expect(lengthVerdict(275, 300)).toBe('fits');
    expect(lengthVerdict(250, 300)).toBe('short');
    expect(lengthVerdict(340, 300)).toBe('long');
    // A short talk still gets 15 s either way.
    expect(lengthVerdict(50, 60)).toBe('fits');
    expect(lengthVerdict(200, null)).toBeNull();
  });

  it('writes a duration as minutes and seconds', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(90)).toBe('1:30');
    expect(clock(605)).toBe('10:05');
  });

  it('names each word to practise once, skipped first', () => {
    expect(wordsToPractise({ skipped: ['kleine'], misread: ['Wald', 'Kleine'] })).toEqual([
      'kleine',
      'Wald',
    ]);
  });
});
