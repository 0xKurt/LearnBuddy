// The figure library end to end (issues #250, #252, #261): the model CHOOSES an element, a
// drawing and its parts, a net, a gate, a colour — code writes the questions, the figures and
// the keys, stores them, and judges every answer by comparing it with the computed key. No model
// call per answer, in any direction (#224, Regel 0). docs/architecture.md §Practice ("Figure
// library").
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

const CELL = {
  task: 'label',
  drawing: 'plant_cell',
  ask: 'tap',
  parts: ['nucleus', 'vacuole', 'cell_wall', 'chloroplast', 'membrane'],
};

const lamp = (open = false) => ({ part: 'lamp', ohm: null, open, asked: false });
const resistor = (ohm: number, asked = false) => ({ part: 'resistor', ohm, open: false, asked });

const tapPart = (id: string): StructuredAnswer => ({
  type: 'figure_tap',
  value: { kind: 'schematic', id },
});

describe.skipIf(!dbReady)('figure library', () => {
  let env: TestEnv;
  let l: Learner;

  async function prepare(
    figures: unknown[],
    text = 'Pflanzenzelle beschriften',
  ): Promise<SessionView> {
    env.llm.script('explain', () => ({
      usable: true,
      title: 'Figuren',
      subject: { name: 'Biologie', kind: 'biology' },
      items: [],
      figures,
    }));
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();
    return (await l.api.get<SessionView>(`/practice/sessions/${res.body.id}`)).body;
  }

  /** A set whose every choice is rejected: nothing to learn, said plainly. */
  async function prepareRejecting(figures: unknown[]): Promise<number> {
    env.llm.script('explain', () => ({
      usable: true,
      title: 'Figuren',
      subject: null,
      items: [],
      figures,
    }));
    const res = await l.api.post('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Periodensystem',
    });
    return res.status;
  }

  async function answer(
    session: SessionView,
    itemId: string,
    body: { parts: StructuredAnswer } | { text: string } | { choice: number },
    as: Learner = l,
  ) {
    return as.api.post<AnswerResponse>(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: itemId,
      ...body,
    });
  }

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2013-02-10' });
  });
  afterEach(async () => {
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      // Any other call — hints, the tutor — would mean code did not decide what it must decide.
      unexpected: env.llm.unexpected.map((u) => u.purpose),
      pending: env.llm.pending(),
    };
    await env.close();
    expect(report).toEqual({ scriptErrors: [], unexpected: [], pending: 0 });
  });

  it('"Zelle beschriften" gives five questions without a model, and code judges every tap', async () => {
    const session = await prepare([CELL]);
    expect(session.items).toHaveLength(5);
    expect(session.items.map((i) => i.item.prompt)).toEqual([
      'Tippe auf die Zellwand.',
      'Tippe auf den Zellkern.',
      'Tippe auf die Zellmembran.',
      'Tippe auf die Vakuole.',
      'Tippe auf einen Chloroplasten.',
    ]);
    for (const si of session.items) {
      expect(si.item.kind).toBe('figure_tap');
      expect(si.item.task_view).toEqual({
        type: 'figure_tap',
        figure: {
          kind: 'schematic',
          drawing: 'plant_cell',
          parts: ['cell_wall', 'nucleus', 'membrane', 'vacuole', 'chloroplast'],
        },
      });
      // Help is code's, written with the question: nothing left for a model to prepare.
      expect(si.item.kind).not.toBe('short');
    }
    const nucleus = session.items[1]!;
    const row = await env.db.one<{ task: { key: unknown }; answer: string; hints: string[] }>(
      `select task, answer, hints from items where id = $1`,
      [nucleus.item.id],
    );
    expect(row.task.key).toEqual({ kind: 'schematic', id: 'nucleus' });
    expect(row.answer).toBe('Zellkern');
    expect(row.hints.length).toBeGreaterThan(0);

    const wrong = await answer(session, nucleus.item.id, { parts: tapPart('vacuole') });
    expect(wrong.status, JSON.stringify(wrong.body)).toBe(200);
    expect(wrong.body.verdict).toBe('incorrect');
    expect(wrong.body.reply.text).toContain('Das ist: Vakuole.');
    const right = await answer(session, nucleus.item.id, { parts: tapPart('nucleus') });
    expect(right.body.verdict).toBe('correct');
    const said = await env.db.query<{ text: string }>(
      `select text from practice_turns where session_id = $1 and role = 'learner' order by created_at`,
      [session.id],
    );
    expect(said.map((s) => s.text)).toEqual(['Vakuole', 'Zellkern']);
  });

  it('a part without a pin, another kind of figure and typed text are no answer', async () => {
    const session = await prepare([CELL]);
    const id = session.items[0]!.item.id;
    for (const parts of [
      tapPart('cytoplasm'),
      tapPart('heart'),
      { type: 'figure_tap', value: { kind: 'periodic', id: 'na' } },
    ] as StructuredAnswer[]) {
      const res = await answer(session, id, { parts });
      expect(res.status, JSON.stringify(parts)).toBe(422);
      expect(JSON.stringify(res.body)).toContain('parts_mismatch');
    }
    expect((await answer(session, id, { text: 'Zellwand' })).status).toBe(422);
    const fresh = await l.api.get<SessionView>(`/practice/sessions/${session.id}`);
    expect(fresh.body.items[0]?.attempts).toBe(0);
  });

  it('periodic table, circuit, logic gates and colour wheel: every key computed, every verdict code', async () => {
    const session = await prepare(
      [
        { task: 'element', ask: 'valence', element: 'S' },
        {
          task: 'circuit',
          ask: 'current',
          voltage: 12,
          blocks: [
            { branches: [[resistor(6)]] },
            { branches: [[resistor(6, true)], [resistor(12)]] },
          ],
        },
        { task: 'logic', gate: 'and', then: null },
        { task: 'color', ask: 'complement', color: 'r' },
      ],
      'Chemie, Physik, Informatik und Kunst',
    );
    const [valence, current, logic, color] = session.items;
    expect(valence!.item).toMatchObject({
      kind: 'numeric',
      prompt: 'Wie viele Valenzelektronen hat ein Atom Schwefel?',
      figure: { type: 'periodic', table: 'main', mark: 's' },
    });
    expect((await answer(session, valence!.item.id, { text: '5' })).body.verdict).toBe('incorrect');
    expect((await answer(session, valence!.item.id, { text: '6' })).body.verdict).toBe('correct');

    expect(current!.item).toMatchObject({
      kind: 'numeric',
      unit: 'A',
      figure: { type: 'circuit', voltage: 12, meter: { kind: 'ammeter', at: 'r2' } },
    });
    expect((await answer(session, current!.item.id, { text: '0,8' })).body.verdict).toBe('correct');

    expect(logic!.item.kind).toBe('table_fill');
    expect(logic!.item.figure).toEqual({ type: 'logic', gate: 'and', then: null });
    const view = logic!.item.task_view;
    if (view?.type !== 'table_fill') throw new Error('table view');
    const gaps = view.rows.flatMap((r) =>
      r.filter((c): c is { id: string; input: 'math' | 'text' } => 'id' in c),
    );
    expect(gaps).toHaveLength(4);
    const cells = gaps.map((g, i) => ({ id: g.id, text: i === 3 ? '1' : '0' }));
    const table = await answer(session, logic!.item.id, { parts: { type: 'table_fill', cells } });
    expect(table.body.verdict).toBe('correct');

    const wrongColor = await answer(session, color!.item.id, {
      parts: { type: 'figure_tap', value: { kind: 'color_wheel', id: 'bg' } },
    });
    expect(wrongColor.body.reply.text).toContain('Das ist Blaugrün.');
    const rightColor = await answer(session, color!.item.id, {
      parts: { type: 'figure_tap', value: { kind: 'color_wheel', id: 'g' } },
    });
    expect(rightColor.body.verdict).toBe('correct');
  });

  it('drops every choice code rejects and keeps the rest', async () => {
    expect(await prepareRejecting([{ task: 'element', ask: 'protons', element: 'Xy' }])).toBe(422);
    const session = await prepare([
      // A part the drawing does not have.
      { task: 'label', drawing: 'eye', ask: 'tap', parts: ['lens', 'heart'] },
      // A short circuit of the battery.
      {
        task: 'circuit',
        ask: 'lit_count',
        voltage: 6,
        blocks: [
          { branches: [[lamp()], [{ part: 'switch', ohm: null, open: false, asked: false }]] },
        ],
      },
      // Orange and violet mix to nothing this wheel shows.
      { task: 'color', ask: 'mix', color: 'o', with: 'v' },
      { task: 'label', drawing: 'eye', ask: 'tap', parts: ['lens', 'retina'] },
    ]);
    // At most four tasks are read (MAX_FIGURE_TASKS); the fourth is the one that holds.
    expect(session.items.map((i) => i.item.prompt)).toEqual([
      'Tippe auf die Netzhaut.',
      'Tippe auf die Linse.',
    ]);
  });

  it("another learner's session or question is 404, and the key is never sent", async () => {
    const session = await prepare([{ task: 'element', ask: 'find', element: 'Mg' }]);
    const si = session.items[0]!;
    const other = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2013-05-01' });
    const foreign = await answer(
      session,
      si.item.id,
      { parts: { type: 'figure_tap', value: { kind: 'periodic', id: 'mg' } } },
      other,
    );
    expect(foreign.status).toBe(404);
    const wrong = await answer(session, si.item.id, {
      parts: { type: 'figure_tap', value: { kind: 'periodic', id: 'ca' } },
    });
    expect(wrong.body.reply.text).toContain('die Gruppe stimmt schon');
    for (const body of [JSON.stringify(session), JSON.stringify(wrong.body)]) {
      expect(body).not.toContain('"key"');
      expect(body).not.toContain('"mg"');
    }
  });

  it('a library question is a figure kind with its task — the database insists', async () => {
    const si = (await prepare([CELL])).items[0]!;
    await expect(
      env.db.query(`update items set task = null where id = $1`, [si.item.id]),
    ).rejects.toThrow(/items_task_matches_kind/);
  });
});
