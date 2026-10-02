// A question written for a task marked on a corrected test must not be that task again
// (issue #259, rule 0): reject, never repair. Purely mechanical — numbers, then words.

import { describe, expect, it } from 'vitest';

import { differsFromOriginal } from '../extract.js';

describe('a new question for a marked task', () => {
  it('is rejected when it is the original, however it is spaced or punctuated', () => {
    expect(differsFromOriginal('Berechne 3/4 + 1/8', 'Berechne 3/4 + 1/8')).toBe(false);
    expect(differsFromOriginal('berechne: 3/4+1/8!', 'Berechne 3/4 + 1/8')).toBe(false);
  });

  it('is rejected when it still holds every number of the original', () => {
    expect(differsFromOriginal('Berechne 1/8 + 3/4', 'Berechne 3/4 + 1/8')).toBe(false);
    expect(differsFromOriginal('Berechne 3/4 + 1/8 + 1/2', 'Berechne 3/4 + 1/8')).toBe(false);
    expect(differsFromOriginal('Rechne 3,5 · 2', 'Rechne 3.5 · 2')).toBe(false);
  });

  it('is kept with other numbers of the same type', () => {
    expect(differsFromOriginal('Berechne 2/3 + 1/6', 'Berechne 3/4 + 1/8')).toBe(true);
    // A number that only contains the original's digits is another number.
    expect(differsFromOriginal('Berechne 13 + 54', 'Berechne 3 + 5')).toBe(true);
  });

  it('needs other words when the task has no numbers', () => {
    expect(differsFromOriginal('Übersetze: the dog', 'Übersetze: the dog')).toBe(false);
    expect(differsFromOriginal('Übersetze: the cat', 'Übersetze: the dog')).toBe(true);
    // The original standing whole inside it is still the original.
    expect(differsFromOriginal('Nochmal: Übersetze the dog', 'Übersetze the dog')).toBe(false);
    expect(
      differsFromOriginal('Schreibe den Plural von Maus', 'Schreibe den Plural von Haus'),
    ).toBe(true);
  });
});
