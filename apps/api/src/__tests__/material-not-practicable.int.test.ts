// A sheet whose task is an exercise form Buddy has no exercise for (issue #198):
// the practicable part stays practicable, the rest is NAMED instead of quietly turned into
// other questions, and a sheet that is nothing but such tasks fails with its own reason —
// photos kept, no second reading offered. docs/architecture.md §Material,
// docs/lehrplan-und-uebungsformen.md §12.3.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type {
  BuddyHome,
  MaterialItemsView,
  MaterialView,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import {
  createTestEnv,
  onboard,
  TEST_TICK_SECRET,
  type Learner,
  type TestEnv,
} from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();
const DAY = 86_400_000;

const WAIT = { json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null } };

/** One sum with a key that agrees with it, so nothing is dropped for its own reasons (#157). */
const sum = (a: number, b: number) => ({
  kind: 'numeric',
  prompt: `${a} + ${b}`,
  answer: String(a + b),
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Addition',
  difficulty: 2,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
});

const ESSAY = 'Erörtern Sie, ob Hausaufgaben abgeschafft werden sollten';
const CONSTRUCTION = 'Konstruiere das Dreieck ABC mit Zirkel und Lineal';

async function tick(env: TestEnv): Promise<void> {
  const res = await env.app.request('/v1/internal/tick', {
    method: 'POST',
    headers: { 'x-tick-secret': TEST_TICK_SECRET },
  });
  expect(res.status).toBe(200);
}

/** Photograph a sheet and let the reading return exactly this answer. */
async function send(
  env: TestEnv,
  l: Learner,
  result: unknown,
): Promise<{ id: string; paths: string[]; view: MaterialView }> {
  env.llm.script('extraction', { json: result });
  const created = await l.api.post<{ material: MaterialView; uploads: Array<{ path: string }> }>(
    '/materials',
    { client_request_id: randomUUID(), photo_mimes: ['image/jpeg'], purpose: 'study' },
  );
  expect(created.status).toBe(201);
  const id = created.body.material.id;
  const paths = created.body.uploads.map((u) => u.path);
  for (const p of paths) env.storage.put(p);
  expect((await l.api.post(`/materials/${id}/submit`)).status).toBe(202);
  await env.flushBackground();
  return { id, paths, view: (await l.api.get<MaterialView>(`/materials/${id}`)).body };
}

/** What Buddy really sees this turn: the STATE block as it reached the model. */
async function stateBlock(env: TestEnv, l: Learner): Promise<string> {
  env.llm.script('buddy_turn', { json: { reply: 'Schau ich nach.', options: null, actions: [] } });
  const res = await l.api.post('/buddy/messages', {
    client_message_id: randomUUID(),
    text: 'was ist mit meinem blatt',
  });
  expect(res.status).toBe(200);
  return ScriptedGateway.textOf(env.llm.callsFor('buddy_turn').at(-1)!);
}

describe.skipIf(!dbReady)('an exercise form Buddy cannot practise', () => {
  let env: TestEnv;
  let lena: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T14:00:00Z' });
    lena = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    env.llm.byDefault('buddy_check', WAIT);
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

  it('keeps the five sums of a mixed sheet and names the sixth task instead of inventing questions', async () => {
    const m = await send(env, lena, {
      is_learning_material: true,
      readable: true,
      pages: [{ page: 1, read: 'all', problem: null }],
      title: 'Übungsblatt 7',
      subject: { name: 'Mathe', kind: 'math' },
      extracted_text: 'Fünf Additionsaufgaben und eine Erörterung',
      items: [sum(2, 3), sum(4, 5), sum(6, 7), sum(8, 9), sum(10, 11)],
      not_practicable: [{ task: ESSAY, form: 'long_text' }],
    });

    // The sheet is ready: nothing about it failed, and the practicable part is practicable.
    expect(m.view).toMatchObject({ status: 'ready', failure_reason: null, item_count: 5 });
    expect(m.view.not_practicable).toEqual([{ task: ESSAY, form: 'long_text' }]);
    const items = await lena.api.get<MaterialItemsView>(`/materials/${m.id}/items`);
    expect(items.body.items.map((i) => i.prompt)).toEqual([
      '2 + 3',
      '4 + 5',
      '6 + 7',
      '8 + 9',
      '10 + 11',
    ]);
    // Six questions would have been the silent substitution: the essay never became one.
    expect(items.body.items.some((i) => i.prompt.includes('Erörtern'))).toBe(false);
    expect(items.body.material.not_practicable).toEqual([{ task: ESSAY, form: 'long_text' }]);

    // Buddy can say WHICH task, in the words she read on her sheet.
    const state = await stateBlock(env, lena);
    expect(state).toContain(ESSAY);
    expect(state).toContain('long_text');

    // The column only ever holds a list (migration 0067): anything else is refused by the
    // database, not repaired later.
    await expect(
      env.db.query(`update materials set not_practicable = '"keine"'::jsonb where id = $1`, [m.id]),
    ).rejects.toThrow(/not_practicable/);
  });

  it('fails a sheet that is nothing but such a task with its own reason, keeps its photos and refuses a second reading', async () => {
    const m = await send(env, lena, {
      is_learning_material: true,
      readable: true,
      pages: [{ page: 1, read: 'all', problem: null }],
      title: 'Konstruktion',
      subject: { name: 'Mathe', kind: 'math' },
      extracted_text: 'Konstruktionsaufgabe',
      items: [],
      not_practicable: [{ task: CONSTRUCTION, form: 'drawing' }],
    });
    expect(m.view).toMatchObject({
      status: 'failed',
      failure_reason: 'form_not_practicable',
      item_count: 0,
    });
    // The task is kept on the failed sheet too, or the card could not say what it was about.
    expect(m.view.not_practicable).toEqual([{ task: CONSTRUCTION, form: 'drawing' }]);
    // And the home card never offers "Nochmal lesen" the API would decline.
    const home = await lena.api.get<BuddyHome>('/buddy');
    expect(home.body.now).toMatchObject({
      type: 'material_failed',
      reason: 'form_not_practicable',
      retryable: false,
    });

    // The photos stay for the normal retention: the sheet is valid, she may want to look at
    // it (unlike a letter or a sheet the safety filter refused, whose photos go at once).
    const purge = await env.db.one<{ run_at: Date }>(
      `select run_at from jobs where kind = 'purge_photos' and payload ->> 'material_id' = $1`,
      [m.id],
    );
    expect(purge.run_at.getTime()).toBeGreaterThan(env.clock.now().getTime() + 6 * DAY);
    expect(m.view.photos_deleted).toBe(false);
    env.clock.advance(DAY);
    await tick(env);
    expect(m.paths.every((p) => env.storage.objects.has(p))).toBe(true);

    // Reading it again would find the same task, so the API says so instead of trying.
    const retry = await lena.api.post(`/materials/${m.id}/retry`);
    expect(retry.status).toBe(409);
    expect(retry.body).toMatchObject({
      error: { details: { reason: 'form_not_practicable' } },
    });

    // Buddy says what it is, not that the photo was bad, and offers what he can do.
    const state = await stateBlock(env, lena);
    expect(state).toContain('no exercise for');
    expect(state).toContain(CONSTRUCTION);
  });

  it('still calls an unreadable photo unreadable (the new path swallows no old one)', async () => {
    const m = await send(env, lena, {
      is_learning_material: true,
      readable: false,
      pages: [{ page: 1, read: 'none', problem: 'blurry' }],
      title: null,
      subject: null,
      extracted_text: '',
      items: [],
      not_practicable: [],
    });
    expect(m.view).toMatchObject({ status: 'failed', failure_reason: 'unreadable' });
    expect(m.view.not_practicable).toEqual([]);
    // Here a second reading CAN help, and it is still offered.
    const home = await lena.api.get<BuddyHome>('/buddy');
    expect(home.body.now).toMatchObject({
      type: 'material_failed',
      reason: 'unreadable',
      retryable: true,
    });
  });
});
