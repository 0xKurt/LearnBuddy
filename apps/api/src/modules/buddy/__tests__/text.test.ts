// Quote provenance (audit S-6 p2-sec-quote-provenance-two-chars, N-2 quote-checked-against-trigger-only).

import { describe, expect, it } from 'vitest';

import { holdsWordPairs, quoteOccursIn } from '../text.js';

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

// A vocabulary offer is a button over the pairs its text holds; a title holds none, so that
// button could never start (issue #196). Structure only — no word, language or subject in it.
describe('holdsWordPairs', () => {
  it('accepts a list, however she wrote it', () => {
    expect(holdsWordPairs('la chambre – the bedroom\nle lit – the bed')).toBe(true);
    expect(holdsWordPairs('le chien – der Hund, la souris – die Maus')).toBe(true);
    // Separated without a dash, as a child types it into the chat.
    expect(holdsWordPairs('la chambre das zimmer, le lit das bett')).toBe(true);
    expect(holdsWordPairs('la chambre: das Zimmer')).toBe(true);
    expect(holdsWordPairs('casa = Haus')).toBe(true);
    // One pair on one line is a list of one.
    expect(holdsWordPairs('la fenêtre – das Fenster')).toBe(true);
  });

  it('refuses a name for a list — the shape that reached the chat as a dead button', () => {
    expect(holdsWordPairs('French vocabulary Unité 3')).toBe(false);
    expect(holdsWordPairs('Vokabeln Unité 3')).toBe(false);
    expect(holdsWordPairs('meine Französisch Vokabeln')).toBe(false);
    expect(holdsWordPairs('')).toBe(false);
    expect(holdsWordPairs('   ')).toBe(false);
    // A separator with nothing on one side of it is still just a name.
    expect(holdsWordPairs('Unité 3 –')).toBe(false);
    expect(holdsWordPairs('- Vokabeln')).toBe(false);
  });
});
