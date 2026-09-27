// The school year as her own school system names it, converted by code (audit M-39).
import { describe, expect, it } from 'vitest';

import { SchoolYear, schoolYearsOf } from '../decision.js';

describe('schoolYearsOf', () => {
  it('converts every system to years of schooling (German Klasse numbering)', () => {
    expect(schoolYearsOf({ system: 'de', klasse: 7 })).toBe(7);
    // Camille, 13: "je suis en 4e" is her 8th school year, not Klasse 4.
    expect(schoolYearsOf({ system: 'fr', classe: '4e' })).toBe(8);
    expect(schoolYearsOf({ system: 'fr', classe: 'CP' })).toBe(1);
    expect(schoolYearsOf({ system: 'fr', classe: 'Tle' })).toBe(12);
    expect(schoolYearsOf({ system: 'es', etapa: 'eso', curso: 2 })).toBe(8);
    expect(schoolYearsOf({ system: 'es', etapa: 'bachillerato', curso: 1 })).toBe(11);
    expect(schoolYearsOf({ system: 'it', scuola: 'media', classe: 3 })).toBe(8);
    expect(schoolYearsOf({ system: 'it', scuola: 'superiore', classe: 5 })).toBe(13);
    expect(schoolYearsOf({ system: 'uk', year: 8 })).toBe(7);
    expect(schoolYearsOf({ system: 'us', grade: 8 })).toBe(8);
  });

  it('refuses a label the system does not have', () => {
    expect(schoolYearsOf({ system: 'es', etapa: 'eso', curso: 5 })).toBeNull();
    expect(schoolYearsOf({ system: 'it', scuola: 'media', classe: 4 })).toBeNull();
    expect(SchoolYear.safeParse({ system: 'fr', classe: '7e' }).success).toBe(false);
    expect(SchoolYear.safeParse({ system: 'de', klasse: 14 }).success).toBe(false);
  });
});
