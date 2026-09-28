// Speed audit (issue #7): wall-clock stage timings of the real model paths,
// measured through the real app (in-process, testing harness) against the real
// Vertex EU models from apps/api/.env.local. The test database is throwaway;
// nothing touches hosted services except the model/TTS calls themselves.
//
//   pnpm --filter @learnbuddy/api exec tsx scripts/speed-audit.ts
//
// Output: a Markdown table on stdout (paste into docs/speed-audit.md) with
// wall-clock per endpoint and the model-side latency/tokens from llm_calls,
// so overhead (auth, db, JSON) = wall − model is visible per path.
// requires live verification in Claude Code session (real model calls; fixtures from src/testing/fixtures/audio)

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import {
  VOICE_NAMES,
  type AnswerResponse,
  type SendMessageResponse,
  type SessionView,
} from '@learnbuddy/shared-types/contracts';

import { loadConfig } from '../src/config.js';
import { VertexGateway } from '../src/llm/vertex.js';
import { GoogleSpeech } from '../src/speech/google.js';
import { createTestEnv, apiClient, onboard } from '../src/testing/harness.js';

const dotenv = await import('dotenv');
dotenv.config({ path: '.env.local' });

const FIXTURES = join(import.meta.dirname, '../src/testing/fixtures/audio');
const clip = (name: string) => readFileSync(join(FIXTURES, name)).toString('base64');

type Row = {
  path: string;
  runs: number[];
};
const rows: Row[] = [];
const note = (path: string, runs: number[]) => rows.push({ path, runs });

const p = (ms: number) => `${(ms / 1000).toFixed(2)}s`;
const stats = (runs: number[]) => {
  const s = [...runs].sort((a, b) => a - b);
  return { min: s[0] ?? 0, med: s[Math.floor(s.length / 2)] ?? 0, max: s[s.length - 1] ?? 0 };
};

async function main(): Promise<void> {
  const cfg = loadConfig({
    ...process.env,
    NODE_ENV: 'development',
    DATABASE_URL: 'postgres://unused/unused',
    SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'speed-audit-not-used',
    TICK_SECRET: 'speed-audit-tick-0123456789abcdef',
    ADMIN_TOKEN_SECRET: 'speed-audit-admin-0123456789abcdef01',
    LLM_BACKEND: 'vertex',
  });
  const gateway = new VertexGateway(cfg);
  const env = await createTestEnv({ gateway });
  try {
    const learner = await onboard(env, { name: 'Speedy', birthDate: '1990-06-15' });
    const api = apiClient(env, learner.token);

    // ── Buddy chat turn: JSON total ×2 and SSE time-to-first-event ×2 ──
    const chatTotals: number[] = [];
    for (const text of ['Hallo Buddy, wie geht es dir heute?', 'Was machen wir als Nächstes?']) {
      const t0 = performance.now();
      const res = await api.post<SendMessageResponse>('/buddy/messages', {
        client_message_id: randomUUID(),
        text,
      });
      if (res.status !== 200) throw new Error(`chat ${res.status}: ${JSON.stringify(res.body)}`);
      chatTotals.push(performance.now() - t0);
    }
    note('Buddy-Turn gesamt (JSON)', chatTotals);

    const ttfb: number[] = [];
    for (const text of ['Erzähl mir kurz, was du kannst.', 'Und was üben wir morgen?']) {
      const t0 = performance.now();
      const res = await env.app.request('/v1/buddy/messages', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${learner.token}`,
          'content-type': 'application/json',
          accept: 'text/event-stream',
        },
        body: JSON.stringify({ client_message_id: randomUUID(), text }),
      });
      const reader = res.body?.getReader();
      if (!reader) throw new Error('no SSE body');
      await reader.read();
      ttfb.push(performance.now() - t0);
      await reader.cancel();
    }
    note('Buddy-Turn erstes SSE-Event', ttfb);

    // ── Transcribe: 10 s ×3, 66 s ×2, 206 s ×1 ──
    for (const [file, runsWanted] of [
      ['t15.m4a', 3],
      ['t60.m4a', 2],
      ['t180.m4a', 1],
    ] as const) {
      const audio = clip(file);
      const runs: number[] = [];
      for (let i = 0; i < runsWanted; i++) {
        const t0 = performance.now();
        const res = await api.post('/voice/transcribe', {
          mime: 'audio/m4a',
          audio_base64: audio,
          purpose: 'message',
          lang: null,
        });
        if (res.status !== 200)
          throw new Error(`transcribe ${file} ${res.status}: ${JSON.stringify(res.body)}`);
        runs.push(performance.now() - t0);
      }
      note(`Transkription ${file} (${Math.round((audio.length * 0.75) / 1024)} KB)`, runs);
    }

    // ── Speak: topic session (real generation), then judging ×2 ──
    const topic = await api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'speak',
      text: 'Hello, nice to meet you. My name is Anna and I am very happy to be here today.',
    });
    if (topic.status !== 200 && topic.status !== 201)
      throw new Error(`topic ${topic.status}: ${JSON.stringify(topic.body)}`);
    const speakIds = topic.body.items.filter((i) => i.item.kind === 'speak').map((i) => i.item.id);
    if (speakIds.length === 0) throw new Error('no speak item in generated session');
    const speakAudio = clip('speak8.m4a');
    const judge: number[] = [];
    // One attempt per item: a judged question closes (409 on retry by design).
    for (const itemId of speakIds.slice(0, 2)) {
      const t0 = performance.now();
      const res = await api.post<AnswerResponse>(`/practice/sessions/${topic.body.id}/speak`, {
        client_turn_id: randomUUID(),
        item_id: itemId,
        mime: 'audio/m4a',
        audio_base64: speakAudio,
      });
      if (res.status !== 200) throw new Error(`speak ${res.status}: ${JSON.stringify(res.body)}`);
      judge.push(performance.now() - t0);
    }
    note('Aussprache-Urteil (5-s-Clip)', judge);

    // ── TTS: one short sentence ×3 (only when configured) ──
    if (process.env.SPEECH_BACKEND === 'google') {
      const speech = new GoogleSpeech(cfg);
      const tts: number[] = [];
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        await speech.synthesize({
          text: 'Super gemacht, das üben wir gleich noch einmal.',
          locale: 'de-DE',
          voice: VOICE_NAMES[0],
          rate: 1,
          timeoutMs: 15_000,
        });
        tts.push(performance.now() - t0);
      }
      note('TTS ein Satz (Chirp 3 HD)', tts);
    } else {
      console.info('[speed-audit] SPEECH_BACKEND not "google" — TTS skipped');
    }

    // ── Model-side view: latency/tokens per purpose from llm_calls ──
    const calls = await env.db.query<{
      purpose: string;
      n: string;
      lat_med: number;
      lat_max: number;
      in_med: number;
      out_med: number;
    }>(
      `select purpose, count(*) as n,
              percentile_cont(0.5) within group (order by latency_ms) as lat_med,
              max(latency_ms) as lat_max,
              percentile_cont(0.5) within group (order by input_tokens) as in_med,
              percentile_cont(0.5) within group (order by output_tokens) as out_med
         from llm_calls group by purpose order by purpose`,
    );

    console.log('\n## Endpoint wall-clock\n');
    console.log('| Pfad | Läufe | min | median | max |');
    console.log('|---|---|---|---|---|');
    for (const r of rows) {
      const s = stats(r.runs);
      console.log(`| ${r.path} | ${r.runs.length} | ${p(s.min)} | ${p(s.med)} | ${p(s.max)} |`);
    }
    console.log('\n## Modellseite (llm_calls)\n');
    console.log('| Purpose | Calls | Latenz median | Latenz max | In-Tokens | Out-Tokens |');
    console.log('|---|---|---|---|---|---|');
    for (const c of calls) {
      console.log(
        `| ${c.purpose} | ${c.n} | ${p(Number(c.lat_med))} | ${p(Number(c.lat_max))} | ${Math.round(Number(c.in_med))} | ${Math.round(Number(c.out_med))} |`,
      );
    }
  } finally {
    await env.close();
  }
}

void main().catch((err: unknown) => {
  console.error('[speed-audit] failed:', err);
  process.exit(1);
});
