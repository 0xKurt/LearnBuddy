// A fraction is not a division: 2/5 is "zwei Fünftel", not "zwei durch fünf"
// (issue #175, owner 01.10.: "darauf muss man sehr achten"). The words come from the real
// locale files (./words.ts), so what is checked here is what the app says out loud.

import { describe, expect, it } from 'vitest';

import { speakMathText } from '../speak.js';
import { wordsOf } from './words.js';

const frac = (num: number, den: number, lang: 'de' | 'en' | 'fr' | 'es' | 'it') =>
  speakMathText(`$\\frac{${num}}{${den}}$`, wordsOf(lang));

describe('fractions are named, not divided', () => {
  it('names the everyday fractions in German', () => {
    expect(frac(2, 5, 'de')).toBe('2 Fünftel');
    expect(frac(1, 2, 'de')).toBe('ein Halb');
    expect(frac(3, 2, 'de')).toBe('3 Halbe');
    expect(frac(1, 3, 'de')).toBe('ein Drittel');
    expect(frac(3, 4, 'de')).toBe('3 Viertel');
    expect(frac(7, 10, 'de')).toBe('7 Zehntel');
    expect(frac(1, 12, 'de')).toBe('ein Zwölftel');
    expect(frac(3, 20, 'de')).toBe('3 Zwanzigstel');
    expect(frac(1, 100, 'de')).toBe('ein Hundertstel');
  });

  it('names them in the other four school languages', () => {
    expect(frac(2, 5, 'en')).toBe('2 fifths');
    expect(frac(1, 2, 'en')).toBe('one half');
    expect(frac(3, 4, 'en')).toBe('3 quarters');
    expect(frac(2, 5, 'fr')).toBe('2 cinquièmes');
    expect(frac(1, 2, 'fr')).toBe('un demi');
    expect(frac(2, 3, 'fr')).toBe('2 tiers');
    expect(frac(2, 5, 'es')).toBe('2 quintos');
    expect(frac(1, 2, 'es')).toBe('un medio');
    expect(frac(3, 4, 'es')).toBe('3 cuartos');
    expect(frac(2, 5, 'it')).toBe('2 quinti');
    expect(frac(1, 2, 'it')).toBe('un mezzo');
    expect(frac(3, 4, 'it')).toBe('3 quarti');
  });

  it('falls back to the plain form where a language has no simple word', () => {
    // Clumsy, but true — never an invented word (CLAUDE.md rule 5).
    expect(frac(2, 75, 'de')).toBe('2 durch 75');
    expect(frac(2, 75, 'en')).toBe('2 over 75');
    expect(frac(1, 37, 'fr')).toBe('1 sur 37');
  });

  it('reads a mixed number as one number', () => {
    expect(speakMathText('$3\\frac{1}{2}$', wordsOf('de'))).toBe('3 und ein Halb');
    expect(speakMathText('$2\\frac{3}{4}$', wordsOf('de'))).toBe('2 und 3 Viertel');
    expect(speakMathText('$3\\frac{1}{2}$', wordsOf('en'))).toBe('3 and one half');
    expect(speakMathText('$3\\frac{1}{2}$', wordsOf('fr'))).toBe('3 et un demi');
    // No word for the denominator: the mixed number still reads, just plainly.
    expect(speakMathText('$3\\frac{1}{75}$', wordsOf('de'))).toBe('3 und 1 durch 75');
  });

  it('leaves a fraction with letters or a term in it alone', () => {
    expect(speakMathText('$\\frac{x}{3}$', wordsOf('de'))).toBe('x durch 3');
    expect(speakMathText('$\\frac{x+1}{2}$', wordsOf('de'))).toBe(
      'Bruch: x plus 1, geteilt durch 2',
    );
  });
});
