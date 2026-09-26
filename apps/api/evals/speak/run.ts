// Live check of the pronunciation judgement (Vertex): does the model hear the
// difference between a French voice, a German accent and a wrong word?
// Needs LLM_BACKEND=vertex, GOOGLE_* variables, a local Postgres and espeak-ng.
//   cd apps/api && npx tsx evals/speak/run.ts
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { loadConfig } from '../../src/config.js';
import { VertexGateway } from '../../src/llm/vertex.js';
import { ScriptedGateway } from '../../src/testing/fakes.js';
import type { LlmGateway, LlmRequest } from '../../src/llm/gateway.js';
import { createTestEnv, onboard } from '../../src/testing/harness.js';

const config = loadConfig({
  ...process.env,
  DATABASE_URL: 'x',
  SUPABASE_URL: 'http://x.local',
  SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
  ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
});
const real = new VertexGateway(config);
const scripted = new ScriptedGateway();
// Recordings made with espeak-ng (apt install espeak-ng): the sentence read by a
// French voice, by a German voice (strong accent), and with a wrong word.
const S = mkdtempSync(join(tmpdir(), 'lb-speak-'));
const say = (voice: string, text: string, file: string) =>
  execFileSync('espeak-ng', ['-v', voice, '-s', '140', '-w', join(S, file), text]);
const gateway = {
  available: true,
  generate: async (req: LlmRequest) => {
    if (req.purpose === 'explain') return scripted.generate(req);
    const r = await real.generate(req);
    const u = r.usage;
    console.log(
      `  [${req.purpose} ${u.model}] ${u.latencyMs} ms · $${(u.costMicros / 1e6).toFixed(5)} · in ${u.inputTokens} out ${u.outputTokens} thought ${u.thoughtTokens}`,
    );
    return r;
  },
} as LlmGateway;
const env = await createTestEnv({ start: '2026-09-28T14:00:00Z', gateway });
const l = await onboard(env, {
  relation: 'child',
  name: 'Lena',
  birthDate: '2014-02-10',
  pin: '4826',
});
const target = "Je m'appelle Léna et j'habite à Berlin.";
say('fr', target, 'fr-good.wav');
say('de', target, 'fr-german.wav');
say('fr', "Je m'appelle Léna et je mange à Berlin.", 'fr-wrongword.wav');
for (const [file, label] of [
  ['fr-good.wav', 'korrekt (fr-Stimme)'],
  ['fr-german.wav', 'deutsche Aussprache'],
  ['fr-wrongword.wav', 'falsches Wort (mange statt habite)'],
] as const) {
  scripted.script('explain', {
    json: {
      usable: true,
      title: 'Aussprache',
      subject: null,
      intro: null,
      items: [
        {
          kind: 'speak',
          prompt: target,
          answer: target,
          accepted_answers: [],
          unit: null,
          choices: null,
          correct_choice: null,
          topic: 'Vorstellen',
          difficulty: 2,
          prompt_lang: null,
          lang: 'fr',
          figure: null,
          source_excerpt: null,
        },
      ],
    },
  });
  const s = (
    await l.api.post<SessionView>('/practice/topic', {
      client_request_id: crypto.randomUUID(),
      kind: 'speak',
      text: target,
    })
  ).body;
  const r = await l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/speak`, {
    client_turn_id: crypto.randomUUID(),
    item_id: s.items[0]!.item.id,
    mime: 'audio/wav',
    audio_base64: readFileSync(join(S, file)).toString('base64'),
  });
  const p = r.body.reply?.pronunciation;
  console.log(
    `\n# ${label}: ${r.status} verdict=${r.body.verdict} overall=${p?.overall}\n  heard: ${p?.heard}\n  words: ${p?.words.map((w) => (w.ok ? w.text : `[${w.text}: ${w.tip}]`)).join(' ')}\n  reply: ${r.body.reply?.text}`,
  );
}
await env.close();
