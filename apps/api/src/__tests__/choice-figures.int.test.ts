// Pictures as the options of a multiple choice, end to end (issue #231): "Welcher Graph passt
// zu f(x) = x² − 1?" with four graphs. The model writes the graphs and the key; code checks
// before anything is stored that exactly one graph is that function and that it is the one
// the index points at, and that no two options look alike (#227 Nr. 2, #224 "Regel 0").
// The answer is judged by its index — exactly, without a model. docs/architecture.md §Practice.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import {
  Figure as FigureSchema,
  type AnswerResponse,
  type Figure,
  type SessionView,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

type Plot = Extract<Figure, { type: 'function_plot' }>;

const graph = (expr: string): Plot => ({
  type: 'function_plot',
  functions: [{ expr, label: null }],
  x_min: -3,
  x_max: 3,
  y_min: -3,
  y_max: 5,
  points: [],
});

const twoCurves: Plot = {
  ...graph('x^2-1'),
  functions: [
    { expr: 'x^2-1', label: null },
    { expr: 'x', label: null },
  ],
};

/** A note line: a figure the app can show, but never one the model may write (issue #226). */
const STAFF: Figure = {
  type: 'staff',
  clef: 'bass',
  time: null,
  bars: [[{ el: 'note', pitch: { name: 'F', octave: 3 }, value: 'quarter', dotted: false }]],
  tempo: 80,
  labels: [],
};

const GRAPHS = ['x^2+1', '-x^2+1', 'x^2-1', '(x-1)^2'];
const TEXTS = ['$y = x^{2} + 1$', '$y = -x^{2} + 1$', '$y = x^{2} - 1$', '$y = (x - 1)^{2}$'];

const which = (over: Record<string, unknown> = {}) => ({
  kind: 'multiple_choice',
  prompt: 'Welcher Graph passt zu $f(x) = x^{2} - 1$?',
  answer: 'f(x) = x^2 - 1',
  accepted_answers: [],
  unit: null,
  choices: TEXTS,
  correct_choice: 2,
  choice_figures: GRAPHS.map(graph),
  topic: 'Parabeln',
  difficulty: 2,
  prompt_lang: 'de',
  lang: null,
  figure: null,
  source_excerpt: null,
  hints: ['Wo schneidet der Graph die y-Achse?'],
  worked_solution: 'Bei x = 0 ist f(0) = −1: Nur der dritte Graph geht durch (0 | −1).',
  ...over,
});

describe.skipIf(!dbReady)('pictures as options', () => {
  let env: TestEnv;
  let l: Learner;

  async function prepare(items: unknown[]): Promise<SessionView> {
    env.llm.script('explain', () => ({
      usable: true,
      title: 'Parabeln',
      subject: { name: 'Mathe', kind: 'math' },
      items,
    }));
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Parabeln erkennen',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();
    return res.body;
  }

  async function choose(session: SessionView, itemId: string, choice: number, as: Learner = l) {
    return as.api.post<AnswerResponse>(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: itemId,
      choice,
    });
  }

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2010-02-10' });
  });
  afterEach(async () => {
    // A tutor call would mean code could not judge a tapped option — it always can.
    await env.closeChecked();
  });

  it('stores the graphs, shows them without the key, and judges the tap by its index', async () => {
    const session = await prepare([which()]);
    expect(session.items).toHaveLength(1);
    const si = session.items[0]!;
    expect(si.item.kind).toBe('multiple_choice');
    expect(si.item.choices).toEqual(TEXTS);
    expect(
      si.item.choice_figures?.map((f) => f.type === 'function_plot' && f.functions[0]?.expr),
    ).toEqual(GRAPHS);
    expect(si.answer).toBeNull();

    const row = await env.db.one<{ choice_figures: Figure[]; correct_choice: number }>(
      `select choice_figures, correct_choice from items where id = $1`,
      [si.item.id],
    );
    expect(row.correct_choice).toBe(2);
    expect(row.choice_figures).toHaveLength(4);

    const right = await choose(session, si.item.id, 2);
    expect(right.status, JSON.stringify(right.body)).toBe(200);
    expect(right.body.verdict).toBe('correct');
    const closed = right.body.session.items[0];
    expect(closed?.status).toBe('correct');
    const state = await env.db.one<{ last_outcome: string }>(
      `select last_outcome from item_states where item_id = $1`,
      [si.item.id],
    );
    expect(state.last_outcome).toBe('first_try');
  });

  it('says "not this one" to a wrong graph without a model, and keeps the question open', async () => {
    const session = await prepare([which()]);
    const si = session.items[0]!;
    const wrong = await choose(session, si.item.id, 0);
    expect(wrong.status).toBe(200);
    expect(wrong.body.verdict).toBe('incorrect');
    const open = wrong.body.session.items[0];
    expect(open?.status).toBe('open');
    expect(open?.answer).toBeNull();
    // The pictures stay while it is open; the tried option is known by its text.
    expect(open?.item.choice_figures).toHaveLength(4);
    const mine = wrong.body.session.turns.find((t) => t.role === 'learner');
    expect(mine?.text).toBe(TEXTS[0]);
    const right = await choose(session, si.item.id, 2);
    expect(right.body.verdict).toBe('correct');
  });

  it('stores nothing of a draft whose graphs do not hold together, and keeps the rest', async () => {
    const session = await prepare([
      // Two options draw the same parabola.
      which({ choice_figures: ['x^2+1', '1+x*x', 'x^2-1', '(x-1)^2'].map(graph) }),
      // The index points at another graph than the key (off by one).
      which({ correct_choice: 3 }),
      // The key contradicts the function the question names.
      which({ answer: 'f(x) = x^2 + 1', correct_choice: 0 }),
      which({ prompt: 'Welcher Graph gehört zu $f(x) = x^{2} - 1$?' }),
    ]);
    expect(session.items.map((i) => i.item.prompt)).toEqual([
      'Welcher Graph gehört zu $f(x) = x^{2} - 1$?',
    ]);
    const stored = await env.db.one<{ n: number }>(
      `select count(*)::int as n from items where learner_id = $1`,
      [l.learnerId],
    );
    expect(stored.n).toBe(1);
  });

  it('never sends the key while the question is open', async () => {
    const session = await prepare([which()]);
    const si = session.items[0]!;
    const wrong = await choose(session, si.item.id, 1);
    const bodies = [
      JSON.stringify(session),
      JSON.stringify((await l.api.get(`/practice/sessions/${session.id}`)).body),
      JSON.stringify(wrong.body),
    ];
    for (const path of ['/materials', '/buddy']) {
      const res = await l.api.get(path);
      expect(res.status, path).toBe(200);
      bodies.push(JSON.stringify(res.body));
    }
    for (const body of bodies) {
      expect(body).not.toContain('correct_choice');
      expect(body).not.toContain('f(x) = x^2 - 1');
      expect(body).not.toContain('"answer":"$y = x^{2} - 1$"');
      expect(body).not.toContain('Nur der dritte Graph');
    }
  });

  it("never lets another learner see or answer the question; another's id is 404", async () => {
    const session = await prepare([which()]);
    const si = session.items[0]!;
    const other = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2010-05-01' });
    expect((await choose(session, si.item.id, 2, other)).status).toBe(404);
    expect((await other.api.get(`/practice/sessions/${session.id}`)).status).toBe(404);
    // Her own session, someone else's question in it: not in this session.
    const own = await prepare([which({ prompt: 'Welcher Graph gehört zu $f(x) = x^{2} - 1$?' })]);
    expect((await choose(own, si.item.id, 2)).status).toBe(404);
  });

  // Regel 0 on the way out (issue #326): a stored row is read back through the checks it was
  // written under. Each case is a row the write path would have refused — as if a contract or a
  // check had changed since. The app never gets its pictures, only the plain options, and the
  // tap is still judged by its index. Nothing is repaired: no picture is dropped or redrawn.
  const BROKEN: Array<[string, (stored: Plot[]) => unknown[]]> = [
    [
      'a picture type the contract no longer knows',
      (f) => [f[0], f[1], { type: 'hologram' }, f[3]],
    ],
    ['a picture missing a field', (f) => f.map(({ points: _gone, ...rest }) => rest)],
    ['a note line, which only code ever writes', (f) => [f[0], f[1], f[2], STAFF]],
    ['a graph the app cannot read', (f) => [f[0], f[1], graph('x^^2'), f[3]]],
    ['two options the same drawing', (f) => [f[0], f[1], f[2], f[2]]],
    ['two curves in one option', (f) => [f[0], f[1], twoCurves, f[3]]],
    ['the key no longer the indexed graph', (f) => [f[2], f[1], f[0], f[3]]],
    ['a window that draws nothing', (f) => [f[0], f[1], { ...f[2], x_min: 3, x_max: -3 }, f[3]]],
  ];

  it('holds a valid note line for a figure the app can show (the case above is not a typo)', () => {
    expect(FigureSchema.safeParse(STAFF).success).toBe(true);
  });

  for (const [what, broken] of BROKEN) {
    it(`never sends option pictures that no longer hold: ${what}`, async () => {
      const session = await prepare([which()]);
      const si = session.items[0]!;
      const stored = await env.db.one<{ choice_figures: Plot[] }>(
        `select choice_figures from items where id = $1`,
        [si.item.id],
      );
      await env.db.query(`update items set choice_figures = $2::jsonb where id = $1`, [
        si.item.id,
        JSON.stringify(broken(stored.choice_figures)),
      ]);

      const view = await l.api.get<SessionView>(`/practice/sessions/${session.id}`);
      expect(view.status).toBe(200);
      const shown = view.body.items[0]!.item;
      expect(shown.choice_figures).toBeNull();
      // Shown as the plain multiple choice it also is: the option texts, the same index.
      expect(shown.choices).toEqual(TEXTS);
      const wrong = await choose(session, si.item.id, 0);
      expect(wrong.body.verdict).toBe('incorrect');
      expect(wrong.body.session.items[0]?.item.choice_figures).toBeNull();
      expect((await choose(session, si.item.id, 2)).body.verdict).toBe('correct');
      // Read, never repaired: the row is as it was left.
      const after = await env.db.one<{ choice_figures: unknown }>(
        `select choice_figures from items where id = $1`,
        [si.item.id],
      );
      expect(after.choice_figures).toEqual(broken(stored.choice_figures));
    });
  }

  it('keeps reading an old multiple choice without pictures', async () => {
    const session = await prepare([
      which({
        prompt: 'Wer war der erste römische Kaiser?',
        answer: 'Augustus',
        choices: ['Caesar', 'Augustus', 'Nero'],
        correct_choice: 1,
        choice_figures: undefined,
        topic: 'Rom',
      }),
    ]);
    const si = session.items[0]!;
    expect(si.item.choice_figures).toBeNull();
    expect((await choose(session, si.item.id, 1)).body.verdict).toBe('correct');
  });
});
