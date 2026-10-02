// The legend of a function plot (issue #298): a label that only repeats the curve is said once.

import { describe, expect, it } from 'vitest';

import { legendText } from '../legend.js';

describe('legendText', () => {
  it('names a curve by its label and its equation', () => {
    expect(legendText('a = 2', '2*x^2')).toBe('a = 2: y = 2·x²');
  });
  it('says a label that only repeats the curve once, however it is written', () => {
    expect(legendText('y = 2x²', '2*x^2')).toBe('y = 2·x²');
    expect(legendText('y = x^2', 'x^2')).toBe('y = x²');
    expect(legendText('2*x^2', '2*x^2')).toBe('y = 2·x²');
  });
  it('shows the equation alone without a label', () => {
    expect(legendText(null, 'x^2 - 2*x')).toBe('y = x² − 2·x');
  });
});
