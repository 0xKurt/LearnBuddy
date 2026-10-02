// Two more things a study photo can be (issue #259), read through the SAME photo path:
//   · a corrected class test — new questions of the same type for the tasks the teacher marked,
//     never the original task (code drops it), and no grade or points stored anywhere;
//   · today's notebook entry ("Was war heute?") — at most five questions, prepared as practice
//     for the next morning.
// docs/architecture.md §Material ("Other sources of a study photo").
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type {
  BuddyHome,
  MaterialItemsView,
  MaterialView,
  SendMessageResponse,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();
const DAY = 86_400_000;

const WAIT = { json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null } };

const item = (prompt: string, answer: string, extra: Record<string, unknown> = {}) => ({
  kind: 'numeric',
  prompt,
  answer,
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Bruchrechnung',
  difficulty: 2,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
  ...extra,
});

/** What a model might well write about a corrected test — grade and points included. */
const GRADE_TEXT = 'Klassenarbeit Nr. 2 — Note: 4 — 12/20 Punkte. Aufgabe 3: 3/4 + 1/8 = 4/12 ✗';

const page = { page: 1, read: 'all', problem: null };

function reading(items: unknown[], over: Record<string, unknown> = {}) {
  return {
    is_learning_material: true,
    readable: true,
    pages: [page],
    title: 'Mathearbeit Note 4',
    subject: { name: 'Mathe', kind: 'math' },
    extracted_text: GRADE_TEXT,
    items,
    // Fields the schema does not have: whatever the model adds, nothing of it is kept.
    grade: '4',
    points: '12/20',
    ...over,
  };
}

const turn = (over: Record<string, unknown>) => ({
  json: {
    lookups: [],
    concern: false,
    also_asked: false,
    actions: [],
    reply: 'Alles klar.',
    options: null,
    asks_permission: false,
    ...over,
  },
});

async function send(
  env: TestEnv,
  l: Learner,
  result: unknown,
  body: Record<string, unknown> = {},
): Promise<{ id: string; view: MaterialView }> {
  env.llm.script('extraction', { json: result });
  const created = await l.api.post<{ material: MaterialView; uploads: Array<{ path: string }> }>(
    '/materials',
    { client_request_id: randomUUID(), photo_mimes: ['image/jpeg'], purpose: 'study', ...body },
  );
  expect(created.status).toBe(201);
  const id = created.body.material.id;
  for (const u of created.body.uploads) env.storage.put(u.path);
  expect((await l.api.post(`/materials/${id}/submit`)).status).toBe(202);
  await env.flushBackground();
  return { id, view: (await l.api.get<MaterialView>(`/materials/${id}`)).body };
}

describe.skipIf(!dbReady)('new sources of a study photo (issue #259)', () => {
  let env: TestEnv;
  let lena: Learner;
  beforeEach(async () => {
    // Thursday afternoon in Berlin.
    env = await createTestEnv({ start: '2026-10-01T14:00:00Z' });
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

  it('a corrected test becomes new questions for the marked tasks, and nothing of the grade is kept', async () => {
    const original = 'Berechne 3/4 + 1/8';
    const m = await send(
      env,
      lena,
      reading([
        // The original task itself: thrown away.
        item('Berechne 3/4 + 1/8', '7/8', { original }),
        // The same numbers in another order: still the original task.
        item('Berechne 1/8 + 3/4', '7/8', { original }),
        // New numbers, same type: kept.
        item('Berechne 2/3 + 1/6', '5/6', { original }),
        item('Berechne 1/2 + 3/10', '4/5', { original }),
        // A question that cannot say which marked task it practises cannot be checked.
        item('Berechne 1/5 + 1/10', '3/10'),
      ]),
      { source: 'corrected_test' },
    );
    expect(m.view).toMatchObject({ status: 'ready', source: 'corrected_test', item_count: 2 });
    const items = await lena.api.get<MaterialItemsView>(`/materials/${m.id}/items`);
    expect(items.body.items.map((i) => i.prompt).sort()).toEqual([
      'Berechne 1/2 + 3/10',
      'Berechne 2/3 + 1/6',
    ]);
    // The reading was told what this is.
    const sent = ScriptedGateway.textOf(env.llm.callsFor('extraction')[0]!);
    expect(env.llm.callsFor('extraction')[0]!.system).toContain('THIS IS A CORRECTED CLASS TEST');
    expect(sent).toContain('LEARNER');

    // No grade, no points — not in the sheet's text, not in its name, not in any row of it.
    const row = await env.db.one<{ extracted_text: string; title: string; dump: string }>(
      `select extracted_text, title, row_to_json(m)::text as dump from materials m where id = $1`,
      [m.id],
    );
    expect(row.extracted_text).toBe(original);
    expect(row.title).toBe('Aus deiner Arbeit: Mathe');
    for (const leak of ['Note', '12/20', 'Punkte', '"grade"', '"points"']) {
      expect(row.dump).not.toContain(leak);
    }
    const itemDump = await env.db.one<{ dump: string }>(
      `select coalesce(string_agg(row_to_json(i)::text, ' '), '') as dump from items i where material_id = $1`,
      [m.id],
    );
    for (const leak of ['Note:', '12/20', 'Punkte']) expect(itemDump.dump).not.toContain(leak);
  });

  it('a corrected test with nothing marked fails with its own reason, not as a bad photo', async () => {
    const m = await send(env, lena, reading([]), { source: 'corrected_test' });
    expect(m.view).toMatchObject({ status: 'failed', failure_reason: 'nothing_marked' });
  });

  it('a reading that only wrote the original tasks again went wrong — it is not her photo', async () => {
    const m = await send(
      env,
      lena,
      reading([item('Berechne 3/4 + 1/8', '7/8', { original: 'Berechne 3/4 + 1/8' })]),
      { source: 'corrected_test' },
    );
    expect(m.view).toMatchObject({ status: 'failed', failure_reason: 'model_error' });
  });

  it('homework stays the sheet she has to do, whatever source the app sends', async () => {
    env.llm.byDefault('hints', { json: { hints: [] } });
    const created = await lena.api.post<{ material: MaterialView }>('/materials', {
      client_request_id: randomUUID(),
      photo_mimes: ['image/jpeg'],
      purpose: 'homework',
      source: 'corrected_test',
    });
    expect(created.status).toBe(201);
    expect(created.body.material.source).toBe('sheet');
  });

  it('Buddy asks for the corrected test in the chat; the photo is read as one whatever the app sends', async () => {
    env.llm.script(
      'buddy_turn',
      turn({
        actions: [
          {
            tool: 'request_material',
            args: { goal: null, title: 'deine korrigierte Mathearbeit', source: 'corrected_test' },
          },
        ],
        reply: 'Fotografier mir die Arbeit, dann üben wir genau die Fehler.',
      }),
    );
    const res = await lena.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: randomUUID(),
      text: 'ich hab meine mathearbeit zurück, voll viele fehler',
    });
    expect(res.status).toBe(200);
    const now = res.body.home.now;
    expect(now).toMatchObject({ type: 'capture_needed', source: 'corrected_test' });
    const stepId = now?.type === 'capture_needed' ? now.step_id : null;
    expect(stepId).not.toBeNull();

    // The app links the photo to the step and sends no source: the step decides.
    const m = await send(
      env,
      lena,
      reading([item('Berechne 2/3 + 1/6', '5/6', { original: 'Berechne 3/4 + 1/8' })]),
      { step_id: stepId },
    );
    expect(m.view).toMatchObject({ status: 'ready', source: 'corrected_test', item_count: 1 });
    const step = await env.db.one<{ state: string }>(
      `select state from buddy_steps where id = $1`,
      [stepId],
    );
    expect(step.state).toBe('done');

    // Another learner cannot attach a photo to her step.
    const tom = await onboard(env, { relation: 'child', name: 'Tom', birthDate: '2013-05-01' });
    const foreign = await tom.api.post('/materials', {
      client_request_id: randomUUID(),
      photo_mimes: ['image/jpeg'],
      step_id: stepId,
    });
    expect(foreign.status).toBe(404);
  });

  it("today's notebook entry becomes at most five questions, prepared for tomorrow morning", async () => {
    const seven = [1, 2, 3, 4, 5, 6, 7].map((n) => item(`${n} · 4 = ?`, String(n * 4)));
    const m = await send(
      env,
      lena,
      reading(seven, {
        title: 'Malnehmen mit 4',
        extracted_text: 'Heute: Viererreihe',
        more_items: true,
        grade: undefined,
        points: undefined,
      }),
      { source: 'today_notes' },
    );
    expect(m.view).toMatchObject({ status: 'ready', source: 'today_notes', item_count: 5 });
    // Never read again for "the rest": five is what a notebook entry becomes.
    expect(env.llm.callsFor('extraction')).toHaveLength(1);
    expect(env.llm.callsFor('extraction')[0]!.system).toContain("THIS IS TODAY'S NOTEBOOK ENTRY");

    const step = await env.db.one<{
      state: string;
      planned_date: string;
      agreed: boolean;
      payload: { item_ids: string[] };
    }>(
      `select state, planned_date::text, agreed, payload from buddy_steps
        where learner_id = $1 and kind = 'practice'`,
      [lena.learnerId],
    );
    // Thursday's lesson → Friday morning, her zone; Buddy's own idea, not an agreed reminder.
    expect(step).toMatchObject({ state: 'prepared', planned_date: '2026-10-02', agreed: false });
    expect(step.payload.item_ids).toHaveLength(5);

    // Not on today's home: it is tomorrow's practice.
    const today = await lena.api.get<BuddyHome>('/buddy');
    expect(today.body.now?.type).not.toBe('practice_ready');
    // Tomorrow it is the thing to do.
    env.clock.advance(DAY);
    const tomorrow = await lena.api.get<BuddyHome>('/buddy');
    expect(tomorrow.body.now).toMatchObject({ type: 'practice_ready', question_count: 5 });

    // Buddy knows what the sheet is, so he does not prepare it a second time.
    env.llm.script('buddy_turn', turn({ reply: 'Schau ich nach.' }));
    await lena.api.post('/buddy/messages', { client_message_id: randomUUID(), text: 'und jetzt?' });
    const state = ScriptedGateway.textOf(env.llm.callsFor('buddy_turn').at(-1)!);
    expect(state).toContain("her notebook entry of a day's lesson");
  });
});
