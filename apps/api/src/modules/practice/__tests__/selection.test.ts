// Minutes and questions (#311): the estimate a prepared practice, an agreed reminder and a
// fallback before a test show, written once next to its inverse.

import { describe, expect, it } from 'vitest';

import { minutesFor, questionCountFor } from '../selection.js';

describe('how long a set of questions takes', () => {
  it('is never under five minutes', () => {
    expect(minutesFor(0)).toBe(5);
    expect(minutesFor(6)).toBe(5);
  });

  it('counts about 1.2 questions a minute', () => {
    expect(minutesFor(12)).toBe(10);
    expect(minutesFor(13)).toBe(11);
    expect(minutesFor(50)).toBe(42);
  });

  it('gives back the minutes a minute estimate asked for', () => {
    expect(minutesFor(questionCountFor(10))).toBe(10);
  });
});
