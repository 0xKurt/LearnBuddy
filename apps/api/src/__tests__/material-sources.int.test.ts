// Two learning sources besides the worksheet (issue #259, #224 Baustein QUELLE): a corrected
// class test becomes NEW tasks for exactly what the teacher marked — never the original, never
// a grade kept anywhere — and the notebook entry of the day becomes a handful of short questions.
// The model says which source a page is; everything that follows is code's (sources.ts).
// docs/architecture.md §Material, docs/privacy.md §What is stored.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type {
  BuddyHome,
  MaterialItemsView,
  MaterialView,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LlmError } from '../llm/gateway.js';
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

/** One question with a key that agrees with it, so nothing is dropped for its own reasons. */
const question = (prompt: string, answer: string, kind: 'numeric' | 'short' = 'numeric') => ({
  kind,
  prompt,
  answer,
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Nachüben',
  difficulty: 2,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
});

/** What a teacher writes on a test, and what must never be stored. */
const GRADE = 'Note 4 – 12/20 Punkte. Bitte mehr üben! (Lena Berger)';

const ADDITION = 'Rechne schriftlich: 37 + 48';
const WORDS = 'Übersetze: the dog sleeps';

/** A corrected test: two tasks marked wrong, one right, the grade on top. */
const CORRECTED = {
  is_learning_material: true,
  readable: true,
  pages: [{ page: 1, read: 'all', problem: null }],
  title: 'Mathe-Probe Addition',
  subject: { name: 'Mathe', kind: 'math' },
  source: 'corrected_test',
  // The faithful transcript a sheet would keep — grade, remarks and name included.
  extracted_text: `${GRADE}\n1. ${ADDITION}\n2. ${WORDS}\n3. Rechne: 2 + 2`,
  marked: [
    { page: 1, task: ADDITION, questions: ['26 + 59', '37 + 48', '48 + 37'] },
    {
      page: 1,
      task: WORDS,
      questions: ['Übersetze: the cat sleeps', 'Übersetze bitte: the dog sleeps'],
    },
    // A page the test does not have: nothing written for it can come from a marked place.
    { page: 3, task: 'Rechne: 15 + 15', questions: ['16 + 14'] },
  ],
  items: [
    question('26 + 59', '85'),
    // The original task again, as printed and with its numbers turned round: not new.
    question('37 + 48', '85'),
    question('48 + 37', '85'),
    question('Übersetze: the cat sleeps', 'die Katze schläft', 'short'),
    // The same words with one added: the same task.
    question('Übersetze bitte: the dog sleeps', 'der Hund schläft', 'short'),
    question('16 + 14', '30'),
    // A task that was right: listed under no mark, so it is no practice of a mistake.
    question('3 + 3', '6'),
  ],
  unclear: [{ page: 1, task: ADDITION, about: 'die erste Zahl', readings: ['37', '87'] }],
  more_items: true,
};

async function tick(env: TestEnv): Promise<void> {
  const res = await env.app.request('/v1/internal/tick', {
    method: 'POST',
    headers: { 'x-tick-secret': TEST_TICK_SECRET },
  });
  expect(res.status).toBe(200);
}

/** Photograph a page and let the reading return these answers, in turn. */
async function send(
  env: TestEnv,
  l: Learner,
  ...answers: Array<{ json: unknown } | { error: LlmError }>
): Promise<{ id: string; paths: string[]; view: MaterialView }> {
  env.llm.script('extraction', ...answers);
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

/** Every stored row about this learner's material, as text: where a grade could hide. */
async function everythingStored(env: TestEnv, materialId: string): Promise<string> {
  const rows = await env.db.query<{ row: unknown }>(
    `select to_jsonb(m) as row from materials m where m.id = $1
     union all select to_jsonb(i) from items i where i.material_id = $1
     union all select to_jsonb(s) from material_unclear_spots s where s.material_id = $1
     union all select to_jsonb(p) from material_passages p where p.material_id = $1`,
    [materialId],
  );
  return JSON.stringify(rows);
}

describe.skipIf(!dbReady)('a corrected class test and the notebook entry of the day', () => {
  let env: TestEnv;
  let lena: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-05T14:00:00Z' });
    lena = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    env.llm.byDefault('buddy_check', WAIT);
  });
  afterEach(() => env.closeChecked());

  it('practises only the marked tasks, with new numbers or words, and keeps no grade', async () => {
    const m = await send(env, lena, { json: CORRECTED });

    expect(m.view).toMatchObject({
      status: 'ready',
      source: 'corrected_test',
      items_incomplete: false,
      item_count: 2,
    });
    const items = await lena.api.get<MaterialItemsView>(`/materials/${m.id}/items`);
    // New tasks for the two marked ones; the original again, the right task and a task on a
    // page the test does not have are all gone.
    expect(items.body.items.map((i) => i.prompt)).toEqual(['26 + 59', 'Übersetze: the cat sleeps']);
    // A test is short by design: never read again for "more", even when the model says so.
    expect(env.llm.callsFor('extraction')).toHaveLength(1);

    // Nothing of the grade, the points, the remark or her name is stored anywhere: the
    // transcript is the marked tasks, built by code, and no unclear spot was kept.
    const stored = await everythingStored(env, m.id);
    for (const leak of ['Note 4', '12/20', 'Punkte', 'mehr üben', 'Berger']) {
      expect(stored).not.toContain(leak);
    }
    const row = await env.db.one<{ extracted_text: string }>(
      `select extracted_text from materials where id = $1`,
      [m.id],
    );
    expect(row.extracted_text).toBe(`- ${ADDITION}\n- ${WORDS}`);
    const spots = await env.db.one<{ n: number }>(
      `select count(*)::int as n from material_unclear_spots where material_id = $1`,
      [m.id],
    );
    expect(spots.n).toBe(0);

    // The photos show the grade: they go right after the reading, and no figure is cut from them.
    expect(env.llm.callsFor('figures')).toHaveLength(0);
    const purge = await env.db.one<{ run_at: Date }>(
      `select run_at from jobs where kind = 'purge_photos' and payload ->> 'material_id' = $1`,
      [m.id],
    );
    expect(purge.run_at.getTime()).toBeLessThanOrEqual(env.clock.now().getTime());
    await tick(env);
    expect(m.paths.some((p) => env.storage.objects.has(p))).toBe(false);

    // Buddy knows what it is, and that a grade is nothing to ask about.
    const state = await stateBlock(env, lena);
    expect(state).toContain('"Mathe-Probe Addition" is her corrected class test');
    expect(state).toContain('never ask for or mention a grade or points');
  });

  it('a test with nothing marked has nothing to practise: its own reason, photos gone, no retry', async () => {
    const m = await send(env, lena, {
      json: { ...CORRECTED, marked: [], items: [question('2 + 2', '4')] },
    });
    expect(m.view).toMatchObject({
      status: 'failed',
      failure_reason: 'nothing_marked',
      item_count: 0,
    });
    // Nothing read from it is kept, not even the transcript.
    const row = await env.db.one<{ extracted_text: string | null }>(
      `select extracted_text from materials where id = $1`,
      [m.id],
    );
    expect(row.extracted_text).toBeNull();
    await tick(env);
    expect(m.paths.some((p) => env.storage.objects.has(p))).toBe(false);

    const retry = await lena.api.post(`/materials/${m.id}/retry`);
    expect(retry.status).toBe(409);
    expect(retry.body).toMatchObject({ error: { details: { reason: 'nothing_marked' } } });
    const home = await lena.api.get<BuddyHome>('/buddy');
    expect(home.body.now).toMatchObject({
      type: 'material_failed',
      reason: 'nothing_marked',
      retryable: false,
    });
  });

  it('a blurry test is unreadable, not a test without mistakes, and can be read again', async () => {
    const m = await send(env, lena, {
      json: {
        ...CORRECTED,
        readable: false,
        pages: [{ page: 1, read: 'none', problem: 'blurry' }],
        marked: [],
        items: [],
        extracted_text: '',
      },
    });
    expect(m.view).toMatchObject({ status: 'failed', failure_reason: 'unreadable' });
    const home = await lena.api.get<BuddyHome>('/buddy');
    expect(home.body.now).toMatchObject({ reason: 'unreadable', retryable: true });
  });

  it('an outage is retried, and the test read afterwards is handled the same way', async () => {
    const m = await send(env, lena, { error: new LlmError('unavailable', 'down') });
    expect(m.view.status).toBe('queued');
    env.llm.script('extraction', { json: CORRECTED });
    env.clock.advance(5 * 60_000);
    await tick(env);
    await env.flushBackground();
    const after = await lena.api.get<MaterialView>(`/materials/${m.id}`);
    expect(after.body).toMatchObject({ status: 'ready', source: 'corrected_test', item_count: 2 });
    expect(await everythingStored(env, m.id)).not.toContain('12/20');
  });

  it('is nobody else’s to see', async () => {
    const m = await send(env, lena, { json: CORRECTED });
    const tom = await onboard(env, { relation: 'child', name: 'Tom', birthDate: '2013-05-01' });
    expect((await tom.api.get(`/materials/${m.id}`)).status).toBe(404);
    expect((await tom.api.get(`/materials/${m.id}/items`)).status).toBe(404);
    expect((await tom.api.post(`/materials/${m.id}/retry`)).status).toBe(404);
  });

  it('a notebook entry gives at most five short questions, for the next morning', async () => {
    const m = await send(env, lena, {
      json: {
        is_learning_material: true,
        readable: true,
        pages: [{ page: 1, read: 'all', problem: null }],
        title: 'Die Photosynthese',
        subject: { name: 'Biologie', kind: 'biology' },
        source: 'notebook_entry',
        extracted_text: 'Hefteintrag: Pflanzen bilden aus Licht, Wasser und CO2 Zucker.',
        items: Array.from({ length: 8 }, (_, n) => question(`${n + 1} + 1`, String(n + 2))),
        more_items: true,
      },
    });
    expect(m.view).toMatchObject({ status: 'ready', source: 'notebook_entry', item_count: 5 });
    expect(env.llm.callsFor('extraction')).toHaveLength(1);
    // Her own notes: the transcript stays like any page's, and the photos the normal week.
    const purge = await env.db.one<{ run_at: Date }>(
      `select run_at from jobs where kind = 'purge_photos' and payload ->> 'material_id' = $1`,
      [m.id],
    );
    expect(purge.run_at.getTime()).toBeGreaterThan(env.clock.now().getTime() + 6 * DAY);
    const state = await stateBlock(env, lena);
    expect(state).toContain(
      '"Die Photosynthese" is her notebook entry of the lesson on 2026-10-05',
    );
    expect(state).toContain('next morning');
  });

  it('a worksheet stays a worksheet: read on for more, nothing dropped', async () => {
    const m = await send(
      env,
      lena,
      { json: { ...CORRECTED, source: 'sheet', more_items: true } },
      {
        json: {
          ...CORRECTED,
          source: 'sheet',
          items: [question('9 + 9', '18')],
          more_items: false,
        },
      },
    );
    expect(m.view).toMatchObject({ status: 'ready', source: 'sheet', item_count: 8 });
    expect(env.llm.callsFor('extraction')).toHaveLength(2);
  });
});
