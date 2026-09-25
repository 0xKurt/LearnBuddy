import { describe, expect, it } from 'vitest';

import { localDecimal } from '../numbers.js';

describe('localDecimal', () => {
  it('writes a decimal comma where it is usual', () => {
    expect(localDecimal('0.75', 'de')).toBe('0,75');
    expect(localDecimal('-12.5', 'fr')).toBe('-12,5');
    expect(localDecimal('0.75', 'en')).toBe('0.75');
  });

  it('leaves everything that is not a plain decimal alone', () => {
    expect(localDecimal('3/4', 'de')).toBe('3/4');
    expect(localDecimal('12', 'de')).toBe('12');
    expect(localDecimal('1.000.000', 'de')).toBe('1.000.000');
    expect(localDecimal('x = 2.5', 'de')).toBe('x = 2.5');
  });
});
