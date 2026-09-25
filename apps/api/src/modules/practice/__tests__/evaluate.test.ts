import { describe, expect, it } from 'vitest';

import { ruleCheck } from '../evaluate.js';

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
