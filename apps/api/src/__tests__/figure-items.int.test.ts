// Interactive figures end to end (issues #248, #249): the model writes a figure and its key as
// VALUES, code checks that the key lies on a place she can tap or draw before anything is
// stored, keeps the key in `items.task`, and judges her tap or drawing by comparing it with
// that key — never a model (#224, Regel 0). docs/architecture.md §Practice ("Interactive
// figures").
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type {
  AnswerResponse,
  SessionView,
  StructuredAnswer,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const META = { topic: 'Koordinaten', difficulty: 2, prompt_lang: 'de' } as const;

/** "Tippe P(2 | −1) an" — a tap task as the model writes it. */
const tapPoint = (key = { x: 2, y: -1 }) => ({
  type: 'figure_tap',
  prompt: 'Tippe den Punkt P(2 | −1) an.',
  plane: { x_min: -4, x_max: 4, y_min: -3, y_max: 3, step: 1, marks: [], key },
  number_line: null,
  bars: null,
  clock: null,
  ...META,
});

/** "Zeichne y = 2x − 1" — a drawing task as the model writes it. */
const drawLine = (fn = '2*x-1') => ({
  type: 'grid_draw',
  prompt: 'Zeichne die Gerade y = 2x − 1.',
  grid: { x_min: -4, x_max: 4, y_min: -4, y_max: 4, step: 1, axes: true },
  task: 'line',
  points: null,
  closed: false,
  cells: null,
  mirror: null,
  fn,
  count: null,
  bars: null,
  ...META,
});

const points = (...ps: Array<[number, number]>): StructuredAnswer => ({
  type: 'grid_draw',
  points: ps.map(([x, y]) => ({ x, y })),
  cells: [],
  bars: [],
});

const tap = (x: number, y: number): StructuredAnswer => ({
  type: 'figure_tap',
  value: { kind: 'plane', x, y },
});

describe.skipIf(!dbReady)('interactive figures', () => {
  let env: TestEnv;
  let l: Learner;

  async function prepare(structured: unknown[]): Promise<SessionView> {
    env.llm.script('explain', () => ({
      usable: true,
      title: 'Koordinaten',
      subject: { name: 'Mathe', kind: 'math' },
      items: [],
      structured,
    }));
    env.llm.script('hints', () => ({
      items: structured.map((_, i) => ({
        n: i + 1,
        hints: ['Geh zuerst nach rechts oder links, dann nach oben oder unten.'],
        worked_solution: 'Man geht vom Ursprung aus erst entlang der x-Achse …',
      })),
    }));
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Koordinaten üben',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();
    return res.body;
  }

  async function answer(
    session: SessionView,
    itemId: string,
    parts: StructuredAnswer,
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
    env = await createTestEnv({ start: '2026-10-02T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterEach(async () => {
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      // A tutor call here would mean code could not decide a tap or a drawing it must decide.
      unexpected: env.llm.unexpected.map((u) => u.purpose),
      pending: env.llm.pending(),
    };
    await env.close();
    expect(report).toEqual({ scriptErrors: [], unexpected: [], pending: 0 });
  });

  it('a tap: stored without its key in the view, a wrong tap named, the right one right', async () => {
    const session = await prepare([tapPoint()]);
    const si = session.items[0]!;
    expect(si.item.kind).toBe('figure_tap');
    expect(si.item.task_view).toEqual({
      type: 'figure_tap',
      figure: {
        kind: 'plane',
        grid: { x_min: -4, x_max: 4, y_min: -3, y_max: 3, step: 1, axes: true },
        marks: [],
      },
    });
    const row = await env.db.one<{ task: { key: unknown }; answer: string }>(
      `select task, answer from items where id = $1`,
      [si.item.id],
    );
    expect(row.task.key).toEqual({ kind: 'plane', x: 2, y: -1 });
    expect(row.answer).toBe('(2 | −1)');

    const swapped = await answer(session, si.item.id, tap(-1, 2));
    expect(swapped.status, JSON.stringify(swapped.body)).toBe(200);
    expect(swapped.body.verdict).toBe('incorrect');
    expect(swapped.body.reply.text).toContain('vertauscht');
    expect(swapped.body.session.items[0]?.status).toBe('open');

    const right = await answer(session, si.item.id, tap(2, -1));
    expect(right.body.verdict).toBe('correct');
    expect(right.body.session.items[0]?.status).toBe('correct');
    // Her taps stand in the thread as words.
    const said = await env.db.query<{ text: string }>(
      `select text from practice_turns where session_id = $1 and role = 'learner' order by created_at`,
      [session.id],
    );
    expect(said.map((s) => s.text)).toEqual(['(−1 | 2)', '(2 | −1)']);
  });

  it('"Zeichne y = 2x − 1": any two right points are right (acceptance of #249)', async () => {
    const session = await prepare([drawLine()]);
    const si = session.items[0]!;
    expect(si.item.task_view).toMatchObject({ type: 'grid_draw', tool: 'line', needs: 2 });
    const shifted = await answer(session, si.item.id, points([0, 0], [1, 2]));
    expect(shifted.body.verdict).toBe('incorrect');
    expect(shifted.body.reply.text).toContain('Die Steigung stimmt schon');
    const right = await answer(session, si.item.id, points([2, 3], [-1, -3]));
    expect(right.body.verdict).toBe('correct');
  });

  it('records one answer per client_turn_id', async () => {
    const session = await prepare([drawLine()]);
    const si = session.items[0]!;
    const turn = randomUUID();
    const a = await answer(session, si.item.id, points([0, 0], [1, 1]), turn);
    const b = await answer(session, si.item.id, points([0, 0], [1, 1]), turn);
    expect(b.status).toBe(200);
    expect(b.body.reply.id).toBe(a.body.reply.id);
    expect(b.body.session.items[0]?.attempts).toBe(1);
  });

  it('refuses a point between grid points, a foreign shape and typed text — none counted', async () => {
    const session = await prepare([tapPoint(), drawLine()]);
    const [tapItem, drawItem] = session.items;
    for (const [id, parts] of [
      [tapItem!.item.id, tap(2.5, -1)],
      [tapItem!.item.id, tap(9, 0)],
      [tapItem!.item.id, points([1, 1])],
      [drawItem!.item.id, points([0, -1], [1, 1], [2, 3])],
      [drawItem!.item.id, points([0.5, 0], [1, 1])],
    ] as const) {
      const res = await answer(session, id, parts);
      expect(res.status, JSON.stringify(parts)).toBe(422);
      expect(JSON.stringify(res.body)).toContain('parts_mismatch');
    }
    const asText = await l.api.post(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: tapItem!.item.id,
      text: '(2 | -1)',
    });
    expect(asText.status).toBe(422);
    expect(JSON.stringify(asText.body)).toContain('use_parts');
    const fresh = await l.api.get<SessionView>(`/practice/sessions/${session.id}`);
    expect(fresh.body.items.map((i) => i.attempts)).toEqual([0, 0]);
  });

  it("another learner's session or question is 404", async () => {
    const session = await prepare([tapPoint()]);
    const si = session.items[0]!;
    const other = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2014-05-01' });
    expect((await answer(session, si.item.id, tap(2, -1), undefined, other)).status).toBe(404);
    const own = await prepare([drawLine()]);
    expect((await answer(own, si.item.id, tap(2, -1))).status).toBe(404);
  });

  it('never sends the key while the question is open', async () => {
    const session = await prepare([tapPoint({ x: 3, y: 2 })]);
    const si = session.items[0]!;
    const wrong = await answer(session, si.item.id, tap(0, 0));
    for (const body of [
      JSON.stringify(session),
      JSON.stringify((await l.api.get(`/practice/sessions/${session.id}`)).body),
      JSON.stringify(wrong.body),
    ]) {
      expect(body).not.toContain('"key"');
      expect(body).not.toContain('(3 | 2)');
    }
  });

  it('drops a task whose key cannot be tapped or drawn, and keeps the rest', async () => {
    const session = await prepare([
      tapPoint({ x: 2.5, y: -1 }),
      drawLine('x^2'),
      drawLine('10*x+30'),
      tapPoint(),
    ]);
    expect(session.items.map((i) => i.item.kind)).toEqual(['figure_tap']);
  });

  it('the database refuses a figure kind without its task', async () => {
    const si = (await prepare([tapPoint()])).items[0]!;
    await expect(
      env.db.query(`update items set task = null where id = $1`, [si.item.id]),
    ).rejects.toThrow(/items_task_matches_kind/);
  });
});
