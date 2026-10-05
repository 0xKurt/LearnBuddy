// Fehlerdetektiv and schriftlich rechnen end to end (issue #260). The model writes a CORRECT worked
// solution, or names an operation and its numbers; code checks it, builds the error into one line
// itself, or computes every digit and carry, and keeps the key in `items.task` (migration 0094).
// Her answer — the line she tapped and wrote right, or every cell of the grid — is judged by code
// alone: no model call per answer, and the reply names the place (the line above or below, the
// column) without giving the solution away. docs/architecture.md §Practice ("Structured items").
// requires live verification in Claude Code session (needs a running Postgres; scripted model)

import { randomUUID } from 'node:crypto';

import type {
  AnswerResponse,
  ColumnCalcTaskView,
  FindErrorTaskView,
  MaterialView,
  SessionItemView,
  SessionView,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const SUM = {
  type: 'column_calc',
  prompt: 'Rechne schriftlich.',
  op: 'add',
  operands: ['4721', '1389'],
  topic: 'Schriftliche Addition',
  difficulty: 2,
  prompt_lang: 'de',
};

const PATH = {
  type: 'find_error',
  prompt: 'Finde die falsche Zeile und verbessere sie.',
  lines: ['3(x+2) = 21', '3x + 6 = 21', '3x = 15', 'x = 5'],
  topic: 'Gleichungen',
  difficulty: 3,
  prompt_lang: 'de',
};

function columns(si: SessionItemView | undefined): ColumnCalcTaskView {
  const view = si?.item.task_view;
  if (view?.type !== 'column_calc') throw new Error('expected a column_calc view');
  return view;
}

function lines(si: SessionItemView | undefined): FindErrorTaskView {
  const view = si?.item.task_view;
  if (view?.type !== 'find_error') throw new Error('expected a find_error view');
  return view;
}

/** 4721 + 1389 = 6110 as she writes it, cell by cell in her order: digit or carry. */
const RIGHT_SUM: Record<string, string> = {
  r3c5: '0',
  r2c4: '1',
  r3c4: '1',
  r2c3: '1',
  r3c3: '1',
  r2c2: '1',
  r3c2: '6',
  r3c1: '',
};

/** 672 : 3 = 224 as she writes it, step by step (#413): quotient digit, times, difference. */
const RIGHT_DIV: Record<string, string> = {
  r0c6: '2',
  r1c0: '6',
  r2c0: '',
  r2c1: '7',
  r0c7: '2',
  r3c0: '',
  r3c1: '6',
  r4c1: '1',
  r4c2: '2',
  r0c8: '4',
  r5c1: '1',
  r5c2: '2',
  r6c2: '0',
};

describe.skipIf(!dbReady)('find-the-error and written-arithmetic items (#260)', () => {
  let env: TestEnv;
  let l: Learner;

  async function prepare(
    structured: unknown[],
    kind: 'practice' | 'test' = 'practice',
  ): Promise<SessionView> {
    env.llm.script('explain', () => ({
      usable: true,
      title: 'Mathe',
      subject: { name: 'Mathe', kind: 'math' },
      items: [],
      structured,
    }));
    if (kind === 'practice') {
      env.llm.script('hints', () => ({
        items: structured.map((_, i) => ({
          n: i + 1,
          hints: ['Geh Schritt für Schritt vor.'],
          worked_solution: null,
        })),
      }));
    }
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind,
      text: 'Mathe schriftlich und Fehler finden',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();
    return res.body;
  }

  function send(session: SessionView, itemId: string, parts: unknown, turn = randomUUID()) {
    return l.api.post<AnswerResponse>(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: turn,
      item_id: itemId,
      parts,
    });
  }

  function grid(session: SessionView, itemId: string, change: Record<string, string> = {}) {
    const cells = Object.entries({ ...RIGHT_SUM, ...change }).map(([id, digit]) => ({ id, digit }));
    return send(session, itemId, { type: 'column_calc', cells });
  }

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-05T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2016-02-10' });
  });
  // A tutor call here would mean code could not decide what it must decide: the script's verdict
  // fails on any unexpected or unused model call.
  afterEach(async () => {
    await env.closeChecked();
  });

  it('stores only the operation and its numbers, shows the grid without a digit of the key', async () => {
    const session = await prepare([SUM]);
    const si = session.items[0]!;
    expect(si.item.kind).toBe('column_calc');
    const view = columns(si);
    expect(view.order).toEqual(Object.keys(RIGHT_SUM));
    const row = await env.db.one<{ task: unknown; answer: string }>(
      `select task, answer from items where id = $1`,
      [si.item.id],
    );
    expect(row.task).toEqual({ type: 'column_calc', op: 'add', operands: ['4721', '1389'] });
    expect(row.answer).toBe('4721 + 1389 = 6110');
    const body = JSON.stringify(session);
    expect(body).not.toContain('6110');
    expect(body).not.toMatch(/"digit"|"blank"|"key"/);

    const res = await grid(session, si.item.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.verdict).toBe('correct');
    const mine = res.body.session.turns.filter((t) => t.role === 'learner').at(-1);
    expect(mine?.text).toBe('6110');
    const how = await env.db.one<{ answered_by: string }>(
      `select answered_by from session_items where session_id = $1`,
      [session.id],
    );
    expect(how.answered_by).toBe('typed');
  });

  it('names the column of a missing carry, then a wrong digit, and reveals on the third miss', async () => {
    const session = await prepare([SUM]);
    const id = session.items[0]!.item.id;
    const first = await grid(session, id, { r2c4: '' });
    expect(first.body.verdict).toBe('incorrect');
    expect(first.body.reply.text).toBe(
      'Noch nicht ganz – bei den Zehnern fehlt noch der Übertrag.',
    );
    expect(first.body.session.items[0]?.status).toBe('open');
    const second = await grid(session, id, { r3c2: '5' });
    expect(second.body.reply.text).toBe(
      'Noch nicht ganz – bei den Tausendern stimmt die Ziffer im Ergebnis noch nicht.',
    );
    // Naming the place is the feedback of this form, not a hint.
    const help = await env.db.one<{ hints_used: number; attempts: number }>(
      `select hints_used, attempts from session_items where session_id = $1`,
      [session.id],
    );
    expect(help).toEqual({ hints_used: 0, attempts: 2 });
    const third = await grid(session, id, { r3c2: '5' });
    expect(third.body.session.items[0]?.status).toBe('revealed');
    expect(third.body.session.items[0]?.answer).toBe('4721 + 1389 = 6110');
  });

  it('names the division step for the app to open, never in a test or with the solution (#420)', async () => {
    const DIV = { ...SUM, op: 'div', operands: ['672', '3'], topic: 'Schriftliche Division' };
    const session = await prepare([DIV, SUM]);
    const [div, sum] = session.items.map((i) => i.item.id);
    const cellsOf = (change: Record<string, string>) => ({
      type: 'column_calc',
      cells: Object.entries({ ...RIGHT_DIV, ...change }).map(([id, digit]) => ({ id, digit })),
    });
    // The times of the third step: the reply says the step, the response opens it.
    const first = await send(session, div!, cellsOf({ r5c2: '3' }));
    expect(first.body.reply.text).toBe(
      'Noch nicht ganz – im 3. Schritt stimmt das Malnehmen noch nicht.',
    );
    expect(first.body.column_step).toBe(3);
    // The second digit of the quotient opens the second step.
    const second = await send(session, div!, cellsOf({ r0c7: '3' }));
    expect(second.body.column_step).toBe(2);
    // The third miss shows the solution: nothing left to open.
    const third = await send(session, div!, cellsOf({ r0c7: '3' }));
    expect(third.body.session.items[0]?.status).toBe('revealed');
    expect(third.body.column_step ?? null).toBeNull();
    // A sum has no steps.
    const added = await grid(session, sum!, { r2c4: '' });
    expect(added.body.column_step ?? null).toBeNull();

    const test = await prepare([DIV, SUM], 'test');
    const noted = await send(test, test.items[0]!.item.id, cellsOf({ r5c2: '3' }));
    expect(noted.body.reply.text).toBe("Notiert – weiter geht's.");
    expect(noted.body.column_step ?? null).toBeNull();
  });

  it('records one answer per client_turn_id and refuses grids that do not fit, uncounted', async () => {
    const session = await prepare([SUM]);
    const id = session.items[0]!.item.id;
    const turn = randomUUID();
    const cells = Object.entries(RIGHT_SUM).map(([cid, digit]) => ({ id: cid, digit }));
    const a = await send(session, id, { type: 'column_calc', cells: cells.slice(1) }, turn);
    expect(a.status).toBe(422);
    const b = await send(session, id, { type: 'column_calc', cells: [...cells, cells[0]] });
    expect(b.status).toBe(422);
    const c = await send(session, id, {
      type: 'column_calc',
      cells: [...cells.slice(1), { id: 'r9c9', digit: '1' }],
    });
    expect(c.status).toBe(422);
    const d = await send(session, id, { type: 'find_error', line: 'l2', fix: 'x = 5' });
    expect(d.status).toBe(422);
    expect(
      (await l.api.get<SessionView>(`/practice/sessions/${session.id}`)).body.items[0]?.attempts,
    ).toBe(0);
    const right = randomUUID();
    const once = await send(session, id, { type: 'column_calc', cells }, right);
    const again = await send(session, id, { type: 'column_calc', cells }, right);
    expect(again.status).toBe(200);
    expect(again.body.reply.id).toBe(once.body.reply.id);
  });

  it("never lets another learner answer; another's session is 404", async () => {
    const session = await prepare([SUM]);
    const other = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2016-05-01' });
    const cells = Object.entries(RIGHT_SUM).map(([id, digit]) => ({ id, digit }));
    const theirs = await other.api.post(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: session.items[0]!.item.id,
      parts: { type: 'column_calc', cells },
    });
    expect(theirs.status).toBe(404);
  });

  it('builds the error into one line, never sends where it is, and judges line and correction', async () => {
    const session = await prepare([PATH]);
    const si = session.items[0]!;
    const view = lines(si);
    expect(view.lines.map((x) => x.text)).toEqual(['3(x+2) = 21', '3x+2 = 21', '3x = 15', 'x = 5']);
    const row = await env.db.one<{ task: { key: string; right: string }; answer: string }>(
      `select task, answer from items where id = $1`,
      [si.item.id],
    );
    expect(row.task).toMatchObject({ key: 'l2', right: '3x + 6 = 21' });
    expect(row.answer).toBe('② 3x + 6 = 21');
    const open = JSON.stringify(session);
    expect(open).not.toContain('3x + 6 = 21');
    expect(open).not.toContain('"key"');

    const below = await send(session, si.item.id, {
      type: 'find_error',
      line: 'l3',
      fix: '3x = 15',
    });
    expect(below.body.verdict).toBe('incorrect');
    expect(below.body.reply.text).toBe('Der Fehler steckt schon weiter oben.');
    const half = await send(session, si.item.id, {
      type: 'find_error',
      line: 'l2',
      fix: '3x + 5 = 21',
    });
    expect(half.body.verdict).toBe('partially_correct');
    expect(half.body.reply.text).toContain('Die Zeile hast du gefunden!');
    expect(JSON.stringify(half.body)).not.toContain('3x + 6 = 21');
    // A tap on the task itself is no answer, and costs no try.
    const task = await send(session, si.item.id, { type: 'find_error', line: 'l1', fix: 'x = 5' });
    expect(task.status).toBe(422);
    const right = await send(session, si.item.id, {
      type: 'find_error',
      line: 'l2',
      fix: '6 + 3x = 21',
    });
    expect(right.body.verdict).toBe('correct');
    const mine = right.body.session.turns.filter((t) => t.role === 'learner').at(-1);
    expect(mine?.text).toBe('② 6 + 3x = 21');
  });

  it('stores nothing of a draft Regel 0 rejects, and keeps the rest of the set', async () => {
    const session = await prepare([
      // A path that is already wrong: no error can be built into it honestly.
      { ...PATH, lines: ['2x + 3 = 11', '2x = 9', 'x = 4.5'] },
      // A subtrahend larger than the minuend.
      { ...SUM, op: 'sub', operands: ['1389', '4721'] },
      // Four division steps: more rows than a phone shows at once, finished steps shrunk (#413).
      { ...SUM, op: 'div', operands: ['9876', '3'] },
      // Three steps fit: a three-digit quotient (#413).
      { ...SUM, op: 'div', operands: ['672', '3'], prompt: 'Teile schriftlich.' },
    ]);
    expect(session.items.map((i) => i.item.prompt)).toEqual(['Teile schriftlich.']);
    const stored = await env.db.one<{ n: number }>(
      `select count(*)::int as n from items where learner_id = $1`,
      [l.learnerId],
    );
    expect(stored.n).toBe(1);
  });

  it('keeps the database honest: neither kind without its task (0094), the older kinds still allowed', async () => {
    const session = await prepare([SUM, PATH]);
    for (const si of session.items) {
      await expect(
        env.db.query(`update items set task = null where id = $1`, [si.item.id]),
      ).rejects.toThrow(/items_task_matches_kind/);
    }
    const kinds = await env.db.one<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'items_kind_check'`,
    );
    for (const k of ['order', 'select_all', 'mark', 'essay', 'find_error', 'column_calc']) {
      expect(kinds.def).toContain(`'${k}'`);
    }
  });

  it('works in a practice test: one try, no place named until the end', async () => {
    const session = await prepare([SUM, PATH], 'test');
    const [sum, path] = session.items;
    const wrong = await grid(session, sum!.item.id, { r2c4: '' });
    expect(wrong.body.reply.text).toBe("Notiert – weiter geht's.");
    const right = await send(session, path!.item.id, {
      type: 'find_error',
      line: 'l2',
      fix: '3x + 6 = 21',
    });
    expect(right.body.session.status).toBe('finished');
    expect(right.body.session.items.map((i) => i.status)).toEqual(['missed', 'correct']);
    expect(right.body.session.items[0]?.answer).toBe('4721 + 1389 = 6110');
  });

  it('reads both from a photographed sheet, the solution written correct', async () => {
    env.llm.script('extraction', (req) => {
      expect(req.system).toContain('Find-the-error tasks ("structured", type "find_error")');
      expect(req.system).toContain('Written arithmetic tasks ("structured", type "column_calc")');
      return {
        is_learning_material: true,
        readable: true,
        title: 'Rechnen',
        subject: { name: 'Mathe', kind: 'math' },
        extracted_text: 'Rechne schriftlich. Finde den Fehler.',
        items: [],
        structured: [
          { ...SUM, operands: ['5203', '1874'], op: 'sub', hints: ['Am Ende steht 3329.'] },
          { ...PATH, hints: [] },
        ],
      };
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
    const items = await env.db.query<{ kind: string; answer: string; hints: string[] }>(
      `select kind, answer, hints from items where material_id = $1 order by kind`,
      [created.body.material.id],
    );
    expect(items).toEqual([
      { kind: 'column_calc', answer: '5203 − 1874 = 3329', hints: [] },
      { kind: 'find_error', answer: '② 3x + 6 = 21', hints: [] },
    ]);
  });
});
