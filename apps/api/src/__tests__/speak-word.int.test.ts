// One word of the sentence, said on its own (issue #83): she taps a word she got wrong and
// practises just that. What must hold: it is practice, not an attempt — nothing is stored,
// the question keeps its attempts and its state; and only a word of *this* sentence.
// requires live verification in Claude Code session (needs a running Postgres; scripted model)

import type { SessionView, SpeakWordResponse } from '@learnbuddy/shared-types/contracts';
import { randomUUID as uuid } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();
const audio = Buffer.alloc(2000, 7).toString('base64');

function scriptSentence(env: TestEnv, sentence: string): void {
  env.llm.script('explain', {
    json: {
      usable: true,
      title: 'Englisch sprechen',
      subject: { name: 'Englisch', kind: 'english' },
      intro: null,
      items: [
        {
          kind: 'speak',
          prompt: sentence,
          answer: sentence,
          accepted_answers: [],
          unit: null,
          choices: null,
          correct_choice: null,
          topic: 'Sprechen',
          difficulty: 1,
          prompt_lang: 'en',
          lang: 'en',
          figure: null,
          source_excerpt: null,
        },
      ],
    },
  });
}

describe.skipIf(!dbReady)('practising one word', () => {
  let env: TestEnv;
  let l: Learner;
  let sessionId: string;
  let itemId: string;

  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-09-29T08:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    scriptSentence(env, 'The weather is nice today.');
    const s = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: uuid(),
      kind: 'speak',
      text: 'The weather is nice today.',
    });
    sessionId = s.body.id;
    itemId = s.body.items[0]!.item.id;
  });
  afterAll(async () => {
    await env?.close();
  });

  const say = (word: string) =>
    l.api.post<SpeakWordResponse>(`/practice/sessions/${sessionId}/speak-word`, {
      item_id: itemId,
      word,
      mime: 'audio/m4a',
      audio_base64: audio,
    });

  it('judges the word and changes nothing about the question', async () => {
    env.llm.script('pronounce', {
      json: {
        audible: true,
        expected_ipa: 'ˈwɛðər',
        heard_ipa: 'ˈvɛdɐ',
        heard: 'wedder',
        ok: false,
        tip: 'Das ‹th› ist die Zunge zwischen den Zähnen.',
      },
    });
    const res = await say('weather');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ audible: true, ok: false });
    expect(res.body.tip).toContain('Zunge');

    // Practice, not an attempt: no turn, no attempt, the question stays open.
    const turns = await env.db.query(`select 1 from practice_turns where session_id = $1`, [
      sessionId,
    ]);
    expect(turns).toEqual([]);
    const si = await env.db.one<{ attempts: number; status: string }>(
      `select attempts, status from session_items where session_id = $1 and item_id = $2`,
      [sessionId, itemId],
    );
    expect(si).toEqual({ attempts: 0, status: 'open' });
  });

  it('says plainly when nothing was understandable — and gives no tip then', async () => {
    env.llm.script('pronounce', {
      json: {
        audible: false,
        expected_ipa: 'ˈwɛðər',
        heard_ipa: '',
        heard: '',
        ok: false,
        tip: 'sollte nicht erscheinen',
      },
    });
    const res = await say('weather');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ audible: false, ok: false, heard: '', tip: null });
  });

  it('refuses a word that is not in this sentence', async () => {
    const res = await say('banana');
    expect(res.status).toBe(422);
    expect(env.llm.callsFor('pronounce')).toHaveLength(2); // no model call for this one
  });

  it('refuses once the session has ended', async () => {
    await env.db.query(`update practice_sessions set status = 'finished' where id = $1`, [
      sessionId,
    ]);
    const res = await say('weather');
    expect(res.status).toBe(409);
  });
});
