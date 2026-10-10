import { describe, expect, it } from 'vitest';

import { dollarMathField, dollarMathRuns, fractionChoice } from '../dollarMath.js';

describe('dollarMathRuns', () => {
  it('wraps only the LaTeX in a sentence, never the words around it (M-43)', () => {
    expect(dollarMathRuns('Kürze den Bruch \\frac{6}{8} so weit wie möglich.')).toBe(
      'Kürze den Bruch $\\frac{6}{8}$ so weit wie möglich.',
    );
    expect(dollarMathRuns('Berechne \\frac{1}{2} + \\frac{1}{3}.')).toBe(
      'Berechne $\\frac{1}{2} + \\frac{1}{3}$.',
    );
    expect(dollarMathRuns('Ist 3 \\cdot 4 = 12?')).toBe('Ist $3 \\cdot 4 = 12$?');
    expect(dollarMathRuns('Löse x^{2} = 9 und prüfe.')).toBe('Löse $x^{2} = 9$ und prüfe.');
  });

  it('leaves text with dollars or without LaTeX alone', () => {
    expect(dollarMathRuns('Kürze $\\frac{6}{8}$.')).toBe('Kürze $\\frac{6}{8}$.');
    expect(dollarMathRuns('Wie viel ist 3 + 4?')).toBe('Wie viel ist 3 + 4?');
  });

  it('keeps line breaks and spacing of the sentence', () => {
    expect(dollarMathRuns('a)\n\\sqrt{16} =')).toBe('a)\n$\\sqrt{16}$ =');
  });
});

describe('dollarMathField', () => {
  it('wraps a whole math field', () => {
    expect(dollarMathField('\\frac{3}{4}')).toBe('$\\frac{3}{4}$');
    expect(dollarMathField('12')).toBe('12');
  });
});

// A fraction written as text in an option ("2/3") is set as one (issue #521): the tile and her
// answer bubble show a stacked fraction, never a slash. Only a whole option that IS a fraction of
// whole numbers (or a mixed number); words with a slash and calculations stay as written.
describe('fractionChoice', () => {
  it('sets a fraction, a negative one and a mixed number', () => {
    expect(fractionChoice('2/3')).toBe('$\\frac{2}{3}$');
    expect(fractionChoice(' 12 / 25 ')).toBe('$\\frac{12}{25}$');
    expect(fractionChoice('-3/4')).toBe('$-\\frac{3}{4}$');
    expect(fractionChoice('1 1/2')).toBe('$1\\frac{1}{2}$');
  });

  it('leaves words, calculations, decimals and math already set alone', () => {
    for (const plain of ['und/oder', '2/3 kg', '1/2 + 1/3', '0,5', '3', '$\\frac{2}{3}$', 'a/b'])
      expect(fractionChoice(plain)).toBe(plain);
  });
});
