import { describe, expect, it } from 'vitest';

import { signsAround } from '../spokenWords.js';

const words = (...texts: string[]) => texts.map((text) => ({ text }));

describe('the judged words as the sentence writes them (#599 correction)', () => {
  it('gives each word the signs that stand at it in the sentence: the final stop is not lost', () => {
    expect(
      signsAround('The weather is nice today.', words('The', 'weather', 'is', 'nice', 'today')),
    ).toEqual([
      { before: '', after: '' },
      { before: '', after: '' },
      { before: '', after: '' },
      { before: '', after: '' },
      { before: '', after: '.' },
    ]);
  });

  it('keeps commas, quotes and the Spanish opening marks where they stand', () => {
    expect(signsAround('¿Dónde está, «Ana»?', words('Dónde', 'está', 'Ana'))).toEqual([
      { before: '¿', after: '' },
      { before: '', after: ',' },
      { before: '«', after: '»?' },
    ]);
  });

  it('finds a word whatever its case and accents, and passes over a word that was not judged', () => {
    expect(signsAround('Oui, c’est l’école!', words('oui', "l'ecole"))).toEqual([
      { before: '', after: ',' },
      { before: '', after: '!' },
    ]);
  });

  it('adds nothing to a word the sentence does not hold, and goes on after it', () => {
    expect(signsAround('Hello, world.', words('Hallo', 'world'))).toEqual([
      { before: '', after: '' },
      { before: '', after: '.' },
    ]);
  });
});
