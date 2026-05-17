// Unit tests for the local answer evaluator. Doc 07 §3.
// Pure functions — no React Native dependencies.

import { describe, it, expect } from 'vitest';

import { localEvaluate, type EvaluatableItem } from '../local.js';

function item(
  overrides: Partial<EvaluatableItem> & { answer_kind: EvaluatableItem['answer_kind'] },
): EvaluatableItem {
  return {
    expected_answer: '',
    acceptable_answers: [],
    mc_options: null,
    mc_correct_index: null,
    units: null,
    latex_expected: null,
    latex_acceptable: undefined,
    fill_blank_answers: undefined,
    ...overrides,
  };
}

describe('multiple_choice', () => {
  it('returns correct for the right index', () => {
    const i = item({
      answer_kind: 'multiple_choice',
      mc_correct_index: 2,
      mc_options: ['a', 'b', 'c'],
    });
    expect(localEvaluate(i, '2')).toBe('correct');
  });

  it('returns incorrect for a wrong index', () => {
    const i = item({
      answer_kind: 'multiple_choice',
      mc_correct_index: 1,
      mc_options: ['a', 'b', 'c'],
    });
    expect(localEvaluate(i, '0')).toBe('incorrect');
  });

  it('returns unknown when mc_correct_index is null', () => {
    const i = item({
      answer_kind: 'multiple_choice',
      mc_correct_index: null,
      mc_options: ['a', 'b'],
    });
    expect(localEvaluate(i, '0')).toBe('unknown');
  });
});

describe('numeric', () => {
  it('returns correct for an exact match', () => {
    const i = item({ answer_kind: 'numeric', expected_answer: '42' });
    expect(localEvaluate(i, '42')).toBe('correct');
  });

  it('returns correct within 1% tolerance', () => {
    const i = item({ answer_kind: 'numeric', expected_answer: '100' });
    expect(localEvaluate(i, '100.5')).toBe('correct');
  });

  it('returns unknown when answer is unparseable', () => {
    const i = item({ answer_kind: 'numeric', expected_answer: '5' });
    expect(localEvaluate(i, 'fünf')).toBe('unknown');
  });

  it('returns correct for an acceptable alternate answer', () => {
    const i = item({ answer_kind: 'numeric', expected_answer: '10', acceptable_answers: ['20'] });
    expect(localEvaluate(i, '20')).toBe('correct');
  });

  it('returns unknown (not incorrect) when value is close but unit is wrong', () => {
    const i = item({ answer_kind: 'numeric', expected_answer: '5', units: 'kg' });
    expect(localEvaluate(i, '5 g')).toBe('unknown');
  });
});

describe('short', () => {
  it('returns correct for near-identical text', () => {
    const i = item({ answer_kind: 'short', expected_answer: 'Wasser' });
    expect(localEvaluate(i, 'Wasser')).toBe('correct');
  });

  it('returns unknown for a partial match (sends to LLM)', () => {
    const i = item({ answer_kind: 'short', expected_answer: 'Photosynthese' });
    expect(localEvaluate(i, 'Photosyn')).toBe('unknown');
  });

  it('returns unknown for an empty answer', () => {
    const i = item({ answer_kind: 'short', expected_answer: 'Berlin' });
    expect(localEvaluate(i, '')).toBe('unknown');
  });
});

describe('long', () => {
  it('returns incorrect for an empty answer', () => {
    const i = item({ answer_kind: 'long', expected_answer: 'Some detailed explanation here.' });
    expect(localEvaluate(i, '')).toBe('incorrect');
  });

  it('returns incorrect when answer is less than 25% of expected length', () => {
    const i = item({ answer_kind: 'long', expected_answer: 'a'.repeat(100) });
    expect(localEvaluate(i, 'ab')).toBe('incorrect');
  });

  it('returns unknown for a plausibly-length answer (defers to LLM)', () => {
    const i = item({ answer_kind: 'long', expected_answer: 'a'.repeat(40) });
    expect(localEvaluate(i, 'b'.repeat(30))).toBe('unknown');
  });
});

describe('fill_blank', () => {
  it('returns correct when all blanks match', () => {
    const i = item({ answer_kind: 'fill_blank', fill_blank_answers: ['Berlin', 'Deutschland'] });
    expect(localEvaluate(i, 'Berlin||Deutschland')).toBe('correct');
  });

  it('returns incorrect when all blanks are wrong', () => {
    const i = item({ answer_kind: 'fill_blank', fill_blank_answers: ['Berlin', 'Deutschland'] });
    expect(localEvaluate(i, 'Paris||Frankreich')).toBe('incorrect');
  });

  it('returns unknown for partial match (some right, some wrong)', () => {
    const i = item({ answer_kind: 'fill_blank', fill_blank_answers: ['Berlin', 'Deutschland'] });
    expect(localEvaluate(i, 'Berlin||Frankreich')).toBe('unknown');
  });

  it('returns unknown when blank count mismatches', () => {
    const i = item({ answer_kind: 'fill_blank', fill_blank_answers: ['Berlin', 'Deutschland'] });
    expect(localEvaluate(i, 'Berlin')).toBe('unknown');
  });
});

describe('formula', () => {
  it('returns correct for an algebraically equivalent expression', () => {
    const i = item({ answer_kind: 'formula', expected_answer: 'x+1', latex_expected: null });
    expect(localEvaluate(i, '1+x')).toBe('correct');
  });

  it('returns unknown when formula cannot be parsed', () => {
    const i = item({ answer_kind: 'formula', expected_answer: 'x^2', latex_expected: null });
    expect(localEvaluate(i, '???')).toBe('unknown');
  });
});
