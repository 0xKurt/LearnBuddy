// Hörverstehen end to end (issue #210): she asks for it, hears a text, answers, and only then
// reads what was said.
//
// What must hold, and what would be worse than not having the form at all:
//   · the text she hears is exactly the text the questions were checked against, and it does
//     not reach the app while a question is open — it is where every answer comes from;
//   · she can hear it again, and slower, as often as she likes, and a replay costs no second
//     synthesis;
//   · a slip of the pen on something she understood is right, with no word about her spelling;
//   · with no voice configured, NO exercise comes into being — not a set of questions about a
//     text nobody can play, and not a button that promises one;
//   · a listening question never turns up inside a written run, where it would be a question
//     about a text she never heard.
// requires live verification in Claude Code session (needs a running Postgres; scripted model)

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { randomUUID as uuid } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

type ErrorBody = { error: { code: string; details?: { reason?: string } } };

const TEXT =
  'On Saturday morning Tom took the bus to the city centre. He wanted to buy a present for his sister, because she has her birthday on Sunday. In the end he bought a book about horses and a small blue candle.';

type Q = {
  kind: 'short' | 'multiple_choice';
  prompt: string;
  answer: string;
  choices: string[] | null;
  correct_choice: number | null;
};

const QUESTIONS: Q[] = [
  {
    kind: 'short',
    prompt: 'What did Tom buy for his sister?',
    answer: 'a book about horses',
    choices: null,
    correct_choice: null,
  },
  {
    kind: 'multiple_choice',
    prompt: 'How did Tom get to the city centre?',
    answer: 'the bus',
    choices: ['the bus', 'his bike', 'the train'],
    correct_choice: 0,
  },
  {
    kind: 'short',
    prompt: 'When is his sister’s birthday?',
    answer: 'Sunday',
    choices: null,
    correct_choice: null,
  },
];

function script(env: TestEnv, questions: Q[] = QUESTIONS, text = TEXT): void {
  env.llm.script('explain', {
    json: {
      usable: true,
      title: 'Listening: Tom’s Saturday',
      subject: { name: 'Englisch', kind: 'english' },
      items: [],
      listen: {
        text,
        lang: 'en',
        questions: questions.map((q) => ({
          kind: q.kind,
          prompt: q.prompt,
          answer: q.answer,
          accepted_answers: [],
          choices: q.choices,
          correct_choice: q.correct_choice,
          topic: 'Tom’s Saturday',
          difficulty: 2,
        })),
      },
    },
  });
}

describe.skipIf(!dbReady)('Hörverstehen', () => {
  let env: TestEnv;
  let lena: Learner;

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T15:00:00Z' });
    lena = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterEach(async () => {
    await env?.close();
  });

  const start = () =>
    lena.api.post<SessionView>('/practice/topic', {
      client_request_id: uuid(),
      kind: 'listen',
      text: 'Hörverstehen Englisch üben',
    });

  it('gives her a text with questions about it — and never the words of it', async () => {
    script(env);
    const res = await start();
    expect(res.status).toBe(201);
    const session = res.body;
    expect(session.items).toHaveLength(3);

    for (const si of session.items) {
      // Every question of one text is about ONE recording, and says so with one alias.
      expect(si.item.listen).toEqual({ ref: 'h1' });
      // The text is the solution while the question is open: neither it nor the answer goes out.
      expect(si.listen_transcript).toBeNull();
      expect(si.answer).toBeNull();
      // The help here is hearing it again, not a written hint about a text she is listening to.
      expect(si.hint_available).toBe(false);
      expect(si.hints_left).toBe(0);
    }
    // Nothing of the text is anywhere in the answer, in any field.
    expect(JSON.stringify(session)).not.toContain('a book about horses');
    expect(JSON.stringify(session)).not.toContain('took the bus to the city centre');
    // The text IS stored, once, with each of its questions (so a review in three weeks works).
    const rows = await env.db.query<{ listen_task: { text: string; lang: string } }>(
      `select listen_task from items where learner_id = $1 and listen_task is not null`,
      [lena.learnerId],
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.listen_task.text === TEXT && r.listen_task.lang === 'en')).toBe(
      true,
    );
  });

  it('reads exactly the stored text aloud, again and slower, and synthesises each pass once', async () => {
    script(env);
    const session = (await start()).body;
    const itemId = session.items[0]!.item.id;
    const hear = (slow?: boolean) =>
      lena.api.post<{ mime: string; audio_base64: string }>(
        `/practice/sessions/${session.id}/listen`,
        { item_id: itemId, ...(slow ? { slow: true } : {}) },
      );

    const first = await hear();
    expect(first.status).toBe(200);
    expect(first.body.audio_base64.length).toBeGreaterThan(0);
    // Regel 0: what the voice gets is the stored text, character for character.
    expect(env.speech.calls).toHaveLength(1);
    expect(env.speech.calls[0]).toMatchObject({ text: TEXT, locale: 'en-GB', rate: 1 });

    // Hearing it again is the exercise, not an extra — and it costs no second synthesis.
    const again = await hear();
    expect(again.status).toBe(200);
    expect(again.body.audio_base64).toBe(first.body.audio_base64);
    expect(env.speech.calls).toHaveLength(1);

    // The slower pass is the same text, read more slowly.
    const slow = await hear(true);
    expect(slow.status).toBe(200);
    expect(env.speech.calls).toHaveLength(2);
    expect(env.speech.calls[1]).toMatchObject({ text: TEXT, rate: 0.8 });

    // The next question is about the same recording, so it is the same audio again.
    const second = await lena.api.post<{ audio_base64: string }>(
      `/practice/sessions/${session.id}/listen`,
      { item_id: session.items[1]!.item.id },
    );
    expect(second.status).toBe(200);
    expect(env.speech.calls).toHaveLength(2);
  });

  it('counts a slip of the pen as right, and shows the text afterwards', async () => {
    script(env);
    const session = (await start()).body;
    const itemId = session.items[0]!.item.id;
    const res = await lena.api.post<AnswerResponse>(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: uuid(),
      item_id: itemId,
      text: 'a book about horsse',
    });
    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe('correct');
    // Decided by the rules: no model saw it, so nothing could rebuke her language.
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
    const closed = res.body.session.items.find((si) => si.item.id === itemId)!;
    expect(closed.status).toBe('correct');
    // Now she may read what was said — the text arrives with the solution, never before.
    expect(closed.listen_transcript).toBe(TEXT);
    const stillOpen = res.body.session.items.find((si) => si.status === 'open')!;
    expect(stillOpen.listen_transcript).toBeNull();
  });

  it('writes no question whose answer was never said in the text', async () => {
    script(env, [
      QUESTIONS[0]!,
      { ...QUESTIONS[2]!, prompt: 'How did Tom feel about it?', answer: 'he was very happy' },
    ]);
    const session = (await start()).body;
    expect(session.items.map((si) => si.item.prompt)).toEqual(['What did Tom buy for his sister?']);
  });

  it('prepares nothing at all when there is no voice to read it', async () => {
    const off = await createTestEnv({ speech: 'disabled', start: '2026-10-02T15:00:00Z' });
    try {
      const mia = await onboard(off, { relation: 'child', name: 'Mia', birthDate: '2014-02-10' });
      script(off);
      const res = await mia.api.post<ErrorBody>('/practice/topic', {
        client_request_id: uuid(),
        kind: 'listen',
        text: 'Hörverstehen Englisch üben',
      });
      expect(res.status).toBe(503);
      expect(res.body.error.details?.reason).toBe('speech_off');
      // Refused before the model was asked: no call spent, and nothing half-made.
      expect(off.llm.callsFor('explain')).toHaveLength(0);
      const sessions = await off.db.query(`select 1 from practice_sessions where learner_id = $1`, [
        mia.learnerId,
      ]);
      expect(sessions).toEqual([]);
      const items = await off.db.query(`select 1 from items where learner_id = $1`, [
        mia.learnerId,
      ]);
      expect(items).toEqual([]);
    } finally {
      await off.close();
    }
  });

  it('keeps a listening question out of a written run', async () => {
    script(env);
    await start();
    const subject = await env.db.one<{ id: string }>(
      `select id from subjects where learner_id = $1`,
      [lena.learnerId],
    );
    const res = await lena.api.post<ErrorBody>('/practice/sessions', { subject_id: subject.id });
    // Her only questions for this subject are listening ones: a written run finds none, rather
    // than putting a question about an unheard text in front of her.
    expect(res.status).toBe(404);
    expect(res.body.error.details?.reason).toBe('no_questions');
  });

  it('answers another learner’s session and a question without a text with an error', async () => {
    script(env);
    const session = (await start()).body;
    const sam = await onboard(env, { name: 'Sam' });
    const stolen = await sam.api.post<ErrorBody>(`/practice/sessions/${session.id}/listen`, {
      item_id: session.items[0]!.item.id,
    });
    expect(stolen.status).toBe(404);

    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Brüche',
        subject: { name: 'Mathe', kind: 'math' },
        items: [
          {
            kind: 'numeric',
            prompt: 'Wie viel ist 2 + 3?',
            answer: '5',
            accepted_answers: [],
            unit: null,
            choices: null,
            correct_choice: null,
            topic: 'Addieren',
            difficulty: 1,
            prompt_lang: 'de',
            lang: null,
            figure: null,
            source_excerpt: null,
          },
        ],
        bars: [],
      },
    });
    const written = await lena.api.post<SessionView>('/practice/topic', {
      client_request_id: uuid(),
      kind: 'practice',
      text: 'Addieren üben',
    });
    expect(written.status).toBe(201);
    const res = await lena.api.post<ErrorBody>(`/practice/sessions/${written.body.id}/listen`, {
      item_id: written.body.items[0]!.item.id,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.details?.reason).toBe('not_listening');
    // A question that is read has nothing to play, and the app is never shown a way to try.
    expect(written.body.items.every((si) => si.item.listen === null)).toBe(true);
  });
});
