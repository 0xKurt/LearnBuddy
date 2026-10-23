// The prompt budget guard (issue #651, docs/engineering-guards.md §Prompt-Budget): no purpose sends
// a larger system prompt or response schema than `budgets.ts` allows, measured on every call the
// inventory lists — without a model and without a database.

import { describe, expect, it } from 'vitest';

import { overBudget, PROMPT_BUDGETS } from '../budgets.js';
import { variants } from '../inventory.js';
import { mistakeContext } from '../../../src/modules/practice/mistakeContext.js';

describe('prompt budgets (#651)', () => {
  it('caps the entire mistake context at 480 characters, including JSON escaping (#871)', () => {
    expect(mistakeContext([])).toBeNull();
    for (const long of ['x'.repeat(4000), '\\"\n\t'.repeat(1000)]) {
      const rows = Array.from({ length: 60 }, (_, n) => ({
        subject: long,
        topic: `${n} ${long}`,
        prompt: long,
        said: long,
        wrong_at: new Date('2026-10-23T10:00:00Z'),
      }));
      const context = mistakeContext(rows)!;
      expect(context).toContain('LEARNING GAPS');
      expect(context.length).toBeLessThanOrEqual(480);
      expect(mistakeContext(rows)).toBe(context);
      expect(context.split('\n').filter((line) => line.startsWith('SHAKY:'))).toHaveLength(2);
    }
  });
  it('every call the app sends stays within its purpose’s budget', () => {
    expect(overBudget(variants())).toEqual([]);
  });

  it('every budget belongs to a purpose that is still sent', () => {
    const sent = new Set(variants().map((v) => v.purpose));
    expect(Object.keys(PROMPT_BUDGETS).filter((p) => !sent.has(p as never))).toEqual([]);
  });

  it('is red when Buddy’s turn schema grows past its budget', () => {
    const turn = variants().find((v) => v.purpose === 'buddy_turn')!;
    const budget = PROMPT_BUDGETS.buddy_turn!.schemaChars;
    const grown = { ...turn.schema, description: 'x'.repeat(budget) };
    expect(overBudget([{ ...turn, schema: grown }])).toEqual([
      expect.stringMatching(new RegExp(`^buddy_turn — .*: schema \\d+ chars > budget ${budget}$`)),
    ]);
  });

  it('is red for a purpose without a budget', () => {
    expect(overBudget([{ purpose: 'canary', profile: 'x', system: 'hi', schema: {} }])).toEqual([
      'canary — x: no budget in evals/schema/budgets.ts',
    ]);
  });

  it('is red when a system prompt grows past its budget', () => {
    const tutor = variants().find((v) => v.purpose === 'tutor')!;
    const system = 'x'.repeat(PROMPT_BUDGETS.tutor!.systemChars + 1);
    expect(overBudget([{ ...tutor, system }])).toHaveLength(1);
  });
});
