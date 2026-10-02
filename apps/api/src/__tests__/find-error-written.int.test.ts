// Fehlerdetektiv und schriftliches Rechnen end to end (issue #260): the model writes a worked
// solution with one mistake, or only the numbers of a written calculation; code checks the
// path (exactly one wrong line, where the model says), computes every digit and carry, keeps
// the task in `items.task` — and judges what she taps and types without a model (#224,
// Regel 0). docs/architecture.md §Practice ("Structured items").
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type {
  AnswerResponse,
  MaterialView,
  SessionItemView,
  SessionView,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

/** A bracket slip in line 2, carried on to the end. */
const DETECTIVE = {
  type: 'find_error',
  prompt: 'Tim hat die Gleichung gelöst. Wo ist sein Fehler?',
  lines: ['2(x + 3) = 14', '2x + 3 = 14', '2x = 11', 'x = 5,5'],
  wrong_line: 2,
  fixed_line: '2x + 6 = 14',
  topic: 'Gleichungen',
  difficulty: 3,
  prompt_lang: 'de',
};

const ADDITION = {
  type: 'written_calc',
  op: 'add',
  operands: [476, 358],
  topic: 'Schriftlich addieren',
  difficulty: 2,
  prompt_lang: 'de',
};

/** 476 + 358 = 834, by the server's box ids, without carries (they are optional). */
const ADDITION_RIGHT = { r0: '4', r1: '3', r2: '8' };

describe.skipIf(!dbReady)('find_error and written_calc items', () => {
  let env: TestEnv;
  let l: Learner;

  async function prepare(
    structured: unknown[],
    kind: 'practice' | 'test' = 'practice',
  ): Promise<SessionView> {
    env.llm.script('explain', () => ({
      usable: true,
      title: 'Rechnen',
      subject: { name: 'Mathe', kind: 'math' },
      items: [],
      structured,
    }));
    if (kind === 'practice') {
      env.llm.script('hints', () => ({
        items: structured.map((_, i) => ({
          n: i + 1,
          hints: ['Fang ganz rechts an.'],
          worked_solution: 'Schritt für Schritt von rechts nach links …',
        })),
      }));
    }
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind,
      text: 'Schriftlich rechnen',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();
    return res.body;
  }

  function post(session: SessionView, itemId: string, parts: unknown, turn = randomUUID(), as = l) {
    return as.api.post<AnswerResponse>(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: turn,
      item_id: itemId,
      parts,
    });
  }

  const digits = (boxes: Record<string, string>) => ({
    type: 'written_calc',
    boxes: Object.entries(boxes).map(([id, digit]) => ({ id, digit })),
  });
  const detective = (line: string, fix: string) => ({ type: 'find_error', line, fix });

  const boxIds = (si: SessionItemView | undefined): string[] => {
    const view = si?.item.task_view;
    if (view?.type !== 'written_calc') return [];
    return view.rows.flatMap((r) =>
      r.cells.flatMap((c) => (c !== null && 'id' in c ? [c.id] : [])),
    );
  };

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterEach(async () => {
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      // A tutor call here would mean code could not decide what it must decide.
      unexpected: env.llm.unexpected.map((u) => u.purpose),
      pending: env.llm.pending(),
    };
    await env.close();
    expect(report).toEqual({ scriptErrors: [], unexpected: [], pending: 0 });
  });

  it('a written addition: code writes the instruction and the grid, and judges it digit by digit', async () => {
    const session = await prepare([ADDITION]);
    const si = session.items[0]!;
    expect(si.item.kind).toBe('written_calc');
    expect(si.item.prompt).toBe('Rechne schriftlich: 476 + 358');
    expect(si.item.task_view).toMatchObject({ type: 'written_calc', op: 'add', cols: 4 });
    expect(boxIds(si).sort()).toEqual(['c1', 'c2', 'r0', 'r1', 'r2']);
    const row = await env.db.one<{ answer: string; task: unknown }>(
      `select answer, task from items where id = $1`,
      [si.item.id],
    );
    // Stored: the operation and its numbers, nothing else — every key is computed.
    expect(row).toEqual({
      answer: '476 + 358 = 834',
      task: { type: 'written_calc', op: 'add', operands: ['476', '358'] },
    });

    // The carry forgotten in the tens: named by its column, by code.
    const miss = await post(session, si.item.id, digits({ r0: '4', r1: '2', r2: '8' }));
    expect(miss.status, JSON.stringify(miss.body)).toBe(200);
    expect(miss.body.verdict).toBe('incorrect');
    expect(miss.body.reply.text).toBe('Fast – bei den Zehnern fehlt der Übertrag.');
    expect(miss.body.session.turns.find((t) => t.role === 'learner')?.text).toBe('476 + 358 = 824');

    const right = await post(session, si.item.id, digits({ ...ADDITION_RIGHT, c1: '1', c2: '1' }));
    expect(right.body.verdict).toBe('correct');
    expect(right.body.session.items[0]?.item.task_view).toBeNull();
    const how = await env.db.one<{ answered_by: string }>(
      `select answered_by from session_items where session_id = $1`,
      [session.id],
    );
    expect(how.answered_by).toBe('typed');
  });

  it('a written division: the quotient from the highest place, a remainder left out named by its column', async () => {
    const session = await prepare([
      // Not even: a remainder this grid has no box for, never stored.
      { ...ADDITION, op: 'div', operands: [847, 3] },
      { ...ADDITION, op: 'div', operands: [846, 3] },
    ]);
    expect(session.items).toHaveLength(1);
    const si = session.items[0]!;
    expect(si.item.prompt).toBe('Rechne schriftlich: 846 : 3');
    expect(si.item.task_view).toMatchObject({ type: 'written_calc', op: 'div', cols: 6 });
    expect(boxIds(si).sort()).toEqual(['c0', 'c1', 'r0', 'r1', 'r2']);
    // 4 : 3 = 1 instead of 24 : 3 = 8.
    const miss = await post(session, si.item.id, digits({ r2: '2', r1: '1', r0: '2' }));
    expect(miss.body.verdict).toBe('incorrect');
    expect(miss.body.reply.text).toBe(
      'Fast – bei den Zehnern fehlt der Rest von der Stelle davor.',
    );
    const right = await post(session, si.item.id, digits({ r2: '2', c1: '2', r1: '8', r0: '2' }));
    expect(right.body.verdict).toBe('correct');
    expect(right.body.session.turns.filter((t) => t.role === 'learner').at(-1)?.text).toBe(
      '846 : 3 = 282',
    );
  });

  it('the Fehlerdetektiv: the wrong line by code, a correction that follows, not the model’s text', async () => {
    const session = await prepare([DETECTIVE]);
    const si = session.items[0]!;
    expect(si.item.kind).toBe('find_error');
    expect(si.item.task_view).toEqual({
      type: 'find_error',
      chain: 'equation',
      lines: [
        { id: 'l1', text: '2(x + 3) = 14' },
        { id: 'l2', text: '2x + 3 = 14' },
        { id: 'l3', text: '2x = 11' },
        { id: 'l4', text: 'x = 5,5' },
      ],
    });
    const fine = await post(session, si.item.id, detective('l3', '2x = 8'));
    expect(fine.body.verdict).toBe('incorrect');
    expect(fine.body.reply.text).toBe(
      'Zeile 3 stimmt – sie folgt richtig aus der Zeile davor. Such weiter!',
    );
    const found = await post(session, si.item.id, detective('l2', '2x + 5 = 14'));
    expect(found.body.reply.text).toBe(
      'Richtig, in Zeile 2 steckt der Fehler! Deine Verbesserung passt aber noch nicht zu Zeile 1.',
    );
    // She went one step further than the model's fix: still right, decided by equivalence.
    const right = await post(session, si.item.id, detective('l2', '2x = 8'));
    expect(right.body.verdict).toBe('correct');
    expect(right.body.session.turns.filter((t) => t.role === 'learner').at(-1)?.text).toBe(
      'Zeile 2: 2x = 8',
    );
  });

  it('reveals after the third miss, with the line and its correction', async () => {
    const session = await prepare([DETECTIVE]);
    const si = session.items[0]!;
    for (const line of ['l3', 'l4']) {
      const res = await post(session, si.item.id, detective(line, 'x = 4'));
      expect(res.body.session.items[0]?.status).toBe('open');
    }
    const third = await post(session, si.item.id, detective('l3', 'x = 4'));
    expect(third.body.session.items[0]?.status).toBe('revealed');
    expect(third.body.session.items[0]?.answer).toBe('Zeile 2: 2x + 6 = 14');
  });

  it('records one answer per client_turn_id', async () => {
    const session = await prepare([ADDITION]);
    const si = session.items[0]!;
    const turn = randomUUID();
    const a = await post(session, si.item.id, digits({ r0: '5', r1: '3', r2: '8' }), turn);
    const b = await post(session, si.item.id, digits({ r0: '5', r1: '3', r2: '8' }), turn);
    expect(b.status).toBe(200);
    expect(b.body.reply.id).toBe(a.body.reply.id);
    expect(b.body.reply.text).toBe('Fast – bei den Einern stimmt die Ziffer noch nicht.');
    expect(b.body.session.items[0]?.attempts).toBe(1);
  });

  it('refuses text, an unknown box or line, the task line and another kind (422)', async () => {
    const session = await prepare([ADDITION, DETECTIVE]);
    const [calc, det] = session.items;
    const asText = await l.api.post(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: calc!.item.id,
      text: '834',
    });
    expect(asText.status).toBe(422);
    expect(JSON.stringify(asText.body)).toContain('use_parts');
    const bads: Array<[string, unknown]> = [
      [calc!.item.id, digits({ r0: '4', r7: '1' })],
      [calc!.item.id, detective('l2', '2x = 8')],
      [det!.item.id, detective('l9', '2x = 8')],
      [det!.item.id, detective('l1', '2x = 8')],
      [det!.item.id, digits({ r0: '4' })],
    ];
    for (const [id, parts] of bads) {
      const res = await post(session, id, parts);
      expect(res.status, JSON.stringify(parts)).toBe(422);
    }
    // A digit box takes one digit, nothing else (the contract).
    const letters = await post(session, calc!.item.id, digits({ r0: 'x' }));
    expect(letters.status).toBe(422);
    const fresh = await l.api.get<SessionView>(`/practice/sessions/${session.id}`);
    expect(fresh.body.items.map((i) => i.attempts)).toEqual([0, 0]);
  });

  it("never lets another learner answer; another's id is 404", async () => {
    const session = await prepare([ADDITION]);
    const si = session.items[0]!;
    const other = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2014-05-01' });
    const theirs = await post(session, si.item.id, digits(ADDITION_RIGHT), undefined, other);
    expect(theirs.status).toBe(404);
  });

  it('never sends a key while the question is open', async () => {
    const session = await prepare([ADDITION, DETECTIVE]);
    const bodies = [
      JSON.stringify(session),
      JSON.stringify((await l.api.get(`/practice/sessions/${session.id}`)).body),
    ];
    const wrong = await post(session, session.items[0]!.item.id, digits({ r0: '1' }));
    bodies.push(JSON.stringify(wrong.body));
    for (const body of bodies) {
      expect(body).not.toContain('834');
      expect(body).not.toContain('2x + 6');
      expect(body).not.toContain('"wrong"');
      expect(body).not.toContain('"fixed"');
    }
  });

  it('drops what Regel 0 rejects and keeps the rest of the set', async () => {
    const session = await prepare([
      // The mistake is in line 2, not 3.
      { ...DETECTIVE, wrong_line: 3 },
      // Two mistakes.
      { ...DETECTIVE, lines: ['2(x + 3) = 14', '2x + 3 = 14', '2x = 12', 'x = 6'] },
      // Below zero (a set holds at most four structured questions).
      { ...ADDITION, op: 'sub', operands: [358, 476] },
      ADDITION,
    ]);
    expect(session.items.map((i) => i.item.kind)).toEqual(['written_calc']);
    const stored = await env.db.one<{ n: number }>(
      `select count(*)::int as n from items where learner_id = $1`,
      [l.learnerId],
    );
    expect(stored.n).toBe(1);
  });

  it('works in a practice test: no verdict until the end, then the solution', async () => {
    const session = await prepare([ADDITION, DETECTIVE], 'test');
    const [calc, det] = session.items;
    const wrong = await post(session, calc!.item.id, digits({ r0: '4', r1: '2', r2: '8' }));
    expect(wrong.body.reply.text).toBe("Notiert – weiter geht's.");
    const right = await post(session, det!.item.id, detective('l2', '2x + 6 = 14'));
    expect(right.body.session.status).toBe('finished');
    expect(right.body.session.items.map((i) => i.status)).toEqual(['missed', 'correct']);
    expect(right.body.session.items[0]?.answer).toBe('476 + 358 = 834');
  });

  it('reads written calculations from a photographed sheet; the numbers are the model’s, the rest is code', async () => {
    env.llm.script('extraction', {
      json: {
        is_learning_material: true,
        readable: true,
        title: 'Schriftlich multiplizieren',
        subject: { name: 'Mathe', kind: 'math' },
        extracted_text: 'Rechne schriftlich: 352 · 24, 4087 · 6',
        items: [],
        structured: [
          { ...ADDITION, op: 'mul', operands: [352, 24], hints: [], worked_solution: null },
          { ...ADDITION, op: 'mul', operands: [4087, 6], hints: [], worked_solution: null },
          // Three digits in the second factor: not in this grid, never stored.
          { ...ADDITION, op: 'mul', operands: [352, 124], hints: [], worked_solution: null },
        ],
      },
    });
    env.llm.script('buddy_check', {
      json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null },
    });
    const created = await l.api.post<{ material: MaterialView; uploads: Array<{ path: string }> }>(
      '/materials',
      { client_request_id: randomUUID(), photo_mimes: ['image/jpeg'], purpose: 'study' },
    );
    expect(created.status).toBe(201);
    for (const u of created.body.uploads) env.storage.put(u.path);
    expect((await l.api.post(`/materials/${created.body.material.id}/submit`)).status).toBe(202);
    await env.flushBackground();
    const items = await env.db.query<{ kind: string; answer: string }>(
      `select kind, answer from items where material_id = $1 order by answer`,
      [created.body.material.id],
    );
    expect(items).toEqual([
      { kind: 'written_calc', answer: '352 · 24 = 8448' },
      { kind: 'written_calc', answer: '4087 · 6 = 24522' },
    ]);
    const started = await l.api.post<SessionView>('/practice/sessions', {
      material_id: created.body.material.id,
    });
    expect(started.status).toBe(201);
    const mul = started.body.items.find((i) => i.item.prompt.includes('352'))!;
    // 352 · 2 = 704 and 352 · 4 = 1408: four boxes each (a leading one may stay empty).
    expect(boxIds(mul).filter((id) => id.startsWith('p'))).toHaveLength(8);
    // The first partial product wrong in its hundreds: named as in the first partial product.
    const res = await post(
      started.body,
      mul.item.id,
      digits({ p1_1: '4', p1_2: '1', p1_3: '7', p2_0: '8', p2_1: '0', p2_2: '4', p2_3: '1' }),
    );
    expect(res.body.reply.text).toBe(
      'Fast – bei den Hundertern im ersten Teilprodukt stimmt die Ziffer noch nicht.',
    );
    const ok = await post(
      started.body,
      mul.item.id,
      digits({
        p1_1: '4',
        p1_2: '0',
        p1_3: '7',
        p2_0: '8',
        p2_1: '0',
        p2_2: '4',
        p2_3: '1',
        r0: '8',
        r1: '4',
        r2: '4',
        r3: '8',
      }),
    );
    expect(ok.body.verdict).toBe('correct');
  });
});
