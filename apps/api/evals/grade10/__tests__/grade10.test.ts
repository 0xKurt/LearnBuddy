// The grade-10 eval's own logic, proven without a model (issue #298): the case set covers what the
// issue names and every task is one code can follow; the swap, the length band, the flags, the
// human sample, the agreement numbers and the report do what docs/evals/klasse10.md says.

import { describe, expect, it } from 'vitest';

import { checkStepsPlan, guideKindFor } from '../../../src/modules/practice/guide.js';
import { CASES, REQUIRED_SUBJECTS } from '../cases.js';
import { renderReport } from '../report.js';
import {
  agreement,
  flagsOf,
  humanSample,
  humanSheet,
  lengthBand,
  readHumanSheet,
  summarize,
  swapOutcome,
  weaknesses,
  type CaseResult,
  type RubricVerdict,
} from '../score.js';

const verdict = (over: Partial<RubricVerdict> = {}): RubricVerdict => ({
  correctness: 5,
  errors: [],
  clarity: 5,
  curriculum: 5,
  length_fits: 5,
  why: 'Klar und richtig.',
  ...over,
});

const words = (n: number) => Array.from({ length: n }, (_, i) => `wort${i}`).join(' ');

const result = (id: string, over: Partial<CaseResult> = {}): CaseResult => ({
  id,
  subject: 'mathe',
  topic: `Thema ${id}`,
  explanation: words(120),
  words: 120,
  band: 'ok',
  rubric: verdict(),
  pair: 'tie',
  guide: null,
  failure: null,
  ...over,
});

describe('the case set', () => {
  it('covers every subject the issue names, with unique ids', () => {
    const ids = CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of REQUIRED_SUBJECTS) expect(CASES.some((c) => c.subject === s)).toBe(true);
    // Maths: quadratic functions, trigonometry, exponential growth (the issue's three).
    expect(CASES.filter((c) => c.subject === 'mathe')).toHaveLength(3);
    // Chemistry: redox and stoichiometry; English: reading and writing.
    expect(CASES.filter((c) => c.subject === 'chemie').map((c) => c.id)).toEqual([
      'c-redox',
      'c-stoechiometrie',
    ]);
    expect(CASES.filter((c) => c.subject === 'englisch')).toHaveLength(2);
  });

  it('gives the judge facts, pitfalls and a reference for every case', () => {
    for (const c of CASES) {
      expect(c.facts.length).toBeGreaterThanOrEqual(3);
      expect(c.pitfalls.length).toBeGreaterThanOrEqual(2);
      expect(lengthBand(c.reference).band).toBe('ok');
    }
  });

  it('has only tasks code can follow: every reference path passes the plan check', () => {
    for (const c of CASES) {
      if (!c.task) continue;
      const eligible = guideKindFor({
        kind: c.task.kind,
        answer: c.task.answer,
        bar_task: null,
        staff_task: null,
        parts_task: null,
        listen_task: null,
      });
      expect(eligible, c.id).toBe(c.task.kind === 'long' ? 'points' : 'steps');
      if (c.task.kind === 'long') continue;
      const r = checkStepsPlan(
        {
          kind: c.task.kind,
          answer: c.task.answer,
          accepted_answers: [],
          unit: c.task.unit,
          choices: null,
          correct_choice: null,
          tolerance: null,
          spelling: null,
          subject_kind: 'math',
          prompt: c.task.prompt,
        },
        {
          lines: c.task.referencePath.map((line) => ({
            line,
            say: 'Umgeformt.',
            hint: 'Forme um.',
          })),
          figure: null,
        },
        c.task.answer,
      );
      expect(r.ok ? 'ok' : `${r.reason} at ${r.at}`, c.id).toBe('ok');
    }
  });
});

describe('the position-swapped judge', () => {
  it('counts a verdict only when it survives the swap', () => {
    // Buddy first: A is Buddy. Buddy second: B is Buddy.
    expect(swapOutcome('A', 'B')).toBe('buddy');
    expect(swapOutcome('B', 'A')).toBe('reference');
    expect(swapOutcome('tie', 'tie')).toBe('tie');
  });
  it('reports a verdict that follows the position as position bias', () => {
    expect(swapOutcome('A', 'A')).toBe('position_bias');
    expect(swapOutcome('B', 'B')).toBe('position_bias');
    expect(swapOutcome('A', 'tie')).toBe('position_bias');
  });
});

describe('length is counted, not judged', () => {
  it('bands words for a phone', () => {
    expect(lengthBand(words(10)).band).toBe('too_short');
    expect(lengthBand(words(120)).band).toBe('ok');
    expect(lengthBand(words(300))).toEqual({ words: 300, band: 'too_long' });
    // A maths run counts as one word, as the app counts it.
    expect(lengthBand('$a(x-d)^2+e$').words).toBe(1);
  });
});

describe('flags, summary and weaknesses', () => {
  it('flags what a teacher would not sign, and nothing else', () => {
    expect(flagsOf(result('ok'))).toEqual([]);
    expect(flagsOf(result('x', { rubric: verdict({ errors: ['S(−d|e)'] }) }))).toContain(
      'fachlich fragwürdig',
    );
    expect(flagsOf(result('x', { rubric: verdict({ clarity: 3 }) }))).toContain(
      'für 15/16-Jährige unklar',
    );
    expect(flagsOf(result('x', { pair: 'reference' }))).toContain('Lehrkraft-Referenz klar besser');
    // Position bias is the judge's problem, not Buddy's: no flag.
    expect(flagsOf(result('x', { pair: 'position_bias' }))).toEqual([]);
    expect(flagsOf(result('x', { guide: { status: 'rejected', reason: 'step_broke' } }))).toEqual([
      'Vormach-Plan verworfen (step_broke)',
    ]);
  });

  it('summarizes the numbers the report shows', () => {
    const s = summarize([
      result('a'),
      result('b', { rubric: verdict({ correctness: 2, errors: ['falsch'] }), pair: 'reference' }),
      result('c', { band: 'too_long', words: 300, pair: 'position_bias' }),
      result('d', {
        rubric: null,
        failure: 'keine Antwort',
        explanation: '',
        words: 0,
        band: 'too_short',
        pair: null,
      }),
      result('e', { guide: { status: 'accepted', lines: 4, figure: false } }),
      result('f', { guide: { status: 'rejected', reason: 'not_the_key' } }),
    ]);
    expect(s).toMatchObject({
      cases: 6,
      judged: 5,
      withErrors: 1,
      length: { ok: 4, too_long: 1, too_short: 0 },
      pair: { tie: 3, reference: 1, position_bias: 1, buddy: 0 },
      guide: { asked: 2, accepted: 1, rejected: 1, error: 0 },
      flagged: 4,
    });
    expect(s.mean!.correctness).toBeCloseTo((5 + 2 + 5 + 5 + 5) / 5);
    expect(s.good!.correctness).toBeCloseTo(4 / 5);
  });

  it('names each weakness with what was seen', () => {
    const w = weaknesses([
      result('a'),
      result('b', { rubric: verdict({ correctness: 2, errors: ['Scheitel als S(−d|e)'] }) }),
    ]);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('**b**');
    expect(w[0]).toContain('Fehler: Scheitel als S(−d|e)');
  });
});

describe('the human sample', () => {
  const results = [
    result('a'),
    result('b', { rubric: verdict({ clarity: 2 }) }),
    result('c'),
    result('d'),
    result('e'),
    result('f', { rubric: null, failure: 'x', explanation: '' }),
  ];

  it('takes every flagged case plus a seeded draw from the rest — the same seed, the same draw', () => {
    const one = humanSample(results, 'seed-1', 2).map((r) => r.id);
    expect(one).toContain('b');
    expect(one).toHaveLength(3);
    expect(one).not.toContain('f');
    expect(humanSample(results, 'seed-1', 2).map((r) => r.id)).toEqual(one);
  });

  it('writes a sheet without the judge’s scores and reads the filled-in one back', () => {
    const sheet = humanSheet([results[1]!, results[2]!], CASES);
    expect(sheet).toContain('## b');
    expect(sheet).toContain('- correctness: _');
    expect(sheet).not.toMatch(/clarity: 2/);
    const filled = sheet
      .replace(/(## b[\s\S]*?)- correctness: _/, '$1- correctness: 4')
      .replace(/(## b[\s\S]*?)- clarity: _/, '$1- clarity: 2')
      .replace(/(## b[\s\S]*?)- curriculum: _/, '$1- curriculum: 5')
      .replace(/(## b[\s\S]*?)- length_fits: _/, '$1- length_fits: 3');
    const read = readHumanSheet(filled);
    // c was left empty: not read as anything.
    expect([...read.keys()]).toEqual(['b']);
    expect(read.get('b')).toEqual({ correctness: 4, clarity: 2, curriculum: 5, length_fits: 3 });
  });

  it('measures agreement between the human and the judge', () => {
    const human = new Map([
      ['a', { correctness: 5, clarity: 4, curriculum: 5, length_fits: 3 }],
      ['b', { correctness: 3, clarity: 2, curriculum: 5, length_fits: 5 }],
    ]);
    const a = agreement(human, results);
    expect(a.n).toBe(2);
    // a: judge 5/5/5/5; b: judge 5/2/5/5.
    expect(a.exact).toEqual({ correctness: 0.5, clarity: 0.5, curriculum: 1, length_fits: 0.5 });
    expect(a.withinOne).toEqual({ correctness: 0.5, clarity: 1, curriculum: 1, length_fits: 0.5 });
    expect(a.bias.correctness).toBeCloseTo(1);
  });
});

describe('the report', () => {
  it('shows the numbers, every case, the weaknesses and says when no human has scored yet', () => {
    const md = renderReport(
      {
        at: '2026-10-05T15:00:00Z',
        model: 'eu/gemini-test',
        judgeModel: 'eu/gemini-test',
        prompts: { buddy: 'buddy.x', guide: 'guide.v1' },
        seed: 's',
      },
      [result('a'), result('b', { rubric: verdict({ correctness: 2, errors: ['falsch'] }) })],
      null,
    );
    expect(md).toContain('# Klasse-10-Eval');
    expect(md).toContain('| Fachliche Richtigkeit | 3,5 | 50 % |');
    expect(md).toContain('| b | 2 |');
    expect(md).toContain('## Schwächen');
    expect(md).toContain('Noch nicht erhoben');
  });
});
