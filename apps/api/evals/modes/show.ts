// Live walk through the learning modes (Vertex) for a person to read: explain,
// practice on a topic, typed vocabulary, speaking sentences, homework help (typed
// and photographed), a worksheet photo. Prints what the model produced.
// Needs LLM_BACKEND=vertex, GOOGLE_* variables and a local Postgres.
//   cd apps/api && npx tsx evals/modes/show.ts [explain|practice|vocab|speak|help|photo]
// (the photo steps use test-results/web/worksheet.jpg from scripts/web-walkthrough.sh)
import { readFileSync } from 'node:fs';
import type { AnswerResponse, MaterialView, SessionView } from '@learnbuddy/shared-types/contracts';
import { loadConfig } from '../../src/config.js';
import { VertexGateway } from '../../src/llm/vertex.js';
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
const gateway = {
  available: true,
  generate: async (req: LlmRequest) => {
    try {
      const r = await real.generate(req);
      console.log(
        `  [${req.purpose}] ${r.usage.latencyMs}ms $${(r.usage.costMicros / 1e6).toFixed(4)}`,
      );
      return r;
    } catch (e) {
      console.log(`  [${req.purpose}] ERROR ${(e as Error).message.slice(0, 400)}`);
      throw e;
    }
  },
} as LlmGateway;
const env = await createTestEnv({ start: '2026-09-28T14:00:00Z', gateway });
const l = await onboard(env, {
  relation: 'child',
  name: 'Lena',
  birthDate: '2014-02-10',
  pin: '4826',
});
await env.db.query(`update learners set level = 'school', grade = 6 where id = $1`, [l.learnerId]);
const only = process.argv.slice(2);
const want = (k: string) => only.length === 0 || only.includes(k);
const show = (s: SessionView) => {
  console.log(`  == ${s.mode} "${s.title}" reveal=${s.reveal_allowed}`);
  if (s.intro) console.log(`  intro: ${s.intro}`);
  for (const i of s.items)
    console.log(
      `   - [${i.item.kind}${i.item.prompt_lang ? ` ${i.item.prompt_lang}→${i.item.lang}` : i.item.lang ? ` ${i.item.lang}` : ''}] ${i.item.prompt}${i.item.choices ? ` {${i.item.choices.join(' | ')}}` : ''}${i.item.figure ? ` FIGURE ${JSON.stringify(i.item.figure)}` : ''}`,
    );
};
const topic = async (kind: string, text: string) => {
  const r = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: crypto.randomUUID(),
    kind,
    text,
  });
  if (r.status !== 201) {
    console.log('  topic failed', r.status, JSON.stringify(r.body));
    return null;
  }
  show(r.body);
  return r.body;
};
const say = async (s: SessionView, itemId: string, text: string) => {
  const r = await l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
    client_turn_id: crypto.randomUUID(),
    item_id: itemId,
    text,
  });
  console.log(
    `   > ${text}\n   < [${r.body.verdict}] ${r.body.reply?.text ?? JSON.stringify(r.body)}`,
  );
  return r.body;
};
if (want('explain')) {
  console.log('\n# Erklär mir den Dativ');
  const s = await topic('explain', 'Erklär mir den Dativ, ich versteh das nicht');
  if (s) await say(s, s.items[0]!.item.id, 'weiß nicht');
}
if (want('practice')) {
  console.log('\n# Brüche addieren üben');
  await topic('practice', 'Brüche addieren und kürzen, 6. Klasse');
  console.log('\n# Lineare Funktionen');
  await topic('practice', 'Geraden zeichnen, Steigung ablesen');
  console.log('\n# Geschichte');
  await topic('practice', 'Römisches Reich: Augustus und die Republik');
}
if (want('vocab')) {
  console.log('\n# Vokabeln');
  const s = await topic(
    'vocab',
    "Unité 3\nla chambre - das Zimmer\nle lit – das Bett\nl'armoire (f) = der Schrank\nà côté de neben",
  );
  if (s) {
    await say(s, s.items[0]!.item.id, 'die Zimmer');
    const back = s.items.find((i) => i.item.prompt_lang === 'de')!;
    await say(s, back.item.id, 'la chambre');
  }
}
if (want('speak')) {
  console.log('\n# Aussprache');
  await topic('speak', 'Unité 1: sich vorstellen auf Französisch');
}
if (want('help')) {
  console.log('\n# Hausaufgabe getippt');
  const s = await topic(
    'help',
    'Ein Rechteck ist 7 cm lang und 4 cm breit. Berechne den Flächeninhalt.',
  );
  if (s) {
    const id = s.items[0]!.item.id;
    for (const t of [
      'keine ahnung',
      'sag mir einfach die lösung bitte',
      'ist es 11?',
      'ah mal, also 28 cm²',
    ])
      await say(s, id, t);
  }
  console.log('\n# Hausaufgabe Foto');
  const created = await l.api.post<{ material: { id: string }; uploads: Array<{ path: string }> }>(
    '/materials',
    { client_request_id: crypto.randomUUID(), photo_mimes: ['image/jpeg'], purpose: 'homework' },
  );
  env.storage.put(
    created.body.uploads[0]!.path,
    new Uint8Array(
      readFileSync(new URL('../../../../test-results/web/worksheet.jpg', import.meta.url)),
    ),
  );
  await l.api.post(`/materials/${created.body.material.id}/submit`);
  await env.flushBackground();
  const m = (await l.api.get<MaterialView>(`/materials/${created.body.material.id}`)).body;
  console.log('  material', m.status, m.failure_reason, m.session_id);
  if (m.session_id) {
    const hs = (await l.api.get<SessionView>(`/practice/sessions/${m.session_id}`)).body;
    show(hs);
    await say(hs, hs.items[0]!.item.id, 'hilfe');
  }
}
if (want('photo')) {
  console.log('\n# Lernblatt Foto (Mathe-Schreibweise, Figuren)');
  const created = await l.api.post<{ material: { id: string }; uploads: Array<{ path: string }> }>(
    '/materials',
    { client_request_id: crypto.randomUUID(), photo_mimes: ['image/jpeg'] },
  );
  env.storage.put(
    created.body.uploads[0]!.path,
    new Uint8Array(
      readFileSync(new URL('../../../../test-results/web/worksheet.jpg', import.meta.url)),
    ),
  );
  await l.api.post(`/materials/${created.body.material.id}/submit`);
  await env.flushBackground();
  const items = await env.db.query<{
    kind: string;
    prompt: string;
    answer: string;
    figure: unknown;
  }>(`select kind, prompt, answer, figure from items where material_id = $1`, [
    created.body.material.id,
  ]);
  for (const it of items)
    console.log(
      `   - [${it.kind}] ${it.prompt} => ${it.answer}${it.figure ? ` FIGURE ${JSON.stringify(it.figure)}` : ''}`,
    );
}
await env.close();
