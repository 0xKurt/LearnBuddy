import { describe, expect, it } from 'vitest';
import {
  compileExpression,
  evaluateExpression,
  parseExpression,
  variablesOf,
} from '../expression.js';

function at(expr: string, x: number): number {
  const f = compileExpression(expr);
  if (!f) throw new Error(`did not compile: ${expr}`);
  return f(x);
}

describe('compileExpression — precedence', () => {
  it('multiplies before adding', () => {
    expect(at('1 + 2 * 3', 0)).toBe(7);
    expect(at('2 * x + 1', 4)).toBe(9);
  });
  it('divides left to right', () => {
    expect(at('8 / 4 / 2', 0)).toBe(1);
    expect(at('10 - 4 - 3', 0)).toBe(3);
  });
  it('powers bind tighter than unary minus and are right-associative', () => {
    expect(at('-x^2', 3)).toBe(-9);
    expect(at('2^3^2', 0)).toBe(512);
    expect(at('2^-1', 0)).toBe(0.5);
    expect(at('(-2)^2', 0)).toBe(4);
  });
  it('respects parentheses', () => {
    expect(at('(1 + 2) * 3', 0)).toBe(9);
    expect(at('((x))', 5)).toBe(5);
  });
});

describe('compileExpression — implicit multiplication', () => {
  it('number times x', () => {
    expect(at('2x', 3)).toBe(6);
    expect(at('2x^2', 3)).toBe(18);
    expect(at('0.5x + 1', 4)).toBe(3);
  });
  it('number or x times parentheses', () => {
    expect(at('3(x+1)', 2)).toBe(9);
    expect(at('x(x-1)', 4)).toBe(12);
    expect(at('(x+1)(x-1)', 3)).toBe(8);
  });
  it('constants and functions', () => {
    expect(at('2pi', 0)).toBeCloseTo(2 * Math.PI);
    expect(at('2sqrt(x)', 9)).toBe(6);
    expect(at('xpi', 1)).toBeCloseTo(Math.PI);
  });
});

describe('compileExpression — numbers, constants, functions', () => {
  it('reads a decimal comma', () => {
    expect(at('1,5x', 2)).toBe(3);
    expect(at('0,25', 0)).toBe(0.25);
  });
  it('knows pi and e', () => {
    expect(at('pi', 0)).toBeCloseTo(Math.PI);
    expect(at('e', 0)).toBeCloseTo(Math.E);
    expect(at('e^x', 1)).toBeCloseTo(Math.E);
  });
  it('evaluates every function', () => {
    expect(at('sqrt(16)', 0)).toBe(4);
    expect(at('abs(x)', -3)).toBe(3);
    expect(at('sin(0)', 0)).toBe(0);
    expect(at('cos(0)', 0)).toBe(1);
    expect(at('tan(0)', 0)).toBe(0);
    expect(at('ln(e)', 0)).toBeCloseTo(1);
    expect(at('log(1000)', 0)).toBeCloseTo(3);
    expect(at('exp(0)', 0)).toBe(1);
  });
  it('accepts typographic operators and "y =" / "f(x) ="', () => {
    expect(at('2·x − 1', 3)).toBe(5);
    expect(at('x²', 4)).toBe(16);
    expect(at('y = x + 1', 1)).toBe(2);
    expect(at('f(x) = x^2', 3)).toBe(9);
  });
  it('returns NaN / Infinity out of the domain instead of throwing', () => {
    expect(Number.isNaN(at('sqrt(x)', -1))).toBe(true);
    expect(at('1/x', 0)).toBe(Infinity);
  });
});

describe('compileExpression — errors', () => {
  const bad = [
    '',
    '2 +',
    '(x + 1',
    'x + 1)',
    'y',
    'foo(x)',
    'sqrt x',
    'sqrt',
    '2 ** x',
    'x = = 1',
    'alert(1)',
    'constructor',
    '__proto__',
    'x; 1',
    '1..2',
    'x'.repeat(201),
  ];
  for (const expr of bad) {
    it(`rejects ${JSON.stringify(expr.slice(0, 20))}`, () => {
      expect(compileExpression(expr)).toBeNull();
    });
  }
});

// The tree behind the compiler (issues #235, #263): the answer checks ask about the FORM of a
// term and about several variables, which a compiled function cannot answer.
describe('parseExpression — the tree and several variables', () => {
  it('keeps the shape of what was written', () => {
    expect(parseExpression('2(x+3)')).toEqual({
      k: 'mul',
      a: { k: 'num', v: 2, integer: true },
      b: {
        k: 'add',
        a: { k: 'var', name: 'x' },
        b: { k: 'num', v: 3, integer: true },
      },
    });
    expect(parseExpression('0,5')).toEqual({ k: 'num', v: 0.5, integer: false });
  });

  it("reads every single letter as its own variable in 'letters' mode, case kept", () => {
    const t = parseExpression('s/(v·t) + V', 'letters');
    expect(t && variablesOf(t)).toEqual(['V', 's', 't', 'v']);
    expect(t && evaluateExpression(t, { s: 6, v: 2, t: 3, V: 1 })).toBe(2);
    // A run of letters is a product once the function names are taken out; e stays Euler's.
    const r = parseExpression('2ab + sin(x) + e', 'letters');
    expect(r && variablesOf(r)).toEqual(['a', 'b', 'x']);
    expect(r && evaluateExpression(r, { a: 1, b: 2, x: 0 })).toBeCloseTo(4 + Math.E);
  });

  it("refuses other letters in 'x' mode, as the figures always did", () => {
    expect(parseExpression('2a + 1')).toBeNull();
    expect(parseExpression('2X + 1')).not.toBeNull();
  });

  it('evaluates an unassigned variable to NaN instead of throwing', () => {
    const t = parseExpression('a + 1', 'letters');
    expect(t && Number.isNaN(evaluateExpression(t, {}))).toBe(true);
  });
});
