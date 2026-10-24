// Narration for the promo video in Buddy's own voice: the app's speech gateway (Chirp 3: HD
// through the EU endpoint, apps/api/src/speech/google.ts) reads the lines of
// promo/narration.json, one MP3 per line. Runs in the promo workflow with the same
// service account as production (GOOGLE_APPLICATION_CREDENTIALS_JSON, GOOGLE_CLOUD_PROJECT).
//
//   pnpm --filter @learnbuddy/api exec tsx scripts/promo-narration.ts <narration.json> <out dir>
//
// Test tooling only; lives on the promo branch.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { VoiceName } from '@learnbuddy/shared-types/contracts';

import { loadConfig } from '../src/config.js';
import { GoogleSpeech } from '../src/speech/google.js';

type Line = { id: string; locale: string; text: string; voice?: VoiceName; rate?: number };

async function main(): Promise<void> {
  const [file, out] = process.argv.slice(2);
  if (!file || !out) throw new Error('usage: promo-narration.ts <narration.json> <out dir>');
  const lines = JSON.parse(readFileSync(file, 'utf8')) as Line[];
  mkdirSync(out, { recursive: true });
  const config = loadConfig({
    NODE_ENV: 'development',
    DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:5432/postgres',
    SUPABASE_URL: 'http://localhost:8787',
    SUPABASE_SERVICE_ROLE_KEY: 'promo-not-used',
    TICK_SECRET: 'promo-tick-secret-0123456789abcdef',
    ADMIN_TOKEN_SECRET: 'promo-admin-secret-0123456789abcdef0123',
    LLM_BACKEND: 'disabled',
    PUSH_BACKEND: 'disabled',
    SPEECH_BACKEND: 'google',
    GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
    GOOGLE_APPLICATION_CREDENTIALS_JSON: process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
  });
  const speech = new GoogleSpeech(config);
  const index: Array<{ id: string; file: string; chars: number }> = [];
  for (const line of lines) {
    const locale = speech.localeFor(line.locale);
    if (!locale) throw new Error(`${line.id}: Chirp 3 does not read ${line.locale}`);
    const audio = await speech.synthesize({
      text: line.text,
      locale,
      voice: line.voice ?? 'warm',
      rate: line.rate ?? 1,
      timeoutMs: 30_000,
    });
    const name = `${line.id}.mp3`;
    writeFileSync(join(out, name), audio.audio);
    index.push({ id: line.id, file: name, chars: line.text.length });
    console.info(`[promo-narration] ${line.id} (${locale}, ${line.text.length} chars)`);
  }
  writeFileSync(join(out, 'index.json'), JSON.stringify(index, null, 2));
  console.info(`[promo-narration] ${index.length} lines → ${out}`);
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
