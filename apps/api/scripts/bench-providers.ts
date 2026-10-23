// Compare production gateways with the same app-built workloads.
// No alternative adapter: request shapes, retries and validators are production code.
// Run under scripts/test-lock.sh; --dry seeds only a disposable database, with no live calls.
// requires live verification in Claude Code session (seeding uses only external-service fakes).
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as dotenv } from 'dotenv';

import { loadConfig } from '../src/config.js';
import { runBench, type BenchCandidate } from '../src/testing/bench/runner.js';
import { strictSchema } from '../src/llm/chat-schema.js';
import { costMicros } from '../src/llm/pricing.js';
import type { LlmRequest } from '../src/llm/gateway.js';
import { OpenAIGateway, OPENAI_PROFILE } from '../src/llm/openai.js';
import { OPENAI_EU_PRICES, OPENAI_MODELS } from '../src/llm/openai-config.js';
import { VertexGateway, VERTEX_PROFILE, modelFor, splitModelSpec } from '../src/llm/vertex.js';
import { schemaProperties } from '../src/llm/schemaBudget.js';
import { registerLearning } from '../src/modules/learning/register.js';
import { turnDecisionSchema } from '../src/modules/buddy/registry.js';
import { TutorDecision, RubricDecision } from '../src/modules/practice/tutor.js';
import { schemaErrors } from '../src/testing/schemaCheck.js';
import { testDatabaseAvailable } from '../src/testing/database.js';
import { seed, worksheetJpeg, type Workload } from '../src/testing/bench/workloads.js';
import {
  afterIntro,
  costTable,
  MIXES,
  projection,
  summarize,
  type Prices,
} from '../src/testing/bench/costs.js';
import { VERTEX_EU_PRICES } from '../src/llm/pricing.js';

const here = dirname(fileURLToPath(import.meta.url));
dotenv({ path: resolve(here, '../.env.local'), quiet: true });
const args = process.argv.slice(2);
const option = (key: string, fallback: string) => {
  const i = args.indexOf(key);
  return i < 0 ? fallback : (args[i + 1] ?? '');
};
const provider = option('--provider', 'openai');
const dry = args.includes('--dry');
const rounds = Number(option('--rounds', '1'));
const budget = Number(option('--budget', '1'));
const output = resolve(option('--out', 'test-results/provider-bench.md'));
const tag = option('--tag', 'provider-bench');
// 4.1 nano shuts down on 2026-10-23; historical comparison only when explicitly selected.
const models = option('--models', 'gpt-5.4-mini,gpt-5.4-nano,gpt-4.1-mini').split(',');
if (provider === 'openai' && models.some((model) => !OPENAI_MODELS.some((m) => m === model)))
  throw new Error(`Unknown or empty --models; choose from ${OPENAI_MODELS.join(',')}`);
if (
  provider !== 'openai' ||
  !Number.isInteger(rounds) ||
  rounds < 1 ||
  rounds > 20 ||
  !(budget > 0 && budget <= 2)
)
  throw new Error(
    'Use --provider openai, --rounds 1..20, --budget >0..2, --out <file>, optionally --dry',
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
  candidate: OPENAI_PROFILE,
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
const alreadySpent = Number(option('--already-spent', '0'));
if (!(alreadySpent >= 0 && alreadySpent < budget)) throw new Error('Invalid --already-spent');
mkdirSync(dirname(output), { recursive: true });
const pending: Promise<void>[] = [];
let rawCalls = 0;
const traced: typeof fetch = async (url, init) => {
  const response = await fetch(url, init);
  const call = ++rawCalls;
  // Synthetic benchmark data only. Never log request headers, credentials or real learner data.
  pending.push(
    response
      .clone()
      .text()
      .then(
        (raw) => {
          appendFileSync(
            output.replace(/\.md$/, '') + '.raw.jsonl',
            JSON.stringify({
              call,
              status: response.status,
              requestId: response.headers.get('x-request-id'),
              raw,
            }) + '\n',
          );
        },
        () => {},
      ),
  );
  return response;
};
const candidates: BenchCandidate[] = [];
const add = (
  name: string,
  gateway: BenchCandidate['gateway'],
  list: Workload[],
  model: (req: LlmRequest) => string,
  multiplier = 1,
) => {
  candidates.push({
    name,
    gateway,
    workloads: list,
    costMultiplier: multiplier,
    ceiling: (w, previous) => {
      // UTF-8 bytes bound text tokens conservatively; 20k/image exceeds the 1200x1600 fixture's
      // measured vision tokens. Include strict nullable/schema expansion and request overhead.
      const schema = gateway.profile.name === 'openai' ? strictSchema(w.req.schema) : w.req.schema;
      const bytes =
        Buffer.byteLength(w.req.system + JSON.stringify(schema)) +
        2000 +
        w.req.contents.reduce(
          (sum, m) =>
            sum +
            m.parts.reduce((n, p) => n + ('text' in p ? Buffer.byteLength(p.text) : 20_000), 0),
          0,
        );
      const input = previous ? previous.inputTokens + 2000 : bytes;
      // Production retries: at most three HTTP attempts. No repair/function subrequests remain.
      return (
        (3 *
          multiplier *
          costMicros(gateway.profile.prices, model(w.req), {
            inputTokens: input,
            outputTokens: w.req.maxOutputTokens,
            thoughtTokens: 0,
            audioInputTokens: 0,
          })) /
        1e6
      );
    },
  });
};
if (!dry) {
  const config = loadConfig({ ...base, LLM_BACKEND: 'vertex' });
  add(
    'vertex',
    new VertexGateway(config),
    workloads.vertex,
    (req) => splitModelSpec(modelFor(config, req), config.GOOGLE_VERTEX_LOCATION).model,
    2,
  );
  for (const model of models)
    add(
      model,
      new OpenAIGateway(
        loadConfig({
          ...base,
          LLM_BACKEND: 'openai',
          OPENAI_MODEL_SMART: model,
          OPENAI_MODEL_FAST: model,
        }),
        traced,
      ),
      workloads.candidate,
      () => model,
    );
}
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
    `# Provider benchmark — dry\n\n${log.join('\n')}\n\n${sizes.join('\n')}\n\nCandidates: ${['vertex', ...models].join(', ')}. No model calls.\n`,
  );
  console.log(`DRY: ${workloads.candidate.length} app workloads, no model calls. ${output}`);
} else {
  const valid = (w: Workload, json: unknown) =>
    schemaErrors(w.req.schema, json).length === 0 &&
    (w.purpose !== 'buddy_turn' || turnDecisionSchema().safeParse(json).success) &&
    (w.purpose !== 'tutor' ||
      TutorDecision.safeParse(json).success ||
      RubricDecision.safeParse(json).success) &&
    (!w.req.validateOutput || w.req.validateOutput(json));
  const rows = await runBench({
    candidates,
    rounds,
    budget,
    alreadySpent,
    valid,
    record: async (rows) => {
      writeFileSync(output.replace(/\.md$/, '') + '.json', JSON.stringify(rows, null, 2));
      await Promise.all(pending.splice(0));
      const row = rows.at(-1)!;
      console.log(
        `${row.round} ${row.candidate} ${row.workload}: ${row.valid ? 'valid' : row.error} ${Math.round(row.totalMs)}ms; charged $${(alreadySpent + rows.reduce((n, r) => n + r.budgetCharge, 0)).toFixed(5)}`,
      );
    },
  });
  const spent = rows.reduce((n, r) => n + r.receiptUsd, 0);
  const charged = rows.reduce((n, r) => n + r.budgetCharge, alreadySpent);
  appendFileSync(
    `${process.env.HOME}/.local/share/learnbuddy-agents/BUDGET-LEDGER.md`,
    `\n${new Date().toISOString().slice(0, 10)} | ${tag} | #893 | ${rows.reduce((n, r) => n + r.attempts, 0)} | ${spent.toFixed(6)} | ${rounds}-round provider bench with cost tables; reserved including prior probes $${charged.toFixed(6)}; ${output}\n`,
  );
  const table = [
    '| candidate | workload | valid | first partial ms | first speakable ms | total ms | requests | error |',
    '|---|---|---|---:|---:|---:|---:|---|',
    ...rows.map(
      (r) =>
        `| ${r.candidate} | ${r.workload} | ${r.valid} | ${r.firstPartialMs?.toFixed(0) ?? '–'} | ${r.firstReplyMs?.toFixed(0) ?? '–'} | ${r.totalMs.toFixed(0)} | ${r.attempts} | ${r.error ?? ''} |`,
    ),
  ];
  const prices: Record<string, Prices> = {
    vertex: { today: VERTEX_EU_PRICES, from2027: afterIntro(VERTEX_EU_PRICES) },
    ...Object.fromEntries(
      models.map((m) => [m, { today: OPENAI_EU_PRICES, from2027: OPENAI_EU_PRICES }]),
    ),
  };
  const summaries = summarize(rows, prices);
  const costs = `## Cost per call\n\nMeans over calls with a receipt. Receipt = the app's own formula (\`llm_calls.cost_micros\`, cache counted at full price; Vertex net of the introductory credit). List = the provider's price page with its cache discount: Vertex today is net of the 50 % credit until 31.12.2026, from 2027 the list price (= today's gross invoice). OpenAI EU incl. the 10 % residency uplift where it applies; no announced change for 2027.\n\n${costTable(summaries).join('\n')}\n\n## Projection\n\nOne operation = one call of each kind (Vertex adds its form-choice call to explain/extraction). Only the production row is measured counts; days are assumptions.\n\n${projection(summaries, MIXES, 20).join('\n')}\n`;
  writeFileSync(
    output,
    `# Provider benchmark\n\n${rounds} rounds, interleaved with candidate order rotated. Receipt ceiling $${spent.toFixed(5)} (Vertex gross before credits); budget charged including prior $${alreadySpent}: $${charged.toFixed(5)} / $${budget}. Failed/missing receipts retain the conservative reservation; unaffordable calls are recorded and skipped. First partial is gateway output, not network TTFT.\n\n${sizes.join('\n')}\n\n${table.join('\n')}\n\nDirect prices: ${OPENAI_EU_PRICES.source}, ${OPENAI_EU_PRICES.readOn}. Vertex uses twice its net production prices to cover the gross invoice before credits.\n\n${costs}`,
  );
  console.log(output);
}
