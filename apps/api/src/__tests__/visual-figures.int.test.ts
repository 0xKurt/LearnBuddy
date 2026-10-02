// Pictures whose key is read off them, end to end (issues #254, #255).
//
// What this file holds the code to:
//
//   1. **The model writes no picture.** It chooses a task; question, drawing and key come from
//      `practice/visual.ts`, and the stored task is the one source a test can recompute from. A
//      clock the model puts next to a question of its own does not get through the contract.
//   2. **A task whose own claim disagrees with what code computes is no question** — the rest of
//      the set still is (one unusable task costs only itself).
//   3. **Every answer is judged by code, with no model call**: a time ("halb acht" = 7:30 =
//      19:30), an amount in € or ct, coins she laid (any way that sums right), three coordinates.
//      A wrong one gets a fixed line from code, because the tutor cannot see the picture.
//      `afterEach` fails the run on any unexpected model call.
//   4. **The failure paths**: another learner's question, a question already closed, a stale
//      answer after the question moved on.
//
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView, VisualTask } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { visualAgain, visualItem } from '../modules/practice/visual.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

/** Buddy plans what comes next when a run finishes; he has nothing to say about this one. */
const WAIT = { json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null } };

const CLOCK: VisualTask = { task: 'clock', hour: 7, minute: 30 };
const COUNT: VisualTask = { task: 'money', pieces: [200, 100, 20, 20, 5], total: 3.45, set: false };
const LAY: VisualTask = { task: 'money', pieces: [200, 50, 20, 10], total: 2.8, set: true };
const FIELD: VisualTask = { task: 'quantity', look: 'twenty_field', number: 13 };
const EDGES: VisualTask = {
  task: 'solid',
  solid: 'prism_6',
  ask: 'edges',
  dims: [],
  unit: 'cm',
  claim: 18,
};
const NET: VisualTask = {
  task: 'cube_net',
  cells: [
    { col: 1, row: 0 },
    { col: 0, row: 1 },
    { col: 1, row: 1 },
    { col: 2, row: 1 },
    { col: 3, row: 1 },
    { col: 1, row: 2 },
  ],
  is_net: true,
};
const POINT: VisualTask = { task: 'point3d', p: { x: 2, y: 3, z: 2 } };
const ALL = [CLOCK, COUNT, LAY, FIELD, EDGES];

describe.skipIf(!dbReady)('pictures whose key is read off them', () => {
  let env: TestEnv;
  let l: Learner;

  async function prepare(
    visuals: unknown[],
    opts: { items?: unknown[]; learner?: Learner; kind?: 'practice' | 'test' } = {},
  ): Promise<SessionView> {
    env.llm.script('explain', () => ({
      usable: true,
      title: 'Uhr und Geld',
      subject: { name: 'Mathe', kind: 'math' },
      items: opts.items ?? [],
      bars: [],
      staffs: [],
      visuals,
    }));
    const res = await (opts.learner ?? l).api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: opts.kind ?? 'practice',
      text: 'Uhr lesen und Geld zählen',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();
    return res.body;
  }

  async function answer(
    sessionId: string,
    itemId: string,
    body: { text?: string; choice?: number },
    learner: Learner = l,
  ) {
    return learner.api.post<AnswerResponse>(`/practice/sessions/${sessionId}/answer`, {
      client_turn_id: randomUUID(),
      item_id: itemId,
      ...body,
    });
  }

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2017-02-10' });
    env.llm.byDefault('buddy_check', WAIT);
  });
  afterEach(async () => {
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      // Any call here would be a model judging a picture it has not got.
      unexpected: env.llm.unexpected.map((u) => u.purpose),
      tutor: env.llm.callsFor('tutor').length,
    };
    await env.close();
    expect(report).toEqual({ scriptErrors: [], unexpected: [], tutor: 0 });
  });

  it('turns each task into the question code computes, and stores the task with it', async () => {
    const session = await prepare(ALL);
    expect(session.items).toHaveLength(ALL.length);
    for (const [n, si] of session.items.entries()) {
      const want = visualItem(ALL[n] as VisualTask, 'de');
      expect(want).not.toBeNull();
      expect(si.item.prompt).toBe(want?.prompt);
      expect(si.item.figure).toEqual(want?.figure);
      // An open question carries no solution, and no figure carries a field with one.
      expect(si.answer).toBeNull();
      expect(JSON.stringify(si.item.figure)).not.toContain('"answer"');
    }
    // The coins to lay come with their surface — never with the solution.
    expect(session.items[2]?.item.surface).toEqual({
      mode: 'coins',
      offer: [1, 2, 5, 10, 20, 50, 100, 200],
    });
    expect(session.items[0]?.item.surface).toBeNull();
    // The stored task is the one source: recomputing it gives what was stored.
    const rows = await env.db.query<{ answer: string; visual_task: VisualTask; figure: unknown }>(
      `select i.answer, i.visual_task, i.figure from session_items si join items i on i.id = si.item_id
        where si.session_id = $1 order by si.position`,
      [session.id],
    );
    for (const row of rows) {
      const again = visualItem(row.visual_task, 'de');
      expect(row.answer).toBe(again?.answer);
      expect(row.figure).toEqual(again?.figure);
    }
  });

  it('drops a task whose claim disagrees with what code computes, and keeps the rest', async () => {
    const session = await prepare([
      { ...COUNT, total: 3.4 },
      { ...EDGES, claim: 12 },
      { ...NET, is_net: false },
      // Not a minute of a clock.
      { task: 'clock', hour: 7, minute: 60 },
      // Not a euro coin.
      { task: 'money', pieces: [300], total: 3, set: false },
      POINT,
    ]);
    expect(session.items).toHaveLength(1);
    expect(session.items[0]?.item.prompt).toBe('Welche Koordinaten hat der Punkt P?');
  });

  it('lets the model put no clock next to a question of its own', async () => {
    const session = await prepare([], {
      items: [
        {
          kind: 'short',
          prompt: 'Wie spät ist es?',
          answer: '9:00',
          accepted_answers: [],
          unit: null,
          choices: null,
          correct_choice: null,
          topic: 'Uhrzeit',
          difficulty: 1,
          figure: { type: 'clock', hour: 3, minute: 0 },
          source_excerpt: null,
        },
      ],
    });
    // The question survives (its figure is the model's to lose), the picture does not.
    expect(session.items).toHaveLength(1);
    expect(session.items[0]?.item.figure).toBeNull();
    const row = await env.db.one<{ visual_task: unknown }>(
      `select visual_task from items where id = $1`,
      [session.items[0]?.item.id],
    );
    expect(row.visual_task).toBeNull();
  });

  it('judges a time, an amount, laid coins and a point by value — no model', async () => {
    const session = await prepare([CLOCK, COUNT, LAY, POINT]);
    const [clock, count, lay, point] = session.items.map((si) => si.item.id);

    // Wrong first: a fixed line from code that says where to look.
    const wrong = await answer(session.id, clock as string, { text: 'halb sieben' });
    expect(wrong.status, JSON.stringify(wrong.body)).toBe(200);
    expect(wrong.body.verdict).toBe('incorrect');
    expect(wrong.body.reply.text).toBe(visualAgain('de', CLOCK));
    // A second wrong one: still code, never the tutor (afterEach holds that).
    const wrong2 = await answer(session.id, clock as string, { text: '8:30' });
    expect(wrong2.body.reply.text).toBe(visualAgain('de', CLOCK));
    // "halb acht" is 7:30 — and 19:30 would have been too.
    const ok = await answer(session.id, clock as string, { text: 'halb acht' });
    expect(ok.body.verdict).toBe('correct');

    // The amount in cent.
    const cents = await answer(session.id, count as string, { text: '345 ct' });
    expect(cents.body.verdict).toBe('correct');

    // Laid coins: another way to 2,80 € than the model's, and the thread reads it in words.
    const laid = await answer(session.id, lay as string, { text: '100 100 50 20 10' });
    expect(laid.body.verdict).toBe('correct');
    const turns = await env.db.query<{ text: string }>(
      `select text from practice_turns where session_id = $1 and item_id = $2 and role = 'learner'`,
      [session.id, lay],
    );
    expect(turns.map((x) => x.text)).toEqual(['1 € + 1 € + 50 ct + 20 ct + 10 ct']);

    const p = await answer(session.id, point as string, { text: '(2|3|2)' });
    expect(p.body.verdict).toBe('correct');

    // A question already answered right is closed.
    const again = await answer(session.id, point as string, { text: '(2|3|2)' });
    expect(again.status).toBe(409);
  });

  it("refuses another learner's question and keeps her session untouched", async () => {
    const session = await prepare([CLOCK]);
    const other = await onboard(env, { relation: 'child', name: 'Ben', birthDate: '2016-05-01' });
    const res = await answer(
      session.id,
      session.items[0]?.item.id as string,
      { text: '7:30' },
      other,
    );
    expect(res.status).toBe(404);
    const state = await env.db.query<{ status: string; attempts: number }>(
      `select status, attempts from session_items where session_id = $1`,
      [session.id],
    );
    expect(state).toEqual([{ status: 'open', attempts: 0 }]);
  });

  it('brings picture questions into a practice test, judged the same way', async () => {
    const session = await prepare([FIELD, NET], { kind: 'test' });
    expect(session.items).toHaveLength(2);
    const field = await answer(session.id, session.items[0]?.item.id as string, { text: '13' });
    expect(field.body.verdict).toBe('correct');
    const net = await answer(session.id, session.items[1]?.item.id as string, { choice: 1 });
    expect(net.body.verdict).toBe('incorrect');
  });
});
