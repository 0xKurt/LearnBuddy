// One spot a reading could not settle costs one tap, not a new photo of the whole page
// (issue #164 point 1). Before this, unclarity had exactly one step: the page counted as
// partly read, the learner was told to photograph it again, and the question for that task was
// never written — she never learned WHERE it stuck, so she could not help although she was
// holding the sheet. docs/architecture.md §Material, migration 0070.
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

/** One sum whose key agrees with it, so nothing is dropped for its own reasons (#157). */
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

/** The task whose first number is smudged: no question for it until she says which it is. */
const TASK = '4) 1? + 5 = ?';
const ABOUT = 'die erste Zahl';

/** A reading of a sheet with three clear sums and one spot that could not be settled. */
const sheet = (over: Record<string, unknown> = {}) => ({
  is_learning_material: true,
  readable: true,
  // The page says "part" too: the small question must come BEFORE the coarse one.
  pages: [{ page: 1, read: 'part', problem: 'blurry' }],
  title: 'Rechenblatt',
  subject: { name: 'Mathe', kind: 'math' },
  extracted_text: 'Drei Additionsaufgaben und eine mit verwischter Zahl',
  items: [sum(2, 3), sum(4, 5), sum(6, 7)],
  unclear: [{ page: 1, task: TASK, about: ABOUT, readings: ['12', '17'] }],
  ...over,
});

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
): Promise<{ id: string; view: MaterialView }> {
  env.llm.script('extraction', { json: result });
  const created = await l.api.post<{ material: MaterialView; uploads: Array<{ path: string }> }>(
    '/materials',
    { client_request_id: randomUUID(), photo_mimes: ['image/jpeg'], purpose: 'study' },
  );
  expect(created.status).toBe(201);
  const id = created.body.material.id;
  for (const u of created.body.uploads) env.storage.put(u.path);
  expect((await l.api.post(`/materials/${id}/submit`)).status).toBe(202);
  await env.flushBackground();
  return { id, view: (await l.api.get<MaterialView>(`/materials/${id}`)).body };
}

async function home(l: Learner): Promise<BuddyHome> {
  const res = await l.api.get<BuddyHome>('/buddy');
  expect(res.status).toBe(200);
  return res.body;
}

async function prompts(l: Learner, id: string): Promise<string[]> {
  const res = await l.api.get<MaterialItemsView>(`/materials/${id}/items`);
  expect(res.status).toBe(200);
  return res.body.items.map((i) => i.prompt);
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

type SpotRow = { ref: string; status: string; answer: string | null; items_added: number };

const spots = (env: TestEnv, learnerId: string): Promise<SpotRow[]> =>
  env.db.query<SpotRow>(
    `select ref, status, answer, items_added from material_unclear_spots
      where learner_id = $1 order by seq`,
    [learnerId],
  );

const extractJobs = (env: TestEnv, materialId: string): Promise<Array<{ dedupe_key: string }>> =>
  env.db.query<{ dedupe_key: string }>(
    `select dedupe_key from jobs where kind = 'extract_material'
       and payload ->> 'material_id' = $1 order by seq`,
    [materialId],
  );

describe.skipIf(!dbReady)('a spot that could not be read', () => {
  let env: TestEnv;
  let lena: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T14:00:00Z' });
    lena = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    env.llm.byDefault('buddy_check', WAIT);
  });
  afterEach(() => env.closeChecked());

  it('keeps every other question and asks the one small question about the spot', async () => {
    // One good entry and one that is no choice at all (a single reading): the broken one costs
    // only itself, like every other part of a reading's answer.
    const m = await send(
      env,
      lena,
      sheet({
        unclear: [
          { page: 1, task: TASK, about: ABOUT, readings: ['12', '17'] },
          { page: 1, task: '5) 2 + ? = 9', about: 'die zweite Zahl', readings: ['7'] },
        ],
      }),
    );

    // The sheet is ready and its other three questions are there — nothing about the smudge
    // took them away.
    expect(m.view).toMatchObject({ status: 'ready', failure_reason: null, item_count: 3 });
    expect(await prompts(lena, m.id)).toEqual(['2 + 3', '4 + 5', '6 + 7']);
    // And no question was invented for the task nobody could read yet.
    expect((await prompts(lena, m.id)).some((p) => p.includes('5') && p.startsWith('1'))).toBe(
      false,
    );

    // The small question stands in the conversation, with both readings to tap — before the
    // coarse "photograph the page again", although this page reported a problem too.
    const notice = (await home(lena)).notice;
    expect(notice).toMatchObject({
      type: 'unclear_spot',
      material_id: m.id,
      title: 'Rechenblatt',
      page: 1,
      photo_count: 1,
      photo_material_id: m.id,
      spot: {
        ref: 'u1',
        task: TASK,
        about: ABOUT,
        readings: [
          { ref: 'r1', text: '12' },
          { ref: 'r2', text: '17' },
        ],
        status: 'open',
        answer: null,
      },
    });
    // Exactly one spot was kept: the entry without a real choice was dropped.
    expect((await spots(env, lena.learnerId)).map((s) => s.ref)).toEqual(['u1']);

    // Buddy can ask it in his own words, and is told never to pick one himself.
    const state = await stateBlock(env, lena);
    expect(state).toContain(TASK);
    expect(state).toContain(ABOUT);
    expect(state).toContain('"12" or "17"');
    expect(state).toContain('NEVER pick one yourself');
  });

  it('writes the missing question from HER reading and adds nothing twice', async () => {
    const m = await send(env, lena, sheet());
    // The clarified reading sees the same photos and retypes the whole sheet: only the one
    // task it could not write before is new (the dedupe of issue #150).
    env.llm.script('extraction', {
      json: sheet({
        items: [sum(2, 3), sum(4, 5), sum(6, 7), sum(17, 5)],
        unclear: [],
        pages: [{ page: 1, read: 'all', problem: null }],
      }),
    });

    const answered = await lena.api.post<MaterialView>(`/materials/${m.id}/unclear`, {
      spot: 'u1',
      reading: 'r2',
    });
    expect(answered.status).toBe(202);
    await env.flushBackground();

    // The fourth question exists now, and nothing stands twice.
    expect(await prompts(lena, m.id)).toEqual(['2 + 3', '4 + 5', '6 + 7', '17 + 5']);
    expect((await lena.api.get<MaterialView>(`/materials/${m.id}`)).body.item_count).toBe(4);

    // Her reading is what the reading was told — not the one the model leaned towards.
    const clarify = env.llm.callsFor('extraction').at(-1)!;
    expect(clarify.system).toContain('what the LEARNER says is printed there: 17');
    expect(clarify.system).toContain(TASK);
    // It was told what already exists, so it could not hand the same sums back as new.
    expect(clarify.system).toContain('2 + 3');

    // The ask is settled: what it produced is recorded, and the home has moved on to the
    // coarse notice about the page.
    expect(await spots(env, lena.learnerId)).toEqual([
      { ref: 'u1', status: 'read', answer: '17', items_added: 1 },
    ]);
    expect((await home(lena)).notice).toMatchObject({ type: 'pages_missing' });

    // Answering again is refused rather than read a second time.
    const again = await lena.api.post(`/materials/${m.id}/unclear`, { spot: 'u1', reading: 'r1' });
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ error: { details: { reason: 'no_longer_open' } } });
    expect(await prompts(lena, m.id)).toHaveLength(4);
  });

  it('costs the sheet nothing when she ignores it: the ask expires and never comes back', async () => {
    const m = await send(env, lena, sheet());
    expect((await home(lena)).notice).toMatchObject({ type: 'unclear_spot' });

    env.clock.advance(DAY + 3_600_000);
    await tick(env);

    // The sheet is exactly what it was: ready, with its three questions.
    expect((await lena.api.get<MaterialView>(`/materials/${m.id}`)).body).toMatchObject({
      status: 'ready',
      item_count: 3,
    });
    expect(await prompts(lena, m.id)).toEqual(['2 + 3', '4 + 5', '6 + 7']);
    // Nothing asks any more — not on the home and not in Buddy's picture.
    expect((await home(lena)).notice).toBeNull();
    expect(await stateBlock(env, lena)).not.toContain(ABOUT);

    // And an app that still shows the old card is told so, instead of reading again a day late.
    const late = await lena.api.post(`/materials/${m.id}/unclear`, { spot: 'u1', reading: 'r1' });
    expect(late.status).toBe(409);
    expect(late.body).toMatchObject({ error: { details: { reason: 'no_longer_open' } } });
    expect((await extractJobs(env, m.id)).map((j) => j.dedupe_key)).toEqual([`extract:${m.id}:1`]);
  });

  it('lets it go on "weiß ich nicht" without inventing the question', async () => {
    const m = await send(env, lena, sheet());
    const let_go = await lena.api.post<MaterialView>(`/materials/${m.id}/unclear`, {
      spot: 'u1',
      reading: null,
    });
    expect(let_go.status).toBe(202);
    await env.flushBackground();

    expect(await spots(env, lena.learnerId)).toEqual([
      { ref: 'u1', status: 'dismissed', answer: null, items_added: 0 },
    ]);
    // No reading was started, and no question was guessed into existence.
    expect((await extractJobs(env, m.id)).map((j) => j.dedupe_key)).toEqual([`extract:${m.id}:1`]);
    expect(await prompts(lena, m.id)).toEqual(['2 + 3', '4 + 5', '6 + 7']);
    // The coarse step is still there for her, and nothing asks the small question again.
    expect((await home(lena)).notice).toMatchObject({ type: 'pages_missing' });
  });

  it('says it plainly when her answer still could not be written into a question', async () => {
    const m = await send(env, lena, sheet());
    // The reading comes back without a usable question for that task.
    env.llm.script('extraction', {
      json: sheet({ items: [], unclear: [], pages: [{ page: 1, read: 'all', problem: null }] }),
    });
    expect(
      (await lena.api.post(`/materials/${m.id}/unclear`, { spot: 'u1', reading: 'r1' })).status,
    ).toBe(202);
    await env.flushBackground();

    expect(await spots(env, lena.learnerId)).toEqual([
      { ref: 'u1', status: 'read', answer: '12', items_added: 0 },
    ]);
    expect(await prompts(lena, m.id)).toEqual(['2 + 3', '4 + 5', '6 + 7']);
    // Her answer did not vanish without a word: Buddy is told to say so (rule 5).
    const state = await stateBlock(env, lena);
    expect(state).toContain('still could not be written');
    expect(state).toContain('"12"');
  });

  it('is not another learner’s to answer, and never takes a reading she was not offered', async () => {
    const m = await send(env, lena, sheet());
    const tom = await onboard(env, { relation: 'child', name: 'Tom', birthDate: '2013-05-01' });

    const stolen = await tom.api.post(`/materials/${m.id}/unclear`, { spot: 'u1', reading: 'r1' });
    expect(stolen.status).toBe(404);
    // Tom's home knows nothing of her sheet.
    expect((await home(tom)).notice).toBeNull();

    // A spot that was never asked about, and a reading that was never offered.
    expect(
      (await lena.api.post(`/materials/${m.id}/unclear`, { spot: 'u9', reading: 'r1' })).status,
    ).toBe(404);
    const made_up = await lena.api.post(`/materials/${m.id}/unclear`, {
      spot: 'u1',
      reading: 'r4',
    });
    expect(made_up.status).toBe(422);
    expect(made_up.body).toMatchObject({ error: { details: { reason: 'unknown_reading' } } });

    // Nothing of that reached the sheet, and the ask still stands for her.
    expect(await spots(env, lena.learnerId)).toEqual([
      { ref: 'u1', status: 'open', answer: null, items_added: 0 },
    ]);
    expect(await prompts(lena, m.id)).toEqual(['2 + 3', '4 + 5', '6 + 7']);
  });

  it('does not spend one of her three readings of the sheet', async () => {
    const m = await send(env, lena, sheet());
    env.llm.script('extraction', {
      json: sheet({
        items: [sum(2, 3), sum(4, 5), sum(6, 7), sum(12, 5)],
        unclear: [],
        pages: [{ page: 1, read: 'all', problem: null }],
      }),
    });
    expect(
      (await lena.api.post(`/materials/${m.id}/unclear`, { spot: 'u1', reading: 'r1' })).status,
    ).toBe(202);
    await env.flushBackground();
    expect(await prompts(lena, m.id)).toHaveLength(4);

    // A sheet that is ready cannot be retried at all — but the refusal must be about that,
    // never about a reading limit her own answer used up.
    const retry = await lena.api.post(`/materials/${m.id}/retry`);
    expect(retry.status).toBe(409);
    expect(JSON.stringify(retry.body)).not.toContain('retry_limit');
  });
});
