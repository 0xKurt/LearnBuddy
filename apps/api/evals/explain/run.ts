// Is the explanation any good? (issue #77, second gap)
//
// Since buddy.22 an explanation *is* the chat answer. `evals/buddy` proves that it happens
// (`de_explain_in_chat`); nobody checked *how well*. This asks Buddy to explain what a
// 12-year-old actually asks about, and has a second model read each answer against a fixed
// rubric — the way a teacher would look over a shoulder, not a star rating.
//
// The rubric is what the design brief promises: one thought at a time, an example she can
// picture, a question back so she can try it, no technical word left unexplained, her
// language, and short enough to read on a phone.
//
//   cd apps/api
//   LLM_BACKEND=vertex DATABASE_URL=postgres://unused/unused npx tsx evals/explain/run.ts
//   (EXPLAIN_OUT=report.md writes every explanation down to read)
//
// requires live verification in Claude Code session (stand-ins for the outside world; live model)

import { writeFileSync } from 'node:fs';

import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

import { loadConfig } from '../../src/config.js';
import { buddyPrompt } from '../../src/modules/buddy/prompts.js';
import { registerLearning } from '../../src/modules/learning/register.js';
import { toJsonSchema } from '../../src/llm/json-schema.js';
import { VertexGateway } from '../../src/llm/vertex.js';
import { testDatabaseAvailable } from '../../src/testing/database.js';
import { createTestEnv, onboard } from '../../src/testing/harness.js';

// Buddy's prompt is built from what the learning domain registers (issue #107).
registerLearning();

loadDotenv({ path: '.env.local' });

type Ask = { id: string; message: string; what: string };

const ASKS: Ask[] = [
  { id: 'dativ', message: 'erklär mir den dativ', what: 'Dativ (Deutsch, Klasse 6)' },
  { id: 'brueche', message: 'wie kürzt man brüche?', what: 'Brüche kürzen (Mathe, Klasse 6)' },
  {
    id: 'photosynthese',
    message: 'was ist photosynthese',
    what: 'Photosynthese (Biologie, Klasse 6)',
  },
  {
    id: 'present-perfect',
    message: 'ich versteh present perfect nicht',
    what: 'Present Perfect (Englisch, Klasse 6)',
  },
  { id: 'urknall', message: 'erklär mir den urknall', what: 'Urknall (Physik, Klasse 6)' },
];

const Verdict = z.object({
  one_thought: z.boolean().describe('true if it follows one thought, not five at once'),
  example: z.boolean().describe('true if there is an example a 12-year-old can picture'),
  invites_her: z
    .boolean()
    .describe('true if it ends with a question or an invitation she can answer'),
  no_unexplained_jargon: z
    .boolean()
    .describe('true if every technical word is explained where it is used'),
  right_level: z.boolean().describe('true if a 12-year-old in grade 6 can follow it'),
  short_enough: z.boolean().describe('true if it reads in under a minute on a phone'),
  why: z.string().max(240).describe('One short German sentence: what is missing, or why it works'),
});
const SCHEMA = toJsonSchema(Verdict);

const JUDGE = `You read an explanation a learning companion wrote for a 12-year-old in grade 6, in her language, in a chat.
Judge only this explanation, against the schema. What counts is whether *she* can follow it:
one thought at a time, an example she can picture, an invitation to try it herself, every
technical word explained where it is used, her level, and short enough for a phone screen.
A friendly tone is expected and is not a criterion of its own.
Answer with the JSON object described by the schema.`;

async function main(): Promise<void> {
  const config = loadConfig({
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://unused/unused',
    SUPABASE_URL: process.env.SUPABASE_URL ?? 'http://unused.local',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'unused-unused-unused',
    ADMIN_TOKEN_SECRET: process.env.ADMIN_TOKEN_SECRET ?? 'unused-unused-unused-unused-unused!',
  });
  if (config.LLM_BACKEND !== 'vertex') throw new Error('LLM_BACKEND=vertex is required');
  if (!(await testDatabaseAvailable())) throw new Error('a local Postgres is required');
  const vertex = new VertexGateway(config);

  const out: string[] = [
    `# Erklär-Eval (live, ${buddyPrompt().version}, ${new Date().toISOString().slice(0, 16)})`,
    '',
  ];
  let good = 0;

  for (const ask of ASKS) {
    const env = await createTestEnv({ start: '2026-09-29T15:00:00Z', gateway: vertex });
    try {
      const l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
      await l.api.post('/buddy/messages', {
        client_message_id: crypto.randomUUID(),
        text: ask.message,
      });
      const reply = await env.db.maybeOne<{ text: string }>(
        `select text from buddy_messages where learner_id = $1 and role = 'buddy'
          order by seq desc limit 1`,
        [l.learnerId],
      );
      const text = reply?.text?.trim() ?? '';
      if (!text) {
        console.log(`✗ ${ask.id}: keine Antwort`);
        out.push(`## ${ask.what}`, '', '**Keine Antwort.**', '');
        continue;
      }
      const res = await vertex.generate({
        purpose: 'buddy_check',
        tier: 'smart',
        promptVersion: 'explain-eval.v1',
        system: JUDGE,
        contents: [
          { role: 'user', parts: [{ text: `SHE ASKED: ${ask.message}\n\nEXPLANATION:\n${text}` }] },
        ],
        schema: SCHEMA,
        maxOutputTokens: 500,
        temperature: 0,
        timeoutMs: 45_000,
        thinkingBudget: 0,
      });
      const v = Verdict.parse(res.json);
      const flags = [
        v.one_thought ? null : 'zu viel auf einmal',
        v.example ? null : 'kein Beispiel',
        v.invites_her ? null : 'lädt sie nicht ein',
        v.no_unexplained_jargon ? null : 'Fachwort unerklärt',
        v.right_level ? null : 'falsche Stufe',
        v.short_enough ? null : 'zu lang',
      ].filter(Boolean);
      if (flags.length === 0) good += 1;
      console.log(
        `${flags.length === 0 ? '✓' : '✗'} ${ask.id}${flags.length ? `: ${flags.join(', ')}` : ''}`,
      );
      if (flags.length) console.log(`    ${v.why}`);
      out.push(
        `## ${ask.what}`,
        '',
        `*„${ask.message}"* — ${flags.length === 0 ? '✓ ohne Befund' : `✗ ${flags.join(', ')}`}`,
        '',
        `> ${text.split('\n').join('\n> ')}`,
        '',
        `_${v.why}_`,
        '',
      );
    } finally {
      await env.close();
    }
  }

  out.push('', `**${good}/${ASKS.length} Erklärungen ohne Befund**`);
  if (process.env.EXPLAIN_OUT) writeFileSync(process.env.EXPLAIN_OUT, `${out.join('\n')}\n`);
  console.log(`\n${good}/${ASKS.length} Erklärungen ohne Befund`);
  process.exit(good === ASKS.length ? 0 : 1);
}

void main();
