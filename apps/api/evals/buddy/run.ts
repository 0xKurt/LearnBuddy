// Live-model evaluation of Buddy's conversation turns (not part of CI: it
// needs Vertex credentials and costs a little money). Runs every case through
// the real pipeline on a throwaway database and checks what was applied.
//
//   cd apps/api
//   LLM_BACKEND=vertex GOOGLE_CLOUD_PROJECT=… GOOGLE_APPLICATION_CREDENTIALS=… \
//     npx tsx evals/buddy/run.ts [case-id …]
//
// Reads apps/api/.env.local like the dev server. Exit code 1 if a case fails.

import { config as loadDotenv } from 'dotenv';

import { loadConfig } from '../../src/config.js';
import { VertexGateway } from '../../src/llm/vertex.js';
import { testDatabaseAvailable } from '../../src/testing/database.js';
import { createTestEnv, onboard } from '../../src/testing/harness.js';
import { CASES, type Outcome } from './cases.js';

loadDotenv({ path: '.env.local' });

async function main(): Promise<void> {
  const config = loadConfig({
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL ?? 'unused',
    SUPABASE_URL: process.env.SUPABASE_URL ?? 'http://unused.local',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'unused-unused-unused',
    ADMIN_TOKEN_SECRET: process.env.ADMIN_TOKEN_SECRET ?? 'unused-unused-unused-unused-unused!',
  });
  if (config.LLM_BACKEND !== 'vertex')
    throw new Error('Set LLM_BACKEND=vertex and the Vertex variables (docs/SETUP-VERTEX.md)');
  if (!(await testDatabaseAvailable())) throw new Error('No local Postgres (LB_TEST_DATABASE_URL)');
  const gateway = new VertexGateway(config);
  const only = process.argv.slice(2);
  const cases = only.length ? CASES.filter((c) => only.includes(c.id)) : CASES;

  let failed = 0;
  let costMicros = 0;
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
        memories: await env.db.query(
          `select kind, statement, valid_until from buddy_memories where learner_id = $1 and status = 'active'`,
          [l.learnerId],
        ),
        steps: await env.db.query(
          `select kind, title, planned_date, planned_time, agreed, state from buddy_steps where learner_id = $1`,
          [l.learnerId],
        ),
        settings: await env.db.one(
          `select contact_enabled, max_per_week, paused_until from buddy_settings where learner_id = $1`,
          [l.learnerId],
        ),
        level: await env.db.one(`select level, grade from learners where id = $1`, [l.learnerId]),
      };
      const problems =
        outcome.status === 'done'
          ? c.check(outcome)
          : [`turn ${outcome.status} (${outcome.errorCode ?? 'no code'})`];
      const cost = await env.db.one<{ micros: number; calls: number }>(
        `select coalesce(sum(cost_micros), 0)::bigint as micros, count(*)::int as calls from llm_calls`,
      );
      costMicros += cost.micros;
      if (problems.length) failed++;
      console.info(
        `${problems.length ? '✗' : '✓'} ${c.id}  (${cost.calls} call(s), $${(cost.micros / 1e6).toFixed(4)})` +
          (problems.length
            ? `\n    - ${problems.join('\n    - ')}\n    reply: ${outcome.reply ?? '—'}\n    tools: ${outcome.tools.join(', ') || 'none'}\n    goals: ${JSON.stringify(outcome.goals)}`
            : ''),
      );
    } finally {
      await env.close();
    }
  }
  console.info(
    `\n${cases.length - failed}/${cases.length} passed · total $${(costMicros / 1e6).toFixed(4)}`,
  );
  process.exit(failed > 0 ? 1 : 0);
}

void main();
