// requires live verification in Claude Code session
// Source the approved environment and hold scripts/test-lock.sh. Maximum reserved spend $0.04.
import { appendFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { GoogleAuth } from 'google-auth-library';
import { loadConfig } from '../../src/config.js';
import { openAIClient } from '../../src/llm/openai-client.js';
import { GoogleSpeech } from '../../src/speech/google.js';

const config = loadConfig({
  ...process.env,
  DATABASE_URL: 'postgres://unused/unused',
  ADMIN_TOKEN_SECRET: 'measurement-only-unused-unused-unused',
  LLM_BACKEND: 'disabled',
});
const auth = new GoogleAuth({
  ...(config.GOOGLE_APPLICATION_CREDENTIALS_JSON
    ? { credentials: JSON.parse(config.GOOGLE_APPLICATION_CREDENTIALS_JSON) }
    : {}),
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});
const google = new GoogleSpeech(config, auth);
const client = openAIClient(config);
const nativeFetch = globalThis.fetch;
const text = 'Wir schauen uns die Aufgabe gemeinsam an. Was hast du schon herausgefunden?';
let calls = 0,
  reserved = 0;
try {
  for (let round = 1; round <= 2; round++) {
    for (const model of ['chirp3', 'tts-1', 'gpt-4o-mini-tts']) {
      const reserve = model === 'chirp3' ? 0.003 : model === 'tts-1' ? 0.002 : 0.015;
      if (reserved + reserve > 0.041) throw new Error('Live budget exhausted');
      reserved += reserve;
      calls++;
      const started = performance.now();
      let headersMs: number | null = null,
        firstAudioMs: number | null = null,
        chunks = 0,
        prefix = '';
      globalThis.fetch = async (url, init) => {
        const response = await nativeFetch(url, init);
        if (!String(url).includes('texttospeech.googleapis.com')) return response;
        headersMs = Math.round(performance.now() - started);
        const decoder = new TextDecoder();
        const body = response.body?.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              chunks++;
              if (firstAudioMs === null) {
                prefix += decoder.decode(chunk, { stream: true });
                if (/"audioContent"\s*:\s*"[A-Za-z0-9+/]{4}/.test(prefix))
                  firstAudioMs = Math.round(performance.now() - started);
              }
              controller.enqueue(chunk);
            },
          }),
        );
        return new Response(body, { status: response.status, headers: response.headers });
      };
      try {
        let bytes = 0;
        if (model === 'chirp3') {
          bytes = (
            await google.synthesize({
              text,
              locale: 'de-DE',
              voice: 'warm',
              rate: 1,
              timeoutMs: 25000,
            })
          ).audio.length;
        } else {
          const response = await client.audio.speech.create(
            { model, voice: 'nova', input: text, response_format: 'mp3', speed: 1 },
            { signal: AbortSignal.timeout(25000), timeout: 25000 },
          );
          headersMs = Math.round(performance.now() - started);
          if (!response.headers.get('content-type')?.startsWith('audio/') || !response.body)
            throw new Error('No audio');
          const reader = response.body.getReader();
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            if (part.value.length) {
              firstAudioMs ??= Math.round(performance.now() - started);
              chunks++;
              bytes += part.value.length;
            }
          }
        }
        console.info(
          JSON.stringify({
            model,
            round,
            headersMs,
            firstAudioMs,
            totalMs: Math.round(performance.now() - started),
            chunks,
            bytes,
          }),
        );
      } catch (error) {
        console.info(
          JSON.stringify({ model, round, error: error instanceof Error ? error.name : 'unknown' }),
        );
        process.exitCode = 1;
      } finally {
        globalThis.fetch = nativeFetch;
      }
    }
  }
} finally {
  await appendFile(
    join(homedir(), '.local/share/learnbuddy-agents/BUDGET-LEDGER.md'),
    `\n${new Date().toISOString().slice(0, 10)} | cx-speech-fix | #893 / #897 | ${calls} | <=${reserved.toFixed(4)} | TTS streaming first audio byte, 2 paired rounds, de, synthetic text\n`,
  );
}
