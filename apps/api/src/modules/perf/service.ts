// How long she waits, as the device measured it (issue #169, docs/privacy.md §Device timing).
//
// Until now the app's own measurements (`apps/mobile/lib/perf.ts`, #66) stayed on the phone and
// could be read only with a cable and `adb logcat` — so in four days there was exactly one series
// from a real device. Now the app sends them, summed up: per action, how many waits fell into
// which fixed bucket. Stored per UTC day, platform and build. No learner, no account, no content,
// no time of day, no single measurement: the request is signed in (only the app can send), but
// who sent it is not written anywhere.

import { PERF_BUCKET_COUNTER, type PerfReport } from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';

/** Adds one report to the day's counts. Rows with the same key in one report are summed first. */
export async function recordPerf(deps: Deps, report: PerfReport): Promise<number> {
  const day = deps.now().toISOString().slice(0, 10);
  const rows = new Map<string, { action: string; bucket: number; count: number }>();
  const add = (action: string, bucket: number, count: number) => {
    const key = `${action}|${bucket}`;
    const row = rows.get(key) ?? { action, bucket, count: 0 };
    row.count += count;
    rows.set(key, row);
  };
  for (const s of report.spans) add(s.action, s.bucket_ms, s.count);
  for (const c of report.counters) add(c.counter, PERF_BUCKET_COUNTER, c.count);
  if (rows.size === 0) return 0;
  const list = [...rows.values()];
  await deps.db.query(
    `insert into perf_rollups (day, platform, build, action, bucket_ms, count)
     select $1::date, $2, $3, r.action, r.bucket_ms, r.count
       from unnest($4::text[], $5::int[], $6::int[]) as r(action, bucket_ms, count)
     on conflict (day, platform, build, action, bucket_ms)
       do update set count = perf_rollups.count + excluded.count`,
    [
      day,
      report.platform,
      report.build,
      list.map((r) => r.action),
      list.map((r) => r.bucket),
      list.map((r) => r.count),
    ],
  );
  return list.length;
}

/** Retention: the counts are kept 180 days — long enough to compare before and after a lever. */
export async function purgePerf(deps: Deps): Promise<number> {
  const cutoff = new Date(deps.now().getTime() - 180 * 86_400_000).toISOString().slice(0, 10);
  const gone = await deps.db.query(
    `delete from perf_rollups
      where ctid in (select ctid from perf_rollups where day < $1::date limit 2000)
      returning 1`,
    [cutoff],
  );
  return gone.length;
}

export type PerfSummary = {
  action: string;
  n: number;
  /** Upper bound of the bucket the median / p90 falls into; null = beyond the last bound. */
  p50: number | null;
  p90: number | null;
  /** Share of waits within `budgetMs` (counted bucket by bucket, so never flattering). */
  withinBudget: number | null;
};

/**
 * Median and p90 from bucket counts. A percentile is reported as the upper bound of the bucket
 * it falls into — "≤ 1 s", never a made-up value between two bounds.
 */
export function summarisePerf(
  rows: ReadonlyArray<{ bucket_ms: number; count: number }>,
  budgetMs: number | null = null,
): Omit<PerfSummary, 'action'> {
  const sorted = rows
    .filter((r) => r.bucket_ms !== -1 && r.count > 0)
    .map((r) => ({ bound: r.bucket_ms === 0 ? Number.POSITIVE_INFINITY : r.bucket_ms, n: r.count }))
    .sort((a, b) => a.bound - b.bound);
  const n = sorted.reduce((s, r) => s + r.n, 0);
  const at = (q: number): number | null => {
    if (n === 0) return null;
    const rank = Math.ceil(q * n);
    let seen = 0;
    for (const r of sorted) {
      seen += r.n;
      if (seen >= rank) return Number.isFinite(r.bound) ? r.bound : null;
    }
    return null;
  };
  const within =
    budgetMs === null || n === 0
      ? null
      : sorted.filter((r) => r.bound <= budgetMs).reduce((s, r) => s + r.n, 0) / n;
  return { n, p50: at(0.5), p90: at(0.9), withinBudget: within };
}
