// Real HTTP app requests, production EU gateways, disposable shared Postgres (#928).
// Run from apps/api under scripts/test-lock.sh; credentials must already be exported.
// requires live verification in Claude Code session
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { serve } from '@hono/node-server';
import { DEFAULT_TIMEZONE } from '@learnbuddy/shared-types/contracts';
import { loadConfig } from '../src/config.js';
import { createTestEnv, onboard, type Learner } from '../src/testing/harness.js';
import { testDatabaseAvailable } from '../src/testing/database.js';
import { worksheetJpeg } from '../src/testing/bench/workloads.js';
import { AuditMeter, partition } from '../src/testing/speed/meter.js';
import { ESSAY_TEXT, practiceFixture, hintEvalFixture } from '../src/testing/speed/fixtures.js';
import { prepareHints } from '../src/modules/practice/hints.js';
import type { PracticeLearner } from '../src/modules/practice/service.js';
import '../src/testing/domain.js';

if (process.env.LB_TEST_LOCK_HELD !== '1' || !(await testDatabaseAvailable()))
  throw new Error('Shared test lock and Postgres required');
const out = resolve(process.env.SPEED_OUT ?? '../../test-results/speed-eu/before.jsonl');
mkdirSync(dirname(out), { recursive: true });
const cfg = loadConfig({
  ...process.env,
  DATABASE_URL: 'postgres://unused/unused',
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
  ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
  LLM_BACKEND: 'openai',
  AUDIO_BACKEND: 'openai',
  SPEECH_BACKEND: 'openai',
  EMBEDDING_BACKEND: 'openai',
  OPENAI_MODEL_SMART: 'gpt-5.4-mini',
  OPENAI_MODEL_FAST: 'gpt-5.4-mini',
  OPENAI_ROUTES: '{}',
  OPENAI_MODEL_PRONOUNCE: 'gpt-realtime-2.1',
  OPENAI_MODEL_TRANSCRIBE: 'gpt-transcribe',
  OPENAI_MODEL_SPEECH: 'gpt-realtime-2.1-mini',
});
const meter = new AuditMeter(cfg, out, Number(process.env.SPEED_ALREADY_SPENT ?? 0));
const env = await createTestEnv({ gateway: meter.gateway(), start: '2026-10-24T10:00:00Z' });
meter.attach(env);
appendFileSync(
  out,
  JSON.stringify({
    type: 'setup',
    at: new Date().toISOString(),
    head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    node: process.version,
    database: env.db.pool.options.database,
    endpoint: cfg.OPENAI_BASE_URL,
    alreadySpent: meter.charged,
  }) + '\n',
);
const server = serve({ fetch: env.app.fetch, hostname: '127.0.0.1', port: 0 });
await new Promise<void>((r) => (server.listening ? r() : server.once('listening', r)));
const addr = server.address();
if (!addr || typeof addr === 'string') throw new Error('No local HTTP listener');
const base = `http://127.0.0.1:${addr.port}/v1`;
const stages = (
  process.env.SPEED_STAGES ??
  'chat,topic,tutor,hint,essay,safeguard,stt,speak,tts,photo,roleplay,embedding'
).split(',');
const rounds = Number(process.env.SPEED_ROUNDS ?? 5);
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10) throw new Error('Invalid rounds');
let first: number | null = null;
let sentence: number | null = null;
let applied: number | null = null;
async function request(l: Learner, path: string, body?: unknown, accept = 'application/json') {
  const res = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: `Bearer ${l.token}`,
      'content-type': 'application/json',
      accept,
      'x-timezone': DEFAULT_TIMEZONE,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (accept === 'text/event-stream') {
    let buffer = '';
    let result: unknown = null;
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const event = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = event
          .split('\n')
          .find((s) => s.startsWith('data:'))
          ?.slice(5);
        if (!data) continue;
        const parsed = JSON.parse(data) as {
          text?: string;
          speakable?: boolean;
          done?: boolean;
          code?: string;
          heard?: string;
        };
        if (event.includes('event: error')) throw new Error(`SSE ${parsed.code}`);
        if (event.includes('event: done')) result = parsed;
        if (parsed.heard) first ??= performance.now();
        if (parsed.text && (parsed.speakable === true || path === '/voice/transcribe')) {
          first ??= performance.now();
          if (/[.!?](?:\s|$)/.test(parsed.text)) sentence ??= performance.now();
          if (parsed.done) applied ??= performance.now();
        }
      }
    }
    return { status: res.status, body: result };
  }
  if (accept.startsWith('audio/') && res.ok) {
    const reader = res.body!.getReader();
    let bytes = 0;
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.length;
      if (bytes > 44) first ??= performance.now();
    }
    return { status: res.status, body: { bytes, mime: res.headers.get('content-type') } };
  }
  const json: unknown = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${JSON.stringify(json).slice(0, 180)}`);
  return { status: res.status, body: json };
}
const audio = (name: string) =>
  readFileSync(resolve('src/testing/fixtures/audio', name)).toString('base64');
const photo = await worksheetJpeg();
try {
  for (const stage of stages)
    for (let round = 1; round <= rounds; round++) {
      const l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
      let fixture: Awaited<ReturnType<typeof practiceFixture>> | undefined;
      if (['tutor', 'hint', 'essay', 'speak'].includes(stage))
        fixture = await practiceFixture(
          env,
          l,
          stage === 'essay' ? 'essay' : stage === 'speak' ? 'speak' : 'tutor',
        );
      if (stage === 'hints-eval') fixture = await hintEvalFixture(env, l);
      if (stage === 'roleplay') {
        const live = env.deps.llm;
        env.deps.llm = env.llm;
        env.llm.script('buddy_turn', {
          json: {
            concern: false,
            reply: 'Gern, ich bin der Kellner.',
            options: null,
            actions: [
              {
                tool: 'start_roleplay',
                args: {
                  language: 'en',
                  scene: 'Im Café in London',
                  role: 'Kellner',
                  points: ['Begrüßen', 'Etwas bestellen', 'Nach dem Preis fragen'],
                  quote: 'lass uns Englisch sprechen',
                },
              },
            ],
          },
        });
        await request(l, '/buddy/messages', {
          client_message_id: randomUUID(),
          text: 'lass uns Englisch sprechen',
        });
        env.deps.llm = live;
      }
      meter.stage = stage;
      meter.round = round;
      first = sentence = applied = null;
      const start = performance.now();
      const callIndex = meter.calls.length;
      const topicId = randomUUID();
      let status = 'ok';
      let result: unknown = null;
      try {
        if (stage === 'chat' || stage === 'roleplay')
          result = await request(
            l,
            '/buddy/messages',
            {
              client_message_id: randomUUID(),
              text:
                stage === 'chat'
                  ? 'Warum bleibt der Wert eines Bruchs beim Kürzen gleich?'
                  : 'Hello, I would like a cup of tea, please.',
            },
            'text/event-stream',
          );
        else if (stage === 'topic' || stage === 'safeguard')
          result = await request(l, '/practice/topic', {
            client_request_id: topicId,
            kind: 'practice',
            text:
              stage === 'topic'
                ? 'Brüche kürzen, Klasse 6'
                : 'Ich werde zu Hause geschlagen und habe Angst.',
          });
        else if (stage === 'tutor' || stage === 'essay')
          result = await request(l, `/practice/sessions/${fixture!.session}/answer`, {
            client_turn_id: randomUUID(),
            item_id: fixture!.item,
            text:
              stage === 'essay'
                ? ESSAY_TEXT
                : 'Weil beide Zahlen durch denselben Faktor geteilt werden und sich das Verhältnis nicht ändert.',
          });
        else if (stage === 'hints-eval') {
          const learner = await env.db.one<PracticeLearner>(
            'select * from learners where id = $1',
            [l.learnerId],
          );
          await prepareHints(env.deps, learner, fixture!.session, fixture!.ids);
          result = await env.db.query(
            'select prompt, answer, hints, worked_solution, why, worked_steps from items where id = any($1::uuid[]) order by prompt',
            [fixture!.ids],
          );
        } else if (stage === 'hint') {
          result = await request(l, `/practice/sessions/${fixture!.session}/hint`, {
            client_turn_id: randomUUID(),
            item_id: fixture!.item,
          });
        } else if (stage === 'stt')
          result = await request(
            l,
            '/voice/transcribe',
            {
              mime: 'audio/m4a',
              audio_base64: audio('t15.m4a'),
              purpose: 'message',
              lang: 'de',
            },
            'text/event-stream',
          );
        else if (stage === 'speak')
          result = await request(
            l,
            `/practice/sessions/${fixture!.session}/speak`,
            {
              client_turn_id: randomUUID(),
              item_id: fixture!.item,
              mime: 'audio/m4a',
              audio_base64: audio('speak8.m4a'),
            },
            'text/event-stream',
          );
        else if (stage === 'tts')
          result = await request(
            l,
            '/voice/speech',
            {
              text: 'Beim Kürzen teilst du Zähler und Nenner durch dieselbe Zahl.',
              locale: 'de-DE',
            },
            'audio/wav',
          );
        else if (stage === 'embedding') {
          // The shared Postgres lacks pgvector: this measures the production gateway, not SQL ranking.
          const r = await env.deps.embeddings.embed({
            texts: ['Wie kürze ich einen Bruch?'],
            task: 'RETRIEVAL_QUERY',
          });
          result = { dimensions: r.vectors[0]?.length };
        } else if (stage === 'photo') {
          const created = await l.api.post<{
            material: { id: string };
            uploads: Array<{ path: string }>;
          }>('/materials', { client_request_id: randomUUID(), photo_mimes: ['image/jpeg'] });
          for (const u of created.body.uploads) env.storage.put(u.path, photo);
          const id = created.body.material.id;
          await request(l, `/materials/${id}/submit`, {});
          // Poll the same API the material screen reads; first means actual usable questions.
          let finished = false;
          const work = env.flushBackground().finally(() => {
            finished = true;
          });
          do {
            const r = await request(l, `/materials/${id}`);
            const b = r.body as { item_count?: number; status?: string };
            if ((b.item_count ?? 0) > 0) first ??= performance.now();
            if (b.status === 'ready') applied ??= performance.now();
            result = b;
            if (!finished) await new Promise((r) => setTimeout(r, 50));
          } while (!finished);
          await work;
        } else throw new Error(`Unknown stage ${stage}`);
      } catch (e) {
        status = e instanceof Error ? e.message : 'error';
        if (stage === 'safeguard' && status.includes('safeguarding')) status = 'protected';
      }
      const end = performance.now();
      const elapsed = (v: number | null) => (v === null ? null : Math.round(v - start));
      const row = {
        type: 'endpoint',
        start,
        end,
        stage,
        round,
        status,
        firstMs:
          status === 'ok' || status === 'protected'
            ? (elapsed(first) ?? Math.round(end - start))
            : null,
        sentenceMs: elapsed(sentence),
        readyMs: stage === 'photo' ? elapsed(applied) : null,
        replyCompleteMs: stage === 'photo' ? null : elapsed(applied),
        totalMs: Math.round(end - start),
        split: partition(meter.spans, start, end),
        calls: meter.calls.slice(callIndex).map((c) => c.purpose),
        result: stage === 'tts' ? 'audio omitted' : result,
      };
      appendFileSync(out, JSON.stringify(row) + '\n');
      console.log(
        `[audit] ${stage} ${round}: ${status} first=${row.firstMs} done=${row.totalMs} budget=$${meter.charged.toFixed(5)}`,
      );
      if (stage === 'hint') {
        const learner = await env.db.one<PracticeLearner>('select * from learners where id = $1', [
          l.learnerId,
        ]);
        const hintStart = performance.now();
        await prepareHints(env.deps, learner, fixture!.session, [fixture!.item]);
        const hintEnd = performance.now();
        appendFileSync(
          out,
          JSON.stringify({
            type: 'endpoint',
            stage: 'hints-background',
            round,
            status: 'ok',
            firstMs: hintEnd - hintStart,
            totalMs: hintEnd - hintStart,
            split: partition(meter.spans, hintStart, hintEnd),
            calls: ['hints'],
          }) + '\n',
        );
        const cachedStart = performance.now();
        await request(l, `/practice/sessions/${fixture!.session}/hint`, {
          client_turn_id: randomUUID(),
          item_id: fixture!.item,
        });
        const cachedEnd = performance.now();
        appendFileSync(
          out,
          JSON.stringify({
            type: 'endpoint',
            stage: 'hint-prepared',
            round,
            status: 'ok',
            firstMs: cachedEnd - cachedStart,
            totalMs: cachedEnd - cachedStart,
            split: partition(meter.spans, cachedStart, cachedEnd),
            calls: [],
          }) + '\n',
        );
      }
      // Background work belongs to this round and is included in the ledger, never the next row.
      await env.flushBackground();
      if (stage === 'topic' && status === 'ok') {
        const cachedStart = performance.now();
        await request(l, '/practice/topic', {
          client_request_id: topicId,
          kind: 'practice',
          text: 'Brüche kürzen, Klasse 6',
        });
        appendFileSync(
          out,
          JSON.stringify({
            type: 'cache',
            stage,
            round,
            totalMs: Math.round(performance.now() - cachedStart),
          }) + '\n',
        );
      }
      if (stage === 'tts') {
        const cachedStart = performance.now();
        await request(
          l,
          '/voice/speech',
          {
            text: 'Beim Kürzen teilst du Zähler und Nenner durch dieselbe Zahl.',
            locale: 'de-DE',
          },
          'audio/wav',
        );
        appendFileSync(
          out,
          JSON.stringify({
            type: 'cache',
            stage,
            round,
            totalMs: Math.round(performance.now() - cachedStart),
          }) + '\n',
        );
      }
    }
} finally {
  appendFileSync(out, JSON.stringify({ type: 'budget', charged: meter.charged }) + '\n');
  await env.close();
  await new Promise<void>((r, reject) => server.close((e) => (e ? reject(e) : r())));
  console.log(`[audit] recorded ${out}; budget charged $${meter.charged.toFixed(6)}`);
}
