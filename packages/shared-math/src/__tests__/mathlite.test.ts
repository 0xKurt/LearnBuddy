import { describe, expect, it } from 'vitest';
import { parseMathLite } from '../mathlite.js';

// One row per MathLite table entry in docs/07 §4.2.
describe('MathLite syntax table', () => {
  const cases: Array<{ input: string; latex: string; mathjsContains?: string }> = [
    { input: 'x + 2', latex: 'x + 2', mathjsContains: 'x + 2' },
    { input: '2*x', latex: '2x', mathjsContains: '2 * x' },
    { input: '2x', latex: '2x', mathjsContains: '2 * x' },
    { input: '(a+b)/(c-d)', latex: '\\frac{a + b}{c - d}' },
    { input: 'x^2', latex: 'x^{2}', mathjsContains: 'x ^ 2' },
    { input: 'x^(n+1)', latex: 'x^{n + 1}' },
    { input: 'sqrt(9)', latex: '\\sqrt{9}', mathjsContains: 'sqrt(9)' },
    { input: 'sqrt[3](27)', latex: '\\sqrt[3]{27}', mathjsContains: 'nthRoot(27, 3)' },
    { input: 'pi', latex: '\\pi', mathjsContains: 'pi' },
    { input: 'inf', latex: '\\infty', mathjsContains: 'Infinity' },
    { input: 'Delta x', latex: '\\Delta x' },
    { input: '2 >= 1', latex: '2 \\geq 1' },
    { input: '2 <= 1', latex: '2 \\leq 1' },
    { input: '2 != 1', latex: '2 \\neq 1' },
    { input: 'sin(x)', latex: '\\sin(x)' },
    { input: 'log(x)', latex: '\\log(x)' },
    { input: 'ln(x)', latex: '\\ln(x)' },
    { input: 'abs(x)', latex: '\\lvert x \\rvert' },
    { input: '(a; b)', latex: '(a;\\,b)' },
  ];

  for (const c of cases) {
    it(`parses "${c.input}" -> "${c.latex}"`, () => {
      const r = parseMathLite(c.input);
      expect(r.errors, JSON.stringify(r.errors)).toEqual([]);
      expect(r.latex).toBe(c.latex);
      if (c.mathjsContains) {
        expect(r.mathjs).toContain(c.mathjsContains);
      }
    });
  }
});

describe('MathLite error reporting', () => {
  it('reports unexpected characters with positions', () => {
    const r = parseMathLite('x + @');
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]!.pos.start).toBe(4);
  });

  it('reports unbalanced parens', () => {
    const r = parseMathLite('(1 + 2');
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe('MathLite implicit multiplication', () => {
  it('treats 2x as 2 * x', () => {
    const r = parseMathLite('2x');
    expect(r.errors).toEqual([]);
    expect(r.mathjs).toContain('2 * x');
  });

  it('treats x(y+1) as x * (y+1)', () => {
    const r = parseMathLite('x(y+1)');
    expect(r.errors).toEqual([]);
    expect(r.mathjs).toContain('x * ');
  });
});
