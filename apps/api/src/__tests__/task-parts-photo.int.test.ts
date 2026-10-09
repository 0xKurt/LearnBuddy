// Tasks in parts from a photo end to end (issue #297, step 3): a worksheet task with one material and
// subtasks a), b), c) is stored as ONE task — its material on every part, the parts lettered by
// code, b) computed from a) with the Folgefehler, c) open and checked against key points — exactly
// as a generated task is (`practice/taskParts.ts`). The reading reports the structure; code checks
// it, and a structure that does not hold gives the subtasks back as separate questions, none lost.
// docs/architecture.md §Practice ("Aufgaben mit Teilaufgaben").
// Failure paths: another learner, the same sheet sent and submitted twice, a model outage while
// reading, a reading whose lease went to a newer run (stale), and structures code refuses.
// requires live verification in Claude Code session (needs a running Postgres; scripted model)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, MaterialView, SessionView } from '@learnbuddy/shared-types/contracts';
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
import {
  LITRES,
  POOL_STEM,
  POOL_WHY,
  poolSheet,
  poolTask,
} from '../testing/scenarios/taskParts.js';

const dbReady = await testDatabaseAvailable();

const WAIT = { json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null } };

const A = 'Wie viel Wasser fehlt noch, bis das Becken voll ist?';
const B = 'Wie viele Stunden braucht die Pumpe dafür?';

type Row = {
  kind: string;
  prompt: string;
  hints: string[];
  rubric: { elements: Array<{ name: string; missing: string }> } | null;
  task_part: { group: string; part: string; of: number; stem: string; from: string | null } | null;
};

describe.skipIf(!dbReady)('tasks in parts from a photo (#297, step 3)', () => {
  let env: TestEnv;
  let l: Learner;

  /** A sheet created for her; its photos are in Storage, not yet submitted. */
  async function create(request = randomUUID(), purpose = 'study'): Promise<string> {
    const created = await l.api.post<{
      material: MaterialView;
      uploads: Array<{ path: string }>;
    }>('/materials', { client_request_id: request, photo_mimes: ['image/jpeg'], purpose });
    expect(created.status).toBe(201);
    for (const u of created.body.uploads) env.storage.put(u.path);
    return created.body.material.id;
  }

  /** A photographed worksheet, read by the scripted model; the sheet once the reading is done. */
  async function photograph(sheet: unknown = poolSheet(), purpose = 'study'): Promise<string> {
    env.llm.script('extraction', { json: sheet });
    const id = await create(randomUUID(), purpose);
    expect((await l.api.post(`/materials/${id}/submit`)).status).toBe(202);
    await env.flushBackground();
    return id;
  }

  const rows = (materialId: string) =>
    env.db.query<Row>(
      `select kind, prompt, hints, rubric, task_part from items where material_id = $1 order by seq`,
      [materialId],
    );

  async function practise(materialId: string, who: Learner = l): Promise<SessionView> {
    const started = await who.api.post<SessionView>('/practice/sessions', {
      material_id: materialId,
    });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    return started.body;
  }

  const answer = (s: SessionView, itemId: string, text: string) =>
    l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: itemId,
      text,
    });

  async function tick(): Promise<void> {
    const res = await env.app.request('/v1/internal/tick', {
      method: 'POST',
      headers: { 'x-tick-secret': TEST_TICK_SECRET },
    });
    expect(res.status).toBe(200);
  }

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-08T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2010-04-02' });
    env.llm.byDefault('buddy_check', WAIT);
  });
  // An unexpected or unused model call fails the test: code decides what code must decide.
  afterEach(async () => {
    await env.closeChecked();
  });

  it('a photographed a) b) c) is ONE task: lettered by code, its material on every part', async () => {
    const id = await photograph();
    const stored = await rows(id);
    // The sheet's other question stays a question of its own, before the task as on the sheet.
    expect(stored.map((r) => r.prompt)).toEqual([LITRES.prompt, A, B, POOL_WHY]);
    expect(stored[0]!.task_part).toBeNull();
    const parts = stored.slice(1);
    expect(new Set(parts.map((r) => r.task_part!.group)).size).toBe(1);
    expect(parts.map((r) => r.task_part)).toEqual(
      ['a', 'b', 'c'].map((part, i) => ({
        group: parts[0]!.task_part!.group,
        part,
        of: 3,
        stem: POOL_STEM,
        from: i === 1 ? 'a / 25' : null,
      })),
    );
    expect(parts.map((r) => r.kind)).toEqual(['numeric', 'numeric', 'long']);
    // The reading's help stays on the computed parts; the open part's help is its follow-ups.
    expect(parts[0]!.hints).toHaveLength(2);
    expect(parts[2]!.hints).toEqual([
      'Was ändert sich an der Wassermenge, die noch fehlt?',
      'Wie viel Wasser schaffen beide zusammen in einer Stunde?',
    ]);
    expect(parts[2]!.rubric!.elements.map((e) => e.name)).toEqual(['Menge', 'Leistung']);

    const s = await practise(id);
    expect(s.items.map((i) => i.item.task_part?.part ?? null)).toEqual([null, 'a', 'b', 'c']);
    for (const si of s.items.slice(1)) {
      expect(si.item.task_part).toMatchObject({
        ref: 'p1',
        letters: ['a', 'b', 'c'],
        stem: POOL_STEM,
      });
    }
    // Neither the formula, the key points nor the task's id reach the app.
    const body = JSON.stringify(s);
    for (const secret of ['a / 25', 'dieselbe', parts[0]!.task_part!.group])
      expect(body).not.toContain(secret);
    // The reading was told how to report a task in parts, in its schema and its rules.
    const read = env.llm.callsFor('extraction')[0]!;
    expect(JSON.stringify(read.schema)).toContain('part_tasks');
    expect(read.system).toContain('Tasks in parts ("part_tasks")');
  });

  it('mixed parts: b) follows her wrong a) by code, c) is judged on its points with ONE follow-up', async () => {
    const s = await practise(await photograph());
    const [, a, b, c] = s.items.map((i) => i.item.id) as [string, string, string, string];
    expect((await answer(s, a, '250 m³')).body.verdict).toBe('incorrect');
    const followed = await answer(s, b, '10 h');
    expect(followed.body.verdict).toBe('correct');
    expect(followed.body.reply.text).toContain('mit deinem Ergebnis aus a)');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);

    env.llm.script('tutor', {
      json: {
        intent: 'answer',
        verdict: 'partially_correct',
        reply: 'Schon gut begründet.',
        gave_hint: false,
        revealed_answer: false,
        elements: [
          { element: 'r1', met: false, quote: '', verbs: [] },
          { element: 'r2', met: true, quote: 'doppelt so viel Wasser', verbs: [] },
        ],
      },
    });
    const open = await answer(s, c, 'Zusammen pumpen sie doppelt so viel Wasser.');
    expect(open.status, JSON.stringify(open.body)).toBe(200);
    const reply = open.body.reply.text.replaceAll(' ', ' ');
    expect(reply).toContain('Menge fehlt noch');
    expect(reply).toContain('✓ Leistung');
    expect(reply).toContain('Was ändert sich an der Wassermenge, die noch fehlt?');
    expect(reply).not.toContain('Wie viel Wasser schaffen beide');
    expect(open.body.verdict).toBe('partially_correct');
    // The tutor judged c) on the task's material, not on the whole sheet.
    const seen = ScriptedGateway.textOf(env.llm.callsFor('tutor')[0]!);
    expect(seen).toContain(`STUDY MATERIAL:\n${POOL_STEM}`);
  });

  it.each([
    ['a formula that does not give its key', poolTask(['a', 'b', 'c'], 'a / 20')],
    ['letters with a gap (c was a drawing)', poolTask(['a', 'b', 'd'])],
    [
      'a material too long to stand above a part',
      { ...poolTask(), stem: Array(4).fill(POOL_STEM).join(' ') },
    ],
    [
      'a part of a form no part has',
      {
        ...poolTask(),
        parts: [{ ...poolTask().parts[0]!, kind: 'formula' }, ...poolTask().parts.slice(1)],
      },
    ],
  ])('%s: the subtasks come back as separate questions, none lost', async (_, task) => {
    const stem = (task as { stem: string }).stem;
    const id = await photograph(poolSheet(task));
    const stored = await rows(id);
    expect(stored.map((r) => r.task_part)).toEqual([null, null, null, null]);
    // Each answerable on its own: the material in front of its question.
    expect(stored.map((r) => r.prompt)).toEqual([
      LITRES.prompt,
      `${stem}\n\n${A}`,
      `${stem}\n\n${B}`,
      `${stem}\n\n${POOL_WHY}`,
    ]);
    expect(stored[1]!.hints).toHaveLength(2);
    const view = (await l.api.get<MaterialView>(`/materials/${id}`)).body;
    expect(view.status).toBe('ready');
  });

  it('another learner can neither practise her sheet, see her task nor answer its parts', async () => {
    const id = await photograph();
    const s = await practise(id);
    const tom = await onboard(env, { relation: 'child', name: 'Tom', birthDate: '2010-05-01' });
    const theirs = await tom.api.post('/practice/sessions', { material_id: id });
    expect(theirs.status).toBe(404);
    expect((await tom.api.get(`/practice/sessions/${s.id}`)).status).toBe(404);
    const reply = await tom.api.post(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: s.items[1]!.item.id,
      text: '300',
    });
    expect(reply.status).toBe(404);
    expect((await tom.api.get(`/materials/${id}/items`)).status).toBe(404);
    // Nothing of hers became his.
    const his = await env.db.one<{ n: number }>(
      `select count(*)::int as n from items where learner_id = $1`,
      [tom.learnerId],
    );
    expect(his.n).toBe(0);
  });

  it('the same sheet sent and submitted twice is read once and stored as one task', async () => {
    env.llm.script('extraction', { json: poolSheet() });
    const request = randomUUID();
    const id = await create(request);
    expect(await create(request)).toBe(id);
    expect((await l.api.post(`/materials/${id}/submit`)).status).toBe(202);
    expect((await l.api.post(`/materials/${id}/submit`)).status).toBe(202);
    await env.flushBackground();
    env.clock.minutes(10);
    await tick();
    await env.flushBackground();
    const stored = await rows(id);
    expect(stored).toHaveLength(4);
    expect(new Set(stored.flatMap((r) => (r.task_part ? [r.task_part.group] : []))).size).toBe(1);
    expect(env.llm.callsFor('extraction')).toHaveLength(1);
  });

  it('a model outage while reading stores no part; the retry stores the whole task once', async () => {
    env.llm.script('extraction', { error: new LlmError('unavailable', 'down') });
    const id = await create();
    expect((await l.api.post(`/materials/${id}/submit`)).status).toBe(202);
    await env.flushBackground();
    expect(await rows(id)).toEqual([]);
    expect((await l.api.get<MaterialView>(`/materials/${id}`)).body.status).not.toBe('ready');

    env.llm.script('extraction', { json: poolSheet() });
    env.clock.minutes(5);
    await tick();
    await env.flushBackground();
    const stored = await rows(id);
    expect(stored.map((r) => r.task_part?.part ?? null)).toEqual([null, 'a', 'b', 'c']);
    expect(env.llm.callsFor('extraction')).toHaveLength(2);
  });

  it('homework: the task in parts is helped with as one task, in her help session', async () => {
    const id = await photograph(poolSheet(), 'homework');
    const help = await practise(id);
    expect(help.items.map((i) => i.item.task_part?.part ?? null)).toEqual([null, 'a', 'b', 'c']);
    expect(help.items[2]!.item.task_part).toMatchObject({ stem: POOL_STEM });
    // Homework is read with its own schema, which offers the task too.
    expect(JSON.stringify(env.llm.callsFor('extraction')[0]!.schema)).toContain('part_tasks');
  });

  it('a sheet with more than one run holds: the run takes the whole task, never a) b) without c)', async () => {
    const more = Array.from({ length: 12 }, (_, i) => ({
      ...LITRES,
      prompt: `Wie viele Liter sind ${i + 2} m³?`,
      answer: String((i + 2) * 1000),
    }));
    const s = await practise(await photograph({ ...poolSheet(), items: more }));
    // Fourteen asked for (`questionCountFor(12)`): the task's c) comes along, in letter order.
    expect(s.items.map((i) => i.item.task_part?.part ?? null)).toEqual([
      ...more.map(() => null),
      'a',
      'b',
      'c',
    ]);
  });

  it('stale: a reading whose lease went to a newer run stores no part of the task', async () => {
    const id = await create();
    env.llm.script('extraction', async () => {
      await env.db.query(
        `update jobs set lease_token = gen_random_uuid() where kind = 'extract_material'
            and payload ->> 'material_id' = $1`,
        [id],
      );
      return poolSheet();
    });
    expect((await l.api.post(`/materials/${id}/submit`)).status).toBe(202);
    await env.flushBackground();
    expect(await rows(id)).toEqual([]);
    const sheet = await env.db.one<{ status: string }>(
      `select status from materials where id = $1`,
      [id],
    );
    expect(sheet.status).toBe('processing');
  });
});
