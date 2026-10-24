// A run made from questions that exist goes out with their forms, without a choosing call
// (F5-1, KI-Audit 14.10., issue #657). Since #627 a small call (3.1 Flash-Lite, 1.0–1.4 s) chose
// the forms and figures before every run. For "more of this" and for a test from her read sheets
// the answer stands in the database already: the questions the run is made from.
// docs/architecture.md §Schema budget.
// requires live verification in Claude Code session (needs a running Postgres; scripted model)

import { randomUUID } from 'node:crypto';

import type { MaterialView, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { chosenFor, offered } from '../modules/practice/formChoice.js';
import { OPENAI_PROFILE } from '../llm/openai.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const FRACTION = { type: 'fraction', shape: 'circle', fractions: [{ parts: 4, filled: 3 }] };

const item = (prompt: string, answer: string, extra: object = {}) => ({
  kind: 'numeric',
  prompt,
  answer,
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Brüche',
  difficulty: 2,
  source_excerpt: null,
  ...extra,
});

const ITEMS = [
  item('Wie viel ist drei Viertel von 8?', '6', { figure: FRACTION }),
  item('Wie viel ist ein Viertel von 8?', '2'),
];

const SET = {
  usable: true,
  title: 'Brüche',
  subject: { name: 'Mathe', kind: 'math' },
  items: ITEMS,
};

describe.skipIf(!dbReady)('the forms of a run made from existing questions (#657)', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-14T15:00:00Z' });
    env.llm.profile = OPENAI_PROFILE;
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    env.llm.byDefault('buddy_check', {
      json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null },
    });
  });
  afterEach(() => env.closeChecked());

  const explainChoices = () => env.llm.choices.filter((c) => chosenFor(c) === 'explain');

  it('"more of this" goes out with the forms of the run she did, no choosing call', async () => {
    env.llm.scriptChoice({ json: { forms: [], figures: ['fraction'] } });
    env.llm.script('explain', { json: SET });
    const first = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Brüche',
      difficulty: 'easier',
    });
    expect(first.status).toBe(201);
    await env.flushBackground();
    expect(explainChoices()).toHaveLength(1);

    env.llm.script('explain', { json: SET });
    const more = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Mehr davon',
      from_session_id: first.body.id,
      difficulty: 'easier',
    });
    expect(more.status).toBe(201);
    await env.flushBackground();
    expect(explainChoices()).toHaveLength(1);
    const [, second] = env.llm.callsFor('explain');
    expect(offered(second!.schema).figures).toEqual(['fraction']);
  });

  it("a test from her read sheet goes out with the sheet's forms, no choosing call", async () => {
    const goal = await env.db.one<{ id: string }>(
      `insert into buddy_goals (learner_id, kind, title, due_date)
       values ($1, 'exam', 'Mathearbeit', '2026-10-20') returning id`,
      [l.learnerId],
    );
    env.llm.script('extraction', {
      json: {
        is_learning_material: true,
        readable: true,
        pages: [],
        title: 'Brüche',
        subject: { name: 'Mathe', kind: 'math' },
        extracted_text: 'Brüche — Aufgaben 1 und 2',
        items: ITEMS,
      },
    });
    const created = await l.api.post<{ material: MaterialView; uploads: Array<{ path: string }> }>(
      '/materials',
      {
        client_request_id: randomUUID(),
        photo_mimes: ['image/jpeg'],
        purpose: 'study',
        goal_id: goal.id,
      },
    );
    expect(created.status).toBe(201);
    for (const u of created.body.uploads) env.storage.put(u.path);
    await l.api.post(`/materials/${created.body.material.id}/submit`);
    await env.flushBackground();

    env.llm.script('explain', { json: SET });
    const test = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'test',
      text: 'Probetest',
      goal_id: goal.id,
    });
    expect(test.status).toBe(201);
    await env.flushBackground();
    expect(explainChoices()).toHaveLength(0);
    const [call] = env.llm.callsFor('explain');
    expect(offered(call!.schema).figures).toEqual(['fraction']);
  });
});
