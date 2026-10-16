// The essay eval's set and its scoring (issue #258), without a model: the set holds what the
// Abnahme asks (≥ 20 texts per text type, every key point both met and open), agreement is
// counted per key point with the two ways to disagree kept apart, and the report a teacher reads
// carries her text, both judgements, Buddy's quote and the empty column for the teacher.
// The path one case takes through the API is proven with the model scripted
// (`runCase.test.ts`).

import type { EssayFeedback } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { ESSAY_POINTS } from '../../../src/modules/practice/essay.js';
import { ESSAY_CASES, type EssayCase } from '../cases.js';
import {
  PER_TYPE_MIN,
  pointsOf,
  report,
  setProblems,
  summarize,
  type CaseResult,
} from '../score.js';

const linear = ESSAY_CASES.find((c) => c.type === 'argue_linear')!;

/** Buddy's feedback with these states, in the type's order. */
function feedback(c: EssayCase, states: Array<'met' | 'open'>): EssayFeedback {
  return {
    form: 'Stellungnahme',
    points: states.map((state, i) => ({
      name: ESSAY_POINTS[c.type][i]!,
      state,
      quote: state === 'met' ? `Zitat ${i}` : null,
      missing: state === 'open' ? 'Mach das.' : null,
    })),
    places: [{ quote: 'Ein Satz von ihr', better: 'Nenn ein Beispiel.' }],
    last: false,
  };
}

const result = (c: EssayCase, f: EssayFeedback | null, safeguarded = false): CaseResult => ({
  case: c,
  feedback: f,
  safeguarded,
  error: f === null && !safeguarded ? 'down' : null,
});

describe('the essay eval set (#258)', () => {
  it('holds at least 20 texts per text type, every key point both met and open', () => {
    expect(setProblems(ESSAY_CASES)).toEqual([]);
    for (const type of ['argue_linear', 'argue_dialectic', 'analyse'] as const)
      expect(ESSAY_CASES.filter((c) => c.type === type).length).toBeGreaterThanOrEqual(
        PER_TYPE_MIN,
      );
  });

  it('finds a set that is too small or one-sided', () => {
    const few = ESSAY_CASES.filter((c) => c.type !== 'analyse').concat(
      ESSAY_CASES.filter((c) => c.type === 'analyse').slice(0, 3),
    );
    expect(setProblems(few)).toContain(`analyse: 3 texts, needs ${PER_TYPE_MIN}`);
    const allMet = ESSAY_CASES.map((c) => ({
      ...c,
      expected: Object.fromEntries(Object.keys(c.expected).map((k) => [k, 'met' as const])),
    }));
    expect(setProblems(allMet)).toContain('argue_linear/intro: never open in the set');
  });

  it('builds each text from the paragraphs its expectation names', () => {
    for (const c of ESSAY_CASES) {
      // (The paragraphs themselves are in cases.ts, for the teacher to read.)
      if (c.type === 'analyse' && c.expected.tense === 'open')
        expect(c.text, c.id).toMatch(/\b(kam|sah|war|saß|begrüßte)\b/);
      if (c.type === 'analyse' && c.expected.quotes === 'met')
        expect(c.text, c.id).toMatch(/\(Z\. \d/);
    }
  });
});

describe('scoring and the report', () => {
  it('counts agreement per key point, praise for what is missing apart from a point sent back', () => {
    const exp = ESSAY_POINTS.argue_linear.map((p) => linear.expected[p]!);
    const flip = (s: 'met' | 'open') => (s === 'met' ? 'open' : 'met');
    const agreeing = result(linear, feedback(linear, exp));
    const wrongFirst = result(linear, feedback(linear, [flip(exp[0]!), ...exp.slice(1)]));
    const none = result(linear, null);
    const s = summarize([agreeing, wrongFirst, none]);
    expect(s.all.total).toBe(9);
    expect(s.all.agree).toBe(3 + 2);
    expect(s.all.falseMet + s.all.missedMet).toBe(1 + exp.filter((e) => e === 'met').length);
    expect(s.noFeedback).toBe(1);
    expect(s.byPoint['argue_linear/intro']).toMatchObject({ total: 3, agree: 1 });
    expect(pointsOf(none).every((r) => r.got === 'none' && !r.agree)).toBe(true);
  });

  it('writes a report a teacher can check: her text, both judgements, the quote, her column', () => {
    const exp = ESSAY_POINTS.argue_linear.map((p) => linear.expected[p]!);
    const analysis = ESSAY_CASES.filter((c) => c.type === 'analyse').slice(0, 2);
    const md = report(
      [result(linear, feedback(linear, exp)), ...analysis.map((c) => result(c, null, true))],
      { title: 'Aufsatz-Eval' },
    );
    expect(md).toContain('# Aufsatz-Eval');
    expect(md).toContain('Lehrkraft ✓/✗');
    expect(md).toContain(`## ${linear.id}`);
    expect(md).toContain(linear.text.split('\n')[0]!);
    expect(md).toContain('| Einleitung |');
    expect(md).toContain('„Ein Satz von ihr“ → Nenn ein Beispiel.');
    expect(md).toContain('feste Hilfe-Antwort statt einer Rückmeldung');
    // The text she writes about is printed once with its line numbers, then referred to.
    expect(md.match(/```/g)?.length).toBe(2);
    expect(md).toContain('(siehe oben)');
  });
});
