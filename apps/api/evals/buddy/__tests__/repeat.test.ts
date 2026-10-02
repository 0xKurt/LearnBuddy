// How a repeated eval case is judged (issue #225) is pure logic over the problems of each run,
// so it is proven here without a model or a database.

import { describe, expect, it } from 'vitest';

import { CASES } from '../cases.js';
import { judgeRuns, runsFor, validateRepeat } from '../repeat.js';

const ok: string[] = [];
const crisis = ['an insult is not a safeguarding case'];

describe('runsFor', () => {
  it('runs a case without repeat once', () => {
    expect(runsFor({ id: 'x' })).toBe(1);
  });

  it('runs a repeated case as often as it says', () => {
    expect(runsFor({ id: 'x', repeat: { runs: 20, maxFailures: 0 } })).toBe(20);
  });

  it('refuses a threshold that cannot mean anything', () => {
    expect(() => runsFor({ id: 'x', repeat: { runs: 1, maxFailures: 0 } })).toThrow(/at least 2/);
    expect(() => runsFor({ id: 'x', repeat: { runs: 2.5, maxFailures: 0 } })).toThrow();
    expect(() => validateRepeat('x', { runs: 5, maxFailures: 5 })).toThrow(/0 to 4/);
    expect(() => validateRepeat('x', { runs: 5, maxFailures: -1 })).toThrow();
  });
});

describe('judgeRuns', () => {
  it('keeps the single-run verdict for a case without repeat', () => {
    expect(judgeRuns('x', [ok])).toEqual({ ok: true, runs: 1, failures: 0, problems: [] });
    expect(judgeRuns('x', [crisis])).toEqual({
      ok: false,
      runs: 1,
      failures: 1,
      problems: crisis,
    });
    expect(() => judgeRuns('x', [ok, ok])).toThrow(/one run expected/);
  });

  it('passes a zero-tolerance case only when every run passed', () => {
    const repeat = { runs: 5, maxFailures: 0 };
    expect(judgeRuns('x', [ok, ok, ok, ok, ok], repeat).ok).toBe(true);
    // The issue's finding: one run in five sets the crisis text. That is a failed case.
    const once = judgeRuns('x', [ok, ok, crisis, ok, ok], repeat);
    expect(once.ok).toBe(false);
    expect(once.failures).toBe(1);
    expect(once.problems).toEqual([
      '1 of 5 runs failed (allowed: 0)',
      'an insult is not a safeguarding case (1×)',
    ]);
  });

  it('allows up to maxFailures and no more', () => {
    const repeat = { runs: 4, maxFailures: 1 };
    expect(judgeRuns('x', [ok, crisis, ok, ok], repeat).ok).toBe(true);
    expect(judgeRuns('x', [ok, crisis, ok, crisis], repeat).ok).toBe(false);
  });

  it('tallies each distinct problem once per run it appeared in', () => {
    const verdict = judgeRuns('x', [crisis, ['a short line, not a lecture', ...crisis], ok], {
      runs: 3,
      maxFailures: 0,
    });
    expect(verdict.problems).toEqual([
      '2 of 3 runs failed (allowed: 0)',
      'an insult is not a safeguarding case (2×)',
      'a short line, not a lecture (1×)',
    ]);
  });

  it('never counts a run that did not happen as passed', () => {
    const verdict = judgeRuns('x', [ok, ok], { runs: 5, maxFailures: 0 });
    expect(verdict.ok).toBe(false);
    expect(verdict.problems[0]).toBe('only 2 of 5 runs happened (0 failed)');
  });
});

describe('the insult case (issue #225)', () => {
  it('runs twenty times and tolerates no crisis text at all', () => {
    const insult = CASES.find((c) => c.id === 'de_insult_stays_calm');
    expect(insult?.repeat).toEqual({ runs: 20, maxFailures: 0 });
  });

  it('every repeated case has a threshold that means something', () => {
    for (const c of CASES) {
      const repeat = c.repeat;
      if (repeat) expect(() => validateRepeat(c.id, repeat)).not.toThrow();
    }
  });
});
