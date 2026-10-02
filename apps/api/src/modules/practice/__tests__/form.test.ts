// The FORM of an answer, read off its syntax tree (issue #235). Three halves matter:
//   - the same summands in another order are the key's form and right, without a model;
//   - an equivalent answer in a really different form (factored vs expanded) is only described
//     to the tutor — code does not read the question to know whether the form was asked;
//   - wrong-but-close answers stay wrong, whatever form they come in.

import { parseExpression } from '@learnbuddy/shared-math';
import { describe, expect, it } from 'vitest';

import { judgeAlgebra, labelled, mathRunsOf, orderFree, shapeOf, typedBack } from '../form.js';

const tree = (s: string) => {
  const t = parseExpression(s);
  if (t === null) throw new Error(`did not parse: ${s}`);
  return t;
};

describe('the same term up to order', () => {
  it('forgets only the order of summands and factors', () => {
    expect(orderFree(tree('2x+6'))).toBe(orderFree(tree('6+2x')));
    expect(orderFree(tree('2(x+3)'))).toBe(orderFree(tree('(3+x)·2')));
    expect(orderFree(tree('x^2-2x+1'))).toBe(orderFree(tree('1-2x+x^2')));
    // A power of a bracket is that bracket several times.
    expect(orderFree(tree('(x+1)^2'))).toBe(orderFree(tree('(x+1)(1+x)')));
  });

  it('keeps everything that is a change of form', () => {
    expect(orderFree(tree('2(x+3)'))).not.toBe(orderFree(tree('2x+6')));
    expect(orderFree(tree('x·x'))).not.toBe(orderFree(tree('x^2')));
    expect(orderFree(tree('0.5x'))).not.toBe(orderFree(tree('x/2')));
    // Removing a bracket after a minus is a step, not an order.
    expect(orderFree(tree('-(x-3)'))).not.toBe(orderFree(tree('3-x')));
    expect(orderFree(tree('5-(x+1)'))).not.toBe(orderFree(tree('5-x-1')));
  });
});

describe('the shape of a term', () => {
  it('tells a product of brackets from a sum and from a monomial', () => {
    expect(shapeOf(tree('(x+1)^2'))).toBe('product');
    expect(shapeOf(tree('x(x+2)'))).toBe('product');
    expect(shapeOf(tree('-2(x-3)'))).toBe('product');
    expect(shapeOf(tree('x^2+2x+1'))).toBe('sum');
    expect(shapeOf(tree('3x^2'))).toBe('other');
    expect(shapeOf(tree('(x+1)/2'))).toBe('other');
  });
});

describe('one answer against one key', () => {
  it('calls the same summands in another order the same form', () => {
    expect(judgeAlgebra('2x+6', '6+2x')).toEqual({ verdict: 'same', sameForm: true, note: null });
    expect(judgeAlgebra('(x+1)^2', '(x+1)(x+1)')).toMatchObject({ sameForm: true });
    expect(judgeAlgebra('(x+1)(x-1)', '(x-1)(x+1)')).toMatchObject({ sameForm: true });
  });

  it('describes a real change of form, and leaves the judgement to the tutor', () => {
    expect(judgeAlgebra('(x+1)^2', 'x^2+2x+1')).toEqual({
      verdict: 'same',
      sameForm: false,
      note: { kind: 'shape', key: 'product', answer: 'sum' },
    });
    expect(judgeAlgebra('x^2+2x', 'x(x+2)')).toEqual({
      verdict: 'same',
      sameForm: false,
      note: { kind: 'shape', key: 'sum', answer: 'product' },
    });
    // Equivalent, both sums, but not collected: the same value, another form, no shape note.
    expect(judgeAlgebra('2x+6', 'x+x+6')).toEqual({ verdict: 'same', sameForm: false, note: null });
  });

  it('says wrong to wrong-but-close answers in any form', () => {
    expect(judgeAlgebra('(x+1)^2', 'x^2+x+1')).toEqual({ verdict: 'different' });
    expect(judgeAlgebra('(x+1)^2', '(x-1)^2')).toEqual({ verdict: 'different' });
    expect(judgeAlgebra('x^2-9', '(x-3)^2')).toEqual({ verdict: 'different' });
    expect(judgeAlgebra('2(x+3)', '2x+3')).toEqual({ verdict: 'different' });
  });

  it('reads an inequality by its solution set, the direction included', () => {
    expect(judgeAlgebra('x > 3', '3 < x')).toMatchObject({ verdict: 'same', sameForm: true });
    expect(judgeAlgebra('x > 3', '-2x < -6')).toMatchObject({ verdict: 'same', sameForm: false });
    // The sign not turned, the boundary included, the boundary moved: each one another set.
    expect(judgeAlgebra('x > 3', 'x < 3')).toEqual({ verdict: 'different' });
    expect(judgeAlgebra('x > 3', 'x ≥ 3')).toEqual({ verdict: 'different' });
    expect(judgeAlgebra('x > 3', 'x > 3.01')).toEqual({ verdict: 'different' });
  });

  it('reads a formula solved for a variable (Physik: Formel umstellen)', () => {
    expect(judgeAlgebra('s = v·t', 's = t·v')).toMatchObject({ verdict: 'same', sameForm: true });
    expect(judgeAlgebra('v = s/t', 'v·t = s')).toEqual({
      verdict: 'same',
      sameForm: false,
      note: { kind: 'not_solved_for', variable: 'v' },
    });
    expect(judgeAlgebra('v = s/t', 'v = t/s')).toEqual({ verdict: 'different' });
    expect(judgeAlgebra('v = s/t', 'v = s·t')).toEqual({ verdict: 'different' });
  });

  it('treats a function label as notation, and another function as another question', () => {
    expect(labelled("f'(x) = 6x")).toEqual({ label: "f'", arg: 'x', body: '6x' });
    expect(labelled('y = 2x + 3')).toEqual({ label: 'y', arg: 'x', body: '2x + 3' });
    expect(labelled('y = 3').label).toBeNull();
    expect(judgeAlgebra("f'(x) = 6x", '6x')).toMatchObject({ verdict: 'same', sameForm: true });
    expect(judgeAlgebra("f'(x) = 6x", '5x')).toEqual({ verdict: 'different' });
    expect(judgeAlgebra("f'(x) = 3x^2 - 2", 'f′(x) = -2 + 3x²')).toMatchObject({ sameForm: true });
    expect(judgeAlgebra('y = 2x + 3', 'f(x) = 3 + 2x')).toMatchObject({ sameForm: true });
    // f(x) for f'(x), g(x) for f(x): not the same thing, so nothing is decided.
    expect(judgeAlgebra("f'(x) = 6x", 'f(x) = 6x')).toBeNull();
    expect(judgeAlgebra('f(x) = 6x', 'g(x) = 6x')).toBeNull();
  });

  it('decides an antiderivative up to its constant', () => {
    const key = 'F(x) = x^3/3 + C';
    expect(judgeAlgebra(key, 'x^3/3 + C')).toMatchObject({ verdict: 'same', sameForm: true });
    expect(judgeAlgebra(key, '1/3 x^3 + c')).toMatchObject({ verdict: 'same', sameForm: false });
    // One antiderivative instead of all of them: the value is right, the constant is the note.
    expect(judgeAlgebra(key, 'x^3/3')).toEqual({
      verdict: 'same',
      sameForm: false,
      note: { kind: 'constant_missing' },
    });
    expect(judgeAlgebra(key, 'x^3/3 + 5')).toMatchObject({ note: { kind: 'constant_missing' } });
    // Differentiated instead of integrated, or the factor forgotten: another function.
    expect(judgeAlgebra(key, '3x^2 + C')).toEqual({ verdict: 'different' });
    expect(judgeAlgebra(key, 'x^3 + C')).toEqual({ verdict: 'different' });
    expect(judgeAlgebra('F(x) = -cos(x) + C', 'cos(x) + C')).toEqual({ verdict: 'different' });
    expect(judgeAlgebra('F(x) = -cos(x) + C', '2 - cos(x) + C')).toMatchObject({ verdict: 'same' });
  });

  it('is the same answer every time', () => {
    for (let i = 0; i < 10; i++) {
      expect(judgeAlgebra('(x+1)^2', 'x^2+x+1')).toEqual({ verdict: 'different' });
    }
  });
});

describe('the task typed back', () => {
  it('finds the maths of a prompt, with or without dollar signs', () => {
    expect(mathRunsOf('Faktorisiere $x^{2}+2x+1$.')).toEqual(['x^{2}+2x+1']);
    expect(mathRunsOf('Faktorisiere x^2+2x+1.')).toEqual(['x^2+2x+1']);
    expect(mathRunsOf('Löse das System x + y = 5 und x - y = 1.')).toEqual([
      'x + y = 5',
      'x - y = 1',
    ]);
  });

  it('sees the answer is the task’s own term while the key is not', () => {
    expect(typedBack('Faktorisiere $x^{2}+2x+1$.', '(x+1)^2', 'x²+2x+1')).toBe(true);
    expect(typedBack('Faktorisiere $x^{2}+2x+1$.', '(x+1)^2', '1 + 2x + x^2')).toBe(true);
    expect(typedBack('Löse $2x + 3 = 7$.', 'x = 2', '2x + 3 = 7')).toBe(true);
  });

  it('does not call a transformed answer typed back', () => {
    expect(typedBack('Faktorisiere $x^{2}+2x+1$.', '(x+1)^2', '(x+1)(x+1)')).toBe(false);
    expect(typedBack('Multipliziere aus: $2(x+3)$', '2x+6', '2x + 6')).toBe(false);
    // A task whose answer IS its term ("already simplified"): the key says so, nothing typed back.
    expect(typedBack('Vereinfache $2x+6$ so weit wie möglich.', '2x+6', '2x+6')).toBe(false);
  });
});
