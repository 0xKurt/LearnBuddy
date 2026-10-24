/// <reference lib="dom" />
// requires live verification in Claude Code session
// Real gateway/API/test database → shared PCM queue → Web Audio render. Never production DB.
import { appendFileSync, readFileSync } from 'node:fs';
import { once } from 'node:events';
import { serve } from '@hono/node-server';
import { chromium, type Browser } from '@playwright/test';
import ts from 'typescript';
import { createTestEnv, onboard } from '../../src/testing/harness.js';
import { OpenAISpeech } from '../../src/speech/openai.js';
import { speechVoices } from '../../src/speech/openai-config.js';
import { openAIClient } from '../../src/llm/openai-client.js';

if (process.env.LB_LIVE_TTS_BENCH !== '1' || process.env.LB_TEST_LOCK_HELD !== '1')
  throw new Error('Explicit live opt-in and lock required');
const ledger = `${process.env.HOME}/.local/share/learnbuddy-agents/BUDGET-LEDGER.md`;
appendFileSync(
  ledger,
  '\n2026-10-24 | cx-ttsr | #926 | reserved 10 syntheses | <=0.15 | authenticated PCM render, desktop and POCO Chrome\n',
);
const env = await createTestEnv();
const speech = new OpenAISpeech(
  openAIClient({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_BASE_URL: 'https://eu.api.openai.com/v1',
  }),
  speechVoices('gpt-realtime-1.5', {}),
  'gpt-realtime-1.5',
);
env.deps.speech = speech;
const module = ts.transpileModule(
  readFileSync(new URL('../../../mobile/lib/speech/pcmQueue.ts', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } },
).outputText;
let nativeToken = '';
let nativeDone: () => void = () => {};
const server = serve({
  port: process.env.TTS_DEVICE === 'native' ? 8137 : 0,
  hostname: '127.0.0.1',
  fetch: (request) => {
    const path = new URL(request.url).pathname;
    if (path === '/native-settings') return Response.json({ token: nativeToken });
    if (path === '/native-result')
      return request.json().then((result) => {
        console.info(JSON.stringify(result));
        nativeDone();
        return new Response('ok');
      });
    if (path === '/bench')
      return new Response(
        '<!doctype html><title>Speech render timing</title><button>Start synthetic speech benchmark</button>',
        { headers: { 'content-type': 'text/html' } },
      );
    if (path === '/pcmQueue.js')
      return new Response(module, { headers: { 'content-type': 'text/javascript' } });
    return env.app.fetch(request);
  },
});
if (!server.listening) await once(server, 'listening');
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Missing port');
let browser: Browser | undefined;
let phone: Browser | undefined;

try {
  for (const device of process.env.TTS_DEVICE
    ? [process.env.TTS_DEVICE]
    : ['desktop', 'POCO-Chrome']) {
    const learner = await onboard(env);
    if (device === 'native') {
      nativeToken = learner.token;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Native benchmark timeout')), 180_000);
        nativeDone = () => {
          clearTimeout(timeout);
          resolve();
        };
      });
      continue;
    }
    if (device === 'desktop')
      browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
    else {
      // Device attachment belongs to the operator: check adb reverse --list first,
      // then reverse the printed port and forward 9236 to chrome_devtools_remote.
      console.info(`Attach the idle phone to local port ${address.port}; CDP port 9236`);
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          phone = await chromium.connectOverCDP('http://127.0.0.1:9236');
          break;
        } catch (error) {
          if (attempt === 9) throw error;
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }
    const context = device === 'desktop' ? await browser!.newContext() : phone!.contexts()[0]!;
    const page =
      device === 'desktop'
        ? await context.newPage()
        : (context.pages().find((p) => p.url().includes(`:${address.port}/bench`)) ??
          (await context.newPage()));
    await page.addInitScript('globalThis.__name = (fn) => fn');
    await page.goto(`http://127.0.0.1:${address.port}/bench`);
    await page.getByRole('button').click();
    const result = await page.evaluate(
      async ({ token }) => {
        const { PcmQueue } = await import(/* @vite-ignore */ String('/pcmQueue.js'));
        const ctx = new AudioContext();
        await ctx.resume();
        const prepStart = performance.now();
        const prepared = await fetch('/v1/voice/speech/prepare', {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ locale: 'de-DE' }),
        });
        if (!prepared.ok) throw new Error(`prepare ${prepared.status}`);
        const prewarmMs = Math.round(performance.now() - prepStart);
        const rows = [];
        for (const text of [
          'Wir schauen uns die Aufgabe gemeinsam an.',
          'Teile den Kreis in vier gleich große Stücke.',
          'Was hast du bei diesem Versuch beobachtet?',
          'Lies den ersten Absatz bitte noch einmal.',
          'Erkläre deinen nächsten Schritt in eigenen Worten.',
        ]) {
          const start = performance.now();
          let firstByteMs: number | null = null,
            firstRenderedMs: number | null = null;
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          const mute = ctx.createGain();
          mute.gain.value = 0;
          analyser.connect(mute).connect(ctx.destination);
          const samples = new Float32Array(analyser.fftSize);
          const poll = setInterval(() => {
            analyser.getFloatTimeDomainData(samples);
            if (samples.some((s) => Math.abs(s) > 0.005))
              firstRenderedMs ??= Math.round(performance.now() - start);
          }, 5);
          let finish!: () => void;
          const done = new Promise<void>((resolve) => {
            finish = resolve;
          });
          const queue = new PcmQueue(
            {
              now: () => ctx.currentTime,
              schedule(samples: Float32Array, at: number, ended: () => void) {
                const buffer = ctx.createBuffer(1, samples.length, 24000);
                buffer.copyToChannel(new Float32Array(samples), 0);
                const node = ctx.createBufferSource();
                node.buffer = buffer;
                node.connect(analyser);
                node.onended = () => {
                  node.disconnect();
                  ended();
                };
                node.start(at);
                return () => {
                  node.stop();
                  node.disconnect();
                };
              },
            },
            { start() {}, progress() {}, end: finish },
          );
          queue.start();
          const response = await fetch('/v1/voice/speech', {
            method: 'POST',
            headers: {
              authorization: `Bearer ${token}`,
              accept: 'audio/pcm',
              'content-type': 'application/json',
            },
            body: JSON.stringify({ text, locale: 'de-DE' }),
          });
          if (
            !response.ok ||
            !response.body ||
            !response.headers.get('content-type')?.startsWith('audio/pcm')
          )
            throw new Error(`speech ${response.status}`);
          const reader = response.body.getReader();
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            firstByteMs ??= Math.round(performance.now() - start);
            queue.push(part.value);
          }
          const fullAudioMs = Math.round(performance.now() - start);
          queue.finish();
          await done;
          clearInterval(poll);
          analyser.disconnect();
          mute.disconnect();
          rows.push({ text, firstByteMs, firstRenderedMs, fullAudioMs });
        }
        await ctx.close();
        return { prewarmMs, rows };
      },
      { token: learner.token },
    );
    console.info(JSON.stringify({ device, ...result }));
    await page.close();
  }
} finally {
  await browser?.close();
  // CDP close disconnects this client; leave the owner's Chrome running.
  await phone?.close();
  speech.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const costs = await env.db.one<{ calls: number; cost: number }>(
    'select count(*)::int as calls, coalesce(sum(cost_micros),0)::int as cost from speech_calls',
  );
  console.info(JSON.stringify({ receipts: costs }));
  appendFileSync(
    ledger,
    `2026-10-24 | cx-ttsr | #926 | ${costs.calls} | ${costs.cost / 1e6} | authenticated PCM render batch ended\n`,
  );
  await env.close();
}
