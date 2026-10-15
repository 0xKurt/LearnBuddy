// The tutor reads the stretch of her sheet where a question stands (KI-Audit F15, #674).

import { describe, expect, it } from 'vitest';

import { MATERIAL_CHARS, passageFor } from '../sourcePassage.js';

/** A long sheet: filler pages, then the task the question is about, then more filler. */
function longSheet(): string {
  const filler = (page: number) =>
    Array.from(
      { length: 40 },
      (_, n) => `Seite ${page} Zeile ${n}: Wiederholung der Grundlagen.`,
    ).join('\n');
  return [
    filler(1),
    filler(2),
    filler(3),
    'Aufgabe 7: Die Photosynthese findet in den Chloroplasten statt. Nenne den Farbstoff.',
    filler(4),
  ].join('\n');
}

describe('the part of her sheet the tutor reads', () => {
  it('is the whole sheet when it fits', () => {
    expect(passageFor('kurz', 'Frage')).toBe('kurz');
    expect(passageFor(null, 'Frage')).toBeNull();
  });

  it('is the stretch where the question stands, also past the first characters', () => {
    const sheet = longSheet();
    expect(sheet.indexOf('Aufgabe 7')).toBeGreaterThan(MATERIAL_CHARS);
    // Main gave the tutor the first characters only: the task was not in them.
    expect(sheet.slice(0, MATERIAL_CHARS)).not.toContain('Chloroplasten');
    const passage = passageFor(sheet, 'Welchen Farbstoff enthalten die Chloroplasten?')!;
    expect(passage).toContain('Aufgabe 7: Die Photosynthese findet in den Chloroplasten statt.');
    expect(passage.length).toBeLessThanOrEqual(MATERIAL_CHARS + 2);
  });

  it('is the beginning when none of the question’s words stand on the sheet', () => {
    const sheet = longSheet();
    expect(passageFor(sheet, 'Wie heisst die Hauptstadt von Frankreich?')).toBe(
      sheet.slice(0, MATERIAL_CHARS),
    );
  });
});
