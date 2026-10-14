// Every sheet she sends ends in an honest line with a way on (issue #721): device walk 14.10., a
// fraction sheet showed "Ich mache aus deinem Blatt gerade Übungen …" for ~30 s and then nothing —
// the background check's model had chosen to wait — and a vocabulary sheet got only the fixed line
// without its start. Code now answers her sheet whatever the check's model decides: a ready line
// with the start of practice when practice exists, never silence. docs/architecture.md §Material.
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
  topic: 'Brüche',
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
    title: 'Brüche erweitern',
    subject: { name: 'Mathe', kind: 'math' },
    extracted_text: 'Brüche erweitern',
    items: [
      item('Erweitere 1/2 mit 3.', '3/6'),
      item('Erweitere 2/3 mit 2.', '4/6'),
      item('Erweitere 3/4 mit 5.', '15/20'),
    ],
  },
};

const WAIT = { json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null } };

const PREPARE = {
  tool: 'prepare_practice',
  args: { goal: null, subject: null, minutes: 5, focus_topics: [], sheet: 'sh1' },
};

const OUTREACH = (step: string | null) => ({
  kind: 'result',
  topic_key: 'sheet:sh1',
  title: 'Dein Blatt',
  body: 'Dein Blatt ist gelesen.',
  why: 'Sie hat es gerade geschickt.',
  relevance: 0.8,
  expires_in_hours: 12,
  goal: null,
  step,
});

async function sendSheet(
  env: TestEnv,
  l: Learner,
  sheet: typeof SHEET = SHEET,
  flush = true,
): Promise<string> {
  env.llm.script('extraction', sheet);
  const created = await l.api.post<{ material: { id: string }; uploads: Array<{ path: string }> }>(
    '/materials',
    { client_request_id: randomUUID(), photo_mimes: ['image/jpeg'], sending: true },
  );
  expect(created.status).toBe(201);
  for (const u of created.body.uploads) env.storage.put(u.path);
  expect((await l.api.post(`/materials/${created.body.material.id}/submit`)).status).toBe(202);
  if (flush) await env.flushBackground();
  return created.body.material.id;
}

/** A second sheet, goal-less like the first, with questions of its own. */
const OTHER = {
  json: {
    ...SHEET.json,
    title: 'Brüche kürzen',
    subject: { name: 'Mathe', kind: 'math' },
    extracted_text: 'Brüche kürzen',
    items: [item('Kürze 2/4.', '1/2'), item('Kürze 3/9.', '1/3')],
  },
};

/** Each of Buddy's lines about a sheet, with the sheet its start's questions come from. */
async function startsBySheet(env: TestEnv, l: Learner): Promise<Map<string, string[]>> {
  const home = (await l.api.get<BuddyHome>('/buddy')).body;
  const out = new Map<string, string[]>();
  for (const m of home.thread) {
    if (m.role !== 'buddy' || !m.announces) continue;
    const rows = await env.db.query<{ material_id: string }>(
      `select distinct i.material_id from buddy_steps s
         join items i on i.id::text = any(array(select jsonb_array_elements_text(s.payload -> 'item_ids')))
        where s.id = $1`,
      [m.announces.step_id],
    );
    out.set(
      m.id,
      rows.map((r) => r.material_id),
    );
  }
  return out;
}

/** Buddy's messages after her sheet, and the practice waiting for her. */
async function answer(l: Learner): Promise<{ after: MessageView[]; waiting: string[] }> {
  const home = (await l.api.get<BuddyHome>('/buddy')).body;
  const mine = home.thread.findIndex((m) => m.sheet);
  expect(mine).toBeGreaterThanOrEqual(0);
  return {
    after: home.thread.slice(mine + 1).filter((m) => m.role === 'buddy'),
    waiting: home.now?.type === 'practice_ready' ? [home.now.step_id] : [],
  };
}

async function preparedSteps(env: TestEnv, l: Learner): Promise<string[]> {
  const rows = await env.db.query<{ id: string }>(
    `select id from buddy_steps where learner_id = $1 and kind = 'practice' and state = 'prepared'`,
    [l.learnerId],
  );
  return rows.map((r) => r.id);
}

describe.skipIf(!dbReady)('every sheet she sends is answered (issue #721)', () => {
  let env: TestEnv;
  let lena: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-14T14:00:00Z' });
    lena = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterEach(() => env.closeChecked());

  it('answers with a ready line and its start when the check chose to wait', async () => {
    env.llm.script('buddy_check', WAIT);
    await sendSheet(env, lena);
    const { after } = await answer(lena);
    expect(after).toHaveLength(1);
    const steps = await preparedSteps(env, lena);
    expect(steps).toHaveLength(1);
    expect(after[0]?.announces).toMatchObject({ step_id: steps[0], question_count: 3 });
  });

  it('says the practice the check prepared without a word, with its start', async () => {
    env.llm.script('buddy_check', {
      json: { disposition: 'act', reason: 'prepare', actions: [PREPARE], outreach: null },
    });
    await sendSheet(env, lena);
    const { after } = await answer(lena);
    const steps = await preparedSteps(env, lena);
    // The practice it made, not a second one.
    expect(steps).toHaveLength(1);
    expect(after).toHaveLength(1);
    expect(after[0]?.announces).toMatchObject({ step_id: steps[0] });
  });

  it('gives the check’s own line the start it left out', async () => {
    env.llm.script('buddy_check', {
      json: { disposition: 'act', reason: 'tell', actions: [], outreach: OUTREACH(null) },
    });
    await sendSheet(env, lena);
    const { after } = await answer(lena);
    expect(after).toHaveLength(1);
    expect(after[0]?.text).toBe('Dein Blatt ist gelesen.');
    const steps = await preparedSteps(env, lena);
    expect(steps).toHaveLength(1);
    expect(after[0]?.announces).toMatchObject({ step_id: steps[0] });
  });

  it('keeps the fixed line with its start when the model fails', async () => {
    env.llm.script('buddy_check', { error: new LlmError('unavailable', 'overloaded') });
    await sendSheet(env, lena);
    const { after } = await answer(lena);
    expect(after).toHaveLength(1);
    const steps = await preparedSteps(env, lena);
    expect(after[0]?.announces).toMatchObject({ step_id: steps[0] });
  });

  it("starts each goal-less sheet with its own questions, never another sheet's", async () => {
    env.llm.byDefault('buddy_check', WAIT);
    const first = await sendSheet(env, lena);
    const second = await sendSheet(env, lena, OTHER);
    const starts = [...(await startsBySheet(env, lena)).values()];
    expect(starts).toEqual([[first], [second]]);
  });

  it('answers two sheets one check woke for, each with its own start', async () => {
    env.llm.byDefault('buddy_check', WAIT);
    env.holdBackground();
    const first = await sendSheet(env, lena, SHEET, false);
    const second = await sendSheet(env, lena, OTHER, false);
    await env.flushBackground();
    const starts = [...(await startsBySheet(env, lena)).values()].map((s) => s.join());
    expect(starts.sort()).toEqual([first, second].sort());
  });

  it('adds nothing when the check already said it with its start', async () => {
    env.llm.script('buddy_check', {
      json: { disposition: 'act', reason: 'both', actions: [PREPARE], outreach: OUTREACH('new') },
    });
    await sendSheet(env, lena);
    const { after } = await answer(lena);
    expect(after).toHaveLength(1);
    expect(after[0]?.text).toBe('Dein Blatt ist gelesen.');
    const steps = await preparedSteps(env, lena);
    expect(steps).toHaveLength(1);
    expect(after[0]?.announces).toMatchObject({ step_id: steps[0] });
  });
});
