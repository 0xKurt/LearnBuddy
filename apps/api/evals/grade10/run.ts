// The grade-10 probe, live (issues #297 and #298, „Erst messen"): how well Buddy explains real
// Klasse-10 topics, and what becomes of Klasse-10 tasks in parts — photographed and typed in.
//
//   1. Explanations (#298): she asks Buddy in the chat (`cases.ts` EXPLAIN_CASES), a judge reads
//      the answer against subject-correctness, following at 15/16, the grade-10 curriculum and
//      length — twice, with the criteria in swapped order (`judge.ts`).
//   2. Tasks in parts (#297): each TASK_CASES task is photographed as a sheet and read, and typed
//      in as a practice wish. Counted: tasks kept whole, their parts and forms, a figure as
//      material, subtasks that fell back to single questions — and each task judged twice.
//
// Disputed criteria count for neither side; they and every third case go to a human (the report
// lists them). The report is the eval report #298 asks for in docs/ (GRADE10_OUT).
//
//   cd apps/api
//   LLM_BACKEND=vertex GOOGLE_CLOUD_PROJECT=… GOOGLE_APPLICATION_CREDENTIALS=… \
//     GRADE10_OUT=../../docs/measurements/grade10-probe.md npx tsx evals/grade10/run.ts
//
// Needs a local Postgres (LB_TEST_DATABASE_URL) and Chromium (LB_CHROMIUM, else Playwright's own).
// requires live verification in Claude Code session (stand-ins for the outside world; live model)

import { writeFileSync } from 'node:fs';

import { config as loadDotenv } from 'dotenv';

import { loadConfig } from '../../src/config.js';
import { toJsonSchema } from '../../src/llm/json-schema.js';
import { VertexGateway } from '../../src/llm/vertex.js';
import { testDatabaseAvailable } from '../../src/testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../../src/testing/harness.js';
import { closeSheetBrowser, photographSheet } from '../sheetPhoto.js';
import {
  EXPLAIN_CASES,
  EXPLAIN_CRITERIA,
  TASK_CASES,
  TASK_CRITERIA,
  type TaskCase,
} from './cases.js';
import {
  agreement,
  forHumans,
  tally,
  verdictSchema,
  type Agreement,
  type Reading,
} from './judge.js';

loadDotenv({ path: '.env.local' });

const config = loadConfig({
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://unused/unused',
  SUPABASE_URL: process.env.SUPABASE_URL ?? 'http://unused.local',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'unused-unused-unused',
  ADMIN_TOKEN_SECRET: process.env.ADMIN_TOKEN_SECRET ?? 'unused-unused-unused-unused-unused!',
});
const vertex = new VertexGateway(config);

type Criteria = Readonly<Record<string, string>>;

const JUDGE = `You check what a learning app gave a learner in grade 10 (15–16 years old) at a German school.
Judge only what is shown, against the schema, strictly: a single wrong fact makes "correct" or "keys_right" false.
Answer with the JSON object described by the schema.`;

/** One reading of the judge, with the criteria in the order given. */
async function read(criteria: Criteria, reversed: boolean, text: string): Promise<Reading> {
  const schema = verdictSchema(criteria, reversed);
  const res = await vertex.generate({
    purpose: 'buddy_check',
    tier: 'smart',
    promptVersion: 'grade10-eval.v1',
    system: JUDGE,
    contents: [{ role: 'user', parts: [{ text }] }],
    schema: toJsonSchema(schema),
    maxOutputTokens: 600,
    temperature: 0,
    timeoutMs: 45_000,
    thinkingBudget: 0,
  });
  return schema.parse(res.json) as Reading;
}

/** Both readings, and what they agree on. */
async function judged(criteria: Criteria, text: string) {
  const first = await read(criteria, false, text);
  const second = await read(criteria, true, text);
  return { agreement: agreement(criteria, first, second), why: String(first.why) };
}

type Judged = { id: string; what: string; shown: string; agreement: Agreement; why: string };

/** A learner in grade 10 on a fresh database with the live model. */
async function grade10(): Promise<{ env: TestEnv; l: Learner }> {
  const env = await createTestEnv({ start: '2026-10-10T15:00:00Z', gateway: vertex });
  const l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2010-03-10' });
  await env.db.query(`update learners set level = 'school', grade = 10 where id = $1`, [
    l.learnerId,
  ]);
  return { env, l };
}

async function explanations(): Promise<Judged[]> {
  const out: Judged[] = [];
  for (const c of EXPLAIN_CASES) {
    const { env, l } = await grade10();
    try {
      await l.api.post('/buddy/messages', {
        client_message_id: crypto.randomUUID(),
        text: c.message,
      });
      const reply = await env.db.maybeOne<{ text: string }>(
        `select text from buddy_messages where learner_id = $1 and role = 'buddy'
          order by seq desc limit 1`,
        [l.learnerId],
      );
      const shown = reply?.text.trim() ?? '';
      if (!shown) {
        console.log(`✗ ${c.id}: keine Antwort`);
        continue;
      }
      const j = await judged(
        EXPLAIN_CRITERIA,
        `TOPIC: ${c.what}\nSHE ASKED: ${c.message}\n\nEXPLANATION:\n${shown}`,
      );
      console.log(`${j.agreement.clean ? '✓' : '✗'} ${c.id}`);
      out.push({ id: c.id, what: c.what, shown, ...j });
    } finally {
      await env.close();
    }
  }
  return out;
}

type PartRow = {
  task_part: { group: string; part: string; stem: string; from: string | null } | null;
  kind: string;
  prompt: string;
  answer: string;
  figure: { type: string } | null;
  image_id: string | null;
};

/** The questions a case left, tasks first, as text the judge reads and the report shows. */
function described(rows: readonly PartRow[]) {
  const groups = new Map<string, PartRow[]>();
  for (const r of rows) {
    if (r.task_part) groups.set(r.task_part.group, [...(groups.get(r.task_part.group) ?? []), r]);
  }
  const tasks = [...groups.values()].map((parts) => {
    const first = parts[0]!;
    const material = [
      `MATERIAL: ${first.task_part!.stem}`,
      first.figure ? `DRAWN AS DATA: ${first.figure.type}` : null,
      first.image_id ? 'A PHOTO OF THE SHEET’S DRAWING STANDS ABOVE EVERY PART' : null,
    ].filter((line): line is string => line !== null);
    const lines = parts.map(
      (p) =>
        `${p.task_part!.part}) [${p.kind}] ${p.prompt} — ANSWER: ${p.answer}${p.task_part!.from ? ` (from ${p.task_part!.from})` : ''}`,
    );
    return [...material, ...lines].join('\n');
  });
  return { tasks, single: rows.filter((r) => !r.task_part).length };
}

const PART_ROWS = `select task_part, kind, prompt, answer, figure, image_id from items`;

/** The task photographed as a sheet and read: what the reading kept of it. */
async function fromPhoto(env: TestEnv, l: Learner, c: TaskCase): Promise<PartRow[]> {
  const created = await l.api.post<{ material: { id: string }; uploads: { path: string }[] }>(
    '/materials',
    { client_request_id: crypto.randomUUID(), photo_mimes: ['image/jpeg'], purpose: 'study' },
  );
  if (created.status !== 201) throw new Error(`create ${created.status}`);
  const html = c.text
    .split('\n')
    .map((line) => `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`)
    .join('');
  env.storage.put(created.body.uploads[0]!.path, await photographSheet(html));
  await l.api.post(`/materials/${created.body.material.id}/submit`);
  await env.flushBackground();
  return env.db.query<PartRow>(`${PART_ROWS} where material_id = $1 order by seq`, [
    created.body.material.id,
  ]);
}

/** The task typed in as a practice wish: what the generator wrote and code kept. */
async function fromWish(env: TestEnv, l: Learner, c: TaskCase): Promise<PartRow[]> {
  const res = await l.api.post<{ id: string }>('/practice/topic', {
    client_request_id: crypto.randomUUID(),
    kind: 'practice',
    text: `Übe mit mir Aufgaben wie diese:\n${c.text}`,
  });
  if (res.status !== 201) throw new Error(`topic ${res.status}`);
  await env.flushBackground();
  return env.db.query<PartRow>(
    `${PART_ROWS} where id in (select item_id from session_items where session_id = $1)
      order by seq`,
    [res.body.id],
  );
}

async function tasks(): Promise<{ judged: Judged[]; counts: string[] }> {
  const out: Judged[] = [];
  const counts: string[] = [];
  for (const c of TASK_CASES) {
    for (const [how, run] of [
      ['Foto', fromPhoto],
      ['Wunsch', fromWish],
    ] as const) {
      const { env, l } = await grade10();
      try {
        const rows = await run(env, l, c);
        const { tasks: found, single } = described(rows);
        const figures = rows.filter((r) => r.task_part && (r.figure || r.image_id)).length;
        counts.push(
          `| ${c.id} | ${how} | ${found.length} | ${rows.length - single} | ${single} | ${figures} |`,
        );
        for (const [n, task] of found.entries()) {
          const j = await judged(TASK_CRITERIA, `TASK (${c.what}):\n${task}`);
          console.log(`${j.agreement.clean ? '✓' : '✗'} ${c.id} ${how} ${n + 1}`);
          out.push({ id: `${c.id}-${how}-${n + 1}`, what: c.what, shown: task, ...j });
        }
      } catch (err) {
        counts.push(
          `| ${c.id} | ${how} | Fehler: ${err instanceof Error ? err.message : String(err)} | | | |`,
        );
      } finally {
        await env.close();
      }
    }
  }
  return { judged: out, counts };
}

/** One section of the report: the tally per criterion, then every case. */
function section(title: string, criteria: Criteria, cases: readonly Judged[]): string[] {
  const human = new Set(forHumans(cases));
  return [
    `## ${title}`,
    '',
    '| Kriterium | ja (beide Lesungen) | strittig | von |',
    '|---|--:|--:|--:|',
    ...tally(
      criteria,
      cases.map((c) => c.agreement),
    ).map((t) => `| ${t.key} | ${t.yes} | ${t.disputed} | ${t.of} |`),
    '',
    ...cases.flatMap((c) => [
      `### ${c.what} (\`${c.id}\`)${human.has(c.id) ? ' — **Mensch prüft**' : ''}`,
      '',
      `> ${c.shown.split('\n').join('\n> ')}`,
      '',
      `${
        c.agreement.clean
          ? '✓ ohne Befund'
          : `✗ ${Object.entries(c.agreement.agreed)
              .filter(([, v]) => v !== true)
              .map(([k, v]) => (v === null ? `${k} strittig` : k))
              .join(', ')}`
      } — _${c.why}_`,
      '',
    ]),
  ];
}

async function main(): Promise<void> {
  if (config.LLM_BACKEND !== 'vertex') throw new Error('LLM_BACKEND=vertex is required');
  if (!(await testDatabaseAvailable())) throw new Error('a local Postgres is required');
  const explained = await explanations();
  const { judged: tasked, counts } = await tasks();
  await closeSheetBrowser();
  const report = [
    `# Klasse-10-Probe (live, ${new Date().toISOString().slice(0, 16)})`,
    '',
    'Issues #297 und #298. Jede Bewertung zweimal gelesen, die Kriterien in vertauschter Reihenfolge;',
    'strittige Kriterien zählen für keine Seite und gehen mit jedem dritten Fall an einen Menschen.',
    '',
    ...section('Erklärungen (#298)', EXPLAIN_CRITERIA, explained),
    '## Aufgaben mit Teilaufgaben (#297)',
    '',
    '| Fall | Weg | Aufgaben | Teile | Einzelfragen | Teile mit Abbildung |',
    '|---|---|--:|--:|--:|--:|',
    ...counts,
    '',
    ...section('Aufgaben, beurteilt', TASK_CRITERIA, tasked),
  ];
  if (process.env.GRADE10_OUT) writeFileSync(process.env.GRADE10_OUT, `${report.join('\n')}\n`);
  const clean = [...explained, ...tasked].filter((c) => c.agreement.clean).length;
  console.log(`\n${clean}/${explained.length + tasked.length} ohne Befund`);
}

void main();
