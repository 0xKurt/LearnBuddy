// What she waits on the device, and what preparing ahead costs (issues #169, #59): reads the
// summed-up device timings (`perf_rollups`) and the record of preparations ahead
// (`speculative_preparations`) and prints Markdown for docs/speed-audit.md.
//
//   DATABASE_URL=… pnpm --filter @learnbuddy/api exec tsx scripts/perf-report.ts [days=7]
//
// Read-only. Percentiles are bucket bounds ("≤ 1 s"), never interpolated (modules/perf/service.ts).
// requires live verification in Claude Code session (reads whichever database DATABASE_URL names)

import { createDb } from '../src/lib/db.js';
import { summarisePerf } from '../src/modules/perf/service.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
const days = Number(process.argv[2] ?? 7);
const db = createDb(url, { max: 1 });

/** The budgets of issue #59, per action (ms); the rest has none yet. */
const BUDGET: Record<string, number> = {
  reply: 1500,
  start_offer: 1000,
  start_step: 1000,
  first_audio: 1000,
  question_audio: 1000,
  next_question: 500,
  relisten: 500,
};

const fmt = (ms: number | null) =>
  ms === null ? '> 15 s' : ms < 1000 ? `≤ ${ms} ms` : `≤ ${(ms / 1000).toLocaleString('de-DE')} s`;

try {
  const rows = await db.query<{
    platform: string;
    build: string;
    action: string;
    bucket_ms: number;
    count: number;
  }>(
    `select platform, build, action, bucket_ms, sum(count)::int as count
       from perf_rollups where day > current_date - $1::int
      group by 1, 2, 3, 4 order by 1, 2, 3, 4`,
    [days],
  );
  console.log(`## Am Gerät gemessen (letzte ${days} Tage, \`perf_rollups\`)\n`);
  console.log('| Plattform | Build | Aktion | n | Median | p90 | im Budget |');
  console.log('| --- | --- | --- | --- | --- | --- | --- |');
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.platform}|${r.build}|${r.action}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const counters: string[] = [];
  for (const [key, group] of groups) {
    const [platform, build, action] = key.split('|') as [string, string, string];
    if (group.every((r) => r.bucket_ms === -1)) {
      counters.push(`| ${platform} | ${build} | ${action} | ${group[0]!.count} |`);
      continue;
    }
    const budget = BUDGET[action] ?? null;
    const s = summarisePerf(group, budget);
    const share =
      s.withinBudget === null
        ? '—'
        : `${Math.round(s.withinBudget * 100)} % ≤ ${fmt(budget).replace('≤ ', '')}`;
    console.log(
      `| ${platform} | ${build} | ${action} | ${s.n} | ${fmt(s.p50)} | ${fmt(s.p90)} | ${share} |`,
    );
  }
  if (counters.length > 0) {
    console.log('\n| Plattform | Build | Zähler | n |\n| --- | --- | --- | --- |');
    for (const c of counters) console.log(c);
  }

  // A preparation ahead that was ready and not used within a day was a model call for nothing.
  const spec = await db.one<{
    started: number;
    ready: number;
    used: number;
    wasted: number;
    failed: number;
  }>(
    `select count(*)::int as started,
            count(*) filter (where outcome = 'ready')::int as ready,
            count(*) filter (where used_at is not null)::int as used,
            count(*) filter (where outcome = 'ready' and used_at is null
                               and started_at < now() - interval '1 day')::int as wasted,
            count(*) filter (where outcome in ('failed', 'refused'))::int as failed
       from speculative_preparations where started_at > now() - make_interval(days => $1::int)`,
    [days],
  );
  console.log(`\n## Vorab vorbereitet (letzte ${days} Tage, \`speculative_preparations\`)\n`);
  console.log('| gestartet | fertig | genutzt | verworfen (> 1 Tag ungenutzt) | gescheitert |');
  console.log('| --- | --- | --- | --- | --- |');
  console.log(
    `| ${spec.started} | ${spec.ready} | ${spec.used} | ${spec.wasted} | ${spec.failed} |`,
  );
  if (spec.ready > 0) {
    console.log(
      `\nVerwurfquote: ${Math.round((spec.wasted / spec.ready) * 100)} % der fertigen Vorbereitungen.`,
    );
  }
} finally {
  await db.close();
}
