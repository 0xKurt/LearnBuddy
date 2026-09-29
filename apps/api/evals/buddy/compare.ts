// Regression comparison between two buddy-eval runs (issue #80). Reads two
// transcripts written by run.ts (BUDDY_EVAL_OUT=…) and shows, case by case,
// what changed between two prompt versions: pass→fail regressions first, then
// fixed cases, still-failing ones, changed behaviour (tools/options), and
// rewordings to read side by side. Costs are shown per run and per changed case.
//
//   cd apps/api
//   BUDDY_EVAL_OUT=a.json npx tsx evals/buddy/run.ts     # old prompt version
//   BUDDY_EVAL_OUT=b.json npx tsx evals/buddy/run.ts     # new prompt version
//   npx tsx evals/buddy/compare.ts a.json b.json
//
// Exit code 1 when a case regressed (passed in the first run, fails in the
// second) — cases missing from one run are listed but do not fail, so partial
// runs (run.ts with case ids) can be compared too.
// requires live verification in Claude Code session (reads transcripts of live-model runs)

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { z } from 'zod';

// Tolerant of transcripts written before costs were recorded (issue #80's first cut).
const CaseResult = z.object({
  id: z.string(),
  ok: z.boolean(),
  problems: z.array(z.string()),
  reply: z.string().nullable(),
  options: z.array(z.string()).nullable(),
  tools: z.array(z.string()),
  calls: z.number().int().optional(),
  costMicros: z.number().int().optional(),
  inputTokens: z.number().int().optional(),
  cachedTokens: z.number().int().optional(),
});
const RunFile = z.object({
  promptVersion: z.string(),
  ranAt: z.string().optional(),
  models: z.array(z.string()).optional(),
  costMicros: z.number().int().optional(),
  cases: z.array(CaseResult),
});
export type CaseResult = z.infer<typeof CaseResult>;
export type RunFile = z.infer<typeof RunFile>;

export type DiffKind = 'regressed' | 'fixed' | 'still-failing' | 'behaviour' | 'reworded' | 'same';
export type CaseDiff = { id: string; kind: DiffKind; a: CaseResult; b: CaseResult };
export type Comparison = {
  a: RunFile;
  b: RunFile;
  /** Case ids present in only one of the runs (different fallset — nothing to compare). */
  onlyA: string[];
  onlyB: string[];
  /** Shared cases in the first run's order. */
  diffs: CaseDiff[];
};

const sameList = (x: readonly string[] | null, y: readonly string[] | null): boolean =>
  JSON.stringify(x) === JSON.stringify(y);

function classify(a: CaseResult, b: CaseResult): DiffKind {
  if (a.ok && !b.ok) return 'regressed';
  if (!a.ok && b.ok) return 'fixed';
  if (!a.ok && !b.ok) return 'still-failing';
  if (!sameList(a.tools, b.tools) || !sameList(a.options, b.options)) return 'behaviour';
  if (a.reply !== b.reply) return 'reworded';
  return 'same';
}

export function compareRuns(a: RunFile, b: RunFile): Comparison {
  const byIdB = new Map(b.cases.map((c) => [c.id, c]));
  const idsA = new Set(a.cases.map((c) => c.id));
  return {
    a,
    b,
    onlyA: a.cases.filter((c) => !byIdB.has(c.id)).map((c) => c.id),
    onlyB: b.cases.filter((c) => !idsA.has(c.id)).map((c) => c.id),
    diffs: a.cases.flatMap((ca) => {
      const cb = byIdB.get(ca.id);
      return cb ? [{ id: ca.id, kind: classify(ca, cb), a: ca, b: cb }] : [];
    }),
  };
}

const usd = (micros: number | undefined): string =>
  micros === undefined ? '$?' : `$${(micros / 1e6).toFixed(4)}`;

function runLine(label: string, run: RunFile): string {
  const passed = run.cases.filter((c) => c.ok).length;
  const cost = run.costMicros ?? sumMicros(run.cases);
  return (
    `${label}: ${run.promptVersion} · ${run.ranAt ?? 'time unknown'} · ` +
    `${passed}/${run.cases.length} passed · ${usd(cost)}` +
    (run.models?.length ? ` · ${run.models.join(', ')}` : '')
  );
}

/** Total from the cases when the file has no total (undefined when they carry no costs either). */
function sumMicros(cases: readonly CaseResult[]): number | undefined {
  const known = cases.filter((c) => c.costMicros !== undefined);
  return known.length ? known.reduce((s, c) => s + (c.costMicros ?? 0), 0) : undefined;
}

function caseCost(d: CaseDiff): string {
  return d.a.costMicros === undefined && d.b.costMicros === undefined
    ? ''
    : `  (${usd(d.a.costMicros)} → ${usd(d.b.costMicros)})`;
}

function caseBlock(d: CaseDiff): string[] {
  const lines = [`  ${d.id}${caseCost(d)}`];
  if (d.kind === 'regressed' || d.kind === 'still-failing')
    lines.push(...d.b.problems.map((p) => `    problem: ${p}`));
  if (d.kind === 'fixed') lines.push(...d.a.problems.map((p) => `    was: ${p}`));
  if (!sameList(d.a.tools, d.b.tools))
    lines.push(`    tools: [${d.a.tools.join(', ')}] → [${d.b.tools.join(', ')}]`);
  if (!sameList(d.a.options, d.b.options))
    lines.push(`    options: ${JSON.stringify(d.a.options)} → ${JSON.stringify(d.b.options)}`);
  if (d.a.reply !== d.b.reply)
    lines.push(`    A: ${d.a.reply ?? '—'}`, `    B: ${d.b.reply ?? '—'}`);
  return lines;
}

const SECTIONS: ReadonlyArray<{ kind: DiffKind; title: string }> = [
  { kind: 'regressed', title: 'regressed (passed in A, fails in B)' },
  { kind: 'fixed', title: 'fixed (failed in A, passes in B)' },
  { kind: 'still-failing', title: 'still failing in both' },
  { kind: 'behaviour', title: 'changed behaviour (tools or options)' },
  { kind: 'reworded', title: 'reworded only (read side by side)' },
];

export function renderComparison(cmp: Comparison): string[] {
  const lines = [runLine('A', cmp.a), runLine('B', cmp.b), ''];
  for (const { kind, title } of SECTIONS) {
    const of = cmp.diffs.filter((d) => d.kind === kind);
    if (!of.length) continue;
    lines.push(`${title} — ${of.length}:`);
    for (const d of of) lines.push(...caseBlock(d), '');
  }
  if (cmp.onlyA.length) lines.push(`only in A (not compared): ${cmp.onlyA.join(', ')}`, '');
  if (cmp.onlyB.length) lines.push(`only in B (not compared): ${cmp.onlyB.join(', ')}`, '');
  const count = (kind: DiffKind): number => cmp.diffs.filter((d) => d.kind === kind).length;
  lines.push(
    `${cmp.diffs.length} shared case(s): ${count('regressed')} regressed · ${count('fixed')} fixed · ` +
      `${count('still-failing')} still failing · ${count('behaviour')} changed behaviour · ` +
      `${count('reworded')} reworded · ${count('same')} identical`,
  );
  return lines;
}

function main(): void {
  const [fileA, fileB] = process.argv.slice(2);
  if (!fileA || !fileB) {
    console.error('Usage: npx tsx evals/buddy/compare.ts <old-run.json> <new-run.json>');
    process.exit(2);
  }
  const a = RunFile.parse(JSON.parse(readFileSync(fileA, 'utf8')));
  const b = RunFile.parse(JSON.parse(readFileSync(fileB, 'utf8')));
  const cmp = compareRuns(a, b);
  for (const line of renderComparison(cmp)) console.info(line);
  process.exit(cmp.diffs.some((d) => d.kind === 'regressed') ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
