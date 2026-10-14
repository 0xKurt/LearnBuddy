import { describe, expect, it } from 'vitest';

import { nearestWord, signsAround, touchReach, type WordBox } from '../spokenWords.js';

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

describe('the tappable words at normal spacing (#625)', () => {
  // "The weather is nice" on one line of 29 pt, a space of 6 pt between the words.
  const line: WordBox[] = [
    { x: 0, y: 0, width: 40, height: 29 },
    { x: 46, y: 0, width: 80, height: 29 },
    { x: 132, y: 0, width: 16, height: 29 },
    { x: 154, y: 0, width: 42, height: 29 },
  ];

  it('reaches out from a short word to the full touch target, and not from a long one', () => {
    expect(touchReach(line[2], 44)).toEqual({ x: 14, y: 7.5 });
    expect(touchReach(line[1], 44)).toEqual({ x: 0, y: 7.5 });
    expect(touchReach(undefined, 44)).toEqual({ x: 0, y: 0 });
  });

  it('gives a press inside the reach of "is" but on "weather" to "weather"', () => {
    // "is" reaches 14 pt left of its box (118…148): 120 lies on the end of "weather".
    expect(nearestWord({ x: 120, y: 14 }, line, 2)).toBe(1);
    expect(nearestWord({ x: 120, y: 14 }, line, 1)).toBe(1);
  });

  it('gives a press in the space to the nearer word, whichever area lies on top', () => {
    expect(nearestWord({ x: 128, y: 14 }, line, 2)).toBe(1);
    expect(nearestWord({ x: 131, y: 14 }, line, 1)).toBe(2);
    expect(nearestWord({ x: 150, y: 14 }, line, 3)).toBe(2);
  });

  it('keeps a press above the line with the word right under it', () => {
    expect(nearestWord({ x: 140, y: -7 }, line, 2)).toBe(2);
    expect(nearestWord({ x: 120, y: -7 }, line, 2)).toBe(1);
  });

  it('keeps the pressed word on a tie and before the words are laid out', () => {
    expect(nearestWord({ x: 43, y: 14 }, line, 1)).toBe(1);
    expect(nearestWord({ x: 43, y: 14 }, line, 0)).toBe(0);
    expect(nearestWord({ x: 120, y: 14 }, [], 2)).toBe(2);
  });
});
