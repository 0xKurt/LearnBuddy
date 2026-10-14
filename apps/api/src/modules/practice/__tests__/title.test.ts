// A run's name stands whole on one line of the practice header (#642): "Arbeitsblatt Brüche -
// Klasse 6", the title read off the sheet, stood there as "Arbeitsblatt Brüche - Kl…". Every prompt
// that names a material or a run asks for the same title, short enough for a 360 pt phone.

import { describe, expect, it } from 'vitest';

import { EXTRACT_SYSTEM, HOMEWORK_SYSTEM } from '../../materials/extract.js';
import { GENERATE_SYSTEM } from '../generate.js';
import { TITLE_CHARS, TITLE_RULES } from '../title.js';

describe('the title rule (#642)', () => {
  it.each([
    ['a sheet', EXTRACT_SYSTEM],
    ['homework', HOMEWORK_SYSTEM],
    ['a run Buddy writes', GENERATE_SYSTEM],
  ])('names %s within the header’s room', (_name, prompt) => {
    expect(prompt).toContain(TITLE_RULES);
    expect(prompt).toContain(`at most ${TITLE_CHARS} characters`);
  });

  it('fits the 17 pt bold title in the 132 pt a 360 pt phone leaves it', () => {
    // Measured in Figtree Bold 17: "Brüche addieren" (15 letters) is 125 pt wide.
    expect(TITLE_CHARS).toBeLessThanOrEqual(16);
  });

  it('gives the model no sample title to copy', () => {
    for (const prompt of [EXTRACT_SYSTEM, HOMEWORK_SYSTEM, GENERATE_SYSTEM])
      expect(prompt).not.toMatch(/Title: short, what it is about \(e\.g\./);
  });
});
