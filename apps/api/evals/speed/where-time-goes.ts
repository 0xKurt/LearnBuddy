// Where the waiting really goes (issue #165): read from the calls the app already logs, not
// from a benchmark. Per purpose, over an explicit window: how many calls, how long they took
// (p50/p90 of the model's own latency), how many tokens went in, came out and were thought,
// how much came from the provider's prefix cache, and how often the provider throttled us.
//
// Then the question #165 is really about — would a shorter prompt make Buddy faster, or only
// cheaper? — answered with a least-squares fit per purpose:
//
//     latency ≈ base + perInput · input_tokens + perOutput · (output_tokens + thought_tokens)
//
// so "the 6 100 schema tokens cost N ms per turn" becomes a number read off the app's own
// calls. A fit is a correlation, not an experiment: longer conversations have longer prompts
// AND longer answers, so the coefficients are reported with their R² and n, and withheld
// below MIN_FIT_CALLS or when the inputs do not vary enough to separate them. The experiment
// that settles it is the same prompt with and without the schema diet (evals/stream).
//
//   DATABASE_URL=… [DATABASE_CA_CERT=…] npx tsx evals/speed/where-time-goes.ts 2026-09-25 2026-10-02
//
// Reads llm_calls only — aggregates, no learner, no text (docs/privacy.md). The window is
// given, never derived from the database's now() (rule 7).
// requires live verification in Claude Code session (reads the hosted database; proven on a real Postgres in __tests__)

import { pathToFileURL } from 'node:url';

import { createDb, type Db } from '../../src/lib/db.js';

/** Below this many successful calls a purpose gets no fit: three coefficients need data. */
export const MIN_FIT_CALLS = 30;

export type PurposeTime = {
  purpose: string;
  calls: number;
  ok: number;
  rateLimited: number;
  timeouts: number;
  p50Ms: number | null;
  p90Ms: number | null;
  /** The share of all model waiting in the window that this purpose accounts for. */
  shareOfWait: number;
  medianInput: number | null;
  medianOutput: number | null;
  medianThought: number | null;
  /** Share of input tokens served from the provider's prefix cache (a floor, rule 5). */
  cachedShare: number | null;
  fit: Fit | null;
};

export type Fit = {
  n: number;
  baseMs: number;
  /** Milliseconds per 1 000 input tokens. */
  msPer1kInput: number;
  /** Milliseconds per 1 000 output + thought tokens. */
  msPer1kOutput: number;
  r2: number;
};

/** Solves the 3×3 normal equations; null when the inputs do not vary enough to separate. */
export function fitLatency(
  rows: ReadonlyArray<{ input: number; output: number; latency: number }>,
): Fit | null {
  const n = rows.length;
  if (n < MIN_FIT_CALLS) return null;
  // Scale to thousands of tokens so the matrix stays well-conditioned.
  const xs = rows.map((r) => [1, r.input / 1000, r.output / 1000] as const);
  const ys = rows.map((r) => r.latency);
  const m: number[][] = [0, 1, 2].map((i) =>
    [0, 1, 2].map((j) => xs.reduce((s, x) => s + x[i]! * x[j]!, 0)),
  );
  const v: number[] = [0, 1, 2].map((i) => xs.reduce((s, x, k) => s + x[i]! * ys[k]!, 0));
  const beta = solve3(m, v);
  if (!beta) return null;
  const mean = ys.reduce((s, y) => s + y, 0) / n;
  let ssRes = 0;
  let ssTot = 0;
  for (let k = 0; k < n; k++) {
    const x = xs[k]!;
    const pred = beta[0]! + beta[1]! * x[1] + beta[2]! * x[2];
    ssRes += (ys[k]! - pred) ** 2;
    ssTot += (ys[k]! - mean) ** 2;
  }
  return {
    n,
    baseMs: beta[0]!,
    msPer1kInput: beta[1]!,
    msPer1kOutput: beta[2]!,
    r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot,
  };
}

/** Gaussian elimination with partial pivoting; null for a (near-)singular system. */
function solve3(a: number[][], b: number[]): number[] | null {
  const m = a.map((row, i) => [...row, b[i]!]);
  const scale = Math.max(1, ...a.flat().map(Math.abs));
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let r = col + 1; r < 3; r++)
      if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    if (Math.abs(m[pivot]![col]!) < 1e-9 * scale) return null;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = m[r]![col]! / m[col]![col]!;
      for (let c = col; c < 4; c++) m[r]![c]! -= f * m[col]![c]!;
    }
  }
  return [0, 1, 2].map((i) => m[i]![3]! / m[i]![i]!);
}

/** Every purpose's time over [from, to), most waited-on first. */
export async function whereTimeGoes(db: Db, from: Date, to: Date): Promise<PurposeTime[]> {
  if (!(from < to)) throw new Error('the window must start before it ends');
  const rows = await db.query<{
    purpose: string;
    calls: number;
    ok: number;
    rate_limited: number;
    timeouts: number;
    p50: number | null;
    p90: number | null;
    wait: string;
    median_input: number | null;
    median_output: number | null;
    median_thought: number | null;
    input_sum: string;
    cached_sum: string;
  }>(
    `select purpose,
            count(*)::int as calls,
            count(*) filter (where outcome = 'ok')::int as ok,
            count(*) filter (where error_code = 'rate_limited')::int as rate_limited,
            count(*) filter (where outcome = 'timeout')::int as timeouts,
            percentile_cont(0.5) within group (order by latency_ms) filter (where outcome = 'ok') as p50,
            percentile_cont(0.9) within group (order by latency_ms) filter (where outcome = 'ok') as p90,
            coalesce(sum(latency_ms), 0)::bigint as wait,
            percentile_cont(0.5) within group (order by input_tokens) filter (where outcome = 'ok') as median_input,
            percentile_cont(0.5) within group (order by output_tokens) filter (where outcome = 'ok') as median_output,
            percentile_cont(0.5) within group (order by thought_tokens) filter (where outcome = 'ok') as median_thought,
            coalesce(sum(input_tokens) filter (where outcome = 'ok'), 0)::bigint as input_sum,
            coalesce(sum(cached_tokens) filter (where outcome = 'ok'), 0)::bigint as cached_sum
       from llm_calls
      where created_at >= $1 and created_at < $2
      group by purpose`,
    [from, to],
  );
  const totalWait = rows.reduce((s, r) => s + Number(r.wait), 0);
  const out: PurposeTime[] = [];
  for (const r of rows) {
    const samples = await db.query<{ input: number; output: number; latency: number }>(
      `select input_tokens as input, output_tokens + thought_tokens as output, latency_ms as latency
         from llm_calls
        where created_at >= $1 and created_at < $2 and purpose = $3 and outcome = 'ok'`,
      [from, to, r.purpose],
    );
    const input = Number(r.input_sum);
    out.push({
      purpose: r.purpose,
      calls: r.calls,
      ok: r.ok,
      rateLimited: r.rate_limited,
      timeouts: r.timeouts,
      p50Ms: r.p50,
      p90Ms: r.p90,
      shareOfWait: totalWait ? Number(r.wait) / totalWait : 0,
      medianInput: r.median_input,
      medianOutput: r.median_output,
      medianThought: r.median_thought,
      cachedShare: input ? Number(r.cached_sum) / input : null,
      fit: fitLatency(samples),
    });
  }
  return out.sort((a, b) => b.shareOfWait - a.shareOfWait);
}

const s = (ms: number | null): string => (ms === null ? '—' : `${(ms / 1000).toFixed(2)} s`);
const k = (n: number | null): string => (n === null ? '—' : String(Math.round(n)));
const pct = (x: number | null): string => (x === null ? '—' : `${Math.round(x * 100)} %`);

export function renderTimeTable(rows: readonly PurposeTime[], from: Date, to: Date): string {
  const lines = [
    `Model time by purpose, ${from.toISOString()} – ${to.toISOString()} (llm_calls; model latency only, no network to the phone)`,
    '',
    '| purpose | calls | ok | 429 | timeout | p50 | p90 | share of waiting | median in | median out | median thought | cached |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...rows.map(
      (r) =>
        `| ${r.purpose} | ${r.calls} | ${r.ok} | ${r.rateLimited} | ${r.timeouts} | ${s(r.p50Ms)} | ${s(r.p90Ms)} | ${pct(r.shareOfWait)} | ${k(r.medianInput)} | ${k(r.medianOutput)} | ${k(r.medianThought)} | ${pct(r.cachedShare)} |`,
    ),
    '',
    `Latency fit per purpose (ok calls; withheld below ${MIN_FIT_CALLS} calls or when tokens do not vary enough). Correlation, not an experiment:`,
    '',
    '| purpose | n | base | per 1k input | per 1k output+thought | R² |',
    '|---|---:|---:|---:|---:|---:|',
    ...rows.map((r) =>
      r.fit
        ? `| ${r.purpose} | ${r.fit.n} | ${Math.round(r.fit.baseMs)} ms | ${Math.round(r.fit.msPer1kInput)} ms | ${Math.round(r.fit.msPer1kOutput)} ms | ${r.fit.r2.toFixed(2)} |`
        : `| ${r.purpose} | ${r.ok} | — | — | — | — |`,
    ),
  ];
  return lines.join('\n');
}

async function main(): Promise<void> {
  const [fromArg, toArg] = process.argv.slice(2);
  const url = process.env.DATABASE_URL;
  if (!fromArg || !toArg || !url)
    throw new Error('usage: DATABASE_URL=… where-time-goes.ts <from YYYY-MM-DD> <to YYYY-MM-DD>');
  const from = new Date(`${fromArg}T00:00:00Z`);
  const to = new Date(`${toArg}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()))
    throw new Error('dates as YYYY-MM-DD');
  // Supabase needs its own root certificate (Dashboard → Database → SSL), as in production.
  const ca = process.env.DATABASE_CA_CERT;
  const db = createDb(url, ca ? { max: 1, ca } : { max: 1 });
  try {
    console.info(renderTimeTable(await whereTimeGoes(db, from, to), from, to));
  } finally {
    await db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
