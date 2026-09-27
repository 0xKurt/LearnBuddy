import { describe, expect, it } from 'vitest';

import { dollarMathField, dollarMathRuns } from '../dollarMath.js';

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
