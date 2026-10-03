import { describe, expect, it } from 'vitest';

import { judgementFault } from '../speak.js';

const TARGET = "Je m'appelle Lena.";
const words = (...w: Array<[string, boolean]>) => w.map(([text, ok]) => ({ text, ok }));

describe('a pronunciation judgement holds together (#227 A8)', () => {
  it('accepts what agrees with itself and with the sentence', () => {
    expect(
      judgementFault(TARGET, {
        audible: true,
        overall: 'good',
        words: words(['Je', true], ["m'appelle", true], ['Lena', true]),
      }),
    ).toBeNull();
    expect(
      judgementFault(TARGET, {
        audible: true,
        overall: 'almost',
        words: words(['Je', true], ['m’appelle', false], ['Lena.', true]),
      }),
    ).toBeNull();
    // A word left out is no contradiction; case and accents are not what is compared here.
    expect(
      judgementFault('Où est la gare ?', {
        audible: true,
        overall: 'retry',
        words: words(['ou', false], ['gare', true]),
      }),
    ).toBeNull();
  });

  it('rejects "good" with a word that was not ok, and "almost"/"retry" with every word ok', () => {
    expect(
      judgementFault(TARGET, {
        audible: true,
        overall: 'good',
        words: words(['Je', true], ["m'appelle", false], ['Lena', true]),
      }),
    ).toBe('overall_contradicts_words');
    for (const overall of ['almost', 'retry'] as const) {
      expect(
        judgementFault(TARGET, {
          audible: true,
          overall,
          words: words(['Je', true], ["m'appelle", true], ['Lena', true]),
        }),
      ).toBe('overall_contradicts_words');
    }
  });

  it('rejects words that are not the sentence, or not in its order', () => {
    expect(
      judgementFault(TARGET, {
        audible: true,
        overall: 'almost',
        words: words(['Je', true], ['suis', false], ['Lena', true]),
      }),
    ).toBe('not_in_target');
    expect(
      judgementFault(TARGET, {
        audible: true,
        overall: 'almost',
        words: words(['Lena', true], ['Je', false]),
      }),
    ).toBe('not_in_target');
    expect(judgementFault(TARGET, { audible: true, overall: 'good', words: [] })).toBe('no_words');
  });

  it('asks nothing of an inaudible recording: that is "retry" whatever it says', () => {
    expect(judgementFault(TARGET, { audible: false, overall: 'good', words: [] })).toBeNull();
  });
});
