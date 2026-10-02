// The sentences on her own sheet, read aloud (issue #223 point 2).
//
// A reading may write `speak` items from a sheet ("Lies den Text laut vor"), and they were
// stored — but `practice/selection.ts` keeps every spoken item out of a practice set, for a good
// reason: the microphone has no place in the middle of typing. So they were stored and never
// asked, and the speak mode Buddy prepares writes NEW sentences instead of hers.
//
// That exclusion stays. What this adds is the door it was missing: a run through ONE sheet that
// holds its spoken sentences and nothing else (`StartPracticeRequest.mode = 'speak'`). It is an
// ordinary practice session — same spaced repetition, same screen, the recording and the
// pronunciation judgement of `practice/speak.ts` untouched — and the sheet says whether it has
// any (`MaterialView.speak_count`), so the offer can never lead to "nothing to practise".
// docs/architecture.md §Practice.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, MaterialView, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();
const audio = Buffer.alloc(2000, 7).toString('base64');

const WAIT = { json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null } };

const written = (prompt: string, answer: string) => ({
  kind: 'short',
  prompt,
  answer,
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Unité 3',
  difficulty: 2,
  prompt_lang: 'fr',
  lang: null,
  figure: null,
  source_excerpt: null,
});

const spoken = (sentence: string) => ({
  kind: 'speak',
  prompt: sentence,
  answer: sentence,
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Vorlesen',
  difficulty: 2,
  prompt_lang: 'fr',
  lang: 'fr',
  figure: null,
  source_excerpt: null,
});

const FIRST = "Je m'appelle Lena et j'habite à Lyon.";
const SECOND = 'Ma sœur a douze ans.';
const THIRD = 'Nous allons au marché le samedi.';

/** A French sheet: two written tasks and, further down, three sentences to read aloud. */
const mixedSheet = () => ({
  is_learning_material: true,
  readable: true,
  pages: [],
  title: 'Unité 3',
  subject: { name: 'Französisch', kind: 'french' },
  extracted_text: 'Unité 3 — Aufgaben und ein Text zum Vorlesen',
  items: [
    written('Wie heißt „die Schwester“ auf Französisch?', 'la sœur'),
    written('Wie heißt „der Markt“ auf Französisch?', 'le marché'),
    spoken(FIRST),
    spoken(SECOND),
    spoken(THIRD),
  ],
});

/** A sheet that is nothing BUT sentences to read aloud. */
const spokenOnlySheet = () => ({
  ...mixedSheet(),
  title: 'Texte à lire',
  items: [spoken(FIRST), spoken(SECOND)],
});

/** A sheet with nothing to say aloud at all. */
const writtenOnlySheet = () => ({
  ...mixedSheet(),
  title: 'Vokabeln',
  items: [written('Wie heißt „die Schwester“ auf Französisch?', 'la sœur')],
});

const judgement = {
  audible: true,
  expected_ipa: 'ʒə maplɛ lena e ʒabit a ljɔ̃',
  heard_ipa: 'ʒə mapɛl lena e ʒabit a ljɔn',
  heard: "Je m'appelle Lena et j'habite à Lyon",
  overall: 'almost',
  words: [
    { text: 'Je', ok: true, tip: null },
    { text: "m'appelle", ok: false, tip: 'Das ‹ll› klingt wie ‹l›.' },
    { text: 'Lyon', ok: true, tip: null },
  ],
  reply: 'Fast! Achte auf „m’appelle“.',
};

/** Send a sheet and let the reading run; returns the material's view. */
async function send(
  env: TestEnv,
  l: Learner,
  extraction: unknown,
  purpose: 'study' | 'homework' = 'study',
): Promise<MaterialView> {
  env.llm.script('extraction', { json: extraction });
  if (purpose === 'study') env.llm.script('buddy_check', WAIT);
  const created = await l.api.post<{ material: MaterialView; uploads: Array<{ path: string }> }>(
    '/materials',
    { client_request_id: randomUUID(), photo_mimes: ['image/jpeg'], purpose },
  );
  expect(created.status).toBe(201);
  for (const u of created.body.uploads) env.storage.put(u.path);
  expect((await l.api.post(`/materials/${created.body.material.id}/submit`)).status).toBe(202);
  await env.flushBackground();
  const view = await l.api.get<MaterialView>(`/materials/${created.body.material.id}`);
  expect(view.status).toBe(200);
  return view.body;
}

const promptsOf = (s: SessionView) => s.items.map((i) => i.item.prompt);
const kindsOf = (s: SessionView) => [...new Set(s.items.map((i) => i.item.kind))].sort();

describe.skipIf(!dbReady)('reading the sentences from a sheet aloud (issue #223 point 2)', () => {
  let env: TestEnv;
  let lena: Learner;
  let other: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T15:00:00Z' });
    lena = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    other = await onboard(env, { name: 'Sam' });
  });
  afterEach(async () => {
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      unexpected: env.llm.unexpected.map((u) => u.purpose),
      pending: env.llm.pending(),
    };
    await env.close();
    expect(report).toEqual({ scriptErrors: [], unexpected: [], pending: 0 });
  });

  it('says on the sheet how many sentences it has to read aloud', async () => {
    const mixed = await send(env, lena, mixedSheet());
    // They are part of the sheet's questions and counted apart from them.
    expect(mixed).toMatchObject({ item_count: 5, speak_count: 3 });
    const plain = await send(env, lena, writtenOnlySheet());
    expect(plain).toMatchObject({ item_count: 1, speak_count: 0 });
    // The library says the same thing, from the same rule.
    const library = await lena.api.get<{ subjects: Array<{ materials: MaterialView[] }> }>(
      '/materials',
    );
    expect(library.status).toBe(200);
    const sheets = library.body.subjects.flatMap((s) => s.materials);
    expect(sheets.map((m) => [m.title, m.speak_count]).sort()).toEqual([
      ['Unité 3', 3],
      ['Vokabeln', 0],
    ]);
  });

  it('keeps a spoken sentence out of the written run and gives her all of them in a speaking run', async () => {
    const sheet = await send(env, lena, mixedSheet());

    // Unchanged: a written run never puts the microphone in front of her mid-typing.
    const practice = await lena.api.post<SessionView>('/practice/sessions', {
      material_id: sheet.id,
      mode: 'practice',
    });
    expect(practice.status).toBe(201);
    expect(kindsOf(practice.body)).toEqual(['short']);
    expect(promptsOf(practice.body)).toHaveLength(2);

    // New: the sentences from that very sheet, all of them, in the order they stand on it.
    const speaking = await lena.api.post<SessionView>('/practice/sessions', {
      material_id: sheet.id,
      mode: 'speak',
    });
    expect(speaking.status).toBe(201);
    expect(kindsOf(speaking.body)).toEqual(['speak']);
    expect(promptsOf(speaking.body)).toEqual([FIRST, SECOND, THIRD]);
    // It is practice, not a mode of its own: the screen, the summary and the schedule all
    // stay what they are (migration 0069 argues the same for a flashcard pass).
    expect(speaking.body.mode).toBe('practice');
    expect(speaking.body.title).toBe('Unité 3');
    // The run is the whole sheet, never a sample of it (#145/#49): the offer names the sheet.
    const stored = await env.db.one<{ n: number }>(
      `select count(*)::int as n from session_items where session_id = $1`,
      [speaking.body.id],
    );
    expect(stored.n).toBe(3);
    // Nothing in it is typed: a speaking question has no tap choices and no hint button.
    expect(speaking.body.items.every((i) => i.item.tap_choices === null)).toBe(true);
    expect(speaking.body.items.every((i) => !i.hint_available)).toBe(true);
  });

  it('judges one of her own sentences with the machinery that was already there', async () => {
    const sheet = await send(env, lena, mixedSheet());
    const speaking = await lena.api.post<SessionView>('/practice/sessions', {
      material_id: sheet.id,
      mode: 'speak',
    });
    const first = speaking.body.items[0]!.item;
    expect(first.prompt).toBe(FIRST);

    env.llm.script('pronounce', { json: judgement });
    const said = await lena.api.post<AnswerResponse>(
      `/practice/sessions/${speaking.body.id}/speak`,
      { client_turn_id: randomUUID(), item_id: first.id, mime: 'audio/m4a', audio_base64: audio },
    );
    expect(said.status).toBe(200);
    expect(said.body.verdict).toBe('partially_correct');
    expect(said.body.reply.pronunciation?.heard).toBe("Je m'appelle Lena et j'habite à Lyon");
    // The model listened to HER sentence, the one printed on the sheet.
    const asked = env.llm.callsFor('pronounce')[0]!;
    const text = asked.contents
      .flatMap((m) => m.parts.flatMap((p) => ('text' in p ? [p.text] : [])))
      .join('\n');
    expect(text).toContain(FIRST);
    // It counts as practice: the question is closed and carries a review now.
    const closed = said.body.session.items.find((i) => i.item.id === first.id)!;
    expect(closed.status).not.toBe('open');
    const review = await env.db.query<{ last_outcome: string | null }>(
      `select last_outcome from item_states where item_id = $1`,
      [first.id],
    );
    expect(review).toHaveLength(1);
  });

  it('a sheet whose questions are all spoken has its speaking run and no written one', async () => {
    const sheet = await send(env, lena, spokenOnlySheet());
    // item_count === speak_count is what makes reading aloud the sheet's main action.
    expect(sheet).toMatchObject({ item_count: 2, speak_count: 2 });
    const written = await lena.api.post('/practice/sessions', {
      material_id: sheet.id,
      mode: 'practice',
    });
    expect(written.status).toBe(404);
    expect(written.body).toMatchObject({ error: { details: { reason: 'no_questions' } } });
    const speaking = await lena.api.post<SessionView>('/practice/sessions', {
      material_id: sheet.id,
      mode: 'speak',
    });
    expect(speaking.status).toBe(201);
    expect(promptsOf(speaking.body)).toEqual([FIRST, SECOND]);
  });

  it('refuses a speaking run that is not about one sheet, or about a sheet without sentences', async () => {
    const plain = await send(env, lena, writtenOnlySheet());

    // Nothing to read aloud on this sheet: the honest answer, never a run of her written
    // questions with a microphone in front of them.
    const none = await lena.api.post('/practice/sessions', {
      material_id: plain.id,
      mode: 'speak',
    });
    expect(none.status).toBe(404);
    expect(none.body).toMatchObject({ error: { details: { reason: 'no_questions' } } });

    // A speaking run is a run through ONE sheet; the contract refuses it without one, so no
    // request can ask for "every sentence I ever photographed".
    const unscoped = await lena.api.post('/practice/sessions', { mode: 'speak' });
    expect(unscoped.status).toBe(422);
    const bySubject = await lena.api.post('/practice/sessions', {
      subject_id: null,
      material_id: null,
      mode: 'speak',
    });
    expect(bySubject.status).toBe(422);
  });

  it("never reads from another learner's sheet", async () => {
    const sheet = await send(env, lena, mixedSheet());
    const stolen = await other.api.post('/practice/sessions', {
      material_id: sheet.id,
      mode: 'speak',
    });
    expect(stolen.status).toBe(404);
    // Her own sheet is untouched by that attempt.
    const sessions = await env.db.query(`select id from practice_sessions where learner_id = $1`, [
      other.learnerId,
    ]);
    expect(sessions).toEqual([]);
  });

  it('counts no sentence on a homework sheet and sends every way back to its help session', async () => {
    // Homework is helped with, not drilled (audit H-7). Its tasks carry `origin = 'homework'`,
    // which no run selects — so a sheet of homework offers nothing to read aloud, and asking
    // for it anyway lands where every way back to that sheet lands.
    const homework = await send(
      env,
      lena,
      { ...mixedSheet(), title: 'Hausaufgabe', items: [written('Traduis la phrase.', 'la sœur')] },
      'homework',
    );
    expect(homework).toMatchObject({ purpose: 'homework', speak_count: 0 });
    const asked = await lena.api.post<SessionView>('/practice/sessions', {
      material_id: homework.id,
      mode: 'speak',
    });
    expect(asked.status).toBe(201);
    expect(asked.body.mode).toBe('help');
  });
});
