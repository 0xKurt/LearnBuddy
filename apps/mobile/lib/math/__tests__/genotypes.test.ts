// Genotypes a screen reader can tell apart (issue #352): "$AA$", "$Aa$" and "$aa$" are three
// different answer options, but a voice does not say case — before this they all came out
// "A A". The words come from the real locale files, so this is what the app says out loud.

import { describe, expect, it } from 'vitest';

import { speakMathText } from '../speak.js';
import { wordsOf } from './words.js';

type Lang = 'de' | 'en' | 'fr' | 'es' | 'it';
const LANGS: readonly Lang[] = ['de', 'en', 'fr', 'es', 'it'];
const say = (text: string, lang: Lang = 'de') => speakMathText(text, wordsOf(lang));

/** The options exactly as shared-math `genotypeOptions` writes them. */
const AUTOSOMAL = ['$AA$', '$Aa$', '$aa$'];
const X_FEMALE = ['$X^{A}X^{A}$', '$X^{A}X^{a}$', '$X^{a}X^{a}$'];
const X_MALE = ['$X^{A}Y$', '$X^{a}Y$'];

describe('a genotype says the case of each allele', () => {
  it('reads AA, Aa, aa with groß/klein in German', () => {
    expect(AUTOSOMAL.map((g) => say(g))).toEqual([
      'groß A, groß A',
      'groß A, klein a',
      'klein a, klein a',
    ]);
  });

  it('reads the gonosomal forms with the X and the Y', () => {
    expect(X_FEMALE.map((g) => say(g))).toEqual([
      'X groß A, X groß A',
      'X groß A, X klein a',
      'X klein a, X klein a',
    ]);
    expect(X_MALE.map((g) => say(g))).toEqual(['X groß A, Y', 'X klein a, Y']);
  });

  it('reads them idiomatically in the other four', () => {
    expect(say('$Aa$', 'en')).toBe('capital A, small a');
    expect(say('$Aa$', 'fr')).toBe('A majuscule, a minuscule');
    expect(say('$Aa$', 'es')).toBe('A mayúscula, a minúscula');
    expect(say('$Aa$', 'it')).toBe('A maiuscola, a minuscola');
    expect(say('$X^{a}Y$', 'en')).toBe('X small a, Y');
  });

  it.each(LANGS)('keeps every option of a set distinct by ear in %s', (lang) => {
    for (const set of [AUTOSOMAL, X_FEMALE, X_MALE]) {
      const spoken = set.map((g) => say(g, lang).toLowerCase());
      expect(new Set(spoken).size).toBe(set.length);
    }
  });

  it('reads the genotype inside a sentence too', () => {
    expect(say('Person 5 hat $Aa$.')).toBe('Person 5 hat groß A, klein a.');
  });
});

describe('only a genotype, decided by structure', () => {
  it('leaves two different letters as they are', () => {
    expect(say('$ab$')).toBe('ab');
    expect(say('$AB$')).toBe('AB');
  });

  it('leaves a longer run and ordinary powers of X as math', () => {
    expect(say('$AAa$')).toBe('AAa');
    expect(say('$X^{2}$')).toBe('X hoch 2');
    expect(say('$X^{a}$')).toBe('X hoch a');
    // Two different alleles on the two X are no genotype of one gene.
    expect(say('$X^{A}X^{b}$')).toBe('X hoch A X hoch b');
  });

  it('only when the whole math run is the genotype', () => {
    expect(say('$2AA$')).toBe('2AA');
  });
});
