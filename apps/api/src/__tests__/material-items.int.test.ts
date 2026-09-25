// The questions of one material: listed without solutions and with the latest
// result, a bad one deleted, the material renamed, and "Frage passt nicht" in
// practice — each scoped to the learner, with the failure paths.
// docs/architecture.md §Material, §Practice.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type {
  LibraryView,
  MaterialItemsView,
  MaterialView,
  SessionView,
} from '@learnbuddy/shared-types/contracts';
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

const FRANCE = 'Hauptstadt von Frankreich?';
const ITALY = 'Welche Stadt ist die Hauptstadt von Italien?';
const RIVER = 'Wie heißt der längste Fluss Europas?';

const europe = (purpose: 'study' | 'homework' = 'study') => ({
  is_learning_material: true,
  readable: true,
  title: purpose === 'homework' ? 'Hausaufgabe Europa' : 'Europa',
  subject: { name: 'Erdkunde', kind: 'geography' },
  extracted_text: 'Europa: Hauptstädte und Flüsse',
  items: [
    item({ prompt: FRANCE, answer: 'Paris', topic: 'Hauptstädte' }),
    item({
      kind: 'multiple_choice',
      prompt: ITALY,
      answer: 'Rom',
      choices: ['Mailand', 'Rom'],
      correct_choice: 1,
      topic: 'Hauptstädte',
    }),
    item({ prompt: RIVER, answer: 'Wolga', topic: 'Flüsse' }),
  ],
});

const WAIT = { json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null } };

async function upload(
  env: TestEnv,
  l: Learner,
  purpose: 'study' | 'homework' = 'study',
): Promise<string> {
  env.llm.script('extraction', { json: europe(purpose) });
  if (purpose === 'study') env.llm.script('buddy_check', WAIT);
  const created = await l.api.post<{ material: MaterialView; uploads: Array<{ path: string }> }>(
    '/materials',
    { client_request_id: randomUUID(), photo_mimes: ['image/jpeg'], purpose },
  );
  expect(created.status).toBe(201);
  for (const u of created.body.uploads) env.storage.put(u.path);
  expect((await l.api.post(`/materials/${created.body.material.id}/submit`)).status).toBe(202);
  await env.flushBackground();
  return created.body.material.id;
}

async function contextVersion(env: TestEnv, learnerId: string): Promise<number> {
  const r = await env.db.one<{ context_version: number }>(
    `select context_version from buddy_settings where learner_id = $1`,
    [learnerId],
  );
  return r.context_version;
}

describe.skipIf(!dbReady)('the questions of a material', () => {
  let env: TestEnv;
  let lena: Learner;
  let other: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T14:00:00Z' });
    lena = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2014-02-10',
      pin: '4826',
    });
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

  it('lists her questions with the latest result and never a solution', async () => {
    const id = await upload(env, lena);
    let list = await lena.api.get<MaterialItemsView>(`/materials/${id}/items`);
    expect(list.status).toBe(200);
    expect(list.body.material).toMatchObject({ id, title: 'Europa', item_count: 3 });
    expect(list.body.items.map((i) => [i.prompt, i.kind, i.topic, i.result])).toEqual([
      [FRANCE, 'short', 'Hauptstädte', 'never_asked'],
      [ITALY, 'multiple_choice', 'Hauptstädte', 'never_asked'],
      [RIVER, 'short', 'Flüsse', 'never_asked'],
    ]);
    // Choices are shown; which one is right is not. No answers anywhere.
    expect(list.body.items[1]!.choices).toEqual(['Mailand', 'Rom']);
    for (const i of list.body.items) {
      expect(Object.keys(i)).not.toContain('answer');
      expect(Object.keys(i)).not.toContain('correct_choice');
      expect(Object.keys(i)).not.toContain('accepted_answers');
    }
    const raw = JSON.stringify(list.body);
    expect(raw).not.toContain('Paris');
    expect(raw).not.toContain('Wolga');

    // Practise: right at once, right after a wrong try, the solution shown.
    const s = (
      await lena.api.post<SessionView>('/practice/sessions', { material_id: id, mode: 'practice' })
    ).body;
    const idOf = (prompt: string) => s.items.find((x) => x.item.prompt === prompt)!.item.id;
    const answer = (itemId: string, body: Record<string, unknown>) =>
      lena.api.post(`/practice/sessions/${s.id}/answer`, {
        client_turn_id: randomUUID(),
        item_id: itemId,
        ...body,
      });
    expect((await answer(idOf(FRANCE), { text: 'Paris' })).status).toBe(200);
    env.llm.script('tutor', {
      json: {
        intent: 'answer',
        verdict: 'incorrect',
        reply: 'Schau nochmal auf die Karte.',
        gave_hint: true,
        revealed_answer: false,
      },
    });
    expect((await answer(idOf(ITALY), { choice: 0 })).status).toBe(200);
    expect((await answer(idOf(ITALY), { choice: 1 })).status).toBe(200);
    expect(
      (await lena.api.post(`/practice/sessions/${s.id}/reveal`, { item_id: idOf(RIVER) })).status,
    ).toBe(200);

    list = await lena.api.get<MaterialItemsView>(`/materials/${id}/items`);
    expect(list.body.items.map((i) => [i.prompt, i.result])).toEqual([
      [FRANCE, 'first_try'],
      [ITALY, 'with_help'],
      [RIVER, 'not_known'],
    ]);
    // Even once revealed in practice, the list carries no solution.
    expect(JSON.stringify(list.body)).not.toContain('Wolga');
  });

  it('shows an empty list for material not read yet, and 404 for unknown or foreign ids', async () => {
    const created = await lena.api.post<{ material: MaterialView }>('/materials', {
      client_request_id: randomUUID(),
      photo_mimes: ['image/jpeg'],
    });
    const pending = await lena.api.get<MaterialItemsView>(
      `/materials/${created.body.material.id}/items`,
    );
    expect(pending.status).toBe(200);
    expect(pending.body).toMatchObject({
      material: { status: 'awaiting_upload' },
      items: [],
    });

    const id = await upload(env, lena);
    expect((await other.api.get(`/materials/${id}/items`)).status).toBe(404);
    expect((await lena.api.get(`/materials/${randomUUID()}/items`)).status).toBe(404);
    expect((await lena.api.get(`/materials/not-a-uuid/items`)).status).toBe(422);
    // A deleted material has no questions to list.
    expect((await lena.api.delete(`/materials/${id}`)).status).toBe(204);
    expect((await lena.api.get(`/materials/${id}/items`)).status).toBe(404);
  });

  it('deletes a bad question for good: idempotent, out of practice, scoped to her', async () => {
    const id = await upload(env, lena);
    const list = (await lena.api.get<MaterialItemsView>(`/materials/${id}/items`)).body;
    const river = list.items.find((i) => i.prompt === RIVER)!.id;

    // Not hers, not this material's, not known: 404, and nothing changes.
    const theirs = await upload(env, other);
    expect((await other.api.delete(`/materials/${id}/items/${river}`)).status).toBe(404);
    expect((await other.api.delete(`/materials/${theirs}/items/${river}`)).status).toBe(404);
    expect((await lena.api.delete(`/materials/${theirs}/items/${river}`)).status).toBe(404);
    expect((await lena.api.delete(`/materials/${id}/items/${randomUUID()}`)).status).toBe(404);
    const second = await upload(env, lena);
    expect((await lena.api.delete(`/materials/${second}/items/${river}`)).status).toBe(404);
    expect(
      (
        await env.db.one<{ archived_at: Date | null }>(
          `select archived_at from items where id = $1`,
          [river],
        )
      ).archived_at,
    ).toBeNull();

    const before = await contextVersion(env, lena.learnerId);
    expect((await lena.api.delete(`/materials/${id}/items/${river}`)).status).toBe(204);
    expect(await contextVersion(env, lena.learnerId)).toBe(before + 1);
    // Deleting it again is fine and changes nothing.
    expect((await lena.api.delete(`/materials/${id}/items/${river}`)).status).toBe(204);
    expect(await contextVersion(env, lena.learnerId)).toBe(before + 1);

    const after = (await lena.api.get<MaterialItemsView>(`/materials/${id}/items`)).body;
    expect(after.items.map((i) => i.prompt)).toEqual([FRANCE, ITALY]);
    expect(after.material.item_count).toBe(2);
    const library = (await lena.api.get<LibraryView>('/materials')).body;
    const card = library.subjects.flatMap((x) => x.materials).find((m) => m.id === id);
    expect(card?.item_count).toBe(2);

    // Practice never picks it again.
    const s = await lena.api.post<SessionView>('/practice/sessions', {
      material_id: id,
      mode: 'practice',
    });
    expect(s.status).toBe(201);
    expect(s.body.items.map((i) => i.item.prompt).sort()).toEqual([FRANCE, ITALY].sort());
  });

  it('renames a material: trimmed, 1–120 characters, only her own', async () => {
    const id = await upload(env, lena);
    const before = await contextVersion(env, lena.learnerId);
    const renamed = await lena.api.patch<MaterialView>(`/materials/${id}`, {
      title: '  Europa – Test Freitag  ',
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ id, title: 'Europa – Test Freitag' });
    expect(await contextVersion(env, lena.learnerId)).toBe(before + 1);
    // The same title again changes nothing.
    expect(
      (await lena.api.patch(`/materials/${id}`, { title: 'Europa – Test Freitag' })).status,
    ).toBe(200);
    expect(await contextVersion(env, lena.learnerId)).toBe(before + 1);
    const library = (await lena.api.get<LibraryView>('/materials')).body;
    expect(library.subjects.flatMap((x) => x.materials).find((m) => m.id === id)?.title).toBe(
      'Europa – Test Freitag',
    );

    for (const title of ['', '   ', 'x'.repeat(121)]) {
      const bad = await lena.api.patch(`/materials/${id}`, { title });
      expect(bad.status).toBe(422);
    }
    expect((await lena.api.patch(`/materials/${id}`, {})).status).toBe(422);
    expect((await lena.api.patch(`/materials/${id}`, { title: 'x'.repeat(120) })).status).toBe(200);

    expect((await other.api.patch(`/materials/${id}`, { title: 'Meins' })).status).toBe(404);
    expect((await lena.api.patch(`/materials/${randomUUID()}`, { title: 'Neu' })).status).toBe(404);
    const row = await env.db.one<{ title: string }>(`select title from materials where id = $1`, [
      id,
    ]);
    expect(row.title).toBe('x'.repeat(120));
  });

  it('"Frage passt nicht" skips it here without FSRS and archives it for later', async () => {
    const id = await upload(env, lena);
    const s = (
      await lena.api.post<SessionView>('/practice/sessions', { material_id: id, mode: 'practice' })
    ).body;
    const idOf = (prompt: string) => s.items.find((x) => x.item.prompt === prompt)!.item.id;
    const river = idOf(RIVER);

    // Not hers, not in this session, unknown: 404.
    expect((await other.api.post(`/practice/sessions/${s.id}/items/${river}/flag`)).status).toBe(
      404,
    );
    expect(
      (await lena.api.post(`/practice/sessions/${s.id}/items/${randomUUID()}/flag`)).status,
    ).toBe(404);
    expect(
      (await lena.api.post(`/practice/sessions/${randomUUID()}/items/${river}/flag`)).status,
    ).toBe(404);

    const before = await contextVersion(env, lena.learnerId);
    const flagged = await lena.api.post<SessionView>(
      `/practice/sessions/${s.id}/items/${river}/flag`,
    );
    expect(flagged.status).toBe(200);
    expect(flagged.body.items.find((x) => x.item.id === river)).toMatchObject({
      status: 'skipped',
    });
    expect(flagged.body.current_item_id).not.toBe(river);
    expect(await contextVersion(env, lena.learnerId)).toBe(before + 1);
    // Twice is fine.
    expect((await lena.api.post(`/practice/sessions/${s.id}/items/${river}/flag`)).status).toBe(
      200,
    );
    expect(await contextVersion(env, lena.learnerId)).toBe(before + 1);

    // No spaced-repetition review for it; it is archived.
    expect(await env.db.query(`select 1 from item_states where item_id = $1`, [river])).toEqual([]);
    const row = await env.db.one<{ archived_at: Date | null }>(
      `select archived_at from items where id = $1`,
      [river],
    );
    expect(row.archived_at).not.toBeNull();

    // The rest is answered; the flagged one is neither answered nor shaky.
    for (const [prompt, body] of [
      [FRANCE, { text: 'Paris' }],
      [ITALY, { choice: 1 }],
    ] as const) {
      const r = await lena.api.post(`/practice/sessions/${s.id}/answer`, {
        client_turn_id: randomUUID(),
        item_id: idOf(prompt),
        ...body,
      });
      expect(r.status).toBe(200);
    }
    env.llm.script('buddy_check', WAIT);
    const finished = await lena.api.post<SessionView>(`/practice/sessions/${s.id}/finish`);
    await env.flushBackground();
    expect(finished.body.summary).toEqual({
      answered: 2,
      first_try: 2,
      secure_topics: ['Hauptstädte'],
      shaky_topics: [],
    });
    // A finished session takes no more flags.
    expect(
      (await lena.api.post(`/practice/sessions/${s.id}/items/${idOf(FRANCE)}/flag`)).status,
    ).toBe(409);

    // Gone from the material's list and from new practice.
    const list = (await lena.api.get<MaterialItemsView>(`/materials/${id}/items`)).body;
    expect(list.items.map((i) => i.prompt)).toEqual([FRANCE, ITALY]);
    const again = (
      await lena.api.post<SessionView>('/practice/sessions', { material_id: id, mode: 'practice' })
    ).body;
    expect(again.items.map((i) => i.item.id)).not.toContain(river);
  });

  it('refuses "Frage passt nicht" for homework help and while a test runs', async () => {
    const homework = await upload(env, lena, 'homework');
    const hw = (await lena.api.get<MaterialView>(`/materials/${homework}`)).body;
    const help = (await lena.api.get<SessionView>(`/practice/sessions/${hw.session_id}`)).body;
    expect(help.mode).toBe('help');
    const task = help.items[0]!.item.id;
    const refused = await lena.api.post(`/practice/sessions/${help.id}/items/${task}/flag`);
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ error: { details: { reason: 'flag_not_allowed' } } });

    const id = await upload(env, lena);
    const test = (
      await lena.api.post<SessionView>('/practice/sessions', { material_id: id, mode: 'test' })
    ).body;
    expect(test.mode).toBe('test');
    const q = test.items[0]!.item.id;
    const inTest = await lena.api.post(`/practice/sessions/${test.id}/items/${q}/flag`);
    expect(inTest.status).toBe(409);
    expect(inTest.body).toMatchObject({ error: { details: { reason: 'flag_not_allowed' } } });

    // Nothing was taken out.
    const archived = await env.db.query(
      `select 1 from items where id = any($1::uuid[]) and archived_at is not null`,
      [[task, q]],
    );
    expect(archived).toEqual([]);
    const open = await env.db.query<{ status: string }>(
      `select status from session_items where item_id = any($1::uuid[])`,
      [[task, q]],
    );
    expect(open.every((r) => r.status === 'open')).toBe(true);
  });
});
