// Her photo as her message in the conversation (issue #632, #630 point 4): a sheet she sends is
// her message the moment it goes off, where its reading stands comes from the material row each
// time the thread is read, and Buddy's "Blatt bereit" follows it in time with the start of the
// practice it announces. Failure paths: a repeated submit, an upload that never finished, a reading
// that failed, a sheet deleted since, another learner's sheet. docs/architecture.md §Material.
// requires live verification in Claude Code session (needs a running Postgres; the model and
// Storage are the harness's fakes)

import { randomUUID } from 'node:crypto';

import type { BuddyHome, MessageView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LlmError } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const item = (prompt: string, answer: string) => ({
  kind: 'short',
  prompt,
  answer,
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Hauptstädte',
  difficulty: 2,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
});

const SHEET = {
  json: {
    is_learning_material: true,
    readable: true,
    pages: [],
    title: 'Hauptstädte',
    subject: { name: 'Erdkunde', kind: 'geography' },
    extracted_text: 'Hauptstädte Europas',
    items: [
      item('Hauptstadt von Frankreich?', 'Paris'),
      item('Hauptstadt von Italien?', 'Rom'),
      item('Hauptstadt von Spanien?', 'Madrid'),
    ],
  },
};

const WAIT = { json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null } };

/** Reserved and uploaded (all pages, or only the first), not yet submitted. */
async function reserve(
  env: TestEnv,
  l: Learner,
  opts: { pages?: number; uploaded?: 'all' | 'first' } = {},
): Promise<string> {
  const created = await l.api.post<{ material: { id: string }; uploads: Array<{ path: string }> }>(
    '/materials',
    {
      client_request_id: randomUUID(),
      photo_mimes: Array.from({ length: opts.pages ?? 2 }, () => 'image/jpeg'),
      sending: true,
    },
  );
  expect(created.status).toBe(201);
  const uploads = created.body.uploads;
  for (const u of opts.uploaded === 'first' ? uploads.slice(0, 1) : uploads)
    env.storage.put(u.path);
  return created.body.material.id;
}

async function thread(l: Learner): Promise<MessageView[]> {
  const home = await l.api.get<BuddyHome>('/buddy');
  expect(home.status).toBe(200);
  return home.body.thread;
}

const sheetsIn = (messages: MessageView[]) => messages.filter((m) => m.sheet);

describe.skipIf(!dbReady)('her sheet as her message in the conversation (issue #632)', () => {
  let env: TestEnv;
  let lena: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-14T14:00:00Z' });
    lena = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    env.llm.byDefault('buddy_check', WAIT);
  });
  afterEach(() => env.closeChecked());

  it('is her message the moment it goes off, with no text and no image, and says where it stands', async () => {
    env.holdBackground();
    const id = await reserve(env, lena);
    // Reserved and uploaded, not yet sent: nothing of hers in the conversation yet.
    expect(sheetsIn(await thread(lena))).toEqual([]);
    expect((await lena.api.post(`/materials/${id}/submit`)).status).toBe(202);
    const sent = sheetsIn(await thread(lena));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      role: 'learner',
      text: '',
      status: 'done',
      sheet: { material_id: id, pages: 2, stage: 'waiting' },
      created_at: '2026-10-14T14:00:00.000Z',
    });
    // The row points at the material and copies nothing of it.
    const row = await env.db.one<Record<string, unknown>>(
      `select * from buddy_messages where material_id = $1`,
      [id],
    );
    expect(row).toMatchObject({ role: 'learner', text: '', ask: null, outreach_id: null });

    env.llm.script('extraction', SHEET);
    await env.flushBackground();
    expect(sheetsIn(await thread(lena))[0]?.sheet).toMatchObject({ stage: 'ready' });
  });

  it('is never told to the model as an empty line of hers', async () => {
    const id = await reserve(env, lena, { pages: 1 });
    env.llm.script('extraction', SHEET);
    expect((await lena.api.post(`/materials/${id}/submit`)).status).toBe(202);
    await env.flushBackground();
    env.llm.script('buddy_turn', { json: { reply: 'Schön!', options: null, actions: [] } });
    const res = await lena.api.post('/buddy/messages', {
      client_message_id: randomUUID(),
      text: 'hab dir mein blatt geschickt',
    });
    expect(res.status).toBe(200);
    const roles = (await thread(lena)).map((m) => [m.role, m.text, Boolean(m.sheet)]);
    expect(roles.slice(0, 2)).toEqual([
      ['learner', '', true],
      ['learner', 'hab dir mein blatt geschickt', false],
    ]);
    const call = env.llm.callsFor('buddy_turn').at(-1)!;
    const learnerTurns = call.contents.filter((c) => c.role === 'user');
    expect(learnerTurns.some((c) => c.parts.some((p) => 'text' in p && p.text === ''))).toBe(false);
  });

  it('writes one message, also when the submit is repeated', async () => {
    env.llm.script('extraction', SHEET);
    const id = await reserve(env, lena);
    expect((await lena.api.post(`/materials/${id}/submit`)).status).toBe(202);
    expect((await lena.api.post(`/materials/${id}/submit`)).status).toBe(202);
    await env.flushBackground();
    expect((await lena.api.post(`/materials/${id}/submit`)).status).toBe(202);
    expect(sheetsIn(await thread(lena))).toHaveLength(1);
  });

  it('writes nothing while the photos have not all arrived, and one message once they have', async () => {
    const id = await reserve(env, lena, { uploaded: 'first' });
    const refused = await lena.api.post<{ error: { reason: string } }>(`/materials/${id}/submit`);
    expect(refused.status).toBe(422);
    expect(sheetsIn(await thread(lena))).toEqual([]);
    // The app sends the missing page again with the same reservation.
    const paths = await env.db.query<{ storage_path: string }>(
      `select storage_path from material_photos where material_id = $1`,
      [id],
    );
    for (const p of paths) env.storage.put(p.storage_path);
    env.llm.script('extraction', SHEET);
    expect((await lena.api.post(`/materials/${id}/submit`)).status).toBe(202);
    await env.flushBackground();
    expect(sheetsIn(await thread(lena))).toHaveLength(1);
  });

  it('says a sheet was not read when the reading failed, and that it is gone once deleted', async () => {
    env.llm.script('extraction', {
      json: { ...SHEET.json, is_learning_material: false, items: [] },
    });
    const failed = await reserve(env, lena);
    expect((await lena.api.post(`/materials/${failed}/submit`)).status).toBe(202);
    await env.flushBackground();
    const afterFail = sheetsIn(await thread(lena));
    expect(afterFail[0]?.sheet).toMatchObject({ material_id: failed, stage: 'failed' });
    // The failure card with its way on still comes from the home (`material_failed`).
    expect((await lena.api.get<BuddyHome>('/buddy')).body.now).toMatchObject({
      type: 'material_failed',
      material_id: failed,
    });

    env.llm.script('extraction', SHEET);
    const read = await reserve(env, lena);
    expect((await lena.api.post(`/materials/${read}/submit`)).status).toBe(202);
    await env.flushBackground();
    expect((await lena.api.delete(`/materials/${read}`)).status).toBe(204);
    const deleted = sheetsIn(await thread(lena)).find((m) => m.sheet?.material_id === read);
    expect(deleted?.sheet).toMatchObject({ stage: 'deleted' });
  });

  it('says nothing is happening when no reading run is alive', async () => {
    env.holdBackground();
    const id = await reserve(env, lena);
    expect((await lena.api.post(`/materials/${id}/submit`)).status).toBe(202);
    // The run is gone (parked by an operator, say) while the row still says queued.
    await env.db.query(
      `update jobs set status = 'failed' where kind = 'extract_material' and payload ->> 'material_id' = $1`,
      [id],
    );
    expect(sheetsIn(await thread(lena))[0]?.sheet).toMatchObject({ stage: null });
    await env.flushBackground();
  });

  it("never shows or takes another learner's sheet", async () => {
    const tom = await onboard(env, { relation: 'child', name: 'Tom', birthDate: '2013-05-01' });
    env.llm.script('extraction', SHEET);
    const id = await reserve(env, lena);
    // Tom submits Lena's sheet: not found, and nothing is written for either of them.
    expect((await tom.api.post(`/materials/${id}/submit`)).status).toBe(404);
    expect(sheetsIn(await thread(tom))).toEqual([]);
    expect(sheetsIn(await thread(lena))).toEqual([]);
    expect((await lena.api.post(`/materials/${id}/submit`)).status).toBe(202);
    await env.flushBackground();
    expect(sheetsIn(await thread(tom))).toEqual([]);
    expect(sheetsIn(await thread(lena))).toHaveLength(1);
  });

  it('puts "Blatt bereit" after her sheet, with the start of the practice it announces', async () => {
    // The model is briefly down: the fixed fallback prepares practice and says the sheet is ready.
    env.llm.script('buddy_check', { error: new LlmError('unavailable', 'overloaded') });
    env.llm.script('extraction', SHEET);
    const id = await reserve(env, lena);
    expect((await lena.api.post(`/materials/${id}/submit`)).status).toBe(202);
    await env.flushBackground();
    const messages = await thread(lena);
    const mine = messages.findIndex((m) => m.sheet?.material_id === id);
    const ready = messages.findIndex((m) => m.outreach?.kind === 'result');
    expect(mine).toBeGreaterThanOrEqual(0);
    expect(ready).toBeGreaterThan(mine);
    const home = (await lena.api.get<BuddyHome>('/buddy')).body;
    expect(home.now).toMatchObject({ type: 'practice_ready' });
    const stepId = home.now?.type === 'practice_ready' ? home.now.step_id : null;
    expect(messages[ready]?.announces).toMatchObject({ step_id: stepId, question_count: 3 });

    // Started: nothing waits any more, so the card has nothing to start.
    expect((await lena.api.post(`/buddy/steps/${stepId}/start`)).status).toBe(200);
    const after = (await thread(lena)).find((m) => m.outreach?.kind === 'result');
    expect(after?.announces ?? null).toBeNull();
  });
});
