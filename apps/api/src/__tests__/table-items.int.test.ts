// Tabelle ausfüllen end to end (issue #230): the model writes the table with every value in
// it and marks the gaps; code recomputes what it can (a value table from its function, a
// number wall from its sums), names the gaps, keeps the keys in `items.task` — and judges
// what she typed cell by cell with the rules every answer goes through. Never a model for
// the verdict (#224, Regel 0). docs/architecture.md §Practice ("Structured items").
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

const v = (text: string) => ({ text, gap: false, also: [] });
const g = (text: string, also: string[] = []) => ({ text, gap: true, also });

/** A value table of f(x) = 2x + 1, four columns of x: the 4×4 of the issue's acceptance. */
const VALUES = {
  type: 'table_fill',
  prompt: 'Fülle die Wertetabelle für $f(x) = 2x + 1$ aus.',
  header: ['x', '-1', '0', '1'],
  rows: [[v('f(x)'), g('-1'), v('1'), g('3')]],
  family: 'values',
  fn: '2*x+1',
  x_in: 'header',
  topic: 'Lineare Funktionen',
  difficulty: 2,
  prompt_lang: 'de',
};

/** A number wall, top brick first. */
const WALL = {
  type: 'table_fill',
  prompt: 'Rechne die Zahlenmauer aus.',
  header: null,
  rows: [[g('20')], [v('8'), g('12')], [g('3'), v('5'), v('7')]],
  family: 'wall',
  fn: null,
  x_in: null,
  topic: 'Zahlenmauern',
  difficulty: 1,
  prompt_lang: 'de',
};

/** The right cells of each table, by the server's ids. */
const VALUES_RIGHT = { r0c1: '-1', r0c3: '3' };
const WALL_RIGHT = { r0c0: '20', r1c1: '12', r2c0: '3' };

describe.skipIf(!dbReady)('table items', () => {
  let env: TestEnv;
  let l: Learner;

  async function prepare(
    structured: unknown[],
    kind: 'practice' | 'test' = 'practice',
  ): Promise<SessionView> {
    env.llm.script('explain', () => ({
      usable: true,
      title: 'Tabellen',
      subject: { name: 'Mathe', kind: 'math' },
      items: [],
      structured,
    }));
    if (kind === 'practice') {
      env.llm.script('hints', () => ({
        items: structured.map((_, i) => ({
          n: i + 1,
          hints: ['Setz die Zahl oben in die Rechnung ein.'],
          worked_solution: 'Für jedes x rechnest du 2 · x + 1 …',
        })),
      }));
    }
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind,
      text: 'Wertetabelle üben',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();
    return res.body;
  }

  async function answer(
    session: SessionView,
    itemId: string,
    cells: Record<string, string>,
    turn: string = randomUUID(),
    as: Learner = l,
  ) {
    return as.api.post<AnswerResponse>(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: turn,
      item_id: itemId,
      parts: {
        type: 'table_fill',
        cells: Object.entries(cells).map(([id, text]) => ({ id, text })),
      },
    });
  }

  const gapIds = (si: SessionItemView | undefined): string[] => {
    const view = si?.item.task_view;
    if (view?.type !== 'table_fill') return [];
    return view.rows.flatMap((cells) => cells.flatMap((c) => ('id' in c ? [c.id] : [])));
  };

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterEach(async () => {
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      // A tutor call here would mean code could not decide a cell it must decide.
      unexpected: env.llm.unexpected.map((u) => u.purpose),
      pending: env.llm.pending(),
    };
    await env.close();
    expect(report).toEqual({ scriptErrors: [], unexpected: [], pending: 0 });
  });

  it('stores the recomputed table, shows it without keys, and judges it right', async () => {
    const session = await prepare([VALUES]);
    expect(session.items).toHaveLength(1);
    const si = session.items[0]!;
    expect(si.item.kind).toBe('table_fill');
    expect(si.item.task_view).toEqual({
      type: 'table_fill',
      header: ['x', '-1', '0', '1'],
      rows: [
        [
          { text: 'f(x)' },
          { id: 'r0c1', input: 'math' },
          { text: '1' },
          { id: 'r0c3', input: 'math' },
        ],
      ],
      layout: 'grid',
    });
    const row = await env.db.one<{ answer: string; kind: string }>(
      `select answer, kind from items where id = $1`,
      [si.item.id],
    );
    expect(row).toEqual({ kind: 'table_fill', answer: 'f(x): -1, 3' });

    const res = await answer(session, si.item.id, VALUES_RIGHT);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.verdict).toBe('correct');
    expect(res.body.reply.text).toBe('Stimmt – gut gemacht!');
    expect(res.body.session.turns.find((t) => t.role === 'learner')?.text).toBe('-1 · 3');
    const closed = res.body.session.items[0];
    expect(closed?.status).toBe('correct');
    expect(closed?.item.task_view).toBeNull();
    expect(closed?.answer).toBe('f(x): -1, 3');

    // FSRS heard it, and she typed it.
    const state = await env.db.one<{ last_outcome: string; reps: number }>(
      `select last_outcome, reps from item_states where item_id = $1`,
      [si.item.id],
    );
    expect(state).toEqual({ last_outcome: 'first_try', reps: 1 });
    const how = await env.db.one<{ answered_by: string }>(
      `select answered_by from session_items where session_id = $1`,
      [session.id],
    );
    expect(how.answered_by).toBe('typed');
    expect(res.body.session.summary?.first_try).toBe(1);
  });

  it('names the one wrong cell, keeps the question open, and reveals after the third miss', async () => {
    const session = await prepare([WALL]);
    const si = session.items[0]!;
    expect(gapIds(si)).toEqual(['r0c0', 'r1c1', 'r2c0']);
    expect(si.item.task_view).toMatchObject({ layout: 'wall', header: null });

    const first = await answer(session, si.item.id, { ...WALL_RIGHT, r2c0: '4' });
    expect(first.status).toBe(200);
    expect(first.body.verdict).toBe('incorrect');
    expect(first.body.reply.text).toBe(
      '2 von 3 Feldern stimmen. Schau nochmal bei Reihe 3, Stein 1.',
    );
    expect(first.body.session.items[0]?.status).toBe('open');
    expect(first.body.session.items[0]?.answer).toBeNull();
    expect(gapIds(first.body.session.items[0])).toHaveLength(3);

    // The second miss: code again, no tutor (afterEach holds that).
    const second = await answer(session, si.item.id, { r0c0: '1', r1c1: '2', r2c0: '4' });
    expect(second.body.reply.text).toBe(
      'Noch stimmt keins der Felder – fang am besten bei Reihe 1, Stein 1 an.',
    );
    const third = await answer(session, si.item.id, { ...WALL_RIGHT, r0c0: '19' });
    expect(third.body.verdict).toBe('incorrect');
    expect(third.body.reply.text).toContain('Für jedes x rechnest du');
    expect(third.body.session.items[0]?.status).toBe('revealed');
    expect(third.body.session.items[0]?.answer).toBe('20 · 12 · 3');
  });

  it('shows the solution when she asks for it after a try', async () => {
    const session = await prepare([VALUES]);
    const si = session.items[0]!;
    // Like every question: first a try (or a hint), then the solution.
    const early = await l.api.post(`/practice/sessions/${session.id}/reveal`, {
      item_id: si.item.id,
    });
    expect(early.status).toBe(409);
    await answer(session, si.item.id, { r0c1: '1', r0c3: '3' });
    const res = await l.api.post<SessionView>(`/practice/sessions/${session.id}/reveal`, {
      item_id: si.item.id,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.items[0]?.status).toBe('skipped');
    expect(res.body.items[0]?.answer).toBe('f(x): -1, 3');
    expect(res.body.items[0]?.item.task_view).toBeNull();
    const state = await env.db.one<{ last_outcome: string }>(
      `select last_outcome from item_states where item_id = $1`,
      [si.item.id],
    );
    expect(state.last_outcome).toBe('revealed');
  });

  it('records one answer per client_turn_id', async () => {
    const session = await prepare([VALUES]);
    const si = session.items[0]!;
    const turn = randomUUID();
    const wrong = { r0c1: '-1', r0c3: '4' };
    const a = await answer(session, si.item.id, wrong, turn);
    const b = await answer(session, si.item.id, wrong, turn);
    expect(b.status).toBe(200);
    expect(b.body.reply.id).toBe(a.body.reply.id);
    expect(b.body.reply.text).toBe('1 von 2 Feldern stimmt. Schau nochmal bei „f(x)“ / „1“.');
    const turns = await env.db.one<{ n: number }>(
      `select count(*)::int as n from practice_turns where session_id = $1 and role = 'learner'`,
      [session.id],
    );
    expect(turns.n).toBe(1);
    expect(b.body.session.items[0]?.attempts).toBe(1);
  });

  it('refuses text, a missing or empty cell, an unknown cell and another kind (422)', async () => {
    const session = await prepare([VALUES]);
    const si = session.items[0]!;
    const asText = await l.api.post(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: si.item.id,
      text: '-1, 3',
    });
    expect(asText.status).toBe(422);
    expect(JSON.stringify(asText.body)).toContain('use_parts');
    const bads: Array<Record<string, string>> = [
      { r0c1: '-1' },
      { r0c1: '-1', r0c3: ' ' },
      { ...VALUES_RIGHT, r0c2: '1' },
      { r0c1: '-1', r9c9: '3' },
    ];
    for (const bad of bads) {
      const res = await answer(session, si.item.id, bad);
      expect(res.status, JSON.stringify(bad)).toBe(422);
      expect(JSON.stringify(res.body)).toContain('parts_mismatch');
    }
    const asOrder = await l.api.post(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: si.item.id,
      parts: { type: 'order', order: ['a', 'b', 'c'] },
    });
    expect(asOrder.status).toBe(422);
    const fresh = await l.api.get<SessionView>(`/practice/sessions/${session.id}`);
    expect(fresh.body.items[0]?.attempts).toBe(0);
  });

  it("never lets another learner answer; another's id is 404", async () => {
    const session = await prepare([VALUES]);
    const si = session.items[0]!;
    const other = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2014-05-01' });
    const theirs = await answer(session, si.item.id, VALUES_RIGHT, undefined, other);
    expect(theirs.status).toBe(404);
    expect((await other.api.get(`/practice/sessions/${session.id}`)).status).toBe(404);
    const own = await prepare([WALL]);
    const foreign = await answer(own, si.item.id, VALUES_RIGHT);
    expect(foreign.status).toBe(404);
  });

  it('never sends a key while the question is open', async () => {
    const session = await prepare([WALL]);
    const si = session.items[0]!;
    const bodies = [
      JSON.stringify(session),
      JSON.stringify((await l.api.get(`/practice/sessions/${session.id}`)).body),
    ];
    for (const path of ['/materials', '/buddy']) {
      const res = await l.api.get(path);
      expect(res.status, path).toBe(200);
      bodies.push(JSON.stringify(res.body));
    }
    const wrong = await answer(session, si.item.id, { ...WALL_RIGHT, r0c0: '19' });
    bodies.push(JSON.stringify(wrong.body));
    for (const body of bodies) {
      expect(body).not.toContain('"key"');
      expect(body).not.toContain('"also"');
      expect(body).not.toContain('20 · 12 · 3');
      // The top brick's 20 is nowhere: no shown cell holds it, and no reply names it.
      expect(body).not.toMatch(/"(text|answer)":"20"/);
    }
  });

  it('drops a table Regel 0 rejects and keeps the rest of the set', async () => {
    const session = await prepare([
      { ...VALUES, rows: [[v('f(x)'), g('-1'), v('1'), g('4')]] },
      { ...WALL, rows: [[g('21')], [v('8'), g('12')], [g('3'), v('5'), v('7')]] },
      {
        ...WALL,
        prompt: 'Zahlenmauer ohne Lücke',
        rows: [[v('20')], [v('8'), v('12')], [v('3'), v('5'), v('7')]],
      },
      { ...VALUES, prompt: 'Eine Wertetabelle, die stimmt.' },
    ]);
    expect(session.items.map((i) => i.item.prompt)).toEqual(['Eine Wertetabelle, die stimmt.']);
    const stored = await env.db.one<{ n: number }>(
      `select count(*)::int as n from items where learner_id = $1 and kind = 'table_fill'`,
      [l.learnerId],
    );
    expect(stored.n).toBe(1);
  });

  it('works in a practice test: no verdict until the end, then the solution', async () => {
    const session = await prepare([VALUES, WALL], 'test');
    expect(session.mode).toBe('test');
    const [first, second] = session.items;
    const wrong = await answer(session, first!.item.id, { r0c1: '-1', r0c3: '4' });
    expect(wrong.status).toBe(200);
    expect(wrong.body.reply.text).toBe("Notiert – weiter geht's.");
    expect(wrong.body.session.items[0]?.status).toBe('missed');
    expect(wrong.body.session.items[0]?.answer).toBeNull();
    const right = await answer(session, second!.item.id, WALL_RIGHT);
    expect(right.body.session.status).toBe('finished');
    expect(right.body.session.items.map((i) => i.status)).toEqual(['missed', 'correct']);
    expect(right.body.session.items[0]?.answer).toBe('f(x): -1, 3');
    const states = await env.db.one<{ n: number }>(
      `select count(*)::int as n from item_states where learner_id = $1`,
      [l.learnerId],
    );
    expect(states.n).toBe(0);
  });

  it('reads a table from a photographed sheet, with the spelling rule of its subject', async () => {
    env.llm.script('extraction', {
      json: {
        is_learning_material: true,
        readable: true,
        title: 'Verben',
        subject: { name: 'Deutsch', kind: 'german' },
        extracted_text: 'Konjugiere gehen.',
        items: [],
        structured: [
          {
            type: 'table_fill',
            prompt: 'Konjugiere „gehen“.',
            header: ['Person', 'Präsens', 'Präteritum'],
            rows: [
              [v('ich'), v('gehe'), g('ging')],
              [v('du'), g('gehst'), g('gingst')],
            ],
            family: null,
            fn: null,
            x_in: null,
            topic: 'Verben',
            difficulty: 2,
            prompt_lang: 'de',
            hints: ['Im Präteritum ändert sich der Stammvokal.', 'Es heißt „gingst“.'],
            worked_solution: null,
          },
          // A wall that does not add up never reaches the database.
          {
            ...WALL,
            rows: [[g('21')], [v('8'), g('12')], [g('3'), v('5'), v('7')]],
            hints: [],
            worked_solution: null,
          },
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
    const items = await env.db.query<{ kind: string; hints: string[] }>(
      `select kind, hints from items where material_id = $1`,
      [created.body.material.id],
    );
    // The hint that named a cell is gone.
    expect(items).toEqual([
      { kind: 'table_fill', hints: ['Im Präteritum ändert sich der Stammvokal.'] },
    ]);
    const started = await l.api.post<SessionView>('/practice/sessions', {
      material_id: created.body.material.id,
    });
    expect(started.status).toBe(201);
    const si = started.body.items[0]!;
    expect(gapIds(si)).toEqual(['r0c2', 'r1c1', 'r1c2']);
    // German is a language subject: a capital letter is a spelling slip, named by code.
    const slip = await answer(started.body, si.item.id, {
      r0c2: 'Ging',
      r1c1: 'gehst',
      r1c2: 'gingst',
    });
    expect(slip.body.verdict).toBe('incorrect');
    expect(slip.body.reply.text).toBe(
      '2 von 3 Feldern stimmen. Bei „ich“ / „Präteritum“ fehlt nur noch eine Kleinigkeit.',
    );
    const res = await answer(started.body, si.item.id, {
      r0c2: 'ging',
      r1c1: 'gehst',
      r1c2: 'gingst',
    });
    expect(res.body.verdict).toBe('correct');
  });
});
