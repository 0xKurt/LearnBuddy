import { describe, it, expect } from 'vitest';

import { isNonAnswer } from '../give-up.js';

describe('isNonAnswer', () => {
  it('flags multilingual give-ups / help-requests / non-answers', () => {
    for (const s of [
      '',
      '   ',
      '?',
      '...',
      'weiß nicht',
      'Weiss nicht',
      'ich weiß es nicht',
      'keine Ahnung',
      'kA',
      'idk',
      "I don't know",
      'no idea',
      'not sure',
      'no sé',
      'ni idea',
      'je ne sais pas',
      'aucune idée',
      'non lo so',
      'boh',
      'hilf mir',
      'help me',
      'skip',
      'weiter',
    ]) {
      expect(isNonAnswer(s), `expected give-up: ${JSON.stringify(s)}`).toBe(true);
    }
  });

  it('does NOT flag genuine answers', () => {
    for (const s of [
      '4',
      'On-Chain-Attestierungen',
      'Die Hauptstadt ist Berlin',
      'x = 5',
      'weil die Zellmembran selektiv permeabel ist',
      'photosynthesis',
      'la cellule',
    ]) {
      expect(isNonAnswer(s), `expected real answer: ${JSON.stringify(s)}`).toBe(false);
    }
  });
});
