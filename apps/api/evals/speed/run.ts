// How long does Lena wait, and what does it cost? Every typical step against
// the live model, timed end to end (in process: no network, no cold start —
// a deployed API adds both) plus the model calls behind it from llm_calls.
// Budget: an answer checked within 1.5 s, Buddy's reply within 3 s
// (docs/architecture.md §Speed).
// Needs LLM_BACKEND=vertex, GOOGLE_* variables, a local Postgres and espeak-ng.
//   cd apps/api && npx tsx evals/speed/run.ts [rounds]

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  AnswerResponse,
  SendMessageResponse,
  SessionView,
} from '@learnbuddy/shared-types/contracts';

import { loadConfig } from '../../src/config.js';
import { VertexGateway } from '../../src/llm/vertex.js';
import { createTestEnv, onboard } from '../../src/testing/harness.js';

const config = loadConfig({
  ...process.env,
  DATABASE_URL: 'x',
  SUPABASE_URL: 'http://x.local',
  SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
  ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
});
const env = await createTestEnv({
  start: '2026-09-28T13:30:00Z',
  gateway: new VertexGateway(config),
});
const l = await onboard(env, {
  relation: 'child',
  name: 'Lena',
  birthDate: '2014-02-10',
  pin: '4826',
});

type Row = { step: string; wall: number; calls: number; model: number; cost: number };
const rows: Row[] = [];
/** Budget per kind of step, in ms (end to end, in process). */
const BUDGET = { answer: 1500, chat: 3000, voice: 1500, prepare: 15000 } as const;
const budgetOf = new Map<string, number>();

async function timed<T>(step: string, kind: keyof typeof BUDGET, fn: () => Promise<T>): Promise<T> {
  await env.db.query(`delete from llm_calls where learner_id = $1`, [l.learnerId]);
  const t0 = performance.now();
  const out = await fn();
  const wall = Math.round(performance.now() - t0);
  const m = await env.db.one<{ calls: string; ms: string | null; cost: string | null }>(
    `select count(*) as calls, sum(latency_ms) as ms, sum(cost_micros) as cost
       from llm_calls where learner_id = $1`,
    [l.learnerId],
  );
  rows.push({
    step,
    wall,
    calls: Number(m.calls),
    model: Number(m.ms ?? 0),
    cost: Number(m.cost ?? 0),
  });
  budgetOf.set(step, BUDGET[kind]);
  return out;
}

const solutionOf = async (itemId: string) =>
  (
    await env.db.one<{ answer: string; correct_choice: number | null }>(
      `select answer, correct_choice from items where id = $1`,
      [itemId],
    )
  ).answer;

async function start(kind: string, text: string): Promise<SessionView> {
  const r = await timed(`prepare ${kind}`, 'prepare', () =>
    l.api.post<SessionView>('/practice/topic', {
      client_request_id: crypto.randomUUID(),
      kind,
      text,
    }),
  );
  if (r.status !== 201) throw new Error(`start ${kind}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

async function answer(s: SessionView, step: string, text: (solution: string) => string) {
  const open = s.items.find((i) => i.status === 'open');
  if (!open) return s;
  const solution = await solutionOf(open.item.id);
  const r = await timed(step, 'answer', () =>
    l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: crypto.randomUUID(),
      item_id: open.item.id,
      text: text(solution),
    }),
  );
  if (r.status !== 200) throw new Error(`${step}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.session;
}

const rounds = Number(process.argv[2] ?? 2);
const S = mkdtempSync(join(tmpdir(), 'lb-speed-'));
execFileSync('espeak-ng', ['-v', 'de', '-s', '150', '-w', join(S, 'de.wav'), 'drei Viertel']);
execFileSync('espeak-ng', [
  '-v',
  'fr',
  '-s',
  '140',
  '-w',
  join(S, 'fr.wav'),
  'Bonjour, je m’appelle Lena.',
]);

for (let round = 0; round < rounds; round++) {
  console.log(`round ${round + 1}/${rounds}`);
  for (const text of [
    'hi',
    'was ist nochmal ein nenner',
    'am donnerstag schreib ich englisch vokabeltest',
  ]) {
    await timed(`chat "${text.slice(0, 18)}"`, 'chat', () =>
      l.api.post<SendMessageResponse>('/buddy/messages', {
        client_message_id: crypto.randomUUID(),
        text,
      }),
    );
  }

  let v = await start(
    'vocab',
    'Englisch: house Haus, garden Garten, kitchen Küche, bedroom Schlafzimmer',
  );
  v = await answer(v, 'vocab right', (sol) => sol);
  v = await answer(v, 'vocab typo', (sol) => sol.slice(0, -1));
  v = await answer(v, 'vocab wrong', () => 'Stuhl');
  v = await answer(v, 'vocab "weiß nicht"', () => 'weiß nicht');

  let m = await start('practice', 'Mathe: Brüche addieren, Klasse 6');
  m = await answer(m, 'math right', (sol) => sol);
  m = await answer(m, 'math wrong', () => '3/7');
  m = await answer(m, 'math "hä?"', () => 'hä versteh ich nicht');

  let t = await start('test', 'Mathe: Brüche addieren, Klasse 6');
  t = await answer(t, 'test right', (sol) => sol);
  t = await answer(t, 'test wrong', () => '3/7');

  await timed('voice → text', 'voice', () =>
    l.api.post('/voice/transcribe', {
      mime: 'audio/wav',
      audio_base64: readFileSync(join(S, 'de.wav')).toString('base64'),
      purpose: 'answer',
      lang: 'de',
      context: 'Was ist 1/2 + 1/4?',
    }),
  );

  const sp = await start(
    'speak',
    'Französisch: sich vorstellen, ein Satz: Bonjour, je m’appelle Lena.',
  );
  const item = sp.items.find((i) => i.status === 'open');
  if (item) {
    await timed('pronunciation', 'answer', () =>
      l.api.post(`/practice/sessions/${sp.id}/speak`, {
        client_turn_id: crypto.randomUUID(),
        item_id: item.item.id,
        mime: 'audio/wav',
        audio_base64: readFileSync(join(S, 'fr.wav')).toString('base64'),
      }),
    );
  }
  await env.flushBackground();
}

// Per step: median wall time, model calls, cost per 1000 times.
const by = new Map<string, Row[]>();
for (const r of rows) by.set(r.step, [...(by.get(r.step) ?? []), r]);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
console.log(
  `\n${'step'.padEnd(26)} ${'wait'.padStart(7)} ${'max'.padStart(7)} ${'calls'.padStart(5)} ${'model'.padStart(7)} ${'$/1000'.padStart(7)}  budget`,
);
let over = 0;
for (const [step, rs] of by) {
  const wall = median(rs.map((r) => r.wall));
  const max = Math.max(...rs.map((r) => r.wall));
  const budget = budgetOf.get(step) ?? 0;
  if (wall > budget) over++;
  console.log(
    `${step.padEnd(26)} ${`${wall}ms`.padStart(7)} ${`${max}ms`.padStart(7)} ${String(median(rs.map((r) => r.calls))).padStart(5)} ${`${median(rs.map((r) => r.model))}ms`.padStart(7)} ${(median(rs.map((r) => r.cost)) / 1000).toFixed(2).padStart(7)}  ${wall > budget ? `✗ over ${budget}ms` : '✓'}`,
  );
}
console.log(`\n${over} step(s) over budget. Cost column: model cost in USD per 1000 such steps.`);
await env.close();
