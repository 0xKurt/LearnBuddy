// How a number itself is read (issue #175, owner 01.10.: "alles was ich sage gilt immer
// allgemein") — the separator of a repeating decimal, and the forms that were measured as
// already right and must stay right. The words come from the real locale files, so what is
// checked here is what the app says out loud.

import { describe, expect, it } from 'vitest';

import { speakMathText } from '../speak.js';
import { wordsOf } from './words.js';

type Lang = 'de' | 'en' | 'fr' | 'es' | 'it';

const say = (text: string, lang: Lang = 'de') => speakMathText(text, wordsOf(lang));

describe('a repeating decimal says its separator', () => {
  it('says the separator that has no digit behind it', () => {
    // "0, Periode 3" leaves the comma as punctuation — a pause where the child has to hear
    // "Komma". Only a separator with nothing after it is spoken as a word.
    expect(say('$0{,}\\overline{3}$')).toBe('0 Komma Periode 3');
    expect(say('$2{,}\\overline{45}$')).toBe('2 Komma Periode 45');
    expect(say('$0{,}\\overline{3}$', 'en')).toBe('0 point 3 recurring');
    expect(say('$0{,}\\overline{3}$', 'fr')).toBe('0 virgule période 3');
    expect(say('$0{,}\\overline{3}$', 'es')).toBe('0 coma periodo 3');
    expect(say('$0{,}\\overline{3}$', 'it')).toBe('0 virgola periodo 3');
  });

  it('says the word of the language, whichever character marks the separator', () => {
    // The character differs between languages, the word comes from the locale: a German
    // text written with a point is still read "Komma".
    expect(say('$0.\\overline{3}$')).toBe('0 Komma Periode 3');
    expect(say('$0.\\overline{3}$', 'en')).toBe('0 point 3 recurring');
  });

  it('leaves a separator that already sits between digits alone', () => {
    // "1,2" is read "eins Komma zwei" by every voice; saying the word here would double it.
    expect(say('$1{,}2\\overline{3}$')).toBe('1,2 Periode 3');
    expect(say('$1{,}2\\overline{3}$', 'en')).toBe('1,2 3 recurring');
  });

  it('leaves a line over letters a segment', () => {
    expect(say('$\\overline{AB}$')).toBe('Strecke AB');
    expect(say('$\\overline{3}$')).toBe('Periode 3');
  });
});

describe('the number forms that were already right stay right', () => {
  it('leaves decimals and large numbers as written', () => {
    // Which of the two characters separates thousands and which separates decimals is not
    // in the characters — it is in the language of whoever wrote them. The voice reads them
    // in the learner's language; guessing here would be worse than passing them through.
    expect(say('$3{,}5$')).toBe('3,5');
    expect(say('$1.000$')).toBe('1.000');
    expect(say('$1.234.567$')).toBe('1.234.567');
    expect(say('$3{,}5$', 'en')).toBe('3,5');
    expect(say('$1,000$', 'en')).toBe('1,000');
    expect(say('Sie hat 1.000 Euro.')).toBe('Sie hat 1.000 Euro.');
    expect(say('Das sind 3,5 Meter.')).toBe('Das sind 3,5 Meter.');
  });

  it('reads a negative number, a percentage and a degree', () => {
    expect(say('$-4$')).toBe('minus 4');
    expect(say('$-4 + 7$')).toBe('minus 4 plus 7');
    expect(say('$20\\%$')).toBe('20 Prozent');
    expect(say('$90°$')).toBe('90 Grad');
    expect(say('$-4$', 'en')).toBe('minus 4');
    expect(say('$20\\%$', 'fr')).toBe('20 pour cent');
    expect(say('$20\\%$', 'es')).toBe('20 por ciento');
    expect(say('$20\\%$', 'it')).toBe('20 per cento');
  });

  it('reads a mixed number and a nested fraction as before', () => {
    expect(say('$1\\frac{1}{2} + 2\\frac{1}{4}$')).toBe('1 und ein Halb plus 2 und ein Viertel');
    expect(say('$3 + \\frac{1}{2}$')).toBe('3 plus ein Halb');
    expect(say('$\\frac{\\frac{1}{2}}{3}$')).toBe('Bruch: ein Halb, geteilt durch 3');
    expect(say('$\\frac{1}{\\frac{2}{3}}$')).toBe('Bruch: 1, geteilt durch 2 Drittel');
    expect(say('$\\frac{1{,}5}{2}$')).toBe('1,5 durch 2');
    expect(say('$\\frac{3}{1}$')).toBe('3 durch 1');
  });

  it('keeps a colon a division, in math and in plain text', () => {
    // One character, three meanings — division, ratio, time — and which one it is is not in
    // the characters. It stays the division German schools write (issue #175); a ratio has
    // to be marked by whoever writes it, not guessed by the reader (CLAUDE.md rule 3).
    expect(say('$3:4$')).toBe('3 geteilt durch 4');
    expect(say('Um 14:30 Uhr.')).toBe('Um 14:30 Uhr.');
  });
});
