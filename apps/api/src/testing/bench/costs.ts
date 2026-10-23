// Cost view of a provider benchmark (#893, docs/decisions/cost-comparison-2026-10-23.md):
// tokens and dollars per purpose × candidate from the receipts each production gateway
// recorded, priced twice — the app's ceiling formula (cache at full price) and the provider's
// list price with its cache discount. Benchmark-only; production cost recording is unchanged.
// requires live verification in Claude Code session (pure arithmetic over recorded receipts).
import type { LlmUsage } from '../../llm/gateway.js';
import { priceModel, type PriceTable } from '../../llm/pricing.js';
import type { BenchRow } from './runner.js';

type ModelPrice = PriceTable['models'][string];

/** Vertex's Flash 3.6–3.8 prices in `VERTEX_EU_PRICES` are net of a 50 % credit until
 * 2026-12-31. The gross invoice today and the list price from 2027-01-01 are twice that
 * (https://cloud.google.com/vertex-ai/generative-ai/pricing, read 2026-10-23). */
const INTRO_FLASH = new Set(['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash']);
const doubled = (p: ModelPrice): ModelPrice => ({
  inputPerM: p.inputPerM * 2,
  outputPerM: p.outputPerM * 2,
  ...(p.audioInputPerM === undefined ? {} : { audioInputPerM: p.audioInputPerM * 2 }),
  ...(p.cachedInputPerM === undefined ? {} : { cachedInputPerM: p.cachedInputPerM * 2 }),
});
export function afterIntro(table: PriceTable): PriceTable {
  return {
    ...table,
    models: Object.fromEntries(
      Object.entries(table.models).map(([id, p]) => [id, INTRO_FLASH.has(id) ? doubled(p) : p]),
    ),
  };
}

/** List price with the provider's cache discount; null for a model the table does not price.
 * The benchmark workloads carry no audio, so the text input price applies to every input. */
export function listUsd(table: PriceTable, usage: LlmUsage): number | null {
  const p = table.models[priceModel(usage.model)];
  if (!p) return null;
  const cached = Math.min(usage.cachedTokens, usage.inputTokens);
  return (
    ((usage.inputTokens - cached) * p.inputPerM +
      cached * (p.cachedInputPerM ?? p.inputPerM) +
      (usage.outputTokens + usage.thoughtTokens) * p.outputPerM) /
    1e6
  );
}

export type Prices = { today: PriceTable; from2027: PriceTable };
export type CostSummary = {
  candidate: string;
  purpose: string;
  sent: number;
  valid: number;
  receipts: number;
  input: number;
  cached: number;
  output: number;
  reasoning: number;
  cacheShare: number;
  receiptUsd: number;
  todayUsd: number | null;
  from2027Usd: number | null;
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const meanOrNull = (xs: (number | null)[]) =>
  xs.length && xs.every((x) => x !== null) ? mean(xs as number[]) : null;

/** `buddy_turn:maths` → buddy_turn; a form choice keeps what it prepares (`forms:explain`). */
const kindOf = (workload: string) =>
  workload.startsWith('forms:') ? workload : workload.split(':')[0]!;
/** The operation a call belongs to: a form choice counts with the reading/run it prepares. */
const operationOf = (kind: string) =>
  kind.startsWith('forms:') ? kind.slice('forms:'.length) : kind;

export function summarize(rows: BenchRow[], prices: Record<string, Prices>): CostSummary[] {
  const groups = new Map<string, BenchRow[]>();
  for (const r of rows) {
    const k = `${r.candidate}\u0000${kindOf(r.workload)}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups].map(([k, group]) => {
    const [candidate, purpose] = k.split('\u0000') as [string, string];
    const price = prices[candidate];
    const billed = group.filter((r) => r.costStatus === 'receipt' && r.usage);
    const usages = billed.map((r) => r.usage!);
    const inputs = usages.reduce((n, u) => n + u.inputTokens, 0);
    return {
      candidate,
      purpose,
      sent: group.filter((r) => r.costStatus !== 'not_sent').length,
      valid: group.filter((r) => r.valid).length,
      receipts: usages.length,
      input: mean(usages.map((u) => u.inputTokens)),
      cached: mean(usages.map((u) => u.cachedTokens)),
      output: mean(usages.map((u) => u.outputTokens)),
      reasoning: mean(usages.map((u) => u.thoughtTokens)),
      cacheShare: inputs ? usages.reduce((n, u) => n + u.cachedTokens, 0) / inputs : 0,
      receiptUsd: mean(usages.map((u) => u.costMicros / 1e6)),
      todayUsd: price ? meanOrNull(usages.map((u) => listUsd(price.today, u))) : null,
      from2027Usd: price ? meanOrNull(usages.map((u) => listUsd(price.from2027, u))) : null,
    };
  });
}

const usd = (x: number | null, digits = 5) => (x === null ? '–' : `$${x.toFixed(digits)}`);
const int = (x: number) => Math.round(x).toLocaleString('en-US');

export function costTable(summaries: CostSummary[]): string[] {
  return [
    '| candidate | purpose | valid | receipts | input | cached | output | reasoning | cache share | $/call receipt (cache at full price) | $/call list today | $/call list from 2027 | $ per 1,000 calls today |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...summaries.map(
      (s) =>
        `| ${s.candidate} | ${s.purpose} | ${s.valid}/${s.sent} | ${s.receipts} | ${int(s.input)} | ${int(s.cached)} | ${int(s.output)} | ${int(s.reasoning)} | ${(s.cacheShare * 100).toFixed(1)} % | ${usd(s.receiptUsd)} | ${usd(s.todayUsd)} | ${usd(s.from2027Usd)} | ${usd(s.todayUsd === null ? null : s.todayUsd * 1000, 2)} |`,
    ),
  ];
}

/** Calls per operation. `measured` marks counts taken from production `llm_calls`. */
export type UsageMix = { name: string; measured: boolean; counts: Record<string, number> };

/** Measured cache share (list today / from 2027) or none at all (the receipt formula). */
type Era = 'todayUsd' | 'receiptUsd' | 'from2027Usd';

/** One operation = one call of each kind it consists of (Vertex: a form choice + the reading). */
export function operationUsd(
  summaries: CostSummary[],
  candidate: string,
  op: string,
  era: Era,
): number | null {
  const parts = summaries.filter((s) => s.candidate === candidate && operationOf(s.purpose) === op);
  if (!parts.length || parts.some((s) => s.receipts === 0 || s[era] === null)) return null;
  return parts.reduce((n, s) => n + s[era]!, 0);
}

export function projection(summaries: CostSummary[], mixes: UsageMix[], days: number): string[] {
  const candidates = [...new Set(summaries.map((s) => s.candidate))];
  const eras: Era[] = ['todayUsd', 'receiptUsd', 'from2027Usd'];
  const cost = (c: string, mix: UsageMix, era: Era) => {
    let sum = 0;
    for (const [op, n] of Object.entries(mix.counts)) {
      const v = operationUsd(summaries, c, op, era);
      if (v === null) return null;
      sum += v * n;
    }
    return sum;
  };
  const lines = [
    `| mix | basis | candidate | $ today | $ today, no cache hits | $ from 2027 | $ per month today (${days} days) | $ per month, no cache hits | $ per month from 2027 |`,
    '|---|---|---|---:|---:|---:|---:|---:|---:|',
  ];
  for (const mix of mixes)
    for (const c of candidates) {
      const totals = eras.map((era) => cost(c, mix, era));
      const monthly = totals.map((t) =>
        mix.measured ? '–' : usd(t === null ? null : t * days, 2),
      );
      lines.push(
        `| ${mix.name} | ${mix.measured ? 'measured counts' : 'assumption'} | ${c} | ${totals.map((t) => usd(t, 4)).join(' | ')} | ${monthly.join(' | ')} |`,
      );
    }
  return lines;
}

/** Usage mixes for the projection (docs/decisions/cost-comparison-2026-10-23.md §Projection).
 * Only the first is measured: every benchmarked call in production `llm_calls`, 28.09.–14.10.2026,
 * two learners (#626, 16.10.). The days are assumptions, never measurements. */
export const MIXES: UsageMix[] = [
  {
    name: 'production 28.09.–14.10. (2 learners)',
    measured: true,
    counts: { buddy_turn: 49, tutor: 20, explain: 16, extraction: 6 },
  },
  {
    name: 'light day',
    measured: false,
    counts: { buddy_turn: 5, tutor: 2, explain: 1, extraction: 0 },
  },
  {
    name: 'typical day (KI-Audit F §6b)',
    measured: false,
    counts: { buddy_turn: 10, tutor: 3, explain: 1, extraction: 1 },
  },
  {
    name: 'intensive day',
    measured: false,
    counts: { buddy_turn: 30, tutor: 8, explain: 2, extraction: 2 },
  },
];
