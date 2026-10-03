// "Dein Material" (issue #189): what GET /materials has to carry so she can look a subject
// up without asking Buddy — her sheets, the exercises that came from NO sheet, and the
// topics that came up — and what it must never carry: anything of another learner's.
//
// The two levels the app shows are built from this one view, so the test is about the view:
// a subject's sheets stay its sheets, a sheet's own practice is left to the sheet (it has
// "Üben" there), an abandoned exercise is left out because its screen has nothing to show,
// and nothing here is a count of what is due or missed (CLAUDE.md rule 6).
// docs/architecture.md §Material.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { LibraryView, MaterialView, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const item = (over: Record<string, unknown>) => ({
  kind: 'short',
  prompt: 'Frage',
  answer: 'Antwort',
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Thema',
  difficulty: 2,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
  ...over,
});

const WAIT = { json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null } };

/** A vocabulary pair needs both languages, and they must differ (practice/items.ts). */
const VOCAB = { kind: 'vocab', prompt_lang: 'fr', lang: 'de' };

/** A read sheet in Erdkunde with two topics. */
const sheet = (title: string) => ({
  is_learning_material: true,
  readable: true,
  title,
  subject: { name: 'Erdkunde', kind: 'geography' },
  extracted_text: 'Europa: Hauptstädte und Flüsse',
  items: [
    item({ prompt: 'Hauptstadt von Frankreich?', answer: 'Paris', topic: 'Hauptstädte' }),
    item({ prompt: 'Längster Fluss Europas?', answer: 'Wolga', topic: 'Flüsse' }),
  ],
});

async function upload(env: TestEnv, l: Learner, title: string): Promise<string> {
  env.llm.script('extraction', { json: sheet(title) });
  env.llm.script('buddy_check', WAIT);
  const created = await l.api.post<{ material: MaterialView; uploads: Array<{ path: string }> }>(
    '/materials',
    { client_request_id: randomUUID(), photo_mimes: ['image/jpeg'] },
  );
  expect(created.status).toBe(201);
  for (const u of created.body.uploads) env.storage.put(u.path);
  expect((await l.api.post(`/materials/${created.body.material.id}/submit`)).status).toBe(202);
  await env.flushBackground();
  return created.body.material.id;
}

/** An exercise from something she typed: no sheet behind it, its own subject. */
async function typedExercise(
  env: TestEnv,
  l: Learner,
  title: string,
  subject: { name: string; kind: string },
  topic: string,
): Promise<string> {
  env.llm.script('explain', {
    json: {
      usable: true,
      title,
      subject,
      items: [
        item({ prompt: 'le vélo', answer: 'das Fahrrad', topic, ...VOCAB }),
        item({ prompt: 'la voiture', answer: 'das Auto', topic, ...VOCAB }),
      ],
    },
  });
  const res = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: randomUUID(),
    kind: 'vocab',
    text: 'le vélo – das Fahrrad\nla voiture – das Auto',
  });
  expect(res.status).toBe(201);
  await env.flushBackground();
  return res.body.id;
}

const subjectNamed = (view: LibraryView, name: string) =>
  view.subjects.find((s) => s.name === name);

describe.skipIf(!dbReady)('Dein Material: a subject with everything there is for it', () => {
  let env: TestEnv;
  let lena: Learner;
  let other: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T14:00:00Z' });
    lena = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2014-02-10',
      pin: '4826',
    });
    other = await onboard(env, { name: 'Sam' });
  });
  afterEach(() => env.closeChecked());

  it('carries her sheets, the exercises that came from no sheet and the topics, per subject', async () => {
    await upload(env, lena, 'Europa');
    await typedExercise(
      env,
      lena,
      'Vokabeln Unit 3',
      { name: 'Französisch', kind: 'french' },
      'Verkehr',
    );

    const view = (await lena.api.get<LibraryView>('/materials')).body;
    const geography = subjectNamed(view, 'Erdkunde');
    const french = subjectNamed(view, 'Französisch');
    expect(geography?.materials.map((m) => m.title)).toEqual(['Europa']);
    expect([...(geography?.topics ?? [])].sort()).toEqual(['Flüsse', 'Hauptstädte']);
    // Nothing was typed for Erdkunde, so it has no exercise of its own kind.
    expect(geography?.exercises).toEqual([]);

    // The vocabulary she typed has no sheet: without this it would stand nowhere she can open.
    expect(french?.materials).toEqual([]);
    expect(french?.topics).toEqual(['Verkehr']);
    expect(french?.exercises).toHaveLength(1);
    expect(french?.exercises[0]).toMatchObject({ title: 'Vokabeln Unit 3', status: 'active' });
    expect(typeof french?.exercises[0]?.started_at).toBe('string');
    // What she is never shown: a tally of what is due or missed (rule 6). The view offers
    // none — no field here counts anything beyond the questions of one sheet.
    expect(Object.keys(french ?? {}).sort()).toEqual([
      'exercises',
      'id',
      'kind',
      'materials',
      'name',
      'topics',
    ]);
  });

  it("leaves a sheet's own practice to the sheet, and an abandoned exercise out", async () => {
    const materialId = await upload(env, lena, 'Europa');
    const fromSheet = await lena.api.post<SessionView>('/practice/sessions', {
      material_id: materialId,
      mode: 'practice',
    });
    expect(fromSheet.status).toBe(201);
    const typed = await typedExercise(
      env,
      lena,
      'Vokabeln Unit 3',
      { name: 'Französisch', kind: 'french' },
      'Verkehr',
    );

    let view = (await lena.api.get<LibraryView>('/materials')).body;
    // The sheet's practice is reached from the sheet (its "Üben"), so it does not stand twice.
    expect(subjectNamed(view, 'Erdkunde')?.exercises).toEqual([]);
    expect(subjectNamed(view, 'Erdkunde')?.materials[0]?.session_id).toBe(fromSheet.body.id);
    expect(subjectNamed(view, 'Französisch')?.exercises.map((e) => e.id)).toEqual([typed]);

    // Given up after a long pause: its screen has nothing to show, so it is not offered.
    await env.db.query(`update practice_sessions set status = 'abandoned' where id = $1`, [typed]);
    view = (await lena.api.get<LibraryView>('/materials')).body;
    expect(subjectNamed(view, 'Französisch')?.exercises).toEqual([]);
    expect(subjectNamed(view, 'Französisch')?.topics).toEqual(['Verkehr']);
  });

  it("keeps another learner's subjects, exercises and topics out of hers", async () => {
    await upload(env, lena, 'Europa');
    await typedExercise(
      env,
      lena,
      'Vokabeln Unit 3',
      { name: 'Französisch', kind: 'french' },
      'Verkehr',
    );
    await upload(env, other, 'Sams Blatt');
    await typedExercise(
      env,
      other,
      'Sams Liste',
      { name: 'Spanisch', kind: 'spanish' },
      'Sams Thema',
    );

    const hers = (await lena.api.get<LibraryView>('/materials')).body;
    const his = (await other.api.get<LibraryView>('/materials')).body;
    expect(hers.subjects.map((s) => s.name).sort()).toEqual(['Erdkunde', 'Französisch']);
    expect(his.subjects.map((s) => s.name).sort()).toEqual(['Erdkunde', 'Spanisch']);
    // Two learners, two Erdkunde: same name, never the same subject.
    const id = (view: LibraryView) => subjectNamed(view, 'Erdkunde')?.id;
    expect(id(hers)).not.toBe(id(his));
    const raw = JSON.stringify(hers);
    for (const his_ of ['Sams Blatt', 'Sams Liste', 'Sams Thema', 'Spanisch']) {
      expect(raw).not.toContain(his_);
    }
    expect(JSON.stringify(his)).not.toContain('Vokabeln Unit 3');
  });
});
