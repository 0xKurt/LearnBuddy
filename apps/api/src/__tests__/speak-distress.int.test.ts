// Distress in a pronunciation take (issue #765, CLAUDE.md rule 18): what she said into the
// recorder is her own words like a written answer. The judge writes down what it heard but has no
// concern bit, so a take that holds words the sentence does not goes to the distress check; a
// concern, or the provider's filter holding the take back, gets the app's fixed help answer and
// nothing is judged. Checked against the database, not only the reply. One tapped word said on its
// own is read the same way (#785).
// requires live verification in Claude Code session (needs a running Postgres; the model is scripted)

import { randomUUID } from 'node:crypto';

import type {
  AnswerResponse,
  SessionView,
  SpeakWordResponse,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { t } from '../i18n/index.js';
import { LlmError } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const SENTENCE = 'Bonjour, je suis Lena.';
const TOLD = 'Bonjour, mein Bruder schlägt mich jeden Tag';

/** The judge's answer for a take in which she said `heard`. */
const judged = (heard: string) => ({
  json: {
    audible: true,
    expected_ipa: 'bɔ̃ʒuʁ ʒə sɥi lena',
    heard_ipa: 'bɔ̃ʒuʁ',
    heard,
    overall: 'good',
    words: ['Bonjour,', 'je', 'suis', 'Lena.'].map((text) => ({ text, ok: true, tip: null })),
    reply: 'Super gesprochen!',
  },
});

describe.skipIf(!dbReady)('distress in a pronunciation take (#765)', () => {
  let env: TestEnv;
  let l: Learner;
  let session: SessionView;

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-04T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Französisch sprechen',
        subject: { name: 'Französisch', kind: 'french' },
        items: [
          {
            kind: 'speak',
            prompt: SENTENCE,
            answer: SENTENCE,
            accepted_answers: [],
            unit: null,
            choices: null,
            correct_choice: null,
            topic: 'Sich vorstellen',
            difficulty: 1,
            prompt_lang: 'fr',
            lang: 'fr',
            figure: null,
            source_excerpt: null,
          },
        ],
      },
    });
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'speak',
      text: SENTENCE,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    session = res.body;
  });
  afterEach(() => env.closeChecked());

  const take = () =>
    l.api.post<AnswerResponse>(`/practice/sessions/${session.id}/speak`, {
      client_turn_id: randomUUID(),
      item_id: session.items[0]!.item.id,
      mime: 'audio/m4a',
      audio_base64: Buffer.alloc(2000, 7).toString('base64'),
    });
  const itemRow = () =>
    env.db.one<{ attempts: number; status: string }>(
      `select attempts, status from session_items where session_id = $1 and item_id = $2`,
      [session.id, session.items[0]!.item.id],
    );

  it('answers distress she says while recording with the fixed help answer, judging nothing', async () => {
    env.llm.script('pronounce', judged(TOLD));
    env.llm.script('safeguard', { json: { concern: true } });
    const res = await take();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.verdict).toBe('not_an_attempt');
    expect(res.body.reply.text).toBe(t('de', 'safeguarding.concern'));
    expect(res.body.reply.pronunciation ?? null).toBeNull();
    expect(await itemRow()).toEqual({ attempts: 0, status: 'open' });
    // The check read what she said, with the sentence she was practising.
    const said = ScriptedGateway.textOf(env.llm.callsFor('safeguard').at(-1)!);
    expect(said).toContain(TOLD);
    expect(said).toContain(SENTENCE);
    // Her words stay in her turns (her data); the tutor's turn is the fixed text.
    const turns = await env.db.query<{ role: string; text: string }>(
      `select role, text from practice_turns where session_id = $1 order by seq`,
      [session.id],
    );
    expect(turns).toEqual([
      { role: 'learner', text: `🎤 ${TOLD}` },
      { role: 'tutor', text: t('de', 'safeguarding.concern') },
    ]);
  });

  it('answers a take the provider holds back with the fixed blocked answer', async () => {
    env.llm.script('pronounce', { error: new LlmError('blocked', 'SAFETY', null, 'SAFETY') });
    const res = await take();
    expect(res.status).toBe(200);
    expect(res.body.reply.text).toBe(t('de', 'safeguarding.blocked'));
    expect(await itemRow()).toEqual({ attempts: 0, status: 'open' });
  });

  it('asks no check when she said only the sentence', async () => {
    env.llm.script('pronounce', judged('Bonjour, je suis Lena'));
    const res = await take();
    expect(res.body.verdict).toBe('correct');
    expect(res.body.reply.text).toBe('Super gesprochen!');
    expect(env.llm.callsFor('safeguard')).toHaveLength(1); // Only the topic's preflight.
  });

  it('keeps the judgement and adds the fixed help line when no check can read her words', async () => {
    env.llm.script('pronounce', judged(TOLD));
    env.llm.script('safeguard', { error: new LlmError('unavailable', 'down') });
    const res = await take();
    expect(res.body.verdict).toBe('correct');
    expect(res.body.reply.text).toBe(`Super gesprochen! ${t('de', 'safeguarding.unchecked')}`);
  });

  // One tapped word said on its own (#785) stores nothing, but it shows her words back: they are
  // read the same way, and the answer carries the fixed help text.
  const sayWord = () =>
    l.api.post<SpeakWordResponse>(`/practice/sessions/${session.id}/speak-word`, {
      item_id: session.items[0]!.item.id,
      word: 'Bonjour',
      mime: 'audio/m4a',
      audio_base64: Buffer.alloc(2000, 7).toString('base64'),
    });
  /** The judge's answer for one word in which she said `heard`. */
  const wordJudged = (heard: string) => ({
    json: { audible: true, expected_ipa: 'bɔ̃ʒuʁ', heard_ipa: 'bɔ̃ʒuʁ', heard, ok: true, tip: null },
  });

  it('answers distress she says instead of the one word with the fixed help answer, showing her words nowhere', async () => {
    env.llm.script('pronounce', wordJudged(TOLD));
    env.llm.script('safeguard', { json: { concern: true } });
    const res = await sayWord();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      audible: false,
      ok: false,
      heard: '',
      tip: null,
      help: t('de', 'safeguarding.concern'),
    });
    const said = ScriptedGateway.textOf(env.llm.callsFor('safeguard').at(-1)!);
    expect(said).toContain(TOLD);
    expect(said).toContain(SENTENCE);
    // Still practice: nothing is stored, the sentence keeps its state.
    expect(
      await env.db.query(`select 1 from practice_turns where session_id = $1`, [session.id]),
    ).toEqual([]);
    expect(await itemRow()).toEqual({ attempts: 0, status: 'open' });
  });

  it('answers one word the provider holds back with the fixed blocked answer', async () => {
    env.llm.script('pronounce', { error: new LlmError('blocked', 'SAFETY', null, 'SAFETY') });
    const res = await sayWord();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      audible: false,
      ok: false,
      heard: '',
      tip: null,
      help: t('de', 'safeguarding.blocked'),
    });
  });

  it('keeps the word judgement and adds the fixed help line when no check can read her words', async () => {
    env.llm.script('pronounce', wordJudged(TOLD));
    env.llm.script('safeguard', { error: new LlmError('unavailable', 'down') });
    const res = await sayWord();
    expect(res.body).toEqual({
      audible: true,
      ok: true,
      heard: TOLD,
      tip: null,
      help: t('de', 'safeguarding.unchecked'),
    });
  });

  it('asks no check when she said only the word', async () => {
    env.llm.script('pronounce', wordJudged('Bonjour'));
    const res = await sayWord();
    expect(res.body).toEqual({ audible: true, ok: true, heard: 'Bonjour', tip: null, help: null });
    expect(env.llm.callsFor('safeguard')).toHaveLength(1); // Only the topic's preflight.
  });
});
