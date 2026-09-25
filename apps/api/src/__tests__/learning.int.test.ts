// Material and practice under failure: unreadable photos, retries and their
// limit, model outages, photo retention, the tutor without a model, hints,
// revealing, and memory edits. docs/architecture.md §Material, §Practice.
// requires live verification in Claude Code session (needs a running Postgres)

import type { BuddyHome, LibraryView, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LlmError } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import {
  createTestEnv,
  onboard,
  TEST_TICK_SECRET,
  type Learner,
  type TestEnv,
} from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

let n = 0;
const uuid = () => `00000000-0000-4000-9000-${(++n).toString(16).padStart(12, '0')}`;

const item = (prompt: string, answer: string, topic: string, kind = 'short') => ({
  kind,
  prompt,
  answer,
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic,
  difficulty: 2,
  source_excerpt: null,
});

const readable = (
  items = [
    item('Hauptstadt von Frankreich?', 'Paris', 'Hauptstädte'),
    item('Hauptstadt von Italien?', 'Rom', 'Hauptstädte'),
    item('Wie heißt der längste Fluss Europas?', 'Wolga', 'Flüsse'),
  ],
) => ({
  json: {
    is_learning_material: true,
    readable: true,
    title: 'Europa',
    subject: { name: 'Erdkunde', kind: 'geography' },
    extracted_text: 'Europa: Hauptstädte und Flüsse',
    items,
  },
});

async function tick(env: TestEnv): Promise<void> {
  const res = await env.app.request('/v1/internal/tick', {
    method: 'POST',
    headers: { 'x-tick-secret': TEST_TICK_SECRET },
  });
  expect(res.status).toBe(200);
  expect(((await res.json()) as { errors: string[] }).errors).toEqual([]);
}

const WAIT = { json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null } };

async function upload(env: TestEnv, l: Learner): Promise<string> {
  const created = await l.api.post<{ material: { id: string }; uploads: Array<{ path: string }> }>(
    '/materials',
    {
      client_request_id: uuid(),
      photo_mimes: ['image/jpeg', 'image/png'],
    },
  );
  expect(created.status).toBe(201);
  for (const u of created.body.uploads) env.storage.put(u.path);
  const submitted = await l.api.post(`/materials/${created.body.material.id}/submit`);
  expect(submitted.status).toBe(202);
  await env.flushBackground();
  return created.body.material.id;
}

describe.skipIf(!dbReady)('material and practice under failure', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z' });
    l = await onboard(env);
  });
  afterEach(async () => {
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      unexpected: env.llm.unexpected.length,
      pending: env.llm.pending(),
    };
    await env.close();
    expect(report).toEqual({ scriptErrors: [], unexpected: 0, pending: 0 });
  });

  it('reports unreadable photos, allows a bounded number of retries, and keeps photos only 7 days', async () => {
    env.llm.script('extraction', {
      json: {
        is_learning_material: true,
        readable: false,
        title: null,
        subject: null,
        extracted_text: '',
        items: [],
      },
    });
    const id = await upload(env, l);
    let m = await l.api.get<{ status: string; failure_reason: string }>(`/materials/${id}`);
    expect(m.body).toMatchObject({ status: 'failed', failure_reason: 'unreadable' });
    const home = await l.api.get<{ now: { type: string; retryable: boolean } }>('/buddy');
    expect(home.body.now).toMatchObject({ type: 'material_failed', retryable: true });

    env.llm.script('extraction', { error: new LlmError('invalid_output', 'truncated') });
    expect((await l.api.post(`/materials/${id}/retry`)).status).toBe(202);
    await env.flushBackground();
    m = await l.api.get(`/materials/${id}`);
    expect(m.body).toMatchObject({ status: 'failed', failure_reason: 'model_error' });

    // Success: Buddy is woken right away (it decides to wait here).
    env.llm.script('extraction', readable());
    env.llm.script('buddy_check', WAIT);
    expect((await l.api.post(`/materials/${id}/retry`)).status).toBe(202);
    await env.flushBackground();
    m = await l.api.get(`/materials/${id}`);
    expect(m.body).toMatchObject({ status: 'ready' });
    // Three runs are the limit, and ready material cannot be "retried" anyway.
    expect((await l.api.post(`/materials/${id}/retry`)).status).toBe(409);

    // The photos are deleted 7 days after reading.
    const paths = await env.db.query<{ storage_path: string }>(
      `select storage_path from material_photos where material_id = $1`,
      [id],
    );
    expect(paths.every((p) => env.storage.objects.has(p.storage_path))).toBe(true);
    env.clock.hours(24 * 7 + 1);
    await tick(env);
    expect(paths.some((p) => env.storage.objects.has(p.storage_path))).toBe(false);
  });

  it('does not offer a retry for something that is not learning material', async () => {
    env.llm.script('extraction', {
      json: {
        is_learning_material: false,
        readable: true,
        title: null,
        subject: null,
        extracted_text: '',
        items: [],
      },
    });
    const id = await upload(env, l);
    const m = await l.api.get<{ status: string; failure_reason: string }>(`/materials/${id}`);
    expect(m.body).toMatchObject({ status: 'failed', failure_reason: 'not_learning_material' });
    const retry = await l.api.post(`/materials/${id}/retry`);
    expect(retry.status).toBe(409);
  });

  it('retries a provider timeout later instead of failing the material', async () => {
    env.llm.script('extraction', { error: new LlmError('timeout', 'slow') });
    const id = await upload(env, l);
    let m = await l.api.get<{ status: string }>(`/materials/${id}`);
    expect(m.body.status).toBe('queued');
    env.llm.script('extraction', readable());
    // Later, with the learner out of the app (so Buddy's follow-up check runs too).
    env.clock.minutes(5);
    env.llm.script('buddy_check', {
      json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null },
    });
    await tick(env);
    m = await l.api.get(`/materials/${id}`);
    expect(m.body.status).toBe('ready');
  });

  it('prepares practice from new photos at once when the model is briefly down, not ten minutes later', async () => {
    env.llm.script('extraction', readable());
    env.llm.script('buddy_check', { error: new LlmError('unavailable', 'overloaded') });
    await upload(env, l);
    // The learner is waiting for their photos: the fixed fallback acts now.
    const home = (await l.api.get<BuddyHome>('/buddy')).body;
    expect(home.working).toBeNull();
    expect(home.now).toMatchObject({ type: 'practice_ready', question_count: 3 });
    const job = await env.db.one<{ status: string; result: { outcome: string } }>(
      `select status, result from jobs where learner_id = $1 and kind = 'buddy_check'`,
      [l.learnerId],
    );
    expect(job).toMatchObject({ status: 'done', result: { outcome: 'fallback_act' } });
  });

  it('does not claim to read photos that never all arrived, and deletes a half-sent upload after a day', async () => {
    const created = await l.api.post<{
      material: { id: string };
      uploads: Array<{ path: string }>;
    }>('/materials', { client_request_id: uuid(), photo_mimes: ['image/jpeg', 'image/jpeg'] });
    expect(created.status).toBe(201);
    // Only the first photo arrives; the app is closed before the rest is sent.
    const first = created.body.uploads[0]!.path;
    env.storage.put(first);
    let home = (await l.api.get<BuddyHome>('/buddy')).body;
    expect(home.now).toMatchObject({ type: 'material_processing', status: 'awaiting_upload' });
    env.clock.minutes(11);
    home = (await l.api.get<BuddyHome>('/buddy')).body;
    expect(home.now).toBeNull();

    env.clock.minutes(24 * 60);
    await tick(env);
    expect(env.storage.objects.has(first)).toBe(false);
    const library = (await l.api.get<LibraryView>('/materials')).body;
    expect([...library.unsorted, ...library.subjects.flatMap((s) => s.materials)]).toEqual([]);
    const row = await env.db.one<{ status: string; failure_reason: string }>(
      `select status, failure_reason from materials where id = $1`,
      [created.body.material.id],
    );
    expect(row).toEqual({ status: 'failed', failure_reason: 'photos_missing' });
  });

  it('asks for no further upload when the same send is repeated after the photos went through', async () => {
    env.llm.script('extraction', readable());
    env.llm.script('buddy_check', WAIT);
    const request = { client_request_id: uuid(), photo_mimes: ['image/jpeg'] };
    const first = await l.api.post<{ material: { id: string }; uploads: Array<{ path: string }> }>(
      '/materials',
      request,
    );
    env.storage.put(first.body.uploads[0]!.path);
    const id = first.body.material.id;
    expect((await l.api.post(`/materials/${id}/submit`)).status).toBe(202);
    await env.flushBackground();
    // The answer to the submit got lost, so the app asks again with the same id.
    const again = await l.api.post<{
      material: { id: string; status: string };
      uploads: unknown[];
    }>('/materials', request);
    expect(again.status).toBe(201);
    expect(again.body.material).toMatchObject({ id, status: 'ready' });
    expect(again.body.uploads).toEqual([]);
  });

  it('deleting material removes its photos now and its questions from practice', async () => {
    env.llm.script('extraction', readable());
    env.llm.script('buddy_check', WAIT);
    const id = await upload(env, l);
    const paths = await env.db.query<{ storage_path: string }>(
      `select storage_path from material_photos where material_id = $1`,
      [id],
    );
    expect((await l.api.delete(`/materials/${id}`)).status).toBe(204);
    await tick(env);
    expect(paths.some((p) => env.storage.objects.has(p.storage_path))).toBe(false);
    const practice = await l.api.post('/practice/sessions', {});
    expect(practice.status).toBe(404);
    expect(practice.body).toMatchObject({ error: { details: { reason: 'no_questions' } } });
  });

  it('never grades without judgement: no model → the answer stays open; hints and revealing count honestly', async () => {
    env.llm.script('extraction', readable());
    env.llm.script('buddy_check', WAIT);
    await upload(env, l);
    const started = await l.api.post<SessionView>('/practice/sessions', {});
    expect(started.status).toBe(201);
    const s = started.body;
    const find = (prompt: string) => s.items.find((i) => i.item.prompt === prompt)!.item.id;

    // Free text that the rules cannot decide, while the model is down.
    env.llm.script('tutor', { error: new LlmError('unavailable', 'down') });
    const unsure = await l.api.post<{
      verdict: string | null;
      reply: { text: string };
      session: SessionView;
    }>(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: uuid(),
      item_id: find('Wie heißt der längste Fluss Europas?'),
      text: 'die Donau glaube ich',
    });
    expect(unsure.body.verdict).toBeNull();
    expect(unsure.body.reply.text).toContain('kann ich gerade nicht prüfen');
    expect(
      unsure.body.session.items.find((i) => i.item.prompt.startsWith('Wie heißt'))!.status,
    ).toBe('open');

    // Asking for help is not an answer: a hint, no grade.
    env.llm.script('tutor', {
      json: {
        intent: 'help_request',
        verdict: 'correct',
        reply: 'Tipp: Er fließt durch Russland.',
        gave_hint: true,
        revealed_answer: false,
      },
    });
    const hint = await l.api.post<{ verdict: string | null }>(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: uuid(),
      item_id: find('Wie heißt der längste Fluss Europas?'),
      text: 'Hilfe, ich weiß es nicht',
    });
    expect(hint.body.verdict).toBe('not_an_attempt');

    // Exact match after the hint: right, but not "first try".
    await l.api.post(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: uuid(),
      item_id: find('Wie heißt der längste Fluss Europas?'),
      text: 'Wolga',
    });
    // Reveal another one.
    const revealed = await l.api.post<SessionView>(`/practice/sessions/${s.id}/reveal`, {
      item_id: find('Hauptstadt von Italien?'),
    });
    expect(
      revealed.body.items.find((i) => i.item.prompt === 'Hauptstadt von Italien?'),
    ).toMatchObject({
      status: 'skipped',
      answer: 'Rom',
    });

    env.llm.script('buddy_check', WAIT);
    const finished = await l.api.post<SessionView>(`/practice/sessions/${s.id}/finish`);
    await env.flushBackground();
    expect(finished.body.summary).toEqual({
      answered: 2,
      first_try: 0,
      secure_topics: [],
      shaky_topics: expect.arrayContaining(['Flüsse', 'Hauptstädte']),
    });
    const states = await env.db.query<{ last_outcome: string }>(
      `select last_outcome from item_states where learner_id = $1 order by last_outcome`,
      [l.learnerId],
    );
    expect(states.map((x) => x.last_outcome)).toEqual(['revealed', 'with_help']);
  });

  it('lets the learner correct or remove what Buddy knows, with optimistic concurrency', async () => {
    const row = await env.db.one<{ id: string }>(
      `insert into buddy_memories (learner_id, kind, statement, source, created_at)
       values ($1, 'fact', 'Hat mittwochs Klavier', 'learner_edited', $2) returning id`,
      [l.learnerId, env.clock.now()],
    );
    const edited = await l.api.patch(`/buddy/memory/${row.id}`, {
      statement: 'Hat donnerstags Klavier',
      version: 1,
    });
    expect(edited.status).toBe(200);
    const stale = await l.api.patch(`/buddy/memory/${row.id}`, { retract: true, version: 1 });
    expect(stale.status).toBe(404); // superseded by the edit
    const list = await l.api.get<{
      memories: Array<{ id: string; statement: string; version: number }>;
    }>('/buddy/memory');
    expect(list.body.memories.map((m) => m.statement)).toEqual(['Hat donnerstags Klavier']);
    const current = list.body.memories[0]!;
    expect(
      (
        await l.api.patch(`/buddy/memory/${current.id}`, {
          retract: true,
          version: current.version + 1,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await l.api.patch(`/buddy/memory/${current.id}`, {
          retract: true,
          version: current.version,
        })
      ).status,
    ).toBe(200);
    expect((await l.api.get<{ memories: unknown[] }>('/buddy/memory')).body.memories).toEqual([]);
  });
});
