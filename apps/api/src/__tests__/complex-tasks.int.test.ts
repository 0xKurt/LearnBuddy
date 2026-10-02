// Tasks with several parts (issue #297) on a real Postgres, end to end through the API:
//
//   1. Buddy writes them (`kind: 'complex'`): the model sees the task schema and nothing else; the
//      parts come back as ordinary questions with one shared material and a, b, c; no key and no
//      calculation leaves the server.
//   2. Folgefehler: a) wrong, b) calculated on correctly with HER value from a) → b) is right, with
//      a note saying so — by code, no model. b) wrong both against the key and against her value
//      stays wrong. The chain goes on into c).
//   3. Drafts that do not work out are never stored: a key the calculation does not give, a
//      dependency that points nowhere, a quantity that is not in the material.
//   4. From a photo: the reading recognises the task and stores all its parts; a practice from the
//      sheet holds the task whole and in order; a practice test leaves it out.
//
// No model is asked for any verdict here: `afterEach` fails on any unexpected call.
// docs/architecture.md §Practice ("Tasks with several parts").
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, MaterialView, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HomeworkExtraction } from '../modules/materials/extract.js';
import { selectPracticeItems } from '../modules/practice/selection.js';
import { toJsonSchema } from '../llm/json-schema.js';
import { CHEMIE, DEUTSCH, GESCHICHTE, MATHE, PHYSIK } from '../testing/complex-tasks.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const WAIT = { json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null } };

const answer = (l: Learner, sessionId: string, body: Record<string, unknown>) =>
  l.api.post<AnswerResponse>(`/practice/sessions/${sessionId}/answer`, {
    client_turn_id: randomUUID(),
    ...body,
  });

describe.skipIf(!dbReady)('tasks with several parts', () => {
  let env: TestEnv;
  let l: Learner;

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2010-04-10' });
    env.llm.byDefault('hints', { json: { items: [] } });
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

  async function startRun(...tasks: unknown[]): Promise<SessionView> {
    env.llm.script('explain', (req) => {
      // The task schema, and nothing a task run does not use (#281: no tokens for it).
      const top = Object.keys((req.schema as { properties: Record<string, unknown> }).properties);
      expect(top).toContain('complex');
      expect(top).not.toContain('items');
      expect(top).not.toContain('structured');
      expect(top).not.toContain('reading');
      expect(top).not.toContain('bars');
      expect(JSON.stringify(req.schema)).toContain('"calc"');
      expect(req.system + JSON.stringify(req.contents)).toContain('TASKS WITH SEVERAL PARTS');
      return {
        usable: true,
        title: 'Aufgaben wie in der Arbeit',
        subject: { name: 'Physik', kind: 'physics' },
        complex: tasks,
      };
    });
    const started = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'complex',
      text: 'Aufgaben wie in der Arbeit',
    });
    expect(started.status).toBe(201);
    return started.body;
  }

  it('writes tasks as parts with one material each, and never sends a key or a calculation', async () => {
    const s = await startRun(PHYSIK, MATHE);
    expect(s.mode).toBe('practice');
    expect(s.items.map((i) => [i.item.complex?.ref, i.item.complex?.label])).toEqual([
      ['k1', 'a'],
      ['k1', 'b'],
      ['k1', 'c'],
      ['k2', 'a'],
      ['k2', 'b'],
      ['k2', 'c'],
    ]);
    const first = s.items[0]!.item;
    expect(first.kind).toBe('numeric');
    expect(first.complex).toEqual({
      ref: 'k1',
      label: 'a',
      labels: ['a', 'b', 'c'],
      title: 'Radfahrt',
      lines: PHYSIK.lines,
      figure: null,
    });
    // Nothing the learner may not see: no key, no calculation, no quantities by name.
    const sent = JSON.stringify(s.items.map((i) => i.item));
    expect(sent).not.toContain('calc');
    expect(sent).not.toContain('6250');
    expect(sent).not.toContain('givens');
    expect(s.items.every((i) => i.answer === null)).toBe(true);
    // One stored group per task, the material on every part.
    const rows = await env.db.query<{ g: string; n: string }>(
      `select complex_task->>'group' as g, count(*) as n from items
        where learner_id = $1 and complex_task is not null group by 1`,
      [l.learnerId],
    );
    expect(rows.map((r) => Number(r.n))).toEqual([3, 3]);
  });

  it('counts b) right when she carried her wrong a) on correctly (Folgefehler)', async () => {
    const s = await startRun(PHYSIK, MATHE);
    const [a, b, , ma, mb, mc] = s.items.map((i) => i.item);
    // a) wrong: 100 : 8 is 12.5, she wrote 12.
    const wrongA = await answer(l, s.id, { item_id: a!.id, text: '12' });
    expect(wrongA.body.verdict).toBe('incorrect');
    const shown = await l.api.post<SessionView>(`/practice/sessions/${s.id}/reveal`, {
      item_id: a!.id,
    });
    expect(shown.status).toBe(200);
    // b) with HER 12: ½ · 80 · 12² = 5760 — right, and she is told it is her a) that is off.
    const carried = await answer(l, s.id, { item_id: b!.id, text: '5760' });
    expect(carried.body.verdict).toBe('correct');
    expect(carried.body.reply.text).toContain('Richtig weitergerechnet');
    expect(carried.body.reply.text).toContain('a)');

    // The other task: a) right, b) wrong (she took 0,105 €/min), c) right with HER b).
    expect(
      (await answer(l, s.id, { item_id: ma!.id, text: 'y = 0,09x + 9,99' })).body.verdict,
    ).toBe('correct');
    const wrongB = await answer(l, s.id, { item_id: mb!.id, text: '22,59' });
    expect(wrongB.body.verdict).toBe('incorrect');
    await l.api.post(`/practice/sessions/${s.id}/reveal`, { item_id: mb!.id });
    const carriedC = await answer(l, s.id, { item_id: mc!.id, text: '44,2' });
    expect(carriedC.body.verdict).toBe('correct');
    expect(carriedC.body.reply.text).toContain('b)');
    // Rule verdicts only: not one tutor call.
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('keeps b) wrong when it is wrong with her a) too, and right with the key', async () => {
    const s = await startRun(PHYSIK);
    const [a, b] = s.items.map((i) => i.item);
    await answer(l, s.id, { item_id: a!.id, text: '12' });
    await l.api.post(`/practice/sessions/${s.id}/reveal`, { item_id: a!.id });
    // Neither 5760 (her a) nor 6250 (the key): wrong, by the rules, no model.
    const wrong = await answer(l, s.id, { item_id: b!.id, text: '5000' });
    expect(wrong.body.verdict).toBe('incorrect');
    expect(wrong.body.reply.text).not.toContain('weitergerechnet');
    // With the key's value it is right as always — and no note about a).
    const right = await answer(l, s.id, { item_id: b!.id, text: '6250' });
    expect(right.body.verdict).toBe('correct');
    expect(right.body.reply.text).not.toContain('weitergerechnet');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('gives an open part to the tutor with her earlier answers, and another learner nothing', async () => {
    const s = await startRun(PHYSIK);
    const [a, b, c] = s.items.map((i) => i.item);
    await answer(l, s.id, { item_id: a!.id, text: '12,5' });
    await answer(l, s.id, { item_id: b!.id, text: '6250' });
    env.llm.script('tutor', (req) => {
      const text = JSON.stringify(req.contents);
      expect(text).toContain('THIS IS PART c) OF 3');
      expect(text).toContain('HER ANSWER: 6250');
      expect(text).toContain('Lena fährt mit dem Rad');
      return {
        verdict: 'correct',
        reply: 'Genau – das Quadrat macht es.',
        gave_hint: false,
        revealed: false,
      };
    });
    const open = await answer(l, s.id, {
      item_id: c!.id,
      text: 'Weil die Geschwindigkeit im Quadrat eingeht, wird es 2² = 4-mal so viel.',
    });
    expect(open.status).toBe(200);
    expect(env.llm.callsFor('tutor')).toHaveLength(1);

    const other = await onboard(env, { relation: 'child', name: 'Ben', birthDate: '2010-05-01' });
    const foreign = await answer(other, s.id, { item_id: b!.id, text: '6250' });
    expect(foreign.status).toBe(404);
  });

  it('stores nothing of a draft that does not work out', async () => {
    const badKey = { ...PHYSIK, parts: [PHYSIK.parts[0], { ...PHYSIK.parts[1], answer: '6000' }] };
    const nowhere = { ...MATHE, parts: [MATHE.parts[0], { ...MATHE.parts[1], uses: ['c'] }] };
    const invented = {
      ...CHEMIE,
      givens: CHEMIE.givens.map((g) => (g.name === 'M2' ? { ...g, value: 56.1 } : g)),
      parts: CHEMIE.parts.map((p, n) =>
        n === 2 ? { ...p, answer: '11.11', calc: '[b] * M2' } : p,
      ),
    };
    env.llm.script('explain', {
      json: { usable: true, title: 'Kaputt', subject: null, complex: [badKey, nowhere] },
    });
    const refused = await l.api.post('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'complex',
      text: 'Aufgaben wie in der Arbeit',
    });
    expect(refused.status).toBe(422);
    expect(refused.body).toMatchObject({ error: { details: { reason: 'not_usable' } } });

    // One good task next to a broken one: only the good one, whole.
    env.llm.script('explain', {
      json: { usable: true, title: 'Halb', subject: null, complex: [invented, DEUTSCH] },
    });
    const half = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'complex',
      text: 'Noch mehr Aufgaben',
    });
    expect(half.status).toBe(201);
    expect(half.body.items.map((i) => i.item.complex?.title)).toEqual([
      'Der Anruf',
      'Der Anruf',
      'Der Anruf',
    ]);
    const stored = await env.db.query<{ n: string }>(
      `select count(*) as n from items where learner_id = $1`,
      [l.learnerId],
    );
    expect(Number(stored[0]?.n)).toBe(3);
  });

  it('reads tasks from a photo, keeps each whole in a practice, and leaves them out of a test', async () => {
    env.llm.byDefault('buddy_check', WAIT);
    env.llm.script('extraction', (req) => {
      expect(req.system).toContain('TASKS WITH SEVERAL PARTS ("complex")');
      const schema = JSON.stringify(req.schema);
      expect(schema).toContain('"complex"');
      return {
        is_learning_material: true,
        readable: true,
        title: 'Klassenarbeit Übung',
        subject: { name: 'Geschichte', kind: 'history' },
        extracted_text: [...GESCHICHTE.lines, ...CHEMIE.lines].join('\n'),
        items: [
          {
            kind: 'short',
            prompt: 'In welchem Jahr begann die Märzrevolution?',
            answer: '1848',
            accepted_answers: [],
            unit: null,
            choices: null,
            correct_choice: null,
            topic: 'Revolution 1848',
            difficulty: 1,
            source_excerpt: null,
            hints: [],
            worked_solution: null,
          },
        ],
        structured: [],
        reading: [],
        // The figure is no part of a sheet's task (it is transcribed into the lines).
        complex: [
          { ...GESCHICHTE, figure: undefined },
          { ...CHEMIE, figure: undefined },
        ],
      };
    });
    const created = await l.api.post<{ material: MaterialView; uploads: Array<{ path: string }> }>(
      '/materials',
      { client_request_id: randomUUID(), photo_mimes: ['image/jpeg'] },
    );
    env.storage.put(created.body.uploads[0]!.path);
    await l.api.post(`/materials/${created.body.material.id}/submit`);
    await env.flushBackground();
    const material = (await l.api.get<MaterialView>(`/materials/${created.body.material.id}`)).body;
    expect(material.status).toBe('ready');
    expect(material.item_count).toBe(7);

    // A practice from the sheet: the plain question, then each task whole and in order.
    const practice = await l.api.post<SessionView>('/practice/sessions', {
      client_request_id: randomUUID(),
      mode: 'practice',
      material_id: material.id,
    });
    expect(practice.status).toBe(201);
    const parts = practice.body.items
      .filter((i) => i.item.complex !== null)
      .map((i) => `${i.item.complex!.ref}${i.item.complex!.label}`);
    expect(parts).toEqual(['k1a', 'k1b', 'k1c', 'k2a', 'k2b', 'k2c']);

    const chem = practice.body.items.filter((i) => i.item.complex?.title === 'Magnesium verbrennt');
    expect(chem.map((i) => i.item.kind)).toEqual(['formula', 'numeric', 'numeric']);

    // Two questions asked for: the plain one and part a) — and a) never comes without b) and c).
    const two = await selectPracticeItems(
      env.db,
      l.learnerId,
      { materialId: material.id },
      [],
      2,
      env.clock.now(),
    );
    expect(two).toHaveLength(4);
    const kinds = await env.db.query<{ id: string; part: string | null }>(
      `select id, complex_task->>'part' as part from items where id = any($1::uuid[])`,
      [two],
    );
    const partOf = new Map(kinds.map((k) => [k.id, k.part]));
    expect(two.map((id) => partOf.get(id))).toEqual([null, '0', '1', '2']);

    // A practice test holds no task with several parts (an open part is no test question, #197).
    const test = await l.api.post<SessionView>('/practice/sessions', {
      client_request_id: randomUUID(),
      mode: 'test',
      material_id: material.id,
    });
    expect(test.status).toBe(201);
    expect(test.body.items.map((i) => i.item.prompt)).toEqual([
      'In welchem Jahr begann die Märzrevolution?',
    ]);
  });

  it('helps with homework part by part, so the homework reading is not shown the task schema', () => {
    expect(JSON.stringify(toJsonSchema(HomeworkExtraction))).not.toContain('"calc"');
  });
});
