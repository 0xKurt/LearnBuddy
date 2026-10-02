// One side of the overall-impression comparison (issue #127): walks every scenario
// (scenarios.ts) several times through the real app with the live model, and writes each
// conversation down, turn by turn. Not part of CI — it needs Vertex credentials and costs a
// little money. Run both sides and the judge with one command:
//
//   sh scripts/eval-impression.sh <revision-A> [<revision-B>]        (from the repo root)
//
// or this side alone, from apps/api:
//
//   IMPRESSION_OUT=b.json IMPRESSION_RUNS=3 npx tsx evals/impression/run.ts [scenario-id …]
//
// Every conversation runs on its own throwaway database, so runs cannot see each other. The
// model calls go to the eval project (evals/eval-env.ts, issue #206), never the live quota by
// accident.
// requires live verification in Claude Code session (stand-ins for the outside world; live model)

import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { loadConfig } from '../../src/config.js';
import { VertexGateway } from '../../src/llm/vertex.js';
import { BUDDY_PROMPT_VERSION } from '../../src/modules/buddy/prompts.js';
import { testDatabaseAvailable } from '../../src/testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../../src/testing/harness.js';
import { evalEnv } from '../eval-env.js';
import { SCENARIOS } from './scenarios.js';
import { ImpressionRun, type Conversation, type Turn } from './transcript.js';

/** Monday 28.09.2026, 16:00 in Berlin: an ordinary afternoon after school. */
const START = '2026-09-28T14:00:00Z';

type Totals = { calls: number; input: number; micros: number };

async function main(): Promise<void> {
  const config = loadConfig({
    ...evalEnv(),
    // Never connected to (every conversation gets a throwaway database), but validated.
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://unused/unused',
    SUPABASE_URL: process.env.SUPABASE_URL ?? 'http://unused.local',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'unused-unused-unused',
    ADMIN_TOKEN_SECRET: process.env.ADMIN_TOKEN_SECRET ?? 'unused-unused-unused-unused-unused!',
  });
  if (config.LLM_BACKEND !== 'vertex')
    throw new Error('Set LLM_BACKEND=vertex and the Vertex variables (docs/SETUP-VERTEX.md)');
  if (!(await testDatabaseAvailable())) throw new Error('No local Postgres (LB_TEST_DATABASE_URL)');
  const out = process.env.IMPRESSION_OUT;
  if (!out) throw new Error('Set IMPRESSION_OUT=<file.json> — the judge reads it');
  const runs = Number(process.env.IMPRESSION_RUNS ?? '3');
  if (!Number.isInteger(runs) || runs < 1)
    throw new Error(`IMPRESSION_RUNS must be ≥ 1 (got ${runs})`);
  const only = process.argv.slice(2);
  const unknown = only.filter((id) => !SCENARIOS.some((s) => s.id === id));
  if (unknown.length) throw new Error(`unknown scenario(s): ${unknown.join(', ')}`);
  const scenarios = only.length ? SCENARIOS.filter((s) => only.includes(s.id)) : SCENARIOS;

  const gateway = new VertexGateway(config);
  const conversations: Conversation[] = [];
  const models = new Set<string>();
  const ranAt = new Date().toISOString();
  let spent = 0;

  for (const s of scenarios) {
    for (let run = 0; run < runs; run++) {
      const env = await createTestEnv({ start: START, gateway });
      try {
        const l = await onboard(env, {
          locale: s.learner.locale,
          timezone: 'Europe/Berlin',
          relation: s.learner.relation,
          ...(s.learner.birthDate ? { birthDate: s.learner.birthDate } : {}),
        });
        if (s.setup) {
          await s.setup(env, l);
          await env.db.query(
            `update buddy_settings set context_version = context_version + 1 where learner_id = $1`,
            [l.learnerId],
          );
        }
        const turns = await walkConversation(env, l, s.says);
        for (const m of (
          await env.db.query<{ model: string }>(`select distinct model from llm_calls`)
        ).map((r) => r.model))
          models.add(m);
        const cost = turns.reduce((sum, t) => sum + t.costMicros, 0);
        spent += cost;
        conversations.push({ scenario: s.id, run, turns });
        console.info(
          `${s.id} #${run + 1}  ${turns.filter((t) => t.status === 'done').length}/${turns.length} answered` +
            `  $${(cost / 1e6).toFixed(4)}\n` +
            turns
              .map(
                (t, i) =>
                  `   ${i + 1}. ${t.said}\n      → ${t.asks ? '[asks] ' : ''}${t.reply ?? `(${t.status} ${t.errorCode ?? ''})`}`,
              )
              .join('\n'),
        );
      } finally {
        await env.close();
      }
    }
  }

  const file: ImpressionRun = {
    kind: 'impression-run',
    promptVersion: BUDDY_PROMPT_VERSION,
    revision: process.env.IMPRESSION_REVISION ?? 'working tree',
    ranAt,
    models: [...models].sort(),
    runsPerScenario: runs,
    conversations,
  };
  // Validated before it is written: the judge must never read a file this runner could not.
  writeFileSync(out, `${JSON.stringify(ImpressionRun.parse(file), null, 2)}\n`);
  console.info(
    `\n${conversations.length} conversation(s), ${BUDDY_PROMPT_VERSION}, $${(spent / 1e6).toFixed(4)} → ${out}`,
  );
}

/**
 * Walks one conversation through the real app and writes down each turn: what she said, what
 * was stored as his answer, what the turn applied, and what it cost. Exported so the
 * plumbing is proven against the real schema with a scripted model
 * (__tests__/run.int.test.ts) — the queries here are the eval's measuring instrument, and an
 * instrument that reads nothing reports a perfect conversation (issue #127's own lesson).
 */
export async function walkConversation(
  env: TestEnv,
  l: Learner,
  says: readonly string[],
): Promise<Turn[]> {
  const totals = (): Promise<Totals> =>
    env.db.one<Totals>(
      `select count(*)::int as calls, coalesce(sum(input_tokens), 0)::int as input,
              coalesce(sum(cost_micros), 0)::bigint::int as micros from llm_calls`,
    );
  const turns: Turn[] = [];
  for (const said of says) {
    const clientId = crypto.randomUUID();
    const before = await totals();
    const started = performance.now();
    const res = await l.api.post<{ status: Turn['status']; error_code: string | null }>(
      '/buddy/messages',
      { client_message_id: clientId, text: said },
    );
    const latencyMs = Math.round(performance.now() - started);
    const after = await totals();
    const mine = await env.db.one<{ id: string; seq: string }>(
      `select id, seq from buddy_messages where learner_id = $1 and client_message_id = $2`,
      [l.learnerId, clientId],
    );
    const reply = await env.db.maybeOne<{ text: string; ask: { options?: string[] } | null }>(
      `select text, ask from buddy_messages
        where learner_id = $1 and role = 'buddy' and seq > $2 order by seq limit 1`,
      [l.learnerId, mine.seq],
    );
    const decision = await env.db.maybeOne<{ id: string; output: unknown }>(
      `select id, output from buddy_decisions
        where learner_id = $1 and trigger_message_id = $2 and disposition = 'applied'
        order by created_at desc limit 1`,
      [l.learnerId, mine.id],
    );
    const tools = decision
      ? (
          await env.db.query<{ tool: string }>(
            `select tool from buddy_actions where decision_id = $1 order by seq`,
            [decision.id],
          )
        ).map((a) => a.tool)
      : [];
    turns.push({
      said,
      status: res.body.status,
      errorCode: res.body.error_code,
      reply: reply?.text ?? null,
      options: reply?.ask?.options ?? [],
      tools,
      asks: asksPermission(decision?.output),
      latencyMs,
      inputTokens: after.input - before.input,
      costMicros: after.micros - before.micros,
    });
  }
  return turns;
}

/** The decision's own flag; after a lookup the decision is stored as { lookups, final }. */
export function asksPermission(output: unknown): boolean {
  if (typeof output !== 'object' || output === null) return false;
  const o = output as { asks_permission?: unknown; final?: { asks_permission?: unknown } };
  return o.asks_permission === true || o.final?.asks_permission === true;
}

// Only when run as a script — the test imports asksPermission without starting a run.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    // The model client keeps sockets open; the run is over when the file is written.
    () => process.exit(0),
    (err: unknown) => {
      console.error(err);
      process.exit(1);
    },
  );
}
