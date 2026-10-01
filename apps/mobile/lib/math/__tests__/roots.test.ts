// A root with an index is read with an ordinal, not with a full stop: $\sqrt[4]{16}$ is
// "vierte Wurzel aus 16", never "4. Wurzel aus 16" — a voice reads that "vier Punkt"
// (issue #175, owner 01.10.: "das mit der aussprache sollte generell immer passen").
// The words come from the real locale files (./words.ts), so what is checked here is what
// the app says out loud.

import { describe, expect, it } from 'vitest';

import { speakMathText } from '../speak.js';
import { wordsOf } from './words.js';

type Lang = 'de' | 'en' | 'fr' | 'es' | 'it';

const root = (index: string, body: string, lang: Lang) =>
  speakMathText(`$\\sqrt[${index}]{${body}}$`, wordsOf(lang));

describe('a root index is an ordinal', () => {
  it('names the index in German', () => {
    expect(root('4', '16', 'de')).toBe('vierte Wurzel aus 16');
    expect(root('5', '32', 'de')).toBe('fünfte Wurzel aus 32');
    expect(root('7', 'x', 'de')).toBe('siebte Wurzel aus x');
    expect(root('10', '1024', 'de')).toBe('zehnte Wurzel aus 1024');
    expect(root('20', 'x', 'de')).toBe('zwanzigste Wurzel aus x');
  });

  it('names it in the other four school languages', () => {
    expect(root('4', '16', 'en')).toBe('fourth root of 16');
    expect(root('12', 'x', 'en')).toBe('twelfth root of x');
    expect(root('4', '16', 'fr')).toBe('racine quatrième de 16');
    expect(root('9', 'x', 'fr')).toBe('racine neuvième de x');
    expect(root('4', '16', 'es')).toBe('raíz cuarta de 16');
    expect(root('10', 'x', 'es')).toBe('raíz décima de x');
    expect(root('4', '16', 'it')).toBe('radice quarta di 16');
    expect(root('11', 'x', 'it')).toBe('radice undicesima di x');
  });

  it('keeps the idiomatic name for the square and the cube root', () => {
    // These are not "zweite"/"dritte Wurzel" in every language, so they keep their own word.
    expect(speakMathText('$\\sqrt{9}$', wordsOf('de'))).toBe('Wurzel aus 9');
    expect(root('2', '9', 'de')).toBe('Wurzel aus 9');
    expect(root('3', '27', 'de')).toBe('dritte Wurzel aus 27');
    expect(root('3', '27', 'en')).toBe('cube root of 27');
    expect(root('3', '27', 'fr')).toBe('racine cubique de 27');
    expect(root('3', '27', 'es')).toBe('raíz cúbica de 27');
    expect(root('3', '27', 'it')).toBe('radice cubica di 27');
  });

  it('falls back to the plain form where the language has no ordinal', () => {
    // Clumsy, but true — never an invented word (CLAUDE.md rule 5). A letter index and an
    // index above 20 do not occur in this app's grades; nothing is made up for them.
    expect(root('n', 'x', 'de')).toBe('n. Wurzel aus x');
    expect(root('25', 'x', 'de')).toBe('25. Wurzel aus x');
    expect(root('n', 'x', 'en')).toBe('root n of x');
    expect(root('n', 'x', 'fr')).toBe('racine n-ième de x');
    expect(root('n', 'x', 'es')).toBe('raíz de índice n de x');
    expect(root('n', 'x', 'it')).toBe('radice di indice n di x');
  });

  it('still reads a root around other math', () => {
    expect(root('4', '\\sqrt{16}', 'de')).toBe('vierte Wurzel aus Wurzel aus 16');
    expect(speakMathText('$\\sqrt{\\frac{1}{4}}$', wordsOf('de'))).toBe('Wurzel aus ein Viertel');
    expect(speakMathText('$\\sqrt{\\frac{1}{4}}$', wordsOf('en'))).toBe(
      'square root of one quarter',
    );
  });
});
