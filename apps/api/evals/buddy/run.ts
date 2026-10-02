// Live-model evaluation of Buddy's conversation turns (not part of CI: it
// needs Vertex credentials and costs a little money). Runs every case through
// the real pipeline on a throwaway database and checks what was applied.
//
//   cd apps/api
//   LLM_BACKEND=vertex GOOGLE_CLOUD_PROJECT=… GOOGLE_APPLICATION_CREDENTIALS=… \
//     npx tsx evals/buddy/run.ts [case-id …]
//
// Reads apps/api/.env.local like the dev server. Exit code 1 if a case fails.
// BUDDY_EVAL_OUT=run.json writes every answer down with its cost, so two prompt
// versions can be compared case by case — a check that still passes can still have
// got worse (issue #80). Read two such files with evals/buddy/compare.ts.
// requires live verification in Claude Code session (stand-ins for the outside world; live model)

import { writeFileSync } from 'node:fs';

import { config as loadDotenv } from 'dotenv';

import { loadConfig } from '../../src/config.js';
import { setStateAudit } from '../../src/modules/buddy/blocks.js';
import { BUDDY_PROMPT_VERSION } from '../../src/modules/buddy/prompts.js';
import { VertexGateway } from '../../src/llm/vertex.js';
import { BlockAudit } from './blockaudit.js';
import { testDatabaseAvailable } from '../../src/testing/database.js';
import { createTestEnv, onboard } from '../../src/testing/harness.js';
import { CASES, type Outcome } from './cases.js';

loadDotenv({ path: '.env.local' });

/** Every case's answer and cost, for comparing two runs (BUDDY_EVAL_OUT, issue #80). */
const transcript: Array<{
  id: string;
  ok: boolean;
  problems: string[];
  reply: string | null;
  options: string[] | null;
  tools: string[];
  calls: number;
  costMicros: number;
  inputTokens: number;
  cachedTokens: number;
}> = [];

async function main(): Promise<void> {
  const config = loadConfig({
    ...process.env,
    // Never connected to (every case gets a throwaway database), but validated
    // by loadConfig — the same placeholder every other eval passes.
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://unused/unused',
    SUPABASE_URL: process.env.SUPABASE_URL ?? 'http://unused.local',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'unused-unused-unused',
    ADMIN_TOKEN_SECRET: process.env.ADMIN_TOKEN_SECRET ?? 'unused-unused-unused-unused-unused!',
  });
  if (config.LLM_BACKEND !== 'vertex')
    throw new Error('Set LLM_BACKEND=vertex and the Vertex variables (docs/SETUP-VERTEX.md)');
  if (!(await testDatabaseAvailable())) throw new Error('No local Postgres (LB_TEST_DATABASE_URL)');
  const gateway = new VertexGateway(config);
  // What each STATE section costs and whether an answer pointed back at it (issue #168).
  // Off by default: with no audit registered the request is byte-identical (blockaudit.ts).
  const blockOut = process.env.BUDDY_BLOCK_AUDIT;
  const blocks = blockOut ? new BlockAudit() : null;
  if (blocks) setStateAudit(blocks.record);
  const only = process.argv.slice(2);
  const cases = only.length ? CASES.filter((c) => only.includes(c.id)) : CASES;

  let failed = 0;
  let costMicros = 0;
  let inputTokens = 0;
  let cachedTokens = 0;
  const models = new Set<string>();
  const ranAt = new Date().toISOString();
  for (const c of cases) {
    const env = await createTestEnv({ start: c.at ?? '2026-09-28T08:00:00Z', gateway });
    try {
      const l = await onboard(env, {
        locale: c.learner?.locale ?? 'de',
        timezone: c.learner?.timezone ?? 'Europe/Berlin',
        relation: c.learner?.relation ?? 'self',
        ...(c.learner?.birthDate ? { birthDate: c.learner.birthDate } : {}),
      });
      if (c.setup) {
        await c.setup(env, l);
        await env.db.query(
          `update buddy_settings set context_version = context_version + 1 where learner_id = $1`,
          [l.learnerId],
        );
      }
      // Something she said first, so the measured turn is an answer to Buddy's own question
      // (issue #111: deleting a sheet takes two turns on purpose).
      // Everything she says before the measured turn, each a whole turn of its own.
      for (const said of [...(c.before ? [c.before] : []), ...(c.conversation ?? [])]) {
        await l.api.post('/buddy/messages', {
          client_message_id: crypto.randomUUID(),
          text: said,
        });
      }
      const res = await l.api.post<{ status: Outcome['status']; error_code: string | null }>(
        '/buddy/messages',
        {
          client_message_id: crypto.randomUUID(),
          text: c.message,
        },
      );
      const reply = await env.db.maybeOne<{ text: string; ask: { options?: string[] } | null }>(
        `select text, ask from buddy_messages where learner_id = $1 and role = 'buddy' order by seq desc limit 1`,
        [l.learnerId],
      );
      // Every turn of this conversation, so a case can judge the SHAPE and not only the
      // last answer (issue #127).
      const turns = (
        await env.db.query<{
          output: { asks_permission?: boolean } | null;
          text: string | null;
          tools: string[] | null;
        }>(
          `select d.output,
                  (select m.text from buddy_messages m
                    where m.decision_id = d.id and m.role = 'buddy'
                    order by m.seq limit 1) as text,
                  -- What this turn DID, not only what it said. It was declared and never
                  -- filled, so every check that read it saw an empty list and passed by
                  -- accident (found 01.10. while measuring issue #127).
                  (select array_agg(a.tool order by a.seq) from buddy_actions a
                    where a.decision_id = d.id) as tools
             from buddy_decisions d
            where d.learner_id = $1 and d.mode = 'turn' and d.disposition = 'applied'
            -- The eval's clock does not move between turns, so created_at ties: the
            -- message that triggered each decision is what puts them in order.
            order by (select m.seq from buddy_messages m where m.id = d.trigger_message_id),
                     d.created_at`,
          [l.learnerId],
        )
      ).map((r) => ({
        // After a lookup the decision is stored as { lookups, final }.
        asks:
          (r.output as { asks_permission?: boolean; final?: { asks_permission?: boolean } } | null)
            ?.asks_permission ??
          (r.output as { final?: { asks_permission?: boolean } } | null)?.final?.asks_permission ??
          false,
        tools: r.tools ?? [],
        reply: r.text ?? '',
      }));
      const outcome: Outcome = {
        status: res.body.status,
        errorCode: res.body.error_code,
        reply: reply?.text ?? null,
        options: reply?.ask?.options ?? null,
        tools: (
          await env.db.query<{ tool: string }>(
            `select tool from buddy_actions where learner_id = $1 order by seq`,
            [l.learnerId],
          )
        ).map((a) => a.tool),
        goals: await env.db.query(
          `select g.title, g.kind, g.due_date, g.status, g.outcome, s.kind as subject_kind
             from buddy_goals g left join subjects s on s.id = g.subject_id where g.learner_id = $1`,
          [l.learnerId],
        ),
        turns,
        offers: await env.db.query<{ kind: string; text: string }>(
          `select result ->> 'kind' as kind, result ->> 'text' as text
             from buddy_actions
            where learner_id = $1 and tool = 'offer_learning' order by seq`,
          [l.learnerId],
        ),
        materials: (
          await env.db.query<{ title: string | null; archived_at: Date | null }>(
            `select title, archived_at from materials where learner_id = $1`,
            [l.learnerId],
          )
        ).map((m) => ({ title: m.title, archived: m.archived_at !== null })),
        pending: await env.db.query(
          `select operation, title, detail, status from buddy_pending_actions where learner_id = $1`,
          [l.learnerId],
        ),
        memories: await env.db.query(
          `select kind, statement, valid_until from buddy_memories where learner_id = $1 and status = 'active'`,
          [l.learnerId],
        ),
        steps: await env.db.query(
          `select kind, title, planned_date, planned_time, repeat, agreed, state from buddy_steps where learner_id = $1`,
          [l.learnerId],
        ),
        settings: await env.db.one(
          `select contact_enabled, paused_until from buddy_settings where learner_id = $1`,
          [l.learnerId],
        ),
        level: await env.db.one(`select level, grade from learners where id = $1`, [l.learnerId]),
        lookups: (
          await env.db.query<{ tool: string }>(
            `select distinct c->>'tool' as tool
               from buddy_decisions d,
                    jsonb_array_elements(coalesce(d.output->'lookups', '[]'::jsonb)) s,
                    jsonb_array_elements(s->'results') c
              where d.learner_id = $1`,
            [l.learnerId],
          )
        ).map((r) => r.tool),
      };
      const problems =
        outcome.status === 'done'
          ? c.check(outcome)
          : [
              // Why the answer was rejected, not just that it was: a schema the model keeps
              // missing is a bug in the schema, and "model_invalid" alone never says which.
              `turn ${outcome.status} (${outcome.errorCode ?? 'no code'})`,
              ...(
                await env.db.query<{ errors: string[] | null }>(
                  `select errors from buddy_decisions where learner_id = $1 and errors is not null
                    order by created_at desc limit 1`,
                  [l.learnerId],
                )
              ).flatMap((d) => d.errors ?? []),
            ];
      // cached: what the provider served from its prefix cache (issue #25). Every case is a
      // different learner on its own throwaway database, so what can be cached between them
      // is only the part before `contents` — system prompt plus response schema. Measured
      // 2026-09-29: every hit 12 013–12 177 tokens, on 20 of 36 cases in one run and 31 of 36
      // in the next — implicit caching is best-effort, so the hit rate swings between runs.
      const cost = await env.db.one<{
        micros: number;
        calls: number;
        input: number;
        cached: number;
        models: string[];
      }>(
        `select coalesce(sum(cost_micros), 0)::bigint as micros, count(*)::int as calls,
                coalesce(sum(input_tokens), 0)::int as input,
                coalesce(sum(cached_tokens), 0)::int as cached,
                coalesce(array_agg(distinct model), '{}') as models
           from llm_calls`,
      );
      costMicros += cost.micros;
      inputTokens += cost.input;
      cachedTokens += cost.cached;
      for (const m of cost.models) models.add(m);
      if (problems.length) failed++;
      console.info(
        `${problems.length ? '✗' : '✓'} ${c.id}  (${cost.calls} call(s), $${(cost.micros / 1e6).toFixed(4)}` +
          `, ${cost.input} in, ${cost.cached} cached)` +
          (problems.length
            ? `\n    - ${problems.join('\n    - ')}\n    reply: ${outcome.reply ?? '—'}\n    tools: ${outcome.tools.join(', ') || 'none'}\n    goals: ${JSON.stringify(outcome.goals)}`
            : '') +
          // A conversation is judged by its shape, so its shape is printed — pass or fail
          // (issue #127). "How often did he ask back" is only readable next to what was said.
          (c.conversation
            ? `\n` +
              outcome.turns
                .map((t, i) => `    ${i + 1}.${t.asks ? ' [asks]' : ''} ${t.reply}`)
                .join('\n')
            : ''),
      );
      // What he actually answered, not only whether the check passed (issue #80): two runs
      // side by side show an answer that got worse while still passing.
      transcript.push({
        id: c.id,
        ok: problems.length === 0,
        problems,
        reply: outcome.reply,
        options: outcome.options,
        tools: outcome.tools,
        calls: cost.calls,
        costMicros: cost.micros,
        inputTokens: cost.input,
        cachedTokens: cost.cached,
      });
      // Every JSON object the model wrote in this case: its decisions carry the reply, the
      // actions with their arguments and the lookup calls, applied or rejected.
      if (blocks) {
        const written = await env.db.query<{ output: unknown }>(
          `select output from buddy_decisions where learner_id = $1 and output is not null`,
          [l.learnerId],
        );
        const turnCalls = await env.db.one<{ n: number }>(
          `select count(*)::int as n from llm_calls where purpose = 'buddy_turn'`,
        );
        blocks.closeCase(written.map((r) => JSON.stringify(r.output)).join('\n'), turnCalls.n);
      }
    } finally {
      await env.close();
    }
  }
  console.info(
    `\n${cases.length - failed}/${cases.length} passed · total $${(costMicros / 1e6).toFixed(4)}` +
      ` · ${inputTokens} input tokens, ${cachedTokens} of them from the provider's prefix cache`,
  );
  if (blocks && blockOut) {
    console.info(`\n${blocks.table()}`);
    writeFileSync(blockOut, `${JSON.stringify(blocks.json(), null, 2)}\n`);
    console.info(`state block audit \u2192 ${blockOut}`);
  }
  if (process.env.BUDDY_EVAL_OUT) {
    writeFileSync(
      process.env.BUDDY_EVAL_OUT,
      `${JSON.stringify(
        {
          promptVersion: BUDDY_PROMPT_VERSION,
          ranAt,
          models: [...models].sort(),
          costMicros,
          inputTokens,
          cachedTokens,
          cases: transcript,
        },
        null,
        2,
      )}\n`,
    );
    console.info(`transcript → ${process.env.BUDDY_EVAL_OUT}`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

void main();
