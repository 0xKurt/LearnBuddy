// The comparison between two buddy-eval transcripts (issue #80) is pure logic
// over two JSON files, so it is proven here without a model or a database.

import { describe, expect, it } from 'vitest';

import { compareRuns, renderComparison, type CaseResult, type RunFile } from '../compare.js';

function result(over: Partial<CaseResult> & { id: string }): CaseResult {
  return {
    ok: true,
    problems: [],
    reply: 'Hallo!',
    options: null,
    tools: [],
    calls: 1,
    costMicros: 15_000,
    inputTokens: 1000,
    cachedTokens: 0,
    ...over,
  };
}

function run(promptVersion: string, cases: CaseResult[], over?: Partial<RunFile>): RunFile {
  return {
    promptVersion,
    ranAt: '2026-09-29T08:00:00.000Z',
    models: ['eu/gemini-3.6-flash'],
    costMicros: 30_000,
    cases,
    ...over,
  };
}

describe('compareRuns', () => {
  it('classifies every transition between two runs', () => {
    const a = run('buddy.25', [
      result({ id: 'regresses' }),
      result({ id: 'gets_fixed', ok: false, problems: ['no goal stored'] }),
      result({ id: 'keeps_failing', ok: false, problems: ['tools used'] }),
      result({ id: 'changes_tools', tools: ['set_goal'] }),
      result({ id: 'changes_options', options: ['Ja', 'Nein'] }),
      result({ id: 'rewords' }),
      result({ id: 'stays' }),
    ]);
    const b = run('buddy.26', [
      result({ id: 'regresses', ok: false, problems: ['reply leaked the count'] }),
      result({ id: 'gets_fixed' }),
      result({ id: 'keeps_failing', ok: false, problems: ['tools used'] }),
      result({ id: 'changes_tools', tools: ['set_goal', 'remember'] }),
      result({ id: 'changes_options', options: ['Ja', 'Später'] }),
      result({ id: 'rewords', reply: 'Hi! Schön, dass du da bist.' }),
      result({ id: 'stays' }),
    ]);
    const kinds = Object.fromEntries(compareRuns(a, b).diffs.map((d) => [d.id, d.kind]));
    expect(kinds).toEqual({
      regresses: 'regressed',
      gets_fixed: 'fixed',
      keeps_failing: 'still-failing',
      changes_tools: 'behaviour',
      changes_options: 'behaviour',
      rewords: 'reworded',
      stays: 'same',
    });
  });

  it('reports cases that exist in only one run instead of guessing', () => {
    const cmp = compareRuns(
      run('buddy.25', [result({ id: 'both' }), result({ id: 'removed' })]),
      run('buddy.26', [result({ id: 'both' }), result({ id: 'added' })]),
    );
    expect(cmp.onlyA).toEqual(['removed']);
    expect(cmp.onlyB).toEqual(['added']);
    expect(cmp.diffs.map((d) => d.id)).toEqual(['both']);
  });

  it('a run compared with itself is entirely identical', () => {
    const a = run('buddy.26', [
      result({ id: 'x' }),
      result({ id: 'y', ok: false, problems: ['p'] }),
    ]);
    const kinds = compareRuns(a, a).diffs.map((d) => d.kind);
    expect(kinds).toEqual(['same', 'still-failing']);
  });
});

describe('renderComparison', () => {
  it('shows versions, pass counts and cost per run, and both replies to read', () => {
    const lines = renderComparison(
      compareRuns(
        run('buddy.25', [result({ id: 'rewords', reply: 'Alte Antwort.' })], {
          costMicros: 530_000,
        }),
        run('buddy.26', [result({ id: 'rewords', reply: 'Neue Antwort.' })], {
          costMicros: 570_000,
        }),
      ),
    );
    expect(lines[0]).toBe(
      'A: buddy.25 · 2026-09-29T08:00:00.000Z · 1/1 passed · $0.5300 · eu/gemini-3.6-flash',
    );
    expect(lines[1]).toContain('buddy.26');
    expect(lines[1]).toContain('$0.5700');
    expect(lines).toContain('    A: Alte Antwort.');
    expect(lines).toContain('    B: Neue Antwort.');
    expect(lines.at(-1)).toBe(
      '1 shared case(s): 0 regressed · 0 fixed · 0 still failing · 0 changed behaviour · 1 reworded · 0 identical',
    );
  });

  it('a regression names the new problems and the tool change that caused it', () => {
    const lines = renderComparison(
      compareRuns(
        run('buddy.25', [result({ id: 'goal', tools: ['set_goal'] })]),
        run('buddy.26', [
          result({
            id: 'goal',
            ok: false,
            problems: ['no goal stored'],
            tools: [],
            costMicros: 18_000,
          }),
        ]),
      ),
    );
    expect(lines).toContain('regressed (passed in A, fails in B) — 1:');
    expect(lines).toContain('  goal  ($0.0150 → $0.0180)');
    expect(lines).toContain('    problem: no goal stored');
    expect(lines).toContain('    tools: [set_goal] → []');
  });

  it('sums the run cost from the cases when the file header has none (older transcripts)', () => {
    const bare: RunFile = {
      promptVersion: 'buddy.24',
      cases: [
        { id: 'x', ok: true, problems: [], reply: 'Hi', options: null, tools: [] },
        { id: 'y', ok: true, problems: [], reply: 'Ho', options: null, tools: [] },
      ],
    };
    const lines = renderComparison(compareRuns(bare, bare));
    expect(lines[0]).toBe('A: buddy.24 · time unknown · 2/2 passed · $?');
  });
});
