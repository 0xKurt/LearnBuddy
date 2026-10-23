// Compare production gateways with the same app-built workloads as the original Azure benchmark.
// No alternative adapter: request shapes, retries, tools and validators are production code.
// Run under scripts/test-lock.sh; --dry seeds only a disposable database, with no live calls.
// requires live verification in Claude Code session (seeding uses only external-service fakes).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as dotenv } from 'dotenv';

import { loadConfig } from '../src/config.js';
import { LlmError, type LlmGateway, type LlmRequest, type LlmUsage } from '../src/llm/gateway.js';
import { AzureOpenAIGateway } from '../src/llm/azure.js';
import { CHAT_PROFILE } from '../src/llm/chat.js';
import { OpenAIGateway, OPENAI_PROFILE } from '../src/llm/openai.js';
import { OPENAI_EU_PRICES, OPENAI_MODELS } from '../src/llm/openai-config.js';
import { VertexGateway, VERTEX_PROFILE } from '../src/llm/vertex.js';
import { schemaProperties } from '../src/llm/schemaBudget.js';
import { registerLearning } from '../src/modules/learning/register.js';
import { turnDecisionSchema } from '../src/modules/buddy/registry.js';
import { replyProgress } from '../src/modules/buddy/stream.js';
import { TutorDecision, RubricDecision } from '../src/modules/practice/tutor.js';
import { schemaErrors } from '../src/testing/schemaCheck.js';
import { testDatabaseAvailable } from '../src/testing/database.js';
import { seed, worksheetJpeg, type Workload } from '../src/testing/bench/workloads.js';

const here = dirname(fileURLToPath(import.meta.url));
dotenv({ path: resolve(here, '../.env.local'), quiet: true });
const args = process.argv.slice(2);
const option = (key: string, fallback: string) => {
  const i = args.indexOf(key);
  return i < 0 ? fallback : (args[i + 1] ?? '');
};
const provider = option('--provider', 'azure');
const dry = args.includes('--dry');
const rounds = Number(option('--rounds', '1'));
const budget = Number(option('--budget', '1'));
const output = resolve(option('--out', 'test-results/provider-bench.md'));
// 4.1 nano shuts down on 2026-10-23; historical comparison only when explicitly selected.
const models = option('--models', 'gpt-5.4-mini,gpt-5.4-nano,gpt-4.1-mini').split(',');
if (provider === 'openai' && models.some((model) => !OPENAI_MODELS.some((m) => m === model)))
  throw new Error(`Unknown or empty --models; choose from ${OPENAI_MODELS.join(',')}`);
if (
  !['openai', 'azure'].includes(provider) ||
  !Number.isInteger(rounds) ||
  rounds < 1 ||
  rounds > 20 ||
  !(budget > 0 && budget <= 2)
)
  throw new Error(
    'Use --provider openai|azure, --rounds 1..20, --budget >0..2, --out <file>, optionally --dry',
  );
if (process.env.LB_TEST_LOCK_HELD !== '1')
  throw new Error('Run under the shared scripts/test-lock.sh, including --dry');
if (!process.env.LB_TEST_DATABASE_URL || !(await testDatabaseAvailable()))
  throw new Error('The shared test Postgres is required');
registerLearning();
const photo = await worksheetJpeg();
const log: string[] = [];
const profiles = {
  vertex: VERTEX_PROFILE,
  candidate: provider === 'openai' ? OPENAI_PROFILE : { ...CHAT_PROFILE, name: 'azure' },
};
const workloads = {
  vertex: await seed(profiles.vertex, photo, log),
  candidate: await seed(profiles.candidate, photo, log),
};
for (const list of Object.values(workloads)) {
  for (const purpose of ['buddy_turn', 'tutor', 'explain', 'extraction'])
    if (!list.some((w) => w.purpose === purpose))
      throw new Error(`Seeding failed to build ${purpose}`);
}
const base = {
  ...process.env,
  DATABASE_URL: process.env.LB_TEST_DATABASE_URL,
  SUPABASE_URL: 'http://unused.local',
  SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
  ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
};
type Candidate = { name: string; profile: keyof typeof workloads; gateway: LlmGateway | null };
const candidates: Candidate[] = [
  {
    name: 'vertex',
    profile: 'vertex',
    gateway: dry ? null : new VertexGateway(loadConfig({ ...base, LLM_BACKEND: 'vertex' })),
  },
];
if (provider === 'openai') {
  for (const model of OPENAI_MODELS.filter((model) => models.includes(model)))
    candidates.push({
      name: model,
      profile: 'candidate',
      gateway: dry
        ? null
        : new OpenAIGateway(
            loadConfig({
              ...base,
              LLM_BACKEND: 'openai',
              OPENAI_MODEL_SMART: model,
              OPENAI_MODEL_FAST: model,
            }),
          ),
    });
} else
  candidates.push({
    name: 'azure',
    profile: 'candidate',
    gateway: dry ? null : new AzureOpenAIGateway(loadConfig({ ...base, LLM_BACKEND: 'azure' })),
  });
const sizes = [
  '| provider | workload | schema properties | schema characters |',
  '|---|---|---:|---:|',
];
for (const [profile, list] of Object.entries(workloads))
  for (const w of list)
    sizes.push(
      `| ${profile} | ${w.id} | ${schemaProperties(w.req.schema)} | ${JSON.stringify(w.req.schema).length} |`,
    );
mkdirSync(dirname(output), { recursive: true });
if (dry) {
  writeFileSync(
    output,
    `# Provider benchmark — dry\n\n${log.join('\n')}\n\n${sizes.join('\n')}\n\nCandidates: ${candidates.map((c) => c.name).join(', ')}. No model calls.\n`,
  );
  console.log(`DRY: ${workloads.candidate.length} app workloads, no model calls. ${output}`);
} else {
  // Limits are ceilings from production receipts (no assumed cache discount). There is at most
  // one in-flight request. The budget is a stop threshold, not a guarantee about an unknown bill.
  let spent = 0;
  type Row = {
    candidate: string;
    workload: string;
    valid: boolean;
    error: string | null;
    firstPartialMs: number | null;
    firstReplyMs: number | null;
    totalMs: number;
    attempts: number;
    usage: LlmUsage | null;
  };
  const rows: Row[] = [];
  const ids = [
    ...new Set(
      Object.values(workloads)
        .flat()
        .map((w) => w.id),
    ),
  ];
  const valid = (w: Workload, json: unknown) =>
    schemaErrors(w.req.schema, json).length === 0 &&
    (w.purpose !== 'buddy_turn' || turnDecisionSchema().safeParse(json).success) &&
    (w.purpose !== 'tutor' ||
      TutorDecision.safeParse(json).success ||
      RubricDecision.safeParse(json).success) &&
    (!w.req.validateOutput || w.req.validateOutput(json));
  outer: for (let round = 0; round < rounds; round++) {
    for (const id of ids) {
      for (let i = 0; i < candidates.length; i++) {
        if (spent >= budget) break outer;
        const c = candidates[(i + round) % candidates.length]!;
        const w = workloads[c.profile].find((w) => w.id === id);
        if (!w || !c.gateway) continue;
        const start = performance.now();
        const row: Row = {
          candidate: c.name,
          workload: id,
          valid: false,
          error: null,
          firstPartialMs: null,
          firstReplyMs: null,
          totalMs: 0,
          attempts: 0,
          usage: null,
        };
        const req: LlmRequest = {
          ...w.req,
          signal: undefined,
          onPartial: (raw) => {
            row.firstPartialMs ??= performance.now() - start;
            if (w.purpose === 'buddy_turn' && replyProgress(raw, w.aliases)?.speakable)
              row.firstReplyMs ??= performance.now() - start;
          },
        };
        try {
          const result = await c.gateway.generate(req);
          row.valid = valid(w, result.json);
          row.usage = result.usage;
          row.attempts = result.attempts ?? 1;
        } catch (error) {
          row.error =
            error instanceof LlmError
              ? `${error.kind}:${error.finishReason ?? ''}`
              : 'unexpected error';
          if (error instanceof LlmError) {
            row.usage = error.usage;
            row.attempts = error.attempts;
          }
        }
        row.totalMs = performance.now() - start;
        spent += (row.usage?.costMicros ?? 0) / 1e6;
        rows.push(row);
        // Persist each receipt so a later interruption cannot hide the spend already observed.
        writeFileSync(output.replace(/\.md$/, '') + '.json', JSON.stringify(rows, null, 2));
        console.log(
          `${c.name} ${id}: ${row.valid ? 'valid' : (row.error ?? 'invalid')} ${Math.round(row.totalMs)}ms; cumulative ceiling $${spent.toFixed(4)}`,
        );
        // Failed calls may have only partial receipts. Zero-token metadata is also no proof
        // of a free completion. Stop rather than keep spending with an incomplete ledger.
        if (
          row.error ||
          !row.usage ||
          row.usage.inputTokens + row.usage.outputTokens + row.usage.thoughtTokens === 0
        )
          break outer;
      }
    }
  }
  const table = [
    '| candidate | workload | valid | first partial ms | first speakable ms | total ms | requests | error |',
    '|---|---|---|---:|---:|---:|---:|---|',
    ...rows.map(
      (r) =>
        `| ${r.candidate} | ${r.workload} | ${r.valid} | ${r.firstPartialMs?.toFixed(0) ?? '–'} | ${r.firstReplyMs?.toFixed(0) ?? '–'} | ${r.totalMs.toFixed(0)} | ${r.attempts} | ${r.error ?? ''} |`,
    ),
  ];
  writeFileSync(
    output,
    `# Provider benchmark\n\n${rounds} rounds, interleaved with candidate order rotated. Cost ceiling $${spent.toFixed(5)}; stop threshold $${budget}. In-flight overshoot possible. First partial is not network TTFT; JSON repair buffers until validation.\n\n${sizes.join('\n')}\n\n${table.join('\n')}\n\nDirect prices: ${OPENAI_EU_PRICES.source}, ${OPENAI_EU_PRICES.readOn}. Azure uses its required configured price table; Vertex uses its production table.\n`,
  );
  console.log(output);
}
