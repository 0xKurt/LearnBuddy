// The pronunciation judgement while the model is still listening (issue #8):
// `progress` events colour the words one by one, the `done` event carries the
// stored result. Nothing counts as judged before that (CLAUDE.md rule 5).
// requires live verification in Claude Code session (needs a running Postgres)

import type {
  AnswerResponse,
  SessionView,
  SpeakStreamEvent,
} from '@learnbuddy/shared-types/contracts';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();
const audio = Buffer.alloc(2000, 7).toString('base64');

type Streamed = {
  status: number;
  progress: SpeakStreamEvent[];
  done: AnswerResponse | null;
  error: { code: string } | null;
};

async function speak(
  env: TestEnv,
  l: Learner,
  sessionId: string,
  itemId: string,
  turnId = randomUUID(),
): Promise<Streamed> {
  const res = await env.app.request(`/v1/practice/sessions/${sessionId}/speak`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${l.token}`,
      'content-type': 'application/json',
      accept: 'text/event-stream',
    },
    body: JSON.stringify({
      client_turn_id: turnId,
      item_id: itemId,
      mime: 'audio/m4a',
      audio_base64: audio,
    }),
  });
  const out: Streamed = { status: res.status, progress: [], done: null, error: null };
  for (const block of (await res.text()).split('\n\n')) {
    const event = /^event: (.+)$/m.exec(block)?.[1];
    const data = /^data: (.+)$/m.exec(block)?.[1];
    if (!event || !data) continue;
    if (event === 'progress') out.progress.push(JSON.parse(data) as SpeakStreamEvent);
    if (event === 'done') out.done = JSON.parse(data) as AnswerResponse;
    if (event === 'error') out.error = JSON.parse(data) as { code: string };
  }
  return out;
}

/** The generation of a one-question speaking session (purpose 'explain', like the app's). */
function scriptGeneration(env: TestEnv, sentence: string): void {
  env.llm.script('explain', {
    json: {
      usable: true,
      title: 'Französisch sprechen',
      subject: { name: 'Französisch', kind: 'french' },
      items: [
        {
          kind: 'speak',
          prompt: sentence,
          answer: sentence,
          accepted_answers: [],
          unit: null,
          choices: null,
          correct_choice: null,
          topic: 'Vorstellen',
          difficulty: 2,
          prompt_lang: 'fr',
          lang: 'fr',
          figure: null,
          source_excerpt: null,
        },
      ],
    },
  });
}

const judgement = {
  audible: true,
  expected_ipa: 'ʒə maplɛ lena',
  heard_ipa: 'ʒə mapɛl lena',
  heard: "Je m'appelle Lena",
  overall: 'almost',
  words: [
    { text: 'Je', ok: true, tip: null },
    { text: "m'appelle", ok: false, tip: 'Das ‹ll› klingt wie ‹l›.' },
    { text: 'Lena', ok: true, tip: null },
  ],
  reply: 'Fast! Achte auf „m’appelle“.',
};

describe.skipIf(!dbReady)('streamed pronunciation judgement', () => {
  let env: TestEnv;
  let l: Learner;
  let sessionId: string;
  let itemId: string;

  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    scriptGeneration(env, "Je m'appelle Lena.");
    const s = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'speak',
      text: "Je m'appelle Lena.",
    });
    sessionId = s.body.id;
    itemId = s.body.items[0]!.item.id;
  });
  afterAll(async () => {
    await env?.close();
  });

  it('colours the words while it listens and ends with the stored judgement', async () => {
    env.llm.script('pronounce', { json: judgement });
    const s = await speak(env, l, sessionId, itemId);
    expect(s.status).toBe(200);
    expect(s.error).toBeNull();
    // Progress grows and never says more than the model has written.
    expect(s.progress.length).toBeGreaterThan(0);
    const counts = s.progress.map((p) => p.words.length);
    expect([...counts].sort((a, b) => a - b)).toEqual(counts);
    const last = s.progress[s.progress.length - 1]!;
    expect(last.heard).toBe("Je m'appelle Lena");
    expect(last.words.map((w) => w.text)).toEqual(['Je', "m'appelle", 'Lena']);
    // Only the result counts: verdict, feedback and the closed question come from `done`.
    expect(s.done?.verdict).toBe('partially_correct');
    expect(s.done?.reply.pronunciation).toEqual({
      heard: "Je m'appelle Lena",
      overall: 'almost',
      words: judgement.words.map((w) => ({ text: w.text, ok: w.ok, tip: w.ok ? null : w.tip })),
    });
    expect(env.llm.callsFor('pronounce')).toHaveLength(1);
  });

  it('says the reason as a code when the model cannot listen, and judges nothing', async () => {
    scriptGeneration(env, 'Bonjour.');
    const second = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'speak',
      text: 'Bonjour.',
    });
    const item = second.body.items[0]!.item.id;
    env.llm.script('pronounce', { json: { ...judgement, words: 'not an array' } });
    const s = await speak(env, l, second.body.id, item);
    expect(s.status).toBe(200);
    expect(s.done).toBeNull();
    expect(s.error).toEqual({ code: 'model_unavailable' });
    const turns = await env.db.query(
      `select 1 from practice_turns where session_id = $1 and item_id = $2`,
      [second.body.id, item],
    );
    expect(turns).toHaveLength(0);
  });
});
