// Real progress while Buddy reads a sheet (gap 5, docs/architecture.md §Material):
// the home card follows the stages the reading run reports — photos on their way,
// waiting for the reader, being read, read with the tasks found while Buddy makes
// practice — and nothing it cannot know. Stamped with the app clock; a requeued
// reading starts over; another learner sees none of it.
// requires live verification in Claude Code session (needs a running Postgres)

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LlmError } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

let n = 0;
const uuid = () => `00000000-0000-4000-9300-${(++n).toString(16).padStart(12, '0')}`;

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
  source_excerpt: null,
});

const SHEET = {
  is_learning_material: true,
  readable: true,
  title: 'Europa',
  subject: { name: 'Erdkunde', kind: 'geography' },
  extracted_text: 'Europa: Hauptstädte',
  items: [
    item('Hauptstadt von Frankreich?', 'Paris'),
    item('Hauptstadt von Italien?', 'Rom'),
    item('Hauptstadt von Spanien?', 'Madrid'),
  ],
};

const WAIT = { json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null } };

type Gate = {
  release: () => void;
  wait: Promise<void>;
  called: Promise<void>;
  markCalled: () => void;
};
function gate(): Gate {
  const g = {} as Gate;
  g.wait = new Promise<void>((r) => (g.release = r));
  g.called = new Promise<void>((r) => (g.markCalled = r));
  return g;
}

async function create(l: Learner, photos = 2) {
  const created = await l.api.post<{ material: { id: string }; uploads: Array<{ path: string }> }>(
    '/materials',
    { client_request_id: uuid(), photo_mimes: Array(photos).fill('image/jpeg') },
  );
  expect(created.status).toBe(201);
  return created.body;
}

const nowOf = async (l: Learner) => (await l.api.get<BuddyHome>('/buddy')).body.now;

describe.skipIf(!dbReady)('reading stages on the home card', () => {
  let env: TestEnv;
  let lena: Learner;
  let tom: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z' });
    lena = await onboard(env, { name: 'Lena' });
    tom = await onboard(env, { name: 'Tom' });
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

  it('follows the real stages: sending → waiting → reading → read, tasks found, practice being made', async () => {
    const m = await create(lena, 2);
    // Photos on their way: nothing is being read yet.
    expect(await nowOf(lena)).toMatchObject({
      type: 'material_processing',
      material_id: m.material.id,
      status: 'awaiting_upload',
      stage: 'sending',
      pages: 2,
      found: null,
      purpose: 'study',
    });

    const g = gate();
    env.llm.script('extraction', async () => {
      g.markCalled();
      await g.wait;
      return SHEET;
    });
    for (const u of m.uploads) env.storage.put(u.path);
    expect((await lena.api.post(`/materials/${m.material.id}/submit`)).status).toBe(202);

    // The model is reading (one call for both pages: no page-by-page progress is claimed).
    await g.called;
    expect(await nowOf(lena)).toMatchObject({
      type: 'material_processing',
      status: 'processing',
      stage: 'reading',
      pages: 2,
      found: null,
    });
    const stamped = await env.db.one<{ read_stage: string; read_stage_at: Date }>(
      `select read_stage, read_stage_at from materials where id = $1`,
      [m.material.id],
    );
    expect(stamped.read_stage).toBe('reading');
    expect(stamped.read_stage_at.toISOString()).toBe(env.clock.now().toISOString());
    // Another learner sees none of it.
    expect(await nowOf(tom)).toBeNull();

    // Buddy's look at the read sheet (woken at once) takes its time.
    const check = gate();
    env.llm.script('buddy_check', async () => {
      check.markCalled();
      await check.wait;
      return WAIT.json;
    });
    g.release();
    await check.called;
    // Read: the Buddy check it woke is working — the card says what was found meanwhile.
    const home = (await lena.api.get<BuddyHome>('/buddy')).body;
    expect(home.now).toMatchObject({
      type: 'material_processing',
      material_id: m.material.id,
      status: 'ready',
      stage: 'building',
      pages: 2,
      found: 3,
    });
    expect(home.working).toBe('material');

    // The check is done: the card is gone (whatever Buddy decided stands on its own).
    check.release();
    await env.flushBackground();
    const after = (await lena.api.get<BuddyHome>('/buddy')).body;
    expect(after.now?.type).not.toBe('material_processing');
    expect(after.working).toBeNull();
  });

  it('waits honestly while the reader is busy, and a requeued reading starts over', async () => {
    const m = await create(lena, 1);
    env.llm.script('extraction', { error: new LlmError('unavailable', 'busy') });
    for (const u of m.uploads) env.storage.put(u.path);
    await lena.api.post(`/materials/${m.material.id}/submit`);
    await env.flushBackground();
    // The model was down while reading: queued again, and "reading" is not claimed any more.
    expect(await nowOf(lena)).toMatchObject({
      type: 'material_processing',
      status: 'queued',
      stage: 'waiting',
      pages: 1,
    });
    const row = await env.db.one<{ status: string; read_stage: string | null }>(
      `select status, read_stage from materials where id = $1`,
      [m.material.id],
    );
    expect(row).toEqual({ status: 'queued', read_stage: null });
  });

  it('homework has no practice to build: after reading, the help is there', async () => {
    const created = await lena.api.post<{
      material: { id: string };
      uploads: Array<{ path: string }>;
    }>('/materials', {
      client_request_id: uuid(),
      photo_mimes: ['image/jpeg'],
      purpose: 'homework',
    });
    expect(await nowOf(lena)).toMatchObject({ stage: 'sending', purpose: 'homework' });
    env.llm.script('extraction', { json: SHEET });
    for (const u of created.body.uploads) env.storage.put(u.path);
    await lena.api.post(`/materials/${created.body.material.id}/submit`);
    await env.flushBackground();
    const now = await nowOf(lena);
    expect(now?.type).not.toBe('material_processing');
  });
});
