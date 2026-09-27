import { describe, expect, it } from 'vitest';

import { ageOf, birthDateOf, partsOf } from '../birthDate.js';

describe('birth dates', () => {
  const now = new Date('2026-09-28T12:00:00');

  it('accepts real past dates only', () => {
    expect(birthDateOf('10', '3', '2014', now)).toBe('2014-03-10');
    expect(birthDateOf('31', '2', '2014', now)).toBeNull();
    expect(birthDateOf('1', '1', '2027', now)).toBeNull();
    expect(birthDateOf('1', '1', '1900', now)).toBeNull();
  });

  it('counts whole years and splits a stored date for the form', () => {
    expect(ageOf('2010-09-28', now)).toBe(16);
    expect(ageOf('2010-09-29', now)).toBe(15);
    expect(partsOf('2014-03-10')).toEqual({ day: '10', month: '3', year: '2014' });
  });
});
