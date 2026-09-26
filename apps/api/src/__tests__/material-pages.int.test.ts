// A sheet of several pages where one could not be read completely (cut off,
// blurred, a photo of something else): the rest becomes questions, Lena is told
// which page is missing, and she photographs exactly that page again or says
// it is fine. Before, such a page was dropped without a word.
// docs/architecture.md §Material.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { BuddyHome, MaterialView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
  topic: 'Wortarten',
  difficulty: 2,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
});

const sheet = (pages: unknown, title = 'Nomen und Verben') => ({
  is_learning_material: true,
  readable: true,
  pages,
  title,
  subject: { name: 'Deutsch', kind: 'german' },
  extracted_text: 'Seite 1: Nomen. Seite 3: Verben.',
  items: [
    item('Ist „Hund“ ein Nomen oder ein Verb?', 'Nomen'),
    item('Ist „laufen“ ein Nomen oder ein Verb?', 'Verb'),
  ],
});

const WAIT = { json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null } };

async function send(
  env: TestEnv,
  l: Learner,
  opts: {
    photos: number;
    result: unknown;
    purpose?: 'study' | 'homework';
    completes?: string;
    requestId?: string;
  },
): Promise<MaterialView> {
  const purpose = opts.purpose ?? 'study';
  env.llm.script('extraction', { json: opts.result });
  if (purpose === 'study') env.llm.script('buddy_check', WAIT);
  const created = await l.api.post<{ material: MaterialView; uploads: Array<{ path: string }> }>(
    '/materials',
    {
      client_request_id: opts.requestId ?? randomUUID(),
      photo_mimes: Array.from({ length: opts.photos }, () => 'image/jpeg'),
      ...(opts.completes ? { completes: opts.completes } : { purpose }),
    },
  );
  expect(created.status).toBe(201);
  for (const u of created.body.uploads) env.storage.put(u.path);
  expect((await l.api.post(`/materials/${created.body.material.id}/submit`)).status).toBe(202);
  await env.flushBackground();
  return (await l.api.get<MaterialView>(`/materials/${created.body.material.id}`)).body;
}

async function contextVersion(env: TestEnv, learnerId: string): Promise<number> {
  const r = await env.db.one<{ context_version: number }>(
    `select context_version from buddy_settings where learner_id = $1`,
    [learnerId],
  );
  return r.context_version;
}

describe.skipIf(!dbReady)('pages Buddy could not read', () => {
  let env: TestEnv;
  let lena: Learner;
  let tom: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T14:00:00Z' });
    lena = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2014-02-10',
      pin: '4826',
    });
    tom = await onboard(env, { relation: 'child', name: 'Tom', birthDate: '2013-05-01' });
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

  it('keeps the readable pages and tells her exactly which page is missing', async () => {
    const m = await send(env, lena, {
      photos: 3,
      result: sheet([
        { page: 1, read: 'all', problem: null },
        { page: 2, read: 'part', problem: 'cut_off' },
        // Repeated, and a page that does not exist: only real pages, each once.
        { page: 2, read: 'none', problem: 'blurry' },
        { page: 7, read: 'none', problem: 'dark' },
        { page: 3, read: 'all', problem: null },
      ]),
    });
    expect(m).toMatchObject({
      status: 'ready',
      item_count: 2,
      photo_count: 3,
      page_problems: [{ page: 2, read: 'part', problem: 'cut_off' }],
    });
    const home = (await lena.api.get<BuddyHome>('/buddy')).body;
    expect(home.now).toEqual({
      type: 'pages_missing',
      material_id: m.id,
      title: 'Nomen und Verben',
      photo_count: 3,
      pages: [{ page: 2, read: 'part', problem: 'cut_off' }],
    });
    // Tom sees nothing of it and cannot answer it for her.
    expect((await tom.api.get<BuddyHome>('/buddy')).body.now).toBeNull();
    expect((await tom.api.post(`/materials/${m.id}/pages-ok`)).status).toBe(404);
    expect((await lena.api.get<BuddyHome>('/buddy')).body.now?.type).toBe('pages_missing');
  });

  it('"Passt so" ends the notice once; a repeat changes nothing', async () => {
    const m = await send(env, lena, {
      photos: 2,
      result: sheet([{ page: 2, read: 'none', problem: 'dark' }]),
    });
    const before = await contextVersion(env, lena.learnerId);
    const ok = await lena.api.post<MaterialView>(`/materials/${m.id}/pages-ok`);
    expect(ok.status).toBe(200);
    expect(ok.body.page_problems).toEqual([]);
    expect(await contextVersion(env, lena.learnerId)).toBe(before + 1);
    // A retry after a lost answer: fine, nothing changes.
    expect((await lena.api.post(`/materials/${m.id}/pages-ok`)).status).toBe(200);
    expect(await contextVersion(env, lena.learnerId)).toBe(before + 1);
    expect((await lena.api.get<BuddyHome>('/buddy')).body.now?.type).not.toBe('pages_missing');
    expect((await lena.api.post(`/materials/not-an-id/pages-ok`)).status).toBe(422);
  });

  it('the page photographed again ends the notice and keeps homework and goal', async () => {
    const [goal] = await env.db.query<{ id: string }>(
      `insert into buddy_goals (learner_id, kind, title, due_date, status)
       values ($1, 'exam', 'Deutscharbeit', '2026-10-05', 'active') returning id`,
      [lena.learnerId],
    );
    const hw = await send(env, lena, {
      photos: 2,
      purpose: 'homework',
      result: sheet([{ page: 2, read: 'part', problem: 'covered' }], 'Hausaufgabe Wortarten'),
    });
    await env.db.query(`update materials set goal_id = $2 where id = $1`, [hw.id, goal!.id]);
    // The notice comes before the help session that is waiting, then the session.
    let home = (await lena.api.get<BuddyHome>('/buddy')).body;
    expect(home.now?.type).toBe('pages_missing');

    // Tom cannot attach his photos to her sheet.
    expect(
      (
        await tom.api.post('/materials', {
          client_request_id: randomUUID(),
          photo_mimes: ['image/jpeg'],
          completes: hw.id,
        })
      ).status,
    ).toBe(404);

    const requestId = randomUUID();
    const again = await send(env, lena, {
      photos: 1,
      completes: hw.id,
      requestId,
      purpose: 'homework',
      result: sheet([{ page: 1, read: 'all', problem: null }], 'Hausaufgabe Wortarten 2'),
    });
    expect(again).toMatchObject({ status: 'ready', purpose: 'homework', goal_id: goal!.id });
    expect(again.session_id).not.toBeNull();
    expect((await lena.api.get<MaterialView>(`/materials/${hw.id}`)).body.page_problems).toEqual(
      [],
    );
    home = (await lena.api.get<BuddyHome>('/buddy')).body;
    expect(home.now).toMatchObject({ type: 'resume_practice', mode: 'help' });
    // The same request again (its answer was lost): the same material, nothing new.
    const repeat = await lena.api.post<{ material: MaterialView; uploads: unknown[] }>(
      '/materials',
      { client_request_id: requestId, photo_mimes: ['image/jpeg'], completes: hw.id },
    );
    expect(repeat.body.material.id).toBe(again.id);
    expect(repeat.body.uploads).toEqual([]);
  });

  it('one cut-off page does not cost the whole sheet, even if the model says "unreadable"', async () => {
    const kept = await send(env, lena, {
      photos: 2,
      result: {
        ...sheet([
          { page: 1, read: 'all', problem: null },
          { page: 2, read: 'part', problem: 'cut_off' },
        ]),
        readable: false,
      },
    });
    expect(kept).toMatchObject({
      status: 'ready',
      item_count: 2,
      page_problems: [{ page: 2, read: 'part', problem: 'cut_off' }],
    });
    // Nothing read on any page (or no page report): unreadable, as before.
    env.llm.script('extraction', {
      json: { ...sheet([{ page: 1, read: 'none', problem: 'dark' }]), readable: false },
    });
    const created = await lena.api.post<{ material: MaterialView; uploads: { path: string }[] }>(
      '/materials',
      { client_request_id: randomUUID(), photo_mimes: ['image/jpeg'] },
    );
    for (const u of created.body.uploads) env.storage.put(u.path);
    await lena.api.post(`/materials/${created.body.material.id}/submit`);
    await env.flushBackground();
    expect(
      (await lena.api.get<MaterialView>(`/materials/${created.body.material.id}`)).body,
    ).toMatchObject({ status: 'failed', failure_reason: 'unreadable' });
  });

  it('a broken page report costs no questions, and an old notice goes away by itself', async () => {
    const broken = await send(env, lena, {
      photos: 2,
      result: sheet([{ page: 'zwei', read: 'maybe' }]),
    });
    expect(broken).toMatchObject({ status: 'ready', item_count: 2, page_problems: [] });
    expect((await lena.api.get<BuddyHome>('/buddy')).body.now?.type).not.toBe('pages_missing');

    await send(env, lena, {
      photos: 2,
      result: sheet([{ page: 1, read: 'none', problem: 'not_material' }]),
    });
    expect((await lena.api.get<BuddyHome>('/buddy')).body.now?.type).toBe('pages_missing');
    // A day later the sheet is no longer at hand: no nagging.
    env.clock.advance(25 * 3_600_000);
    expect((await lena.api.get<BuddyHome>('/buddy')).body.now?.type).not.toBe('pages_missing');
  });
});
