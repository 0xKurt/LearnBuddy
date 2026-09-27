// Quote provenance (audit S-6 p2-sec-quote-provenance-two-chars, N-2 quote-checked-against-trigger-only).

import { describe, expect, it } from 'vitest';

import { quoteOccursIn } from '../text.js';

describe('quoteOccursIn', () => {
  it('accepts whole words as written, ignoring case, quotes and edge punctuation', () => {
    expect(
      quoteOccursIn('Mathearbeit am Freitag', 'Ich hab am Montag eine mathearbeit am freitag!'),
    ).toBe(true);
    expect(quoteOccursIn('„nicht nach 19 Uhr“', 'Bitte nicht nach 19 Uhr.')).toBe(true);
  });

  it('refuses fragments of words (the two-character loophole)', () => {
    expect(quoteOccursIn('ge', 'Mein Papa hat mich geschlagen')).toBe(false);
    expect(quoteOccursIn('schlagen', 'Mein Papa hat mich geschlagen')).toBe(false);
    expect(quoteOccursIn('Mathe', 'Mathearbeit am Freitag')).toBe(false);
  });

  it('a very short quote counts only as the whole message', () => {
    expect(quoteOccursIn('Ja', 'ja!')).toBe(true);
    expect(quoteOccursIn('ja', 'Ja, aber nicht heute')).toBe(false);
    expect(quoteOccursIn('ok', ['Mathe am Freitag', 'ok'])).toBe(true);
  });

  it('accepts words from any message of the run the turn answers (split utterances)', () => {
    const run = ['Mathearbeit am Freitag', 'über Brüche'];
    expect(quoteOccursIn('über Brüche', run)).toBe(true);
    expect(quoteOccursIn('Mathearbeit am Freitag', run)).toBe(true);
    expect(quoteOccursIn('Geschichte', run)).toBe(false);
  });

  it('refuses empty quotes', () => {
    expect(quoteOccursIn('  ..', 'irgendwas')).toBe(false);
  });
});
