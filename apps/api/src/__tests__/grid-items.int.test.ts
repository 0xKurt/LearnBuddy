// Zeichnen auf dem Raster end to end (issue #249). The model chooses the mode and its data and
// writes an instruction without a digit; code fits the paper, computes the key on the grid's
// crossings, refuses a task whose key is not on the paper (Regel 0 of #224, reject — never repair)
// and keeps it in `items.task` (migration 0095). What she drew is compared exactly — never a model
// for the verdict — and a drawing that is not right yet gets the point or the bar named.
// docs/architecture.md §Practice ("Structured items" → "Grid").
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type {
  AnswerResponse,
  GridDrawAnswer,
  SessionItemView,
  SessionView,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const NONE = { points: null, fn: null, count: null, axis: null, axis_at: null, bars: null };
const meta = { topic: 'Zeichnen', difficulty: 2, prompt_lang: 'de' };

const line = (fn = '2*x - 1') => ({
  type: 'grid_draw',
  prompt: 'Zeichne den Graphen.',
  task: 'graph',
  ...NONE,
  fn,
  count: 2,
  ...meta,
});
const plot = () => ({
  type: 'grid_draw',
  prompt: 'Trage die Punkte ins Koordinatensystem ein.',
  task: 'points',
  ...NONE,
  points: [
    { x: 2, y: 2 },
    { x: -1, y: 2 },
    { x: 3, y: -2 },
  ],
  ...meta,
});
const mirror = () => ({
  type: 'grid_draw',
  prompt: 'Spiegle das Dreieck an der Achse.',
  task: 'mirror',
  ...NONE,
  points: [
    { x: 1, y: 1 },
    { x: 3, y: 1 },
    { x: 3, y: 3 },
  ],
  axis: 'vertical',
  axis_at: 4,
  ...meta,
});
const chart = () => ({
  type: 'grid_draw',
  prompt: 'Zeichne das Säulendiagramm zum Lieblingsobst.',
  task: 'bars',
  ...NONE,
  bars: [
    { label: 'Apfel', value: 5 },
    { label: 'Birne', value: 3 },
    { label: 'Kiwi', value: 1 },
  ],
  ...meta,
});

const at = (...ps: Array<[number, number]>): GridDrawAnswer => ({
  type: 'grid_draw',
  points: ps.map(([x, y]) => ({ x, y })),
  bars: [],
});
const heights = (...values: number[]): GridDrawAnswer => ({
  type: 'grid_draw',
  points: [],
  bars: values.map((value, i) => ({ id: `b${i + 1}`, value })),
});

/** The view of a grid item (`task_view` is the union of every structured kind). */
function sheetOf(si: SessionItemView | undefined) {
  const view = si?.item.task_view;
  expect(view?.type).toBe('grid_draw');
  return view?.type === 'grid_draw' ? view : null;
}

describe.skipIf(!dbReady)('grid items', () => {
  let env: TestEnv;
  let l: Learner;

  /** A topic's practice (or test) whose scripted model wrote these structured tasks. */
  async function prepare(
    structured: unknown[],
    kind: 'practice' | 'test' = 'practice',
  ): Promise<SessionView> {
    env.llm.script('explain', () => ({
      usable: true,
      title: 'Zeichnen auf dem Raster',
      subject: { name: 'Mathe', kind: 'math' },
      items: [],
      structured,
    }));
    if (kind === 'practice') {
      // Help is written in the background, against the solution code computed.
      env.llm.script('hints', () => ({
        items: structured.map((_, i) => ({
          n: i + 1,
          // The second gives a mirror image point away: code drops it.
          hints: ['Zähle die Kästchen bis zur Achse.', 'B′ liegt bei B′(5|1).'],
          worked_solution: 'Jeder Punkt hat zur Achse denselben Abstand wie sein Bild.',
        })),
      }));
    }
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind,
      text: 'Zeichnen auf dem Raster',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();
    return res.body;
  }

  async function answer(
    session: SessionView,
    itemId: string,
    parts: GridDrawAnswer,
    turn: string = randomUUID(),
    as: Learner = l,
  ) {
    return as.api.post<AnswerResponse>(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: turn,
      item_id: itemId,
      parts,
    });
  }

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-05T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2013-02-10' });
  });
  // A tutor call here would mean code could not decide a drawing it must decide: the script's
  // verdict fails on any unexpected or unused model call.
  afterEach(async () => {
    await env.closeChecked();
  });

  it('„Zeichne y = 2x − 1“ is right with ANY two right points (acceptance of #249)', async () => {
    const session = await prepare([line(), line(), line()]);
    expect(session.items.map((i) => i.item.prompt)).toEqual(
      Array(3).fill('Zeichne den Graphen: $y = 2x - 1$'),
    );
    const view = sheetOf(session.items[0]);
    expect(view).toEqual({
      type: 'grid_draw',
      frame: { x_min: -4, x_max: 4, y_min: -3, y_max: 3 },
      sheet: { mode: 'graph', count: 2, line: true },
    });
    const pairs: Array<[[number, number], [number, number]]> = [
      [
        [0, -1],
        [1, 1],
      ],
      [
        [2, 3],
        [-1, -3],
      ],
      [
        [1, 1],
        [2, 3],
      ],
    ];
    for (const [i, pair] of pairs.entries()) {
      const res = await answer(session, session.items[i]!.item.id, at(...pair));
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.verdict).toBe('correct');
    }
    // Drawing is producing, never recognising (#163).
    const how = await env.db.query<{ answered_by: string }>(
      `select answered_by from session_items where session_id = $1`,
      [session.id],
    );
    expect(how.map((h) => h.answered_by)).toEqual(['typed', 'typed', 'typed']);
  });

  it('names the point that is not on the graph, without a model call, and reveals on the third miss', async () => {
    const session = await prepare([line()]);
    const si = session.items[0]!;
    const first = await answer(session, si.item.id, at([0, -1], [1, 2]));
    expect(first.body.verdict).toBe('incorrect');
    expect(first.body.reply.text).toBe('Noch nicht ganz: (1|2) liegt nicht auf dem Graphen.');
    expect(first.body.session.items[0]?.status).toBe('open');
    // Her drawing stands in the thread in words.
    const mine = first.body.session.turns.filter((t) => t.role === 'learner').at(-1);
    expect(mine?.text).toBe('(0|−1), (1|2)');
    await answer(session, si.item.id, at([0, -1], [1, 2]));
    const third = await answer(session, si.item.id, at([0, -1], [1, 2]));
    const closed = third.body.session.items[0];
    expect(closed?.status).toBe('revealed');
    expect(closed?.answer).toBe('(−1|−3), (0|−1), (1|1), (2|3)');
  });

  it('points, mirror and bars: each judged by code, the wrong one named', async () => {
    const session = await prepare([plot(), mirror(), chart()]);
    const [points, mirrored, bars] = session.items;
    expect(points!.item.prompt).toBe(
      'Trage die Punkte ins Koordinatensystem ein: A(2|2), B(−1|2), C(3|−2)',
    );
    // x/y swapped for C — the classic mistake — named, not solved.
    const swapped = await answer(session, points!.item.id, at([2, 2], [-1, 2], [-2, 3]));
    expect(swapped.body.reply.text).toBe('Noch nicht ganz: C liegt noch nicht richtig.');
    const plotted = await answer(session, points!.item.id, at([2, 2], [-1, 2], [3, -2]));
    expect(plotted.body.verdict).toBe('correct');

    expect(sheetOf(mirrored)?.sheet).toMatchObject({
      mode: 'mirror',
      names: ['A′', 'B′', 'C′'],
      axis: { dir: 'vertical', at: 4 },
    });
    const off = await answer(session, mirrored!.item.id, at([7, 1], [6, 1], [5, 2]));
    expect(off.body.reply.text).toBe('Noch nicht ganz: B′, C′ liegen noch nicht richtig.');
    expect(
      (await answer(session, mirrored!.item.id, at([7, 1], [5, 1], [5, 3]))).body.verdict,
    ).toBe('correct');

    expect(bars!.item.prompt).toBe(
      'Zeichne das Säulendiagramm zum Lieblingsobst: Apfel 5, Birne 3, Kiwi 1',
    );
    const wrongBar = await answer(session, bars!.item.id, heights(5, 4, 1));
    expect(wrongBar.body.reply.text).toBe(
      'Noch nicht ganz: Die Säule für Birne stimmt noch nicht.',
    );
    expect((await answer(session, bars!.item.id, heights(5, 3, 1))).body.verdict).toBe('correct');
  });

  it('never sends the key, the values or the function, and keeps a hint that gives an image away', async () => {
    const session = await prepare([mirror(), chart(), { ...line('0.5*x^2 - 2'), count: 3 }]);
    const rows = await env.db.query<{ answer: string; hints: string[] }>(
      `select i.answer, i.hints from session_items si join items i on i.id = si.item_id
        where si.session_id = $1 order by si.position`,
      [session.id],
    );
    expect(rows.map((r) => r.answer)).toEqual([
      'A′(7|1), B′(5|1), C′(5|3)',
      'Apfel 5, Birne 3, Kiwi 1',
      '(−2|0), (0|−2), (2|0)',
    ]);
    // The hint that names B′'s place never reaches her; the other stays.
    expect(rows[0]?.hints).toEqual(['Zähle die Kästchen bis zur Achse.']);
    const fresh = await l.api.get<SessionView>(`/practice/sessions/${session.id}`);
    for (const body of [JSON.stringify(session), JSON.stringify(fresh.body)]) {
      expect(body).not.toContain('"key"');
      expect(body).not.toContain('"values"');
      expect(body).not.toContain('"fn"');
      expect(body).not.toContain('A′(7|1)');
    }
  });

  it('records one answer per client_turn_id', async () => {
    const session = await prepare([line()]);
    const si = session.items[0]!;
    const turn = randomUUID();
    const a = await answer(session, si.item.id, at([0, -1], [1, 2]), turn);
    const b = await answer(session, si.item.id, at([0, -1], [1, 2]), turn);
    expect(b.status).toBe(200);
    expect(b.body.reply.id).toBe(a.body.reply.id);
    expect(b.body.session.items[0]?.attempts).toBe(1);
    expect((await answer(session, si.item.id, at([0, -1], [1, 1]))).body.verdict).toBe('correct');
    expect((await answer(session, si.item.id, at([0, -1], [1, 1]))).status).toBe(409);
  });

  it('refuses text, a drawing that does not fit and another shape, without counting them', async () => {
    const session = await prepare([line(), chart()]);
    const [graph, bars] = session.items;
    const text = await l.api.post(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: graph!.item.id,
      text: '(0|-1) (1|1)',
    });
    expect(text.status).toBe(422);
    for (const parts of [
      at([0, -1]),
      at([0, -1], [0, -1]),
      at([0, -1], [9, 17]),
      at([0, -1], [1, 1], [2, 3]),
      heights(1, 1),
    ]) {
      const bad = await answer(session, graph!.item.id, parts);
      expect(bad.status, JSON.stringify(parts)).toBe(422);
    }
    for (const parts of [heights(5, 3), heights(5, 3, 1, 1), heights(5, 3, 9), at([1, 1])]) {
      const bad = await answer(session, bars!.item.id, parts);
      expect(bad.status, JSON.stringify(parts)).toBe(422);
    }
    const shape = await l.api.post(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: graph!.item.id,
      parts: { type: 'select_all', chosen: ['a'] },
    });
    expect(shape.status).toBe(422);
    const fresh = await l.api.get<SessionView>(`/practice/sessions/${session.id}`);
    expect(fresh.body.items.map((i) => i.attempts)).toEqual([0, 0]);
  });

  it("never lets another learner answer the question; another's id is 404", async () => {
    const session = await prepare([line()]);
    const other = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2013-05-01' });
    const theirs = await answer(
      session,
      session.items[0]!.item.id,
      at([0, -1], [1, 1]),
      undefined,
      other,
    );
    expect(theirs.status).toBe(404);
  });

  it('stores nothing of a task Regel 0 rejects, and keeps the rest of the set', async () => {
    // A set holds four structured tasks at most (`MAX_STRUCTURED_ITEMS`); every other rejection
    // has its unit test (`practice/__tests__/grid.test.ts`).
    const session = await prepare([
      // A cube is no school graph on a grid.
      line('x^3'),
      // A mirror image half a square off the grid.
      { ...mirror(), axis_at: 4.25 },
      // A number in the instruction would be a second author of the data.
      { ...plot(), prompt: 'Trage A(2|3) ein.' },
      line(),
    ]);
    expect(session.items.map((i) => i.item.prompt)).toEqual(['Zeichne den Graphen: $y = 2x - 1$']);
    const stored = await env.db.one<{ n: number }>(
      `select count(*)::int as n from items where learner_id = $1`,
      [l.learnerId],
    );
    expect(stored.n).toBe(1);
  });

  it('keeps the database honest: a grid row without its task cannot exist (0095)', async () => {
    const session = await prepare([line()]);
    const id = session.items[0]!.item.id;
    await expect(env.db.query(`update items set task = null where id = $1`, [id])).rejects.toThrow(
      /items_task_matches_kind/,
    );
    await expect(
      env.db.query(`update items set task = jsonb_set(task, '{type}', '"mark"') where id = $1`, [
        id,
      ]),
    ).rejects.toThrow(/items_task_matches_kind/);
    const kinds = await env.db.one<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'items_kind_check'`,
    );
    for (const k of ['order', 'match', 'table_fill', 'cloze', 'select_all', 'mark', 'essay']) {
      expect(kinds.def).toContain(`'${k}'`);
    }
    expect(kinds.def).toContain(`'grid_draw'`);
  });

  it('a stored task that no longer passes Regel 0 is no task: the question shows without a paper', async () => {
    const session = await prepare([mirror()]);
    const id = session.items[0]!.item.id;
    // Someone moved an image point by hand: the key now disagrees with the figure.
    await env.db.query(
      `update items set task = jsonb_set(task, '{sheet,key,0}', '{"x": 6, "y": 1}') where id = $1`,
      [id],
    );
    const fresh = await l.api.get<SessionView>(`/practice/sessions/${session.id}`);
    expect(fresh.body.items[0]?.item.task_view).toBeNull();
    // Nothing can be compared, so nothing is claimed (`partsAnswer.ts`).
    const res = await answer(session, id, at([7, 1], [5, 1], [5, 3]));
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toContain('task_unreadable');
  });

  it('works in a practice test: one try, then the solution', async () => {
    const session = await prepare([line(), chart()], 'test');
    const [graph, bars] = session.items;
    const wrong = await answer(session, graph!.item.id, at([0, 0], [1, 1]));
    expect(wrong.body.reply.text).toBe("Notiert – weiter geht's.");
    expect(wrong.body.session.items[0]?.status).toBe('missed');
    const right = await answer(session, bars!.item.id, heights(5, 3, 1));
    expect(right.body.session.status).toBe('finished');
    expect(right.body.session.items[0]?.answer).toBe('(−1|−3), (0|−1), (1|1), (2|3)');
  });
});
