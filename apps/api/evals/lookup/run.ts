// Live lookup-reliability eval (issue #26): does the real turn pipeline get the
// right passage into Buddy's answer for "das Blatt von letzter Woche"-class
// questions — through the search_material lookup or the pre-injection?
//
//   cd apps/api
//   npx tsx evals/lookup/run.ts [case-id …]
//
// Reads apps/api/.env.local like the dev server; needs a local Postgres. On a
// database without pgvector (local PG14) the search runs as full text + trigram
// — exactly what production would do if embeddings dropped out; the vector
// gain itself is measured separately in retrieval.ts. Exit code 1 on failure.
// requires live verification in Claude Code session (stand-ins for the outside world; live model)

import { randomUUID } from 'node:crypto';

import { config as loadDotenv } from 'dotenv';

import { loadConfig } from '../../src/config.js';
import { evalEnv } from '../eval-env.js';
import { VertexEmbeddings } from '../../src/llm/vertex-embeddings.js';
import { VertexGateway } from '../../src/llm/vertex.js';
import { testDatabaseAvailable } from '../../src/testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../../src/testing/harness.js';
import { SHEETS, type Sheet } from './fixtures.js';

loadDotenv({ path: '.env.local' });

type Outcome = {
  status: string;
  reply: string | null;
  lookups: string[];
  queries: string[];
};

type Case = {
  id: string;
  /** Sheet keys from fixtures.ts, with the local day each was read. */
  sheets: Array<{ key: Sheet['key']; readOn: string }>;
  message: string;
  /** Violated expectations; empty = pass. */
  check: (o: Outcome) => string[];
};

const must = (cond: boolean, msg: string): string[] => (cond ? [] : [msg]);
const grounded = (o: Outcome, words: string[]): boolean =>
  words.some((w) => (o.reply ?? '').toLowerCase().includes(w.toLowerCase()));

const CASES: Case[] = [
  {
    id: 'blatt_letzte_woche',
    sheets: [
      { key: 'roemer', readOn: '2026-09-21' },
      { key: 'photosynthese', readOn: '2026-09-27' },
    ],
    message: 'Was stand auf dem Blatt von letzter Woche über die Römer?',
    check: (o) => [
      ...must(
        grounded(o, ['Augustus', 'Kaiser', '753', 'Aquädukt', 'Legion']),
        'answers from the sheet, not from thin air',
      ),
      ...must(
        o.lookups.includes('search_material') || grounded(o, ['Augustus', '753']),
        'search_material fired (or the pre-injected passage carried the answer)',
      ),
    ],
  },
  {
    id: 'typo_fotosyntese',
    sheets: [
      { key: 'photosynthese', readOn: '2026-09-27' },
      { key: 'roemer', readOn: '2026-09-21' },
    ],
    message: 'Was steht auf meinem Fotosyntese-Blatt?',
    check: (o) =>
      must(
        grounded(o, ['Zucker', 'Licht', 'Chlorophyll', 'Sauerstoff']),
        'the mistyped compound still reaches the sheet (trigram/hybrid)',
      ),
  },
  {
    id: 'franzoesisch_vokabeln',
    sheets: [
      { key: 'vokabeln', readOn: '2026-09-25' },
      { key: 'einmaleins', readOn: '2026-09-20' },
    ],
    message: 'Welche französischen Vokabeln hatte ich nochmal auf meinem Blatt?',
    check: (o) => [
      ...must(
        grounded(o, ['chambre', 'cuisine', 'jardin', 'salon', 'maison']),
        'names words that are really on her sheet',
      ),
    ],
  },
  {
    id: 'einmaleins_blatt',
    sheets: [
      { key: 'einmaleins', readOn: '2026-09-26' },
      { key: 'wasserkreislauf', readOn: '2026-09-24' },
    ],
    message: 'Was steht auf meinem Einmaleins-Blatt?',
    check: (o) =>
      must(
        grounded(o, ['Reihe', 'Multiplikation', 'Tauschaufgabe', 'Kernaufgabe', '7er']),
        'answers from the Einmaleins sheet',
      ),
  },
];

async function seed(env: TestEnv, l: Learner, sheets: Case['sheets']): Promise<void> {
  for (const s of sheets) {
    const sheet = SHEETS.find((x) => x.key === s.key)!;
    await env.db.query(
      `with subj as (
         insert into subjects (learner_id, name, kind) values ($1, $2, 'other') returning id)
       insert into materials (learner_id, client_request_id, status, photo_count, title,
                              extracted_text, ready_at, subject_id)
       values ($1, $5, 'ready', 1, $3, $4, ($6::date + interval '10 hours'), (select id from subj))`,
      [l.learnerId, sheet.subject, sheet.title, sheet.text, randomUUID(), s.readOn],
    );
  }
  await env.db.query(
    `update buddy_settings set context_version = context_version + 1 where learner_id = $1`,
    [l.learnerId],
  );
}

async function main(): Promise<void> {
  const config = loadConfig({
    ...evalEnv(),
    DATABASE_URL:
      process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/postgres',
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
    const env = await createTestEnv({
      start: '2026-09-28T08:00:00Z',
      gateway,
      embeddings: new VertexEmbeddings(config),
    });
    try {
      const l = await onboard(env, {
        relation: 'child',
        name: 'Lena',
        birthDate: '2014-02-10',
        pin: '4826',
      });
      await seed(env, l, c.sheets);
      const res = await l.api.post<{ status: string; error_code: string | null }>(
        '/buddy/messages',
        { client_message_id: crypto.randomUUID(), text: c.message },
      );
      const reply = await env.db.maybeOne<{ text: string }>(
        `select text from buddy_messages where learner_id = $1 and role = 'buddy' order by seq desc limit 1`,
        [l.learnerId],
      );
      const lookups = await env.db.query<{ tool: string; query: string | null }>(
        `select c->>'tool' as tool, c->'args'->>'query' as query
           from buddy_decisions d,
                jsonb_array_elements(coalesce(d.output->'lookups', '[]'::jsonb)) s,
                jsonb_array_elements(s->'calls') c
          where d.learner_id = $1`,
        [l.learnerId],
      );
      const outcome: Outcome = {
        status: res.body.status,
        reply: reply?.text ?? null,
        lookups: lookups.map((x) => x.tool),
        queries: lookups.flatMap((x) => (x.query ? [x.query] : [])),
      };
      const problems =
        outcome.status === 'done'
          ? c.check(outcome)
          : [`turn ${outcome.status} (${res.body.error_code ?? 'no code'})`];
      const cost = await env.db.one<{ micros: number; calls: number }>(
        `select coalesce(sum(cost_micros), 0)::bigint as micros, count(*)::int as calls from llm_calls`,
      );
      costMicros += cost.micros;
      if (problems.length) failed++;
      console.info(
        `${problems.length ? '✗' : '✓'} ${c.id}  (${cost.calls} call(s), $${(cost.micros / 1e6).toFixed(4)})` +
          `\n    lookups: ${outcome.lookups.join(', ') || 'none (pre-injection only)'}` +
          (outcome.queries.length ? ` · queries: ${outcome.queries.join(' | ')}` : '') +
          (problems.length
            ? `\n    - ${problems.join('\n    - ')}\n    reply: ${outcome.reply ?? '—'}`
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
