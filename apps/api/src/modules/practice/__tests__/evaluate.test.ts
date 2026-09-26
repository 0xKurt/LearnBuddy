import { describe, expect, it } from 'vitest';

import { differentNumber, ruleCheck } from '../evaluate.js';

const mc = {
  kind: 'multiple_choice' as const,
  answer: '$\\frac{2}{3}$',
  accepted_answers: [],
  unit: null,
  choices: ['$\\frac{2}{3}$', '$\\frac{3}{5}$'],
  correct_choice: 0,
};

describe('ruleCheck', () => {
  it('matches a spoken or typed choice however the choice is written', () => {
    expect(ruleCheck(mc, { text: '2/3', choice: null }, 'de')).toBe('correct');
    expect(ruleCheck(mc, { text: '3/5', choice: null }, 'de')).toBe('incorrect');
    expect(ruleCheck(mc, { text: 'keine Ahnung', choice: null }, 'de')).toBe('unknown');
  });

  it('treats typed 3/4 and a stored \\frac{3}{4} as the same short answer', () => {
    const item = {
      kind: 'short' as const,
      answer: '$\\frac{3}{4}$',
      accepted_answers: [],
      unit: null,
      choices: null,
      correct_choice: null,
    };
    expect(ruleCheck(item, { text: '3/4', choice: null }, 'de')).toBe('correct');
  });

  it('calls a translation with missing accents close, not right', () => {
    const item = {
      kind: 'vocab' as const,
      answer: "l'élève",
      accepted_answers: [],
      unit: null,
      choices: null,
      correct_choice: null,
    };
    expect(ruleCheck(item, { text: "l'eleve", choice: null }, 'de')).toBe('close');
  });
});

describe('differentNumber (tests only)', () => {
  const short = (answer: string, accepted: string[] = []) => ({
    kind: 'short' as const,
    answer,
    accepted_answers: accepted,
    unit: null,
    choices: null,
    correct_choice: null,
  });

  it('knows a plain number with another value is wrong', () => {
    expect(differentNumber(short('$\\frac{3}{4}$'), '3/7')).toBe(true);
    expect(differentNumber(short('0,75'), '0,5')).toBe(true);
    expect(differentNumber(short('12'), '-12')).toBe(true);
  });

  it('leaves everything else to the model', () => {
    // Same value, other form: may still be wrong (not reduced).
    expect(differentNumber(short('1/2'), '4/8')).toBe(false);
    expect(differentNumber(short('3/4'), '0,75')).toBe(false);
    // Not a plain number: mixed numbers, equations, words, units, ambiguous separators.
    expect(differentNumber(short('3,5'), '3 1/2')).toBe(false);
    expect(differentNumber(short('3'), 'x=3')).toBe(false);
    expect(differentNumber(short('3'), 'drei')).toBe(false);
    expect(differentNumber(short('12'), '12 cm')).toBe(false);
    expect(differentNumber(short('1000'), '1.000')).toBe(false);
    // A word solution, or an accepted answer that is not a number.
    expect(differentNumber(short('Nenner'), '3')).toBe(false);
    expect(differentNumber(short('3/4', ['drei Viertel']), '3/7')).toBe(false);
    // Any accepted value counts as right.
    expect(differentNumber(short('3/4', ['0,8']), '0,8')).toBe(false);
  });
});
