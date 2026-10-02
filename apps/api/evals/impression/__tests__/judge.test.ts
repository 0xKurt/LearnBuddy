// The judge's plumbing (issue #127), with a stand-in judge: pairing, blindness, both orders,
// position bias, rejected answers, and the report's wording. The live judge is a model; what
// is proven here is everything the code does with its answers.

import { describe, expect, it } from 'vitest';

import type { LlmRequest } from '../../../src/llm/gateway.js';
import {
  buildReport,
  combineOrders,
  judgePairs,
  judgeRequest,
  pairConversations,
  renderForJudge,
  renderReport,
  shapeOf,
} from '../judge.js';
import type { Conversation, ImpressionRun, Turn } from '../transcript.js';

const turn = (over: Partial<Turn> = {}): Turn => ({
  said: 'hi',
  status: 'done',
  errorCode: null,
  reply: 'Hallo!',
  options: [],
  tools: [],
  asks: false,
  latencyMs: 1000,
  inputTokens: 10_000,
  costMicros: 900,
  ...over,
});

const convo = (
  scenario: string,
  run: number,
  reply: string,
  over: Partial<Turn> = {},
): Conversation => ({
  scenario,
  run,
  turns: [turn({ reply, ...over }), turn({ said: 'ok', reply: `${reply} 2`, ...over })],
});

const runOf = (version: string, conversations: Conversation[]): ImpressionRun => ({
  kind: 'impression-run',
  promptVersion: version,
  revision: version === 'buddy.26' ? 'abc1234' : 'def5678',
  ranAt: '2026-10-02T10:00:00Z',
  models: ['gemini-3.6-flash'],
  runsPerScenario: 2,
  conversations,
});

const SCENARIOS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7'];
const A = runOf(
  'buddy.26',
  SCENARIOS.flatMap((s) => [0, 1].map((r) => convo(s, r, `OLD ${s}`, { asks: true }))),
);
const B = runOf(
  'buddy.42',
  SCENARIOS.flatMap((s) => [0, 1].map((r) => convo(s, r, `NEW ${s}`, { inputTokens: 12_000 }))),
);

/** The text of whichever conversation stood at position `n` (1 or 2) in the request. */
function standing(req: LlmRequest, n: 1 | 2): string {
  const text = req.contents[0]?.parts[0];
  if (!text || !('text' in text)) throw new Error('no text');
  return text.text.split('Gespräch 2:')[n - 1] ?? '';
}

describe('pairing', () => {
  it('pairs conversation r of a scenario with conversation r of the same scenario', () => {
    const extraA = runOf('buddy.26', [...A.conversations, convo('only_a', 0, 'x')]);
    const { pairs, onlyA, onlyB } = pairConversations(extraA, B);
    expect(pairs).toHaveLength(14);
    for (const p of pairs) {
      expect(p.a.scenario).toBe(p.b.scenario);
      expect(p.a.run).toBe(p.b.run);
    }
    expect(onlyA).toEqual(['only_a']);
    expect(onlyB).toEqual([]);
  });
});

describe('blind judging in both orders', () => {
  it('never shows the judge a version, a revision or a side', () => {
    const req = judgeRequest(A.conversations[0]!, B.conversations[0]!);
    const everything = JSON.stringify(req);
    for (const secret of [
      'buddy.26',
      'buddy.42',
      'abc1234',
      'def5678',
      '"A"',
      '"B"',
      'new version',
    ])
      expect(everything).not.toContain(secret);
    expect(req.purpose).toBe('eval_judge');
    expect(req.temperature).toBe(0);
  });

  it('shows what Buddy did and where he did not answer', () => {
    const text = renderForJudge({
      scenario: 's',
      run: 0,
      turns: [
        turn({
          said: 'frag mich ab',
          reply: 'Los geht’s!',
          tools: ['offer_learning'],
          options: ['Start'],
        }),
        turn({ said: 'ok', status: 'failed', errorCode: 'model_busy', reply: null }),
      ],
    });
    expect(text).toContain('[getan: offer_learning]');
    expect(text).toContain('[Knöpfe: Start]');
    expect(text).toContain('(keine Antwort: model_busy)');
  });

  it('a side wins a pair only when it wins in both orders', () => {
    const p = { scenario: 's', run: 0 };
    // A|B → "first" = A; B|A → "second" = A.
    expect(
      combineOrders(
        p,
        { better: 'first', drivers: [], because: 'x' },
        { better: 'second', drivers: [], because: 'y' },
      ).winner,
    ).toBe('A');
    expect(
      combineOrders(
        p,
        { better: 'second', drivers: [], because: 'x' },
        { better: 'first', drivers: [], because: 'y' },
      ).winner,
    ).toBe('B');
    // Always "first": the judge followed the position, not the content.
    const flip = combineOrders(
      p,
      { better: 'first', drivers: [], because: 'x' },
      { better: 'first', drivers: [], because: 'y' },
    );
    expect(flip).toMatchObject({ winner: 'tie', orderFlip: true, pickedFirst: 2, picked: 2 });
    expect(
      combineOrders(
        p,
        { better: 'same', drivers: [], because: 'x' },
        { better: 'second', drivers: [], because: 'y' },
      ).winner,
    ).toBe('tie');
  });

  it('rejects an answer outside its schema instead of guessing one', () => {
    const p = { scenario: 's', run: 0 };
    const ok = { better: 'first', drivers: [], because: 'x' };
    expect(combineOrders(p, { better: 'first is better' }, ok).winner).toBe('invalid');
    expect(combineOrders(p, ok, { ...ok, drivers: ['vibes'] }).winner).toBe('invalid');
    expect(combineOrders(p, ok, { ...ok, extra: 1 }).winner).toBe('invalid');
    expect(combineOrders(p, ok, null).winner).toBe('invalid');
  });

  it('judges every pair twice and counts a failed judge call as no answer', async () => {
    const { pairs } = pairConversations(A, B);
    const seen: LlmRequest[] = [];
    // Prefers the NEW wording wherever it stands — except on s7, where the call fails.
    const results = await judgePairs(pairs, async (req) => {
      seen.push(req);
      if (standing(req, 1).includes('s7')) throw new Error('provider down');
      return {
        better: standing(req, 1).includes('NEW') ? 'first' : 'second',
        drivers: ['acts_instead_of_asking'],
        because: 'Fragt nicht unnötig nach.',
      };
    });
    expect(seen).toHaveLength(28);
    expect(results.filter((r) => r.winner === 'B')).toHaveLength(12);
    expect(results.filter((r) => r.winner === 'invalid')).toHaveLength(2);
  });
});

describe('the report', () => {
  it('names B better when every decided scenario says so, with the numbers behind it', async () => {
    const { pairs, onlyA, onlyB } = pairConversations(A, B);
    const results = await judgePairs(pairs, async (req) => ({
      better: standing(req, 1).includes('NEW') ? 'first' : 'second',
      drivers: ['acts_instead_of_asking'],
      because: 'x',
    }));
    const report = buildReport(A, B, results, pairs, { onlyA, onlyB });
    expect(report.verdict).toMatchObject({ kind: 'B_better' });
    expect(report.verdict.p).toBeCloseTo(2 / 128, 12);
    expect(report.firstBias).toBe(0.5);
    expect(report.orderFlips).toBe(0);
    const asks = report.measures.find((m) => m.key === 'askBacks')!;
    expect(asks).toMatchObject({ meanA: 2, meanB: 0, meanDiff: -2 });
    const tokens = report.measures.find((m) => m.key === 'inputTokensPerTurn')!;
    expect(tokens.meanDiff).toBe(2000);
    const text = renderReport(report);
    expect(text).toContain('B leaves the better overall impression');
    expect(text).toContain('7 of 7 decided scenarios');
    expect(text).toContain('buddy.26');
  });

  it('never calls a judge that only follows the position a difference', async () => {
    const { pairs, onlyA, onlyB } = pairConversations(A, B);
    const results = await judgePairs(pairs, async () => ({
      better: 'first',
      drivers: [],
      because: 'x',
    }));
    const report = buildReport(A, B, results, pairs, { onlyA, onlyB });
    expect(report.pairs).toMatchObject({ winsA: 0, winsB: 0, ties: 14 });
    expect(report.firstBias).toBe(1);
    expect(report.orderFlips).toBe(14);
    const text = renderReport(report);
    expect(text).toContain('No detectable difference');
    expect(text).toContain('not evidence that A and B are equal');
    expect(text).toContain('no split at all could have reached');
  });

  it('measures the shape of a conversation', () => {
    expect(
      shapeOf({
        scenario: 's',
        run: 0,
        turns: [
          turn({ tools: ['offer_learning'], asks: true }),
          turn({ tools: ['offer_learning'] }),
          turn({ status: 'failed', reply: null, latencyMs: 4000 }),
        ],
      }),
    ).toMatchObject({ askBacks: 1, repeatedOffers: 1, unanswered: 1, latencyMsPerTurn: 2000 });
  });
});
