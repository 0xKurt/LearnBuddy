// One word of the sentence, said on its own (issue #83): she taps a word she got wrong and
// practises just that. What must hold: it is practice, not an attempt — nothing is stored,
// the question keeps its attempts and its state; and only a word of *this* sentence.
// requires live verification in Claude Code session (needs a running Postgres; scripted model)

import type {
  AnswerResponse,
  SessionView,
  SpeakWordResponse,
} from '@learnbuddy/shared-types/contracts';
import { randomUUID as uuid } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();
const audio = Buffer.alloc(2000, 7).toString('base64');

function scriptSentence(env: TestEnv, sentence: string, kind: 'speak' | 'short' = 'speak'): void {
  env.llm.script('explain', {
    json: {
      usable: true,
      title: 'Englisch sprechen',
      subject: { name: 'Englisch', kind: 'english' },
      items: [
        {
          kind,
          prompt: sentence,
          answer: sentence,
          accepted_answers: [],
          unit: null,
          choices: null,
          correct_choice: null,
          topic: 'Sprechen',
          difficulty: 1,
          prompt_lang: kind === 'speak' ? 'en' : null,
          lang: kind === 'speak' ? 'en' : null,
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

  beforeEach(async () => {
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
  afterEach(async () => {
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
    expect(env.llm.callsFor('pronounce')).toHaveLength(0); // no model call for this one
  });

  it('rehearses repeatedly after the final almost sentence is genuinely finished without changing practice state', async () => {
    env.llm.script('pronounce', {
      json: {
        audible: true,
        expected_ipa: 'weather',
        heard_ipa: 'wether',
        heard: 'The wether is nice today.',
        overall: 'almost',
        words: [
          { text: 'The', ok: true, tip: null },
          { text: 'weather', ok: false, tip: 'Try th.' },
          { text: 'is', ok: true, tip: null },
          { text: 'nice', ok: true, tip: null },
          { text: 'today', ok: true, tip: null },
        ],
        reply: 'Almost.',
      },
    });
    const graded = await l.api.post<AnswerResponse>(`/practice/sessions/${sessionId}/speak`, {
      client_turn_id: uuid(),
      item_id: itemId,
      mime: 'audio/m4a',
      audio_base64: audio,
    });
    expect(graded.status).toBe(200);
    expect(graded.body.session.status).toBe('finished');
    const finished = await l.api.post<SessionView>(`/practice/sessions/${sessionId}/finish`, {});
    expect(finished.status).toBe(200);
    expect(finished.body.status).toBe('finished');
    expect(finished.body.summary).not.toBeNull();
    const snapshot = () =>
      env.db.query(
        `select row_to_json(s) as session,
         (select jsonb_agg(to_jsonb(si) order by si.item_id) from session_items si where si.session_id = s.id) as items,
         (select jsonb_agg(to_jsonb(t) order by t.id) from practice_turns t where t.session_id = s.id) as turns,
         (select jsonb_agg(to_jsonb(st) order by st.item_id) from item_states st where st.learner_id = s.learner_id) as reviews
       from practice_sessions s where s.id = $1 and s.learner_id = $2`,
        [sessionId, l.learnerId],
      );
    const before = await snapshot();
    for (let i = 0; i < 2; i++) {
      env.llm.script('pronounce', {
        json: {
          audible: true,
          expected_ipa: 'weather',
          heard_ipa: 'weather',
          heard: 'weather',
          ok: true,
          tip: null,
        },
      });
      expect((await say('weather')).status).toBe(200);
    }
    expect(await snapshot()).toEqual(before);
    const sentence = await l.api.post(`/practice/sessions/${sessionId}/speak`, {
      client_turn_id: uuid(),
      item_id: itemId,
      mime: 'audio/m4a',
      audio_base64: audio,
    });
    expect(sentence.status).toBe(409);
    expect(env.llm.callsFor('pronounce')).toHaveLength(3);
  });

  it('still refuses abandoned sessions before asking the model', async () => {
    await env.db.query(
      `update practice_sessions set status = 'abandoned' where id = $1 and learner_id = $2`,
      [sessionId, l.learnerId],
    );
    expect((await say('weather')).status).toBe(409);
    expect(env.llm.callsFor('pronounce')).toHaveLength(0);
  });

  it('refuses a non-spoken item before asking the model', async () => {
    scriptSentence(env, 'Name the weather.', 'short');
    const session = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: uuid(),
      kind: 'practice',
      text: 'Name the weather.',
    });
    expect(session.status).toBe(201);
    expect(
      (
        await l.api.post(`/practice/sessions/${session.body.id}/speak-word`, {
          item_id: session.body.items[0]!.item.id,
          word: 'weather',
          mime: 'audio/m4a',
          audio_base64: audio,
        })
      ).status,
    ).toBe(409);
    expect(env.llm.callsFor('pronounce')).toHaveLength(0);
  });

  it('keeps learner ownership and session membership before asking the model', async () => {
    const other = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2014-02-10' });
    const body = { item_id: itemId, word: 'weather', mime: 'audio/m4a', audio_base64: audio };
    expect((await other.api.post(`/practice/sessions/${sessionId}/speak-word`, body)).status).toBe(
      404,
    );
    scriptSentence(env, 'A different sentence.');
    const another = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: uuid(),
      kind: 'speak',
      text: 'A different sentence.',
    });
    expect(
      (
        await l.api.post(`/practice/sessions/${sessionId}/speak-word`, {
          ...body,
          item_id: another.body.items[0]!.item.id,
        })
      ).status,
    ).toBe(404);
    expect(env.llm.callsFor('pronounce')).toHaveLength(0);
  });
});
