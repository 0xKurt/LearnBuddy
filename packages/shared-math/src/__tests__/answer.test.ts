import { describe, expect, it } from 'vitest';

import { canonicalMath, canonicalText, isMathText } from '../answer.js';
import { plainMath } from '../latex.js';

describe('plainMath', () => {
  it('keeps a whole number apart from the fraction after it (C-5)', () => {
    expect(plainMath('$3\\frac{1}{2}$')).toBe('3 1/2');
    expect(plainMath('$1\\frac{11}{20}$')).toBe('1 11/20');
    expect(plainMath('$3\\,\\frac{1}{2}$')).toBe('3 1/2');
  });

  it('reads a reaction arrow as an arrow, not as a backslash word (#217)', () => {
    // The app's own renderer has always known it (lib/math/parse.ts SYMBOLS); server-side it
    // stayed raw, so anything built from plain text — a spoken sentence, a near-miss reply —
    // carried "\\rightarrow" instead of an arrow.
    expect(plainMath('$2 H_{2} + O_{2} \\rightarrow 2 H_{2}O$')).toContain('→');
    expect(plainMath('$a \\to b$')).toContain('→');
    expect(plainMath('$a \\longrightarrow b$')).toContain('→');
    expect(plainMath('$a \\rightleftharpoons b$')).toContain('⇌');
    expect(plainMath('$a \\rightarrow b$')).not.toContain('\\');
  });

  it('keeps the brackets of a numerator, denominator, root or power of several terms', () => {
    expect(plainMath('$\\frac{a+b}{c}$')).toBe('(a+b)/c');
    expect(plainMath('$\\sqrt{x+1}$')).toBe('√(x+1)');
    expect(plainMath('$x^{n+1}$')).toBe('x^(n+1)');
    expect(plainMath('$\\frac{3}{4}$')).toBe('3/4');
    expect(plainMath('$-\\frac{3}{4}$')).toBe('-3/4');
    expect(plainMath('$x^{2}+2x$')).toBe('x^2+2x');
  });

  it('writes relation symbols as characters', () => {
    expect(plainMath('$x \\le 3$')).toBe('x ≤ 3');
    expect(plainMath('$x \\leq 3$')).toBe('x ≤ 3');
    expect(plainMath('$\\left(1\\right)$')).toBe('(1)');
  });
});

describe('canonicalMath keeps what changes the meaning (C-6)', () => {
  const same = (a: string, b: string) => canonicalMath(a) === canonicalMath(b);

  it('treats the same math typed differently as the same', () => {
    expect(same('$x^{2}+2x$', 'x² + 2x')).toBe(true);
    expect(same('$\\frac{3}{4}$', '3/4')).toBe(true);
    expect(same('$2 \\cdot 3$', '2*3')).toBe(true);
    expect(same('x <= 3', '$x \\le 3$')).toBe(true);
    expect(same('−5', '-5')).toBe(true);
    expect(same('$\\sqrt{16}$', 'sqrt(16)')).toBe(true);
  });

  it('never merges a changed operator, sign, relation or separator', () => {
    expect(same('$x^{2}+2x$', 'x^2-2x')).toBe(false);
    expect(same('x=-5', 'x=5')).toBe(false);
    expect(same('x<3', 'x>3')).toBe(false);
    expect(same('$\\frac{3}{4}$', '3,4')).toBe(false);
    expect(same('$\\frac{3}{4}$', '3-4')).toBe(false);
    expect(same('$\\frac{3}{4}$', '3:4')).toBe(false);
    expect(same('-5', '5')).toBe(false);
    expect(same('$-\\frac{3}{4}$', '3/4')).toBe(false);
    expect(same('$3\\frac{1}{2}$', '31/2')).toBe(false);
    expect(same('X^2', 'x^2')).toBe(false);
  });
});

describe('canonicalText keeps case, ß and punctuation (C-7)', () => {
  it('only unifies spaces and Unicode composition', () => {
    expect(canonicalText('  die   Straße ')).toBe('die Straße');
    expect(canonicalText('e\u0301le\u0300ve')).toBe('élève');
    expect(canonicalText('Strasse')).not.toBe(canonicalText('Straße'));
    expect(canonicalText('l')).not.toBe(canonicalText('L'));
  });

  it('tells math from words', () => {
    expect(isMathText('x = 5')).toBe(true);
    expect(isMathText('$\\frac{3}{4}$')).toBe(true);
    expect(isMathText('-x')).toBe(true);
    expect(isMathText('E-Mail')).toBe(false);
    expect(isMathText("l'élève")).toBe(false);
    expect(isMathText('Ich glaube, dass er kommt.')).toBe(false);
  });
});
