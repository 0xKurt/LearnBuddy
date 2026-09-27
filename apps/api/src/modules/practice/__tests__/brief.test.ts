import { describe, expect, it } from 'vitest';

import { cleanPunctuation, cutToWords, wordCount } from '../brief.js';

describe('"Kurz erklärt" is short and clean (live finding 7)', () => {
  it('counts words, a math run as one', () => {
    expect(wordCount('Der Dativ ist der 3. Fall.')).toBe(6);
    expect(wordCount('Kürze $\\frac{6}{8}$ so weit wie möglich.')).toBe(6);
  });

  it('removes doubled punctuation, keeps an ellipsis', () => {
    expect(cleanPunctuation('Du fragst mit dem Frage-Wort "Wem?". Weiter.')).toBe(
      'Du fragst mit dem Frage-Wort "Wem?" Weiter.',
    );
    expect(cleanPunctuation('Wem?. Dem Hund!. Gut..')).toBe('Wem? Dem Hund! Gut.');
    expect(cleanPunctuation('Und dann ... weiter …')).toBe('Und dann ... weiter …');
    expect(cleanPunctuation('Pourquoi ?')).toBe('Pourquoi ?');
    expect(cleanPunctuation('Wirklich??')).toBe('Wirklich?');
  });

  it('cuts after the last whole sentence within the limit', () => {
    const text = 'Eins zwei drei. Vier fünf sechs.\n\nSieben acht neun zehn.';
    expect(cutToWords(text, 6)).toBe('Eins zwei drei. Vier fünf sechs.');
    expect(cutToWords(text, 100)).toBe(text);
    // Never empty: the first sentence stays.
    expect(cutToWords('Eins zwei drei vier. Fünf.', 2)).toBe('Eins zwei drei vier.');
  });
});
