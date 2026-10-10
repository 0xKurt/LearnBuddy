// Tasks in parts across subjects (issue #297, Schnitt 4) through the real API on a real Postgres:
// chemistry with Folgefehler over two steps, a German text and a history source longer than a
// situation, a table and a chart as the material — and the photo of a sheet's material above
// every part. The checks are the ones every part goes through (`practice/taskParts.ts`); what is
// asserted is what code decides, with the model scripted.
// Failure paths: a chart whose reading does not give the key and a broken table cost their task
// whole, another learner gets nothing, and a part answered twice counts once.
// docs/architecture.md §Practice ("Aufgaben mit Teilaufgaben").
// requires live verification in Claude Code session (needs a running Postgres; scripted model)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';
import { pageJpeg } from '../testing/pagePhoto.js';
import { poolSheet } from '../testing/scenarios/taskParts.js';
import {
  BURN_STEM,
  burnTask,
  CART_STEM,
  CART_TABLE,
  cartTask,
  cityTask,
  partTaskRun,
  SOURCE_STEM,
  SOURCE_WHO,
  sourceTask,
  STORY_STEM,
  storyTask,
} from '../testing/scenarios/taskSubjects.js';

const dbReady = await testDatabaseAvailable();

const WAIT = { json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null } };

describe.skipIf(!dbReady)('tasks in parts across subjects (#297, Schnitt 4)', () => {
  let env: TestEnv;
  let l: Learner;

  /** A practice run the generator writes with these tasks in parts. */
  async function prepare(partTasks: unknown[], who: Learner = l): Promise<SessionView> {
    env.llm.script('explain', () => partTaskRun(partTasks));
    env.llm.script('hints', () => ({
      items: Array.from({ length: 8 }, (_, i) => ({
        n: i + 1,
        hints: ['Schau dir das Material noch einmal an.'],
        worked_solution: null,
      })),
    }));
    const res = await who.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Aufgaben wie in der Klassenarbeit',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();
    return (await who.api.get<SessionView>(`/practice/sessions/${res.body.id}`)).body;
  }

  /** A photographed sheet with its pages as real JPEGs; the sheet once reading and figures ran. */
  async function photograph(sheet: unknown): Promise<string> {
    env.llm.script('extraction', { json: sheet });
    const created = await l.api.post<{
      material: { id: string };
      uploads: Array<{ path: string }>;
    }>('/materials', {
      client_request_id: randomUUID(),
      photo_mimes: ['image/jpeg'],
      purpose: 'study',
    });
    expect(created.status).toBe(201);
    for (const u of created.body.uploads) env.storage.put(u.path, await pageJpeg());
    const id = created.body.material.id;
    expect((await l.api.post(`/materials/${id}/submit`)).status).toBe(202);
    await env.flushBackground();
    return id;
  }

  const answer = (s: SessionView, itemId: string, text: string, turn = randomUUID()) =>
    l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: turn,
      item_id: itemId,
      text,
    });

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-10T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2010-04-02' });
    env.llm.byDefault('buddy_check', WAIT);
  });
  // An unexpected or unused model call fails the test: code decides what code must decide.
  afterEach(async () => {
    await env.closeChecked();
  });

  it('chemistry: b) and c) follow her wrong a) by code, step after step; d) is open', async () => {
    const s = await prepare([burnTask()]);
    expect(s.items.map((i) => i.item.task_part?.part)).toEqual(['a', 'b', 'c', 'd']);
    expect(s.items.map((i) => i.item.kind)).toEqual(['numeric', 'numeric', 'numeric', 'long']);
    for (const i of s.items) expect(i.item.task_part?.stem).toBe(BURN_STEM);
    const [a, b, c] = s.items.map((i) => i.item.id) as [string, string, string];
    // a) wrong: 4 mol instead of 2 — and b), c) carried on correctly from it.
    expect((await answer(s, a, '4')).body.verdict).toBe('incorrect');
    const onB = await answer(s, b, '2');
    expect(onB.body.verdict).toBe('correct');
    expect(onB.body.reply.text).toContain('a)');
    const turn = randomUUID();
    const onC = await answer(s, c, '64', turn);
    expect(onC.body.verdict).toBe('correct');
    expect(onC.body.reply.text).toContain('b)');
    // The same answer twice counts once, and no model was asked for any of it.
    expect((await answer(s, c, '64', turn)).body).toEqual(onC.body);
    const tries = await env.db.one<{ n: number }>(
      `select attempts as n from session_items where session_id = $1 and item_id = $2`,
      [s.id, c],
    );
    expect(tries.n).toBe(1);
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('German: a text longer than a situation is the material of every part', async () => {
    expect(STORY_STEM.length).toBeGreaterThan(300);
    const s = await prepare([storyTask()]);
    expect(s.items.map((i) => i.item.kind)).toEqual(['multiple_choice', 'long']);
    for (const i of s.items) {
      expect(i.item.task_part).toMatchObject({ letters: ['a', 'b'], stem: STORY_STEM });
    }
    // The open part's key points stay on the server.
    expect(JSON.stringify(s)).not.toContain('trotz der Angst handelt');
  });

  it('a table as the material stands above every part, drawn from its data', async () => {
    const s = await prepare([cartTask()]);
    expect(s.items).toHaveLength(3);
    for (const i of s.items) {
      expect(i.item.task_part?.stem).toBe(CART_STEM);
      expect(i.item.figure).toEqual(CART_TABLE);
    }
    // The model was offered the material's drawings, and only those.
    type Node = { properties: Record<string, Node>; items: Node; anyOf?: Node[]; enum?: string[] };
    const sent = env.llm.callsFor('explain')[0]!.schema as unknown as Node;
    const material = sent.properties.part_tasks!.items.properties.figure!;
    const kinds = (material.anyOf ?? [])
      .flatMap((o) => o.anyOf ?? [o])
      .flatMap((o) => o.properties?.type?.enum ?? []);
    expect(kinds).toEqual([
      'table',
      'function_plot',
      'bar_chart',
      'line_chart',
      'climate_chart',
      'pie_chart',
      'scatter_plot',
    ]);
    // Folgefehler with the table beside it, as without one.
    const [a, b] = s.items.map((i) => i.item.id) as [string, string];
    expect((await answer(s, a, '9 m')).body.verdict).toBe('incorrect');
    expect((await answer(s, b, '3 m/s')).body.verdict).toBe('correct');
    // Another learner can neither see the run nor answer its parts.
    const tom = await onboard(env, { relation: 'child', name: 'Tom', birthDate: '2010-05-01' });
    expect((await tom.api.get(`/practice/sessions/${s.id}`)).status).toBe(404);
    const his = await tom.api.post(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: a,
      text: '6',
    });
    expect(his.status).toBe(404);
  });

  it('a chart as the material: a value read off it is checked by code, a wrong one costs the task', async () => {
    const s = await prepare([cityTask('3.2'), cityTask()]);
    // The first task's reading does not give its key (3.7 on the chart): dropped whole, never a
    // b) without its a). The second holds.
    expect(s.items.map((i) => i.item.task_part?.part)).toEqual(['a', 'b']);
    expect(s.items.map((i) => i.item.task_part?.ref)).toEqual(['p1', 'p1']);
    expect(s.items.every((i) => i.item.figure?.type === 'line_chart')).toBe(true);
    const keys = await env.db.query<{ answer: string }>(
      `select i.answer from session_items si join items i on i.id = si.item_id
        where si.session_id = $1 and i.kind = 'numeric'`,
      [s.id],
    );
    expect(keys.map((k) => k.answer)).toEqual(['3.7']);
  });

  it('a broken table costs its task, never one part of it', async () => {
    const broken = { type: 'table', header: [], rows: [] };
    const s = await prepare([cartTask(broken), burnTask()]);
    expect(s.items.map((i) => i.item.task_part?.stem)).toEqual(Array(4).fill(BURN_STEM));
    expect(s.items.some((i) => i.item.figure !== null)).toBe(false);
  });

  it('history: a source longer than 300 characters from a photo is ONE task', async () => {
    expect(SOURCE_STEM.length).toBeGreaterThan(300);
    const id = await photograph(poolSheet(sourceTask()));
    const parts = await env.db.query<{
      kind: string;
      prompt: string;
      task_part: { part: string; stem: string } | null;
    }>(
      `select kind, prompt, task_part from items where material_id = $1 and task_part is not null
        order by seq`,
      [id],
    );
    expect(parts.map((p) => [p.task_part!.part, p.kind, p.prompt])).toEqual([
      ['a', 'multiple_choice', SOURCE_WHO],
      ['b', 'long', expect.stringContaining('Beurteile')],
    ]);
    // The source stays whole, line break and all.
    for (const p of parts) expect(p.task_part!.stem).toBe(SOURCE_STEM);
  });

  it('the photo of the material stands above every part of its task, not beside other questions', async () => {
    // The figures pass names only a) (index 1: the sheet's own question is 0).
    env.llm.script('figures', {
      json: {
        assets: [
          { page_index: 0, box: [0.05, 0.05, 0.55, 0.55], label: 'Becken', item_indices: [1] },
        ],
      },
    });
    const id = await photograph(poolSheet());
    const rows = await env.db.query<{ part: string | null; image_id: string | null }>(
      `select task_part->>'part' as part, image_id from items where material_id = $1 order by seq`,
      [id],
    );
    const crop = rows[1]!.image_id;
    expect(crop).not.toBeNull();
    expect(rows).toEqual([
      { part: null, image_id: null },
      { part: 'a', image_id: crop },
      { part: 'b', image_id: crop },
      { part: 'c', image_id: crop },
    ]);
  });
});
