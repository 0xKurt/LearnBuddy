import { describe, expect, it } from 'vitest';

import { nextSentences } from '../sentences.js';

describe('nextSentences', () => {
  it('hands out each sentence once it is complete', () => {
    const full = 'Klar! Ein Nenner steht unten. Zum Beispiel bei 3/4 ist es die 4.';
    const spoken: string[] = [];
    let upTo = 0;
    for (let n = 1; n <= full.length; n++) {
      const r = nextSentences(full.slice(0, n), upTo, false);
      spoken.push(...r.parts);
      upTo = r.upTo;
    }
    spoken.push(...nextSentences(full, upTo, true).parts);
    expect(spoken).toEqual([
      'Klar!',
      'Ein Nenner steht unten.',
      'Zum Beispiel bei 3/4 ist es die 4.',
    ]);
  });

  it('does not end a sentence at an abbreviation or a decimal point', () => {
    expect(nextSentences('Nimm z. B. 3.5 Liter. Dann', 0, false).parts).toEqual([
      'Nimm z. B. 3.5 Liter.',
    ]);
  });

  it('ends a sentence at a line break and keeps closing quotes', () => {
    expect(nextSentences('Sag „Hallo.“ Dann\nweiter', 0, true).parts).toEqual([
      'Sag „Hallo.“',
      'Dann',
      'weiter',
    ]);
  });
});
