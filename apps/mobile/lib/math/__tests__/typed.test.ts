import { describe, expect, it } from 'vitest';

import { splitMath } from '../parse.js';
import { MAX_PREVIEW_INPUT, typedMath } from '../typed.js';

const preview = (s: string) => typedMath(s);

describe('typedMath: worth a preview', () => {
  it.each([
    '3/4',
    'x^2',
    'x²',
    '2³',
    'sqrt(16)',
    '√16',
    '√(x+1)',
    '3+4',
    '12 : 3',
    '2*3',
    'x = 5',
    '7 − 2',
    '5 <= 6',
  ])('%s is math worth drawing', (s) => expect(preview(s).worth).toBe(true));
  it.each([
    '',
    '12',
    '-3',
    '3,5',
    '0.25',
    'x',
    '2x',
    'Hund',
    'ja/nein',
    'Ich helfe meiner Mutter.',
    '3/',
    'x^',
    '90°',
    '3 Äpfel',
  ])('%s is not', (s) => expect(preview(s).worth).toBe(false));
  it('gives up on long texts (sentences, not formulas)', () => {
    expect(preview(`${'1/2 '.repeat(MAX_PREVIEW_INPUT / 4)}1/2`).worth).toBe(false);
  });
});

describe('typedMath: conversion', () => {
  it('turns a slash between two terms into a fraction', () => {
    expect(preview('3/4').text).toBe('$\\frac{3}{4}$');
    expect(preview('3 / 4').text).toBe('$\\frac{3}{4}$');
  });
  it('drops the brackets that only group a numerator or denominator', () => {
    expect(preview('(x+1)/(x-1)').text).toBe('$\\frac{x+1}{x-1}$');
  });
  it('groups like the answer check: left to right, powers first', () => {
    expect(preview('6/2/3').text).toBe('$\\frac{\\frac{6}{2}}{3}$');
    expect(preview('1+2/3').text).toBe('$1+\\frac{2}{3}$');
    expect(preview('x^2/3').text).toBe('$\\frac{x^{2}}{3}$');
    expect(preview('1/2x').text).toBe('$\\frac{1}{2}x$');
  });
  it('writes powers from ^ and from the ² ³ keys', () => {
    expect(preview('x^2').text).toBe('$x^{2}$');
    expect(preview('x²').text).toBe('$x^{2}$');
    expect(preview('2^(n+1)').text).toBe('$2^{n+1}$');
    expect(preview('10^-3').text).toBe('$10^{-3}$');
    expect(preview('(3/4)²').text).toBe('$(\\frac{3}{4})^{2}$');
  });
  it('writes roots from sqrt(…) and √, and a power after √x belongs to the root', () => {
    expect(preview('sqrt(16)').text).toBe('$\\sqrt{16}$');
    expect(preview('√16').text).toBe('$\\sqrt{16}$');
    expect(preview('√x²').text).toBe('$\\sqrt{x}^{2}$');
    // Right after the √ key: the cursor sits inside the still empty brackets.
    expect(preview('√()').text).toBe('$\\sqrt{}$');
    expect(preview('√(2').text).toBe('$\\sqrt{2}$');
  });
  it('sets operators and symbols', () => {
    expect(preview('2*3').text).toBe('$2\\cdot 3$');
    expect(preview('2·π').text).toBe('$2\\cdot \\pi $');
    expect(preview('a <= b').text).toBe('$a\\le b$');
    expect(preview('12:3').text).toBe('$12\\,:\\,3$');
  });
  it('keeps a mixed number apart ("1 1/2" is not 11/2)', () => {
    expect(preview('1 1/2').text).toBe('$1\\,\\frac{1}{2}$');
  });
  it('keeps words and units as words next to the math', () => {
    expect(preview('3/4 kg').text).toBe('$\\frac{3}{4}$ kg');
    expect(preview('Das sind 3/4 der Klasse.').text).toBe('Das sind $\\frac{3}{4}$ der Klasse.');
    expect(preview('x = 5, weil 2x = 10').text).toBe('$x=5$, weil $2x=10$');
  });
  it('leaves math that is not worth drawing exactly as typed', () => {
    expect(preview('12 und 3/4').text).toBe('12 und $\\frac{3}{4}$');
  });
  it('escapes dollar signs so typed text never becomes other math', () => {
    expect(preview('5$ + 3/4').text).toBe('5\\$ $+\\frac{3}{4}$');
    expect(splitMath(preview('5$ und 3/4').text).filter((s) => s.type === 'math')).toHaveLength(1);
    expect(preview('a_b + 1/2').text).toBe('a_$b+\\frac{1}{2}$');
  });
  it('produces text MathText can parse (every $…$ becomes one math segment)', () => {
    for (const s of ['3/4', 'x² + 2x + 1', '√(x+1)/2', '1 1/2 kg', '(a+b)^2 = a^2 + 2ab + b^2']) {
      const segs = splitMath(preview(s).text);
      expect(
        segs.some((g) => g.type === 'math'),
        s,
      ).toBe(true);
    }
  });
});
