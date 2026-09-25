// Live check of speech to text (Vertex) with espeak-ng recordings: German chat
// message, spoken numbers and fractions in answer mode, a French answer.
// Needs LLM_BACKEND=vertex, GOOGLE_* variables, a local Postgres and espeak-ng.
//   cd apps/api && npx tsx evals/voice/run.ts

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { TranscribeResponse } from '@learnbuddy/shared-types/contracts';

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
const dir = mkdtempSync(join(tmpdir(), 'lb-voice-'));
const env = await createTestEnv({
  start: '2026-09-28T14:00:00Z',
  gateway: new VertexGateway(config),
});
const l = await onboard(env, {
  relation: 'child',
  name: 'Lena',
  birthDate: '2014-02-10',
  pin: '4826',
});

const cases: Array<{
  voice: string;
  say: string;
  purpose: 'message' | 'answer';
  lang: string | null;
  expect: RegExp;
  context?: string;
}> = [
  {
    voice: 'de',
    say: 'Kannst du mir den Dativ erklären? Ich verstehe das nicht.',
    purpose: 'message',
    lang: null,
    expect: /dativ.*erklären/i,
  },
  {
    voice: 'de',
    say: 'Das sind achtundzwanzig Quadratzentimeter.',
    purpose: 'answer',
    lang: null,
    expect: /28\s*(cm²|cm2|Quadratzentimeter)/,
  },
  {
    voice: 'de',
    say: 'drei Viertel',
    purpose: 'answer',
    lang: null,
    expect: /^3\/4\.?$/,
    context: 'Kürze $\\frac{6}{8}$.',
  },
  { voice: 'de', say: 'null Komma fünf', purpose: 'answer', lang: null, expect: /^0,5\.?$/ },
  {
    voice: 'fr',
    say: 'la chambre',
    purpose: 'answer',
    lang: 'fr',
    expect: /^la chambre\.?$/i,
    context: 'das Zimmer',
  },
  {
    voice: 'en',
    say: 'I went to the cinema yesterday.',
    purpose: 'answer',
    lang: 'en',
    expect: /went to the cinema yesterday/i,
  },
];
let failed = 0;
for (const [i, c] of cases.entries()) {
  const file = join(dir, `${i}.wav`);
  execFileSync('espeak-ng', ['-v', c.voice, '-s', '150', '-w', file, c.say]);
  const res = await l.api.post<TranscribeResponse>('/voice/transcribe', {
    mime: 'audio/wav',
    audio_base64: readFileSync(file).toString('base64'),
    purpose: c.purpose,
    lang: c.lang,
    context: c.context ?? null,
  });
  const ok = res.status === 200 && c.expect.test(res.body.text);
  if (!ok) failed++;
  console.log(
    `${ok ? '✓' : '✗'} [${c.purpose}/${c.voice}] "${c.say}" → ${res.status} "${res.body.text}"`,
  );
}
await env.close();
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
