import { describe, expect, it } from 'vitest';
import { VERTEX_EU_PRICES } from '../../llm/pricing.js';
import { OPENAI_EU_PRICES } from '../../llm/openai-config.js';
import type { LlmUsage } from '../../llm/gateway.js';
import type { BenchRow } from '../bench/runner.js';
import {
  afterIntro,
  costTable,
  listUsd,
  operationUsd,
  projection,
  summarize,
} from '../bench/costs.js';

const usage = (model: string, over: Partial<LlmUsage> = {}): LlmUsage => ({
  model,
  inputTokens: 1_000_000,
  outputTokens: 100_000,
  thoughtTokens: 0,
  cachedTokens: 0,
  costMicros: 1,
  latencyMs: 1,
  ...over,
});
const row = (candidate: string, workload: string, u: LlmUsage | null): BenchRow => ({
  round: 1,
  candidate,
  workload,
  valid: u !== null,
  error: null,
  firstPartialMs: null,
  firstReplyMs: null,
  totalMs: 1,
  attempts: 1,
  usage: u,
  budgetCharge: 0,
  receiptUsd: 0,
  costStatus: u ? 'receipt' : 'not_sent',
});
const vertex = { today: VERTEX_EU_PRICES, from2027: afterIntro(VERTEX_EU_PRICES) };

describe('benchmark cost view', () => {
  it('doubles only the introductory Flash prices after 2026', () => {
    const later = afterIntro(VERTEX_EU_PRICES).models;
    expect(later['gemini-3.6-flash']).toMatchObject({ inputPerM: 1.65, outputPerM: 8.25 });
    expect(later['gemini-3.6-flash']!.cachedInputPerM).toBeCloseTo(0.165);
    expect(later['gemini-3.1-flash-lite']).toEqual(
      VERTEX_EU_PRICES.models['gemini-3.1-flash-lite'],
    );
  });

  it('prices cache hits at the cache rate and reasoning as output', () => {
    // 0.6M at $0.825 + 0.4M at $0.0825 + (0.1M + 0.05M) at $4.95
    const u = usage('gpt-5.4-mini', { cachedTokens: 400_000, thoughtTokens: 50_000 });
    expect(listUsd(OPENAI_EU_PRICES, u)).toBeCloseTo(0.495 + 0.033 + 0.7425, 6);
    expect(listUsd(OPENAI_EU_PRICES, usage('unknown'))).toBeNull();
    // The receipt names the dated snapshot; it is billed at its model's price (live run 23.10.).
    expect(listUsd(OPENAI_EU_PRICES, { ...u, model: 'gpt-5.4-mini-2026-03-17' })).toBe(
      listUsd(OPENAI_EU_PRICES, u),
    );
  });

  it('adds the form choice to the operation it prepares and skips unsent calls', () => {
    const rows = [
      row('vertex', 'buddy_turn:a', usage('gemini-3.6-flash')),
      row('vertex', 'buddy_turn:b', usage('gemini-3.6-flash', { outputTokens: 0 })),
      row('vertex', 'extraction', usage('gemini-3.6-flash')),
      row('vertex', 'forms:extraction', usage('gemini-3.1-flash-lite')),
      row('vertex', 'tutor', null),
    ];
    const s = summarize(rows, { vertex });
    expect(s.map((x) => x.purpose)).toEqual([
      'buddy_turn',
      'extraction',
      'forms:extraction',
      'tutor',
    ]);
    expect(s[0]).toMatchObject({ receipts: 2, sent: 2, output: 50_000 });
    expect(operationUsd(s, 'vertex', 'extraction', 'todayUsd')).toBeCloseTo(
      0.825 + 0.4125 + 0.275 + 0.165,
      6,
    );
    // No receipt for tutor: a mix that needs it shows no number instead of an undercount.
    const lines = projection(s, [{ name: 'm', measured: false, counts: { tutor: 1 } }], 20);
    expect(lines.at(-1)).toBe('| m | assumption | vertex | – | – | – | – | – | – |');
    expect(costTable(s)).toHaveLength(2 + s.length);
  });
});
