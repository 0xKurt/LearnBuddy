// Unit tests for lib/practice/generate.ts.

import { describe, expect, it } from 'vitest';

import type { ProblemTemplateRow } from '@learnbuddy/shared-types';

import { generateVariants, scorePracticeAnswer } from '../generate.js';

function makeTemplate(overrides: Partial<ProblemTemplateRow> = {}): ProblemTemplateRow {
  const base: ProblemTemplateRow = {
    id: '00000000-0000-0000-0000-000000000001',
    material_id: '00000000-0000-0000-0000-000000000002',
    learner_id: '00000000-0000-0000-0000-000000000003',
    source_item_id: null,
    subject_kind: 'math',
    topic: 'addition',
    template_text: 'Was ist {a} + {b}?',
    params: [
      { name: 'a', type: 'int', min: 1, max: 9 },
      { name: 'b', type: 'int', min: 1, max: 9 },
    ],
    constraints: [],
    text_substitutions: [],
    solution_expression: 'a + b',
    answer_kind: 'numeric',
    units: null,
    stimulus_template: null,
    difficulty: 1,
    difficulty_adjustment: 0,
    archived_at: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };
  return { ...base, ...overrides };
}

describe('generateVariants', () => {
  it('produces the requested number of variants', () => {
    const out = generateVariants(makeTemplate(), { count: 10, seed: 1 });
    expect(out).toHaveLength(10);
  });

  it('caps count at 50', () => {
    const out = generateVariants(makeTemplate(), { count: 999, seed: 1 });
    expect(out.length).toBeLessThanOrEqual(50);
  });

  it('substitutes params into the question text', () => {
    const out = generateVariants(makeTemplate(), { count: 1, seed: 42 });
    expect(out[0]?.questionText).toMatch(/Was ist \d+ \+ \d+\?/);
  });

  it('computes the numeric expected answer via mathjs', () => {
    const out = generateVariants(makeTemplate(), { count: 5, seed: 7 });
    for (const v of out) {
      expect(v.expectedNumeric).not.toBeNull();
      const m = v.questionText.match(/(\d+) \+ (\d+)/);
      expect(m).not.toBeNull();
      if (m) {
        const a = Number(m[1]);
        const b = Number(m[2]);
        expect(v.expectedNumeric).toBe(a + b);
      }
    }
  });

  it('produces stable output for the same seed', () => {
    const a = generateVariants(makeTemplate(), { count: 4, seed: 12345 });
    const b = generateVariants(makeTemplate(), { count: 4, seed: 12345 });
    expect(a.map((v) => v.questionText)).toEqual(b.map((v) => v.questionText));
  });

  it('respects exclude lists', () => {
    const template = makeTemplate({
      params: [
        { name: 'a', type: 'int', min: 1, max: 5, exclude: [2, 3, 4] },
        { name: 'b', type: 'int', min: 1, max: 5, exclude: [2, 3, 4] },
      ],
    });
    const out = generateVariants(template, { count: 6, seed: 1 });
    for (const v of out) {
      expect([2, 3, 4]).not.toContain(v.params.a);
      expect([2, 3, 4]).not.toContain(v.params.b);
    }
  });
});

describe('scorePracticeAnswer', () => {
  it('marks exact numeric matches correct', () => {
    const [variant] = generateVariants(makeTemplate(), { count: 1, seed: 1 });
    if (!variant) throw new Error('no variant');
    expect(scorePracticeAnswer(variant, variant.expectedNumeric ?? 0)).toBe('correct');
  });

  it('allows 1% tolerance for non-trivial values', () => {
    const template = makeTemplate({
      template_text: 'Was ist {a} * {b}?',
      solution_expression: 'a * b',
      params: [
        { name: 'a', type: 'int', min: 100, max: 100 },
        { name: 'b', type: 'int', min: 100, max: 100 },
      ],
    });
    const [variant] = generateVariants(template, { count: 1, seed: 1 });
    if (!variant) throw new Error('no variant');
    // exp = 10000, tol = 100 → 9900 passes, 9800 fails
    expect(scorePracticeAnswer(variant, 9950)).toBe('correct');
    expect(scorePracticeAnswer(variant, 9800)).toBe('incorrect');
  });

  it('marks numeric mismatches incorrect', () => {
    const [variant] = generateVariants(makeTemplate(), { count: 1, seed: 1 });
    if (!variant) throw new Error('no variant');
    const wrong = (variant.expectedNumeric ?? 0) + 1000;
    expect(scorePracticeAnswer(variant, wrong)).toBe('incorrect');
  });
});
