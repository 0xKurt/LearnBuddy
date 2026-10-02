// Diktat (issue #242): the check is exact, and a miss names the PLACE — read off a character
// diff of her answer against the key, without a model.

import { describe, expect, it } from 'vitest';

import {
  checkDictation,
  dictationForm,
  dictationItems,
  dictationReply,
  nearlyRight,
  standsIn,
  type DictationSpot,
} from '../dictation.js';

function spotOf(key: string, typed: string): DictationSpot {
  const r = checkDictation(key, typed);
  if (r.correct) throw new Error(`"${typed}" was accepted for "${key}"`);
  return r.spot;
}

describe('the check is exact and strict', () => {
  it('accepts exactly the key', () => {
    expect(checkDictation('Schwimmen', 'Schwimmen')).toEqual({ correct: true });
    expect(checkDictation('Der Hund bellt.', 'Der Hund bellt.')).toEqual({ correct: true });
  });

  it('folds only what no keyboard makes a spelling decision: spaces, the kind of quote, composition', () => {
    expect(checkDictation('Der Hund bellt.', '  Der  Hund bellt. ')).toEqual({ correct: true });
    expect(checkDictation('Peter’s dog', "Peter's dog")).toEqual({ correct: true });
    // "ä" as one code point and as "a" + combining diaeresis are one letter.
    expect(checkDictation('Bär', 'Bär')).toEqual({ correct: true });
  });

  it('never accepts another case, ß for ss, or missing punctuation', () => {
    expect(checkDictation('Hund', 'hund').correct).toBe(false);
    expect(checkDictation('Straße', 'Strasse').correct).toBe(false);
    expect(checkDictation('Fluss', 'Fluß').correct).toBe(false);
    expect(checkDictation('Der Hund bellt.', 'Der Hund bellt').correct).toBe(false);
  });
});

describe('the place is named by a character diff', () => {
  it('double consonant missing — "Doppel-m fehlt"', () => {
    expect(spotOf('Schwimmen', 'Schwimen')).toEqual({
      kind: 'double_missing',
      word: 'Schwimen',
      letter: 'm',
    });
    expect(dictationReply('de', spotOf('Schwimmen', 'Schwimen'))).toBe(
      'Fast – bei „Schwimen“ fehlt ein Doppel-m.',
    );
  });

  it('double consonant where there is none', () => {
    expect(spotOf('Hose', 'Hosse')).toEqual({ kind: 'double_extra', word: 'Hosse', letter: 's' });
  });

  it('ie written as i, and i written as ie', () => {
    expect(spotOf('Biene', 'Bine')).toEqual({ kind: 'ie_missing', word: 'Bine' });
    expect(dictationReply('de', spotOf('Biene', 'Bine'))).toBe(
      'Fast – bei „Bine“ fehlt das e: hier schreibt man ie.',
    );
    expect(spotOf('Kiste', 'Kieste')).toEqual({ kind: 'ie_extra', word: 'Kieste' });
  });

  it('capitalisation — "groß schreiben", and the other way', () => {
    expect(spotOf('Hund', 'hund')).toEqual({ kind: 'capital', word: 'hund' });
    expect(dictationReply('de', spotOf('Hund', 'hund'))).toBe(
      'Fast – „hund“ schreibt man hier groß.',
    );
    expect(spotOf('Der Hund bellt laut.', 'Der Hund Bellt laut.')).toEqual({
      kind: 'lower',
      word: 'Bellt',
    });
  });

  it('dass and das, in both directions', () => {
    expect(spotOf('Ich weiß, dass du kommst.', 'Ich weiß, das du kommst.')).toEqual({
      kind: 'double_missing',
      word: 'das',
      letter: 's',
    });
    expect(spotOf('Das Haus, das dort steht.', 'Das Haus, dass dort steht.')).toEqual({
      kind: 'double_extra',
      word: 'dass',
      letter: 's',
    });
  });

  it('ß against ss and against s', () => {
    expect(spotOf('Straße', 'Strasse')).toEqual({ kind: 'sz_needed', word: 'Strasse' });
    expect(spotOf('Straße', 'Strase')).toEqual({ kind: 'sz_needed', word: 'Strase' });
    expect(spotOf('Fluss', 'Fluß')).toEqual({ kind: 'ss_needed', word: 'Fluß' });
  });

  it('a missing, extra, wrong or swapped letter — the spot, never the key spelled out', () => {
    expect(spotOf('Fahrrad', 'Farrad')).toEqual({
      kind: 'letter_missing',
      word: 'Farrad',
      before: 'Fa',
    });
    expect(spotOf('Hund', 'Hundt')).toEqual({ kind: 'letter_extra', word: 'Hundt', letter: 't' });
    expect(spotOf('Hund', 'Hunt')).toEqual({
      kind: 'letter_wrong',
      word: 'Hunt',
      letter: 't',
      n: 4,
    });
    expect(spotOf('Vogel', 'Voegl')).toEqual({ kind: 'swapped', word: 'Voegl' });
    for (const [key, typed] of [
      ['Fahrrad', 'Farrad'],
      ['Hund', 'Hunt'],
      ['Vogel', 'Voegl'],
    ] as const) {
      expect(dictationReply('de', spotOf(key, typed))).not.toContain(key);
    }
  });

  it('a word missing, a word too many, two words that are one, one that is two', () => {
    expect(spotOf('Der kleine Hund bellt.', 'Der Hund bellt.')).toEqual({
      kind: 'word_missing',
      before: 'Der',
    });
    expect(spotOf('Der Hund bellt.', 'Der Hund bellt laut.')).toMatchObject({
      kind: 'word_extra',
    });
    expect(spotOf('Ich fahre Fahrrad.', 'Ich fahre Fahr rad.')).toEqual({
      kind: 'together',
      first: 'Fahr',
      second: 'rad',
    });
    expect(spotOf('Wir gehen zu Fuß.', 'Wir gehen zuFuß.')).toEqual({
      kind: 'apart',
      word: 'zuFuß',
    });
  });

  it('punctuation', () => {
    expect(spotOf('Der Hund bellt.', 'Der Hund bellt')).toEqual({
      kind: 'punctuation',
      word: 'bellt',
    });
  });

  it('something else entirely is "hear it again", not a letter-by-letter lesson', () => {
    const spot = spotOf('Schmetterling', 'Katze');
    expect(spot.kind).toBe('word_wrong');
    expect(nearlyRight(spot)).toBe(false);
    expect(nearlyRight(spotOf('Hund', 'hund'))).toBe(true);
  });

  it('every spot has a sentence in every language', () => {
    const spots: DictationSpot[] = [
      { kind: 'capital', word: 'x' },
      { kind: 'lower', word: 'x' },
      { kind: 'double_missing', word: 'x', letter: 'm' },
      { kind: 'double_extra', word: 'x', letter: 'm' },
      { kind: 'ie_missing', word: 'x' },
      { kind: 'ie_extra', word: 'x' },
      { kind: 'sz_needed', word: 'x' },
      { kind: 'ss_needed', word: 'x' },
      { kind: 'letter_missing', word: 'x', before: 'a' },
      { kind: 'letter_missing', word: 'x', before: '' },
      { kind: 'letter_extra', word: 'x', letter: 'm' },
      { kind: 'letter_wrong', word: 'x', letter: 'm', n: 2 },
      { kind: 'swapped', word: 'x' },
      { kind: 'word_wrong', word: 'x' },
      { kind: 'word_missing', before: 'a' },
      { kind: 'word_missing', before: '' },
      { kind: 'word_extra', word: 'x' },
      { kind: 'together', first: 'a', second: 'b' },
      { kind: 'apart', word: 'x' },
      { kind: 'punctuation', word: 'x' },
    ];
    for (const locale of ['de', 'en', 'fr', 'es', 'it']) {
      for (const spot of spots) {
        const said = dictationReply(locale, spot);
        expect(said).not.toMatch(/practice\.dictation|\{\{/);
      }
    }
  });
});

describe('where the words come from', () => {
  const speech = { available: true, localeFor: (l: string) => (l === 'de' ? 'de-DE' : null) };
  const draft = (entries: string[], from: 'list' | 'topic' = 'list') => ({
    from,
    lang: 'de',
    topic: 'Lernwörter',
    entries,
  });

  it('a list holds the model to her words: an entry it changed is not one of them', () => {
    const typed = 'Lernwörter: Schwimmen, Biene, Straße';
    const items = dictationItems(
      draft(['Schwimmen', 'Bienen', 'Strasse', 'Straße']),
      { text: typed, fromSheet: false },
      speech,
      'de',
    );
    expect(items.map((i) => i.answer)).toEqual(['Schwimmen', 'Straße']);
  });

  it('a sheet holds every entry to it, whatever the model said about where it came from', () => {
    const items = dictationItems(
      draft(['Hund', 'Katze'], 'topic'),
      { text: 'Mein Hund und ich', fromSheet: true },
      speech,
      'de',
    );
    expect(items.map((i) => i.answer)).toEqual(['Hund']);
  });

  it('the key is the recording, the line on the card never carries it, and the check is strict', () => {
    const [item] = dictationItems(
      draft(['Schwimmen'], 'topic'),
      { text: 'ie', fromSheet: false },
      speech,
      'de',
    );
    expect(item).toBeDefined();
    expect(item!.kind).toBe('spelling_dictation');
    expect(item!.listen_task).toEqual({ text: 'Schwimmen', lang: 'de' });
    expect(item!.answer).toBe('Schwimmen');
    expect(item!.spelling).toBe('strict');
    expect(item!.prompt).toBe('Hör gut zu und schreib das Wort.');
    expect(item!.prompt).not.toContain('Schwimmen');
    expect(item!.hints).toEqual([]);
  });

  it('no voice for the language, no Diktat; digits and markup are not spelling', () => {
    expect(
      dictationItems(
        { ...draft(['dog']), lang: 'en' },
        { text: 'dog', fromSheet: false },
        speech,
        'de',
      ),
    ).toEqual([]);
    expect(
      dictationItems(
        draft(['12 Äpfel', '<b>Hund</b>', 'Hund']),
        { text: '12 Äpfel <b>Hund</b> Hund', fromSheet: false },
        speech,
        'de',
      ).map((i) => i.answer),
    ).toEqual(['Hund']);
  });

  it('stands in the list as a whole word, case-sensitively', () => {
    expect(standsIn('Hund', 'Der Hund bellt')).toBe(true);
    expect(standsIn('hund', 'Der Hund bellt')).toBe(false);
    expect(standsIn('Hund', 'Hundehütte')).toBe(false);
    expect(dictationForm(' a  b ')).toBe('a b');
  });
});
