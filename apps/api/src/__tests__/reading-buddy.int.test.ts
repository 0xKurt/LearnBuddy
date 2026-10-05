// Lesetexte, die Buddy selbst schreibt (#368, the rest of #233), through the real API on a real
// Postgres: she asks for reading practice, the generator writes a text and questions, and code
// holds the text to her grade and language and every question to the text before anything is
// stored (Regel 0, reject — never repair). The group then behaves like a photographed one.
//
// Failure paths: a text off her stage or in the wrong language (nothing stored, 422), a model
// outage, the same request twice, another learner's session.
// docs/architecture.md §Practice ("Lesetexte").
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LlmError } from '../llm/gateway.js';
import { printedLines } from '../modules/practice/readText.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const IGEL = [
  'Im Herbst frisst sich der Igel ein dickes Fettpolster an. Er sucht Käfer, Würmer und Schnecken unter dem Laub. Je schwerer er wird, desto besser übersteht er die kalte Zeit.',
  'Wenn die Tage kürzer werden, baut er sich ein Nest aus Blättern und Moos. Oft liegt es unter einer Hecke oder in einem Reisighaufen. Dort rollt er sich zu einer Kugel zusammen.',
  'Im Winterschlaf schlägt sein Herz nur noch wenige Male in der Minute. Seine Körpertemperatur sinkt auf etwa fünf Grad. So verbraucht er kaum Energie und lebt von seinem Fett.',
  'Im Frühling wacht der Igel wieder auf. Dann ist er sehr hungrig und hat fast ein Drittel seines Gewichts verloren. Gärten mit wilden Ecken helfen ihm, schnell wieder Futter zu finden.',
];

const QUESTIONS = [
  {
    kind: 'short',
    prompt: 'Wovon lebt der Igel im Winterschlaf?',
    answer: 'von seinem Fett',
    accepted_answers: [],
    evidence: 'So verbraucht er kaum Energie und lebt von seinem Fett',
    difficulty: 1,
  },
  {
    kind: 'multiple_choice',
    prompt: 'Wo liegt das Nest des Igels oft?',
    choices: ['unter einer Hecke', 'auf einem Baum', 'in einem Teich'],
    correct_choice: 0,
    evidence: 'Oft liegt es unter einer Hecke oder in einem Reisighaufen',
    difficulty: 1,
  },
  {
    kind: 'true_false',
    statement: 'Im Winterschlaf bleibt der Igel so warm wie im Sommer.',
    is_true: false,
    evidence: 'Seine Körpertemperatur sinkt auf etwa fünf Grad',
    difficulty: 2,
  },
  // Dropped: the lines are code's, the model cannot know line 3.
  {
    kind: 'short',
    prompt: 'Was frisst der Igel laut Z. 3?',
    answer: 'Käfer',
    accepted_answers: [],
    evidence: 'Er sucht Käfer, Würmer und Schnecken unter dem Laub',
    difficulty: 1,
  },
  // Dropped: its evidence is not in the text.
  {
    kind: 'short',
    prompt: 'Wie alt wird ein Igel?',
    answer: 'sieben Jahre',
    accepted_answers: [],
    evidence: 'Ein Igel wird bis zu sieben Jahre alt',
    difficulty: 2,
  },
  {
    kind: 'evidence',
    statement: 'Nach dem Winter braucht der Igel schnell Nahrung.',
    evidence: 'Dann ist er sehr hungrig und hat fast ein Drittel seines Gewichts verloren',
    difficulty: 2,
  },
];

const SET = (reading: Record<string, unknown> | null, subject = 'biology') => ({
  json: {
    usable: true,
    title: 'Der Igel im Winter',
    subject: { name: subject === 'english' ? 'Englisch' : 'Biologie', kind: subject },
    items: [],
    reading,
  },
});

const READING = (over: Record<string, unknown> = {}) => ({
  title: 'Der Igel im Winter',
  paragraphs: IGEL,
  lang: 'de',
  topic: 'Igel im Winter',
  questions: QUESTIONS,
  ...over,
});

describe.skipIf(!dbReady)('reading texts Buddy writes (#368)', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-05T09:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    await env.db.query(`update learners set level = 'school', grade = 6 where id = $1`, [
      l.learnerId,
    ]);
  });
  afterEach(() => env.closeChecked());

  async function start(answer: ReturnType<typeof SET>, id = randomUUID(), who: Learner = l) {
    env.llm.script('explain', answer);
    const res = await who.api.post<SessionView>('/practice/topic', {
      client_request_id: id,
      kind: 'read',
      text: 'Lesetext über Igel im Winter',
    });
    await env.flushBackground();
    return res;
  }

  it('writes one text at her stage; the questions that stand in it share it', async () => {
    const id = randomUUID();
    const res = await start(SET(READING()), id);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const s = res.body;
    expect(s.items.map((i) => i.item.prompt)).toEqual([
      'Wovon lebt der Igel im Winterschlaf?',
      'Wo liegt das Nest des Igels oft?',
      'Im Winterschlaf bleibt der Igel so warm wie im Sommer.',
      'Nach dem Winter braucht der Igel schnell Nahrung.',
    ]);
    // Buddy wrote it: the card says so, and the text is the same on every question.
    expect(s.items.every((i) => i.item.origin === 'buddy')).toBe(true);
    const lines = printedLines(IGEL);
    for (const si of s.items.slice(0, 3)) {
      expect(si.item.passage).toMatchObject({ ref: 't1', title: 'Der Igel im Winter', lines });
    }
    // The Belegstelle is answered in the text: its board carries the lines.
    expect(s.items[3]!.item.task_view).toMatchObject({ type: 'mark', mode: 'lines', lines });
    const rows = await env.db.query<{ origin: string; read_passage: { lang: string } }>(
      `select origin, read_passage from items where learner_id = $1`,
      [l.learnerId],
    );
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.read_passage.lang === 'de')).toBe(true);

    // Answered like a photographed text's questions: by rules, no tutor.
    const answer = (i: number, body: Record<string, unknown>) =>
      l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
        client_turn_id: randomUUID(),
        item_id: s.items[i]!.item.id,
        ...body,
      });
    expect((await answer(1, { choice: 0 })).body.verdict).toBe('correct');
    const fat = await answer(0, { text: 'von seinem Fet' });
    expect(fat.body.verdict).toBe('correct');
    expect(fat.body.session.items[0]!.item.passage?.evidence).not.toBeNull();
    expect(env.llm.callsFor('tutor')).toHaveLength(0);

    // The same request again is the same session, and costs no second model call.
    const again = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: id,
      kind: 'read',
      text: 'Lesetext über Igel im Winter',
    });
    expect(again.status).toBe(201);
    expect(again.body.id).toBe(s.id);
    expect(env.llm.callsFor('explain')).toHaveLength(1);

    // Another learner sees nothing of it.
    const tom = await onboard(env, { relation: 'child', name: 'Tom', birthDate: '2013-05-01' });
    expect((await tom.api.get(`/practice/sessions/${s.id}`)).status).toBe(404);
  });

  it('stores nothing of a text off her stage or in the wrong language', async () => {
    // A second grader: 700 characters and sentences of up to 17 words are too much.
    await env.db.query(`update learners set grade = 2 where id = $1`, [l.learnerId]);
    const young = await start(SET(READING()));
    expect(young.status).toBe(422);
    expect(young.body).toMatchObject({ error: { details: { reason: 'not_usable' } } });
    await env.db.query(`update learners set grade = 6 where id = $1`, [l.learnerId]);
    // An English class: a German text is not the text it asked for.
    const english = await start(SET(READING(), 'english'));
    expect(english.status).toBe(422);
    // Declared English, written in German: the alphabet tells (ä, ö, ü).
    const posing = await start(SET(READING({ lang: 'en' }), 'english'));
    expect(posing.status).toBe(422);
    // No text at all.
    expect((await start(SET(null))).status).toBe(422);
    const stored = await env.db.one<{ n: number }>(
      `select count(*)::int as n from items where learner_id = $1`,
      [l.learnerId],
    );
    expect(stored.n).toBe(0);
  });

  it('says so honestly when the model is down, and stores nothing', async () => {
    env.llm.script('explain', { error: new LlmError('unavailable', 'down') });
    const res = await l.api.post('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'read',
      text: 'Lesetext über Igel im Winter',
    });
    expect(res.status).toBe(503);
    const stored = await env.db.one<{ n: number }>(
      `select count(*)::int as n from items where learner_id = $1`,
      [l.learnerId],
    );
    expect(stored.n).toBe(0);
  });
});
