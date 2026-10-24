/// <reference lib="dom" />
// requires live verification in Claude Code session
// Live provider → real API + isolated shared Postgres → browser MP3 decoder.
// Run under scripts/test-lock.sh, with LB_LIVE_TTS_BENCH=1 and EU API credentials.
// This is a transport benchmark, not an APK or whole-screen timing claim.
import { readFileSync, appendFileSync } from 'node:fs';
import { once } from 'node:events';
import { serve } from '@hono/node-server';
import { chromium } from '@playwright/test';
import ts from 'typescript';
import { createTestEnv, onboard } from '../../src/testing/harness.js';
import { OpenAISpeech } from '../../src/speech/openai.js';
import { openAIClient } from '../../src/llm/openai-client.js';

if (process.env.LB_LIVE_TTS_BENCH !== '1' || !process.env.LB_TEST_LOCK_HELD)
  throw new Error('Explicit live opt-in and the machine test lock are required');
if (!process.env.OPENAI_API_KEY) throw new Error('Missing speech credentials');
const env = await createTestEnv();
const learner = await onboard(env);
env.deps.speech = new OpenAISpeech(
  openAIClient({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_BASE_URL: 'https://eu.api.openai.com/v1',
  }),
);
const module = ts.transpileModule(
  readFileSync(new URL('../../../mobile/lib/speech/mediaStream.ts', import.meta.url), 'utf8'),
  {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  },
).outputText;
const server = serve({
  port: 0,
  hostname: '127.0.0.1',
  fetch: (request) => {
    const path = new URL(request.url).pathname;
    if (path === '/bench')
      return new Response('<!doctype html><title>Speech transport timing</title>', {
        headers: { 'content-type': 'text/html' },
      });
    if (path === '/mediaStream.js')
      return new Response(module, { headers: { 'content-type': 'text/javascript' } });
    return env.app.fetch(request);
  },
});
if (!server.listening) await once(server, 'listening');
const address = server.address();
if (!address || typeof address === 'string') throw new Error('No benchmark port');
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/bench`);
  for (const text of [
    'Wir schauen uns diesen Schritt gemeinsam an.',
    'Das probieren wir jetzt gemeinsam.',
    'Das probieren wir jetzt gemeinsam.',
  ]) {
    const result = await page.evaluate(
      async ({ token, text }) => {
        const { appendAudio } = await import(/* @vite-ignore */ String('/mediaStream.js'));
        const start = performance.now();
        const response = await fetch('/v1/voice/speech', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            accept: 'audio/mpeg',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ text, locale: 'de-DE' }),
        });
        if (!response.ok || !response.body) throw new Error(`speech HTTP ${response.status}`);
        const firstByteMs = performance.now() - start;
        const media = new MediaSource();
        const uri = URL.createObjectURL(media);
        const audio = new Audio(uri);
        const controller = new AbortController();
        const pumping = appendAudio(media, response.body, controller.signal);
        let firstSoundMs = 0;
        const heard = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('No playback')), 15000);
          audio.addEventListener(
            'playing',
            () => {
              firstSoundMs = performance.now() - start;
              clearTimeout(timeout);
              resolve();
            },
            { once: true },
          );
          audio.addEventListener(
            'error',
            () => {
              clearTimeout(timeout);
              reject(new Error('Playback error'));
            },
            { once: true },
          );
        });
        await audio.play();
        await heard;
        await pumping;
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        URL.revokeObjectURL(uri);
        return {
          serverFirstByteMs: Math.round(firstByteMs),
          browserPlayingMs: Math.round(firstSoundMs),
          finishedMs: Math.round(performance.now() - start),
        };
      },
      { token: learner.token, text },
    );
    console.log(JSON.stringify(result));
  }
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  const costs = await env.db.one<{ calls: number; cost: number }>(
    'select count(*)::int as calls, coalesce(sum(cost_micros),0)::int as cost from speech_calls where outcome = $1',
    ['ok'],
  );
  appendFileSync(
    `${process.env.HOME}/.local/share/learnbuddy-agents/BUDGET-LEDGER.md`,
    `2026-10-24 | tts-streaming | #921 | ${costs.calls} | ${costs.cost / 1_000_000} | browser speech transport benchmark\n`,
  );
  console.log(JSON.stringify({ providerCalls: costs.calls, usd: costs.cost / 1_000_000 }));
  await env.close();
}
