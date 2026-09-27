import { describe, expect, it } from 'vitest';

import { formatIsoWeekdays } from '../time.js';

describe('avoided weekdays in words (p2-set-contact-card-omits-avoided-weekdays)', () => {
  it('names ISO weekdays in order, in the learner language', () => {
    expect(formatIsoWeekdays([7, 6], 'de')).toBe('Samstag, Sonntag');
    expect(formatIsoWeekdays([1], 'en')).toBe('Monday');
    expect(formatIsoWeekdays([3], 'fr')).toBe('mercredi');
  });

  it('says nothing for no days and ignores values outside 1–7', () => {
    expect(formatIsoWeekdays([], 'de')).toBe('');
    expect(formatIsoWeekdays([0, 8, 5], 'de')).toBe('Freitag');
  });
});
