// The overall-impression comparison itself (issue #127): reads two runs (run.ts), lets a
// model judge each pair of conversations BLIND and in BOTH orders, and reports what the
// numbers carry — and nothing more.
//
//   npx tsx evals/impression/judge.ts a.json b.json        (from apps/api)
//
// The design, and why:
//   - Paired. Conversation r of scenario s in A is compared with conversation r of the same
//     scenario in B: same sentences, same setup, only the revision differs.
//   - Blind. The judge never sees a version, a revision or which side is "new". It reads
//     "Gespräch 1" and "Gespräch 2".
//   - Both orders. A language-model judge prefers whatever stands first (or second) more
//     often than chance. Every pair is judged as A|B and as B|A; a side wins the pair only
//     when it wins in both orders, otherwise the pair is a tie. The share of pairs where the
//     two orders disagreed is reported — it is the judge's own noise floor.
//   - Rejected, never repaired. A judge answer that fails its schema counts as no answer,
//     is reported, and is never guessed into a preference (Regel 0).
//   - The scenario is the unit of evidence (stats.ts): runs of one scenario decide that
//     scenario by majority; the sign test runs over scenarios. "No detectable difference" is
//     said with the number of scenarios that would have been needed, never as "equal".
//
// Everything except main() is pure and proven offline in __tests__/judge.test.ts.
// requires live verification in Claude Code session (the judge is a live model)

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { z } from 'zod';

import { loadConfig } from '../../src/config.js';
import type { LlmRequest } from '../../src/llm/gateway.js';
import { toJsonSchema } from '../../src/llm/json-schema.js';
import { VertexGateway } from '../../src/llm/vertex.js';
import { evalEnv } from '../eval-env.js';
import {
  pairedMetric,
  scenarioPreference,
  verdict,
  wilson,
  type PairedMetric,
  type ScenarioPreference,
  type Verdict,
} from './stats.js';
import { ImpressionRun, type Conversation } from './transcript.js';

export const JUDGE_PROMPT_VERSION = 'impression-judge.1';

/** What the judge may name as the reason for its preference. A fixed list, so it can be counted. */
export const CRITERIA = [
  'moves_forward',
  'acts_instead_of_asking',
  'no_repetition',
  'calm_warm_tone',
  'brevity',
  'keeps_her_thinking',
  'honest_claims',
] as const;

export const JudgeAnswer = z
  .object({
    better: z
      .enum(['first', 'second', 'same'])
      .describe('Which conversation leaves the better overall impression; "same" if neither does'),
    drivers: z
      .array(z.enum(CRITERIA))
      .max(3)
      .describe('Up to three criteria that decided it (empty when "same")'),
    because: z.string().min(1).max(400).describe('One or two sentences, concrete'),
  })
  .strict();
export type JudgeAnswer = z.infer<typeof JudgeAnswer>;

export const JUDGE_SYSTEM = `Du bewertest zwei Gespräche zwischen einem Kind (Lernende) und "Buddy", einem Lernbegleiter in einer App. Beide Gespräche beginnen mit denselben Sätzen des Kindes; die Antworten unterscheiden sich.

Beurteile den GESAMTEINDRUCK des ganzen Gesprächs, nicht einzelne Sätze. Ein gutes Gespräch:
- kommt voran: am Ende steht etwas, mit dem sie weitermachen kann (moves_forward)
- handelt, wo nichts unklar ist, statt nachzufragen; fragt nur bei echter Unklarheit oder vor Löschen (acts_instead_of_asking)
- wiederholt kein Angebot und keinen Satz, der schon dasteht (no_repetition)
- ist ruhig, freundlich, nicht kindisch, nicht klinisch, nie hart (calm_warm_tone)
- ist kurz; kein Text, den ein Kind überspringt (brevity)
- löst Hausaufgaben nicht vor, sondern lässt sie selbst denken (keeps_her_thinking)
- behauptet nichts, was nicht passiert ist: "[getan: …]" zeigt, was Buddy wirklich ausgelöst hat (honest_claims)

Ein Zug ohne Antwort ("keine Antwort") ist für das Kind ein Fehler im Gespräch.
Antworte "same", wenn du keinen klaren Unterschied siehst — das ist eine gültige, ehrliche Antwort.`;

const LABEL = { de: { learner: 'Kind', buddy: 'Buddy' } } as const;

/** One conversation as the judge reads it: what she said, what he said, and what he did. */
export function renderForJudge(c: Conversation): string {
  return c.turns
    .map((t) => {
      const answer =
        t.status === 'done' && t.reply
          ? t.reply
          : `(keine Antwort${t.errorCode ? `: ${t.errorCode}` : ''})`;
      const did = t.tools.length ? `\n  [getan: ${t.tools.join(', ')}]` : '';
      const buttons = t.options.length ? `\n  [Knöpfe: ${t.options.join(' · ')}]` : '';
      return `${LABEL.de.learner}: ${t.said}\n${LABEL.de.buddy}: ${answer}${did}${buttons}`;
    })
    .join('\n');
}

export function judgeRequest(first: Conversation, second: Conversation): LlmRequest {
  return {
    purpose: 'eval_judge',
    tier: 'smart',
    promptVersion: JUDGE_PROMPT_VERSION,
    system: JUDGE_SYSTEM,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Gespräch 1:\n${renderForJudge(first)}\n\nGespräch 2:\n${renderForJudge(second)}`,
          },
        ],
      },
    ],
    schema: toJsonSchema(JudgeAnswer),
    maxOutputTokens: 1024,
    temperature: 0,
    timeoutMs: 60_000,
    thinkingBudget: 512,
  };
}

export type Pair = { scenario: string; run: number; a: Conversation; b: Conversation };

/** Conversation r of a scenario in A with conversation r of the same scenario in B. */
export function pairConversations(
  a: ImpressionRun,
  b: ImpressionRun,
): { pairs: Pair[]; onlyA: string[]; onlyB: string[] } {
  const key = (c: Conversation) => `${c.scenario}#${c.run}`;
  const inB = new Map(b.conversations.map((c) => [key(c), c]));
  const scenariosA = new Set(a.conversations.map((c) => c.scenario));
  const scenariosB = new Set(b.conversations.map((c) => c.scenario));
  const pairs: Pair[] = [];
  for (const ca of a.conversations) {
    const cb = inB.get(key(ca));
    if (cb) pairs.push({ scenario: ca.scenario, run: ca.run, a: ca, b: cb });
  }
  return {
    pairs,
    onlyA: [...scenariosA].filter((s) => !scenariosB.has(s)),
    onlyB: [...scenariosB].filter((s) => !scenariosA.has(s)),
  };
}

/** One order's answer, translated from "first/second" back to the side it really was. */
export type Side = 'A' | 'B' | 'same' | 'invalid';

export function sideOf(
  raw: unknown,
  firstIs: 'A' | 'B',
): { side: Side; answer: JudgeAnswer | null } {
  const parsed = JudgeAnswer.safeParse(raw);
  if (!parsed.success) return { side: 'invalid', answer: null };
  const { better } = parsed.data;
  const other = firstIs === 'A' ? 'B' : 'A';
  return {
    side: better === 'same' ? 'same' : better === 'first' ? firstIs : other,
    answer: parsed.data,
  };
}

/** The pair's result from both orders. A side wins only if it won both. */
export type PairResult = {
  scenario: string;
  run: number;
  winner: 'A' | 'B' | 'tie' | 'invalid';
  /** Both orders gave a direction, and opposite ones: the judge followed the position. */
  orderFlip: boolean;
  /** How often the judge picked whatever stood first, of the orders that picked a side. */
  pickedFirst: number;
  picked: number;
  drivers: string[];
  because: string[];
};

export function combineOrders(
  pair: Pick<Pair, 'scenario' | 'run'>,
  abRaw: unknown,
  baRaw: unknown,
): PairResult {
  const ab = sideOf(abRaw, 'A');
  const ba = sideOf(baRaw, 'B');
  const directional = [ab, ba].filter((o) => o.side === 'A' || o.side === 'B');
  const pickedFirst = (ab.side === 'A' ? 1 : 0) + (ba.side === 'B' ? 1 : 0);
  const winner =
    ab.side === 'invalid' || ba.side === 'invalid'
      ? 'invalid'
      : ab.side === ba.side && (ab.side === 'A' || ab.side === 'B')
        ? ab.side
        : 'tie';
  return {
    scenario: pair.scenario,
    run: pair.run,
    winner,
    orderFlip: directional.length === 2 && ab.side !== ba.side,
    pickedFirst,
    picked: directional.length,
    drivers: [...(ab.answer?.drivers ?? []), ...(ba.answer?.drivers ?? [])],
    because: [ab.answer?.because, ba.answer?.because].filter((x): x is string => !!x),
  };
}

/** The measurable shape of one conversation (secondary measures; lower is better for each). */
export function shapeOf(c: Conversation): {
  askBacks: number;
  unanswered: number;
  repeatedOffers: number;
  inputTokensPerTurn: number;
  latencyMsPerTurn: number;
  costMicros: number;
} {
  const n = c.turns.length;
  const offers = c.turns.filter((t) => t.tools.includes('offer_learning')).length;
  return {
    askBacks: c.turns.filter((t) => t.asks).length,
    unanswered: c.turns.filter((t) => t.status !== 'done' || !t.reply).length,
    repeatedOffers: Math.max(0, offers - 1),
    inputTokensPerTurn: c.turns.reduce((s, t) => s + t.inputTokens, 0) / n,
    latencyMsPerTurn: c.turns.reduce((s, t) => s + t.latencyMs, 0) / n,
    costMicros: c.turns.reduce((s, t) => s + t.costMicros, 0),
  };
}

export const MEASURES = [
  { key: 'askBacks', label: 'ask-backs per conversation' },
  { key: 'repeatedOffers', label: 'repeated offers per conversation' },
  { key: 'unanswered', label: 'unanswered turns per conversation' },
  { key: 'inputTokensPerTurn', label: 'input tokens per turn' },
  { key: 'latencyMsPerTurn', label: 'ms per turn (wall clock)' },
  { key: 'costMicros', label: 'cost per conversation (µ$)' },
] as const;
type MeasureKey = (typeof MEASURES)[number]['key'];

export type ScenarioSummary = {
  scenario: string;
  winsA: number;
  winsB: number;
  ties: number;
  invalid: number;
  preference: ScenarioPreference;
};

export type Report = {
  a: Pick<ImpressionRun, 'promptVersion' | 'revision' | 'ranAt' | 'models'>;
  b: Pick<ImpressionRun, 'promptVersion' | 'revision' | 'ranAt' | 'models'>;
  pairs: { total: number; winsA: number; winsB: number; ties: number; invalid: number };
  /** B's share of the pairs that had a winner, with its 95 % Wilson interval (descriptive). */
  shareB: { value: number | null; low: number; high: number };
  orderFlips: number;
  /** How often the judge picked the conversation shown first (0.5 = no position bias). */
  firstBias: number | null;
  scenarios: ScenarioSummary[];
  verdict: Verdict;
  measures: Array<{ key: MeasureKey; label: string } & PairedMetric>;
  drivers: Array<{ criterion: string; forA: number; forB: number }>;
  onlyA: string[];
  onlyB: string[];
};

const avg = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);

export function buildReport(
  a: ImpressionRun,
  b: ImpressionRun,
  results: readonly PairResult[],
  pairs: readonly Pair[],
  only: { onlyA: string[]; onlyB: string[] },
  seed = 127,
): Report {
  const count = (w: PairResult['winner']) => results.filter((r) => r.winner === w).length;
  const winsA = count('A');
  const winsB = count('B');
  const ci = wilson(winsB, winsA + winsB);
  const picked = results.reduce((s, r) => s + r.picked, 0);
  const pickedFirst = results.reduce((s, r) => s + r.pickedFirst, 0);

  const scenarioIds = [...new Set(pairs.map((p) => p.scenario))];
  const scenarios: ScenarioSummary[] = scenarioIds.map((scenario) => {
    const of = results.filter((r) => r.scenario === scenario);
    const sA = of.filter((r) => r.winner === 'A').length;
    const sB = of.filter((r) => r.winner === 'B').length;
    return {
      scenario,
      winsA: sA,
      winsB: sB,
      ties: of.filter((r) => r.winner === 'tie').length,
      invalid: of.filter((r) => r.winner === 'invalid').length,
      preference: scenarioPreference(sA, sB),
    };
  });

  const measures = MEASURES.map((m, i) => {
    const perScenario = scenarioIds.map((scenario) => {
      const of = pairs.filter((p) => p.scenario === scenario);
      return {
        a: avg(of.map((p) => shapeOf(p.a)[m.key])),
        b: avg(of.map((p) => shapeOf(p.b)[m.key])),
      };
    });
    return { key: m.key, label: m.label, ...pairedMetric(perScenario, seed + 10 * i) };
  });

  const drivers = CRITERIA.map((criterion) => ({
    criterion,
    forA: results.filter((r) => r.winner === 'A' && r.drivers.includes(criterion)).length,
    forB: results.filter((r) => r.winner === 'B' && r.drivers.includes(criterion)).length,
  })).filter((d) => d.forA + d.forB > 0);

  const meta = (r: ImpressionRun) => ({
    promptVersion: r.promptVersion,
    revision: r.revision,
    ranAt: r.ranAt,
    models: r.models,
  });
  return {
    a: meta(a),
    b: meta(b),
    pairs: { total: results.length, winsA, winsB, ties: count('tie'), invalid: count('invalid') },
    shareB: { value: winsA + winsB ? winsB / (winsA + winsB) : null, ...ci },
    orderFlips: results.filter((r) => r.orderFlip).length,
    firstBias: picked ? pickedFirst / picked : null,
    scenarios,
    verdict: verdict(
      scenarios.filter((s) => s.preference === 'A').length,
      scenarios.filter((s) => s.preference === 'B').length,
    ),
    measures,
    drivers,
    ...only,
  };
}

const pct = (x: number): string => `${Math.round(x * 100)} %`;
const num = (x: number): string =>
  Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2);
const pval = (p: number): string => (p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`);

/** The one sentence the owner reads first. */
function headlineOf(r: Report): string {
  const v = r.verdict;
  const decided = r.scenarios.filter((s) => s.preference !== 'even').length;
  const won = (side: 'A' | 'B') => r.scenarios.filter((s) => s.preference === side).length;
  switch (v.kind) {
    case 'B_better':
      return `**B leaves the better overall impression** — ${won('B')} of ${decided} decided scenarios, sign test ${pval(v.p)}.`;
    case 'A_better':
      return `**B is worse than A** — A wins ${won('A')} of ${decided} decided scenarios, sign test ${pval(v.p)}.`;
    case 'undetectable':
      return (
        `**No detectable difference** (sign test over scenarios, ${pval(v.p)}). This is not evidence that A and B are equal: ` +
        (v.needed === null
          ? `with ${v.decisive} decided scenario(s), no split at all could have reached p < 0.05 — add scenarios or runs.`
          : `with ${v.decisive} decided scenario(s), one side would have needed ${v.needed} of them.`)
      );
  }
}

/** The report as Markdown, in words that never claim more than the numbers carry. */
export function renderReport(r: Report): string {
  const side = (label: string, s: Report['a']) =>
    `- **${label}**: ${s.promptVersion} · ${s.revision} · ${s.ranAt}${s.models.length ? ` · ${s.models.join(', ')}` : ''}`;
  const headline = headlineOf(r);
  const lines = [
    '# Overall impression: A vs B (issue #127)',
    '',
    side('A', r.a),
    side('B', r.b),
    '',
    headline,
    '',
    '## Scenarios (the unit the test counts)',
    '',
    '| scenario | A wins | B wins | ties | judge invalid | decided for |',
    '|---|---:|---:|---:|---:|---|',
    ...r.scenarios.map(
      (s) =>
        `| ${s.scenario} | ${s.winsA} | ${s.winsB} | ${s.ties} | ${s.invalid} | ${s.preference === 'even' ? '—' : s.preference} |`,
    ),
    '',
    '## Pairs (descriptive — runs of one scenario are not independent)',
    '',
    `${r.pairs.total} pairs: A ${r.pairs.winsA} · B ${r.pairs.winsB} · tie ${r.pairs.ties} · judge invalid ${r.pairs.invalid}.`,
    r.shareB.value === null
      ? 'No pair had a winner in both orders.'
      : `B's share of decided pairs: ${pct(r.shareB.value)} (95 % Wilson ${pct(r.shareB.low)}–${pct(r.shareB.high)}).`,
    `The two orders pointed in opposite directions in ${r.orderFlips} pair(s)` +
      (r.firstBias === null
        ? '.'
        : `; the judge picked whatever stood first in ${pct(r.firstBias)} of its directional answers (50 % = no position bias).`),
    '',
    '## Secondary measures (paired per scenario; lower is better; not corrected for multiple testing)',
    '',
    '| measure | A | B | B − A | 95 % CI | permutation p |',
    '|---|---:|---:|---:|---|---:|',
    ...r.measures.map(
      (m) =>
        `| ${m.label} | ${num(m.meanA)} | ${num(m.meanB)} | ${m.meanDiff >= 0 ? '+' : ''}${num(m.meanDiff)} | ${num(m.ci.low)} … ${num(m.ci.high)} | ${m.p.toFixed(3)} |`,
    ),
  ];
  if (r.drivers.length)
    lines.push(
      '',
      '## What decided the pairs the judge gave a winner',
      '',
      '| criterion | for A | for B |',
      '|---|---:|---:|',
      ...r.drivers.map((d) => `| ${d.criterion} | ${d.forA} | ${d.forB} |`),
    );
  if (r.onlyA.length || r.onlyB.length)
    lines.push(
      '',
      `Not compared (in one run only): ${[...r.onlyA.map((s) => `${s} (A)`), ...r.onlyB.map((s) => `${s} (B)`)].join(', ')}.`,
    );
  lines.push(
    '',
    '_The judge is a language model: a preference here is its reading, not the learner’s. The ' +
      'number that settles "fühlt sich schlechter an" is still a real sentence from a real session._',
  );
  return lines.join('\n');
}

/** Judges every pair in both orders, `parallel` pairs at a time. The judge is injected. */
export async function judgePairs(
  pairs: readonly Pair[],
  judge: (req: LlmRequest) => Promise<unknown>,
  parallel = 4,
): Promise<PairResult[]> {
  const results: PairResult[] = new Array(pairs.length);
  let next = 0;
  const ask = async (req: LlmRequest): Promise<unknown> => {
    try {
      return await judge(req);
    } catch {
      // A failed judge call is no answer — counted as invalid, never retried into a guess.
      return null;
    }
  };
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= pairs.length) return;
      const p = pairs[i]!;
      const [ab, ba] = await Promise.all([
        ask(judgeRequest(p.a, p.b)),
        ask(judgeRequest(p.b, p.a)),
      ]);
      results[i] = combineOrders(p, ab, ba);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, parallel) }, worker));
  return results;
}

async function main(): Promise<void> {
  const [fileA, fileB] = process.argv.slice(2);
  if (!fileA || !fileB) throw new Error('usage: judge.ts <a.json> <b.json>');
  const a = ImpressionRun.parse(JSON.parse(readFileSync(fileA, 'utf8')));
  const b = ImpressionRun.parse(JSON.parse(readFileSync(fileB, 'utf8')));
  const { pairs, onlyA, onlyB } = pairConversations(a, b);
  if (!pairs.length) throw new Error('The two runs share no conversation to compare.');
  const config = loadConfig({
    ...evalEnv(),
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://unused/unused',
    SUPABASE_URL: process.env.SUPABASE_URL ?? 'http://unused.local',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'unused-unused-unused',
    ADMIN_TOKEN_SECRET: process.env.ADMIN_TOKEN_SECRET ?? 'unused-unused-unused-unused-unused!',
  });
  if (config.LLM_BACKEND !== 'vertex')
    throw new Error('Set LLM_BACKEND=vertex (docs/SETUP-VERTEX.md)');
  const gateway = new VertexGateway(config);
  let spent = 0;
  const results = await judgePairs(pairs, async (req) => {
    const res = await gateway.generate(req);
    spent += res.usage.costMicros;
    return res.json;
  });
  const report = buildReport(a, b, results, pairs, { onlyA, onlyB });
  const text = renderReport(report);
  console.info(text);
  console.info(`\njudge: ${pairs.length * 2} calls, $${(spent / 1e6).toFixed(4)}`);
  if (process.env.IMPRESSION_REPORT) {
    writeFileSync(process.env.IMPRESSION_REPORT, `${text}\n`);
    writeFileSync(
      process.env.IMPRESSION_REPORT.replace(/\.md$/, '') + '.pairs.json',
      `${JSON.stringify(results, null, 2)}\n`,
    );
  }
  // A measured regression fails the command, like the buddy eval's comparison does.
  process.exit(report.verdict.kind === 'A_better' ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(2);
  });
}
