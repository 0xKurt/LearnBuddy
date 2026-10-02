// Mehrfachauswahl mit mehreren richtigen Antworten end to end (issue #240). The model writes
// the options and marks the right ones; code checks the set before anything is stored (Regel 0
// of #224: at least two right and one wrong, no two alike — rejected, never repaired), gives
// the ids, shuffles and keeps the key in `items.task` (migration 0089). The set she ticked is
// compared with that key exactly — never a model for the verdict — and a partial answer gets a
// count ("2 von 3 richtigen hast du schon"), never a harsh verdict.
// docs/architecture.md §Practice ("Structured items").
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

/** "rosae": which cases are possible? Three right, two wrong. */
const RIGHT = ['Genitiv Sg.', 'Dativ Sg.', 'Nominativ Pl.'];
const WRONG = ['Akkusativ Sg.', 'Ablativ Pl.'];

const draft = (over: Record<string, unknown> = {}) => ({
  type: 'select_all',
  prompt: 'Welche Fälle kann „rosae“ sein?',
  options: [
    ...RIGHT.map((text) => ({ text, correct: true })),
    ...WRONG.map((text) => ({ text, correct: false })),
  ],
  topic: 'a-Deklination',
  difficulty: 2,
  prompt_lang: 'de',
  ...over,
});

/** The view of a select-all item (`task_view` is the union of every structured kind). */
function viewOf(si: SessionItemView | undefined) {
  const view = si?.item.task_view;
  expect(view?.type).toBe('select_all');
  return view?.type === 'select_all' ? view : { options: [] };
}

/** The shown ids of the options with these texts ('zz' for one that is not there). */
function idsFor(si: SessionItemView, texts: string[]): string[] {
  const id = new Map(viewOf(si).options.map((o) => [o.text, o.id]));
  return texts.map((t) => id.get(t) ?? 'zz');
}

describe.skipIf(!dbReady)('select-all items', () => {
  let env: TestEnv;
  let l: Learner;

  /** A topic's practice (or test) whose scripted model wrote these structured tasks. */
  async function prepare(
    structured: unknown[],
    kind: 'practice' | 'test' = 'practice',
  ): Promise<SessionView> {
    env.llm.script('explain', () => ({
      usable: true,
      title: 'Latein: a-Deklination',
      subject: { name: 'Latein', kind: 'latin' },
      items: [],
      structured,
    }));
    if (kind === 'practice') {
      env.llm.script('hints', () => ({
        items: [
          {
            n: 1,
            hints: ['Die Endung -ae kommt im Singular und im Plural vor.'],
            worked_solution: 'Im Singular steht -ae im Genitiv und Dativ, im Plural im Nominativ …',
          },
        ],
      }));
    }
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind,
      text: 'Latein Fälle bestimmen',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();
    return res.body;
  }

  async function answer(
    session: SessionView,
    itemId: string,
    chosen: string[],
    turn: string = randomUUID(),
    as: Learner = l,
  ) {
    return as.api.post<AnswerResponse>(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: turn,
      item_id: itemId,
      parts: { type: 'select_all', chosen },
    });
  }

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2011-02-10' });
  });
  afterEach(async () => {
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      // A tutor call here would mean code could not decide a set it must decide.
      unexpected: env.llm.unexpected.map((u) => u.purpose),
      pending: env.llm.pending(),
    };
    await env.close();
    expect(report).toEqual({ scriptErrors: [], unexpected: [], pending: 0 });
  });

  it('stores the checked set, shows the options without the key, and judges the set right', async () => {
    const session = await prepare([draft()]);
    expect(session.items).toHaveLength(1);
    const si = session.items[0]!;
    expect(si.item).toMatchObject({ kind: 'select_all', choices: null });
    const view = viewOf(si);
    expect(view.options.map((o) => o.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(view.options.map((o) => o.text).sort()).toEqual([...RIGHT, ...WRONG].sort());
    expect(si.answer).toBeNull();

    const row = await env.db.one<{ task: { key: string[] }; answer: string; kind: string }>(
      `select task, answer, kind from items where id = $1`,
      [si.item.id],
    );
    expect(row.kind).toBe('select_all');
    expect(row.task.key.sort()).toEqual(idsFor(si, RIGHT).sort());
    expect(row.answer.split('; ').sort()).toEqual([...RIGHT].sort());

    // Any order of ticking: a set is a set.
    const res = await answer(session, si.item.id, idsFor(si, [...RIGHT].reverse()));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.verdict).toBe('correct');
    expect(res.body.reply.text).toBe('Stimmt – gut gemacht!');
    const closed = res.body.session.items[0];
    expect(closed?.status).toBe('correct');
    expect(closed?.item.task_view).toBeNull();
    expect(closed?.answer).toBe(row.answer);
    const state = await env.db.one<{ last_outcome: string }>(
      `select last_outcome from item_states where item_id = $1`,
      [si.item.id],
    );
    expect(state.last_outcome).toBe('first_try');
    const how = await env.db.one<{ answered_by: string }>(
      `select answered_by from session_items where session_id = $1`,
      [session.id],
    );
    expect(how.answered_by).toBe('tapped');
  });

  it('counts a partial set gently, names a wrong tick on the second miss, reveals on the third', async () => {
    const session = await prepare([draft()]);
    const si = session.items[0]!;
    const partial = idsFor(si, ['Genitiv Sg.', 'Dativ Sg.', 'Ablativ Pl.']);

    const first = await answer(session, si.item.id, partial);
    expect(first.status).toBe(200);
    expect(first.body.verdict).toBe('incorrect');
    expect(first.body.reply.text).toBe(
      '2 von 3 richtigen hast du schon. Eine passt aber nicht dazu.',
    );
    expect(first.body.session.items[0]?.status).toBe('open');
    expect(first.body.session.items[0]?.answer).toBeNull();
    // What she ticked stands in the thread as words, never as ids.
    const mine = first.body.session.turns.filter((t) => t.role === 'learner').at(-1);
    expect(mine?.text.split('; ').sort()).toEqual(
      ['Genitiv Sg.', 'Dativ Sg.', 'Ablativ Pl.'].sort(),
    );

    const second = await answer(session, si.item.id, partial);
    expect(second.body.reply.text).toBe(
      '2 von 3 richtigen hast du schon. Eine passt aber nicht dazu. Schau dir „Ablativ Pl.“ nochmal an.',
    );
    const help = await env.db.one<{ hints_used: number; attempts: number }>(
      `select hints_used, attempts from session_items where session_id = $1`,
      [session.id],
    );
    expect(help).toEqual({ hints_used: 1, attempts: 2 });

    const third = await answer(session, si.item.id, partial);
    expect(third.body.verdict).toBe('incorrect');
    const closed = third.body.session.items[0];
    expect(closed?.status).toBe('revealed');
    expect(closed?.answer?.split('; ').sort()).toEqual([...RIGHT].sort());
    expect(closed?.item.task_view).toBeNull();
  });

  it('records one answer per client_turn_id', async () => {
    const session = await prepare([draft()]);
    const si = session.items[0]!;
    const turn = randomUUID();
    const some = idsFor(si, ['Genitiv Sg.']);
    const a = await answer(session, si.item.id, some, turn);
    const b = await answer(session, si.item.id, some, turn);
    expect(a.body.reply.text).toBe('1 von 3 richtigen hast du schon.');
    expect(b.status).toBe(200);
    expect(b.body.reply.id).toBe(a.body.reply.id);
    const turns = await env.db.one<{ n: number }>(
      `select count(*)::int as n from practice_turns where session_id = $1 and role = 'learner'`,
      [session.id],
    );
    expect(turns.n).toBe(1);
    expect(b.body.session.items[0]?.attempts).toBe(1);
    expect((await answer(session, si.item.id, idsFor(si, RIGHT))).body.verdict).toBe('correct');
    expect((await answer(session, si.item.id, idsFor(si, RIGHT))).status).toBe(409);
  });

  it('refuses text, a choice index and sets that do not fit, without counting them', async () => {
    const session = await prepare([draft()]);
    const si = session.items[0]!;
    for (const body of [{ text: 'Genitiv Sg.' }, { choice: 0 }]) {
      const res = await l.api.post(`/practice/sessions/${session.id}/answer`, {
        client_turn_id: randomUUID(),
        item_id: si.item.id,
        ...body,
      });
      expect(res.status, JSON.stringify(body)).toBe(422);
    }
    const [a] = idsFor(si, RIGHT);
    for (const chosen of [[a!, a!], ['zz'], []]) {
      const res = await answer(session, si.item.id, chosen);
      expect(res.status, JSON.stringify(chosen)).toBe(422);
    }
    const shape = await l.api.post(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: si.item.id,
      parts: { type: 'order', order: ['a', 'b', 'c'] },
    });
    expect(shape.status).toBe(422);
    const fresh = await l.api.get<SessionView>(`/practice/sessions/${session.id}`);
    expect(fresh.body.items[0]?.attempts).toBe(0);
  });

  it("never lets another learner answer the question; another's id is 404", async () => {
    const session = await prepare([draft()]);
    const si = session.items[0]!;
    const other = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2011-05-01' });
    const theirs = await answer(session, si.item.id, idsFor(si, RIGHT), undefined, other);
    expect(theirs.status).toBe(404);
    expect((await other.api.get(`/practice/sessions/${session.id}`)).status).toBe(404);
  });

  it('never sends the key, nor how many are right, while the question is open', async () => {
    const session = await prepare([draft()]);
    const row = await env.db.one<{ task: { key: string[] }; answer: string }>(
      `select task, answer from items where learner_id = $1 and kind = 'select_all'`,
      [l.learnerId],
    );
    const si = session.items[0]!;
    const wrong = await answer(session, si.item.id, idsFor(si, ['Akkusativ Sg.']));
    expect(wrong.body.reply.text).toBe(
      'Noch ist keine der richtigen dabei – schau dir alle nochmal in Ruhe an.',
    );
    const bodies = [
      JSON.stringify(session),
      JSON.stringify((await l.api.get(`/practice/sessions/${session.id}`)).body),
      JSON.stringify(wrong.body),
    ];
    for (const body of bodies) {
      expect(body).not.toContain('"key"');
      expect(body).not.toContain('"correct":true');
      expect(body).not.toContain(JSON.stringify(row.task.key));
      expect(body).not.toContain(row.answer);
    }
  });

  it('stores nothing of a draft Regel 0 rejects, and keeps the rest of the set', async () => {
    const all = RIGHT.concat(WRONG).map((text) => ({ text, correct: true }));
    const session = await prepare([
      // Every option right.
      draft({ options: all }),
      // None right.
      draft({ options: all.map((o) => ({ ...o, correct: false })) }),
      // One right: that is ordinary multiple choice.
      draft({ options: all.map((o, i) => ({ ...o, correct: i === 0 })) }),
      draft({ prompt: 'Welche Formen sind möglich?' }),
    ]);
    expect(session.items.map((i) => i.item.prompt)).toEqual(['Welche Formen sind möglich?']);
    const again = await prepare([
      // Two options that say the same.
      draft({
        options: [
          { text: 'Dativ Sg.', correct: true },
          { text: 'dativ sg', correct: false },
          { text: 'Genitiv Sg.', correct: true },
        ],
      }),
      // Two options only.
      draft({ options: all.slice(0, 2) }),
      draft({ prompt: 'Welche Fälle passen?' }),
    ]);
    expect(again.items.map((i) => i.item.prompt)).toEqual(['Welche Fälle passen?']);
    const stored = await env.db.one<{ n: number }>(
      `select count(*)::int as n from items where learner_id = $1`,
      [l.learnerId],
    );
    expect(stored.n).toBe(2);
  });

  it('keeps the database honest: a select_all row without its task cannot exist (0089)', async () => {
    const session = await prepare([draft()]);
    const id = session.items[0]!.item.id;
    await expect(env.db.query(`update items set task = null where id = $1`, [id])).rejects.toThrow(
      /items_task_matches_kind/,
    );
    await expect(
      env.db.query(`update items set task = jsonb_set(task, '{type}', '"order"') where id = $1`, [
        id,
      ]),
    ).rejects.toThrow(/items_task_matches_kind/);
    // The kinds that were allowed before stay allowed.
    const kinds = await env.db.one<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'items_kind_check'`,
    );
    for (const k of ['multiple_choice', 'order', 'match', 'table_fill', 'cloze', 'select_all']) {
      expect(kinds.def).toContain(`'${k}'`);
    }
  });

  it('works in a practice test: one try, no count until the end, then the solution', async () => {
    const session = await prepare(
      [draft(), draft({ prompt: 'Welche Formen sind möglich?' })],
      'test',
    );
    expect(session.mode).toBe('test');
    const [first, second] = session.items;
    const wrong = await answer(session, first!.item.id, idsFor(first!, RIGHT.slice(0, 2)));
    expect(wrong.status).toBe(200);
    expect(wrong.body.reply.text).toBe("Notiert – weiter geht's.");
    expect(wrong.body.session.items[0]?.status).toBe('missed');
    expect(wrong.body.session.items[0]?.answer).toBeNull();
    const right = await answer(session, second!.item.id, idsFor(second!, RIGHT));
    expect(right.body.session.status).toBe('finished');
    const review = right.body.session.items;
    expect(review.map((i) => i.status)).toEqual(['missed', 'correct']);
    expect(review[0]?.answer?.split('; ').sort()).toEqual([...RIGHT].sort());
  });

  it('reads a tick-all-that-apply task from a photographed sheet; no hint names an option', async () => {
    env.llm.script('extraction', (req) => {
      expect(req.system).toContain('Select-all tasks ("structured", type "select_all")');
      return {
        is_learning_material: true,
        readable: true,
        title: 'Fahrradprüfung',
        subject: { name: 'Sachunterricht', kind: 'other' },
        extracted_text: 'Kreuze alle richtigen Antworten an.',
        items: [],
        structured: [
          {
            type: 'select_all',
            prompt: 'Was muss ein verkehrssicheres Fahrrad haben?',
            options: [
              { text: 'Zwei unabhängige Bremsen', correct: true },
              { text: 'Eine helltönende Klingel', correct: true },
              { text: 'Einen roten Rückstrahler', correct: true },
              { text: 'Einen Gepäckträger', correct: false },
            ],
            topic: 'Verkehrssicheres Fahrrad',
            difficulty: 1,
            prompt_lang: 'de',
            hints: [
              'Was brauchst du, um gesehen und gehört zu werden?',
              'Die Klingel gehört dazu.',
            ],
            worked_solution: null,
          },
          // Rejected: every option right.
          {
            type: 'select_all',
            prompt: 'Was gehört zum Fahrrad?',
            options: [
              { text: 'Lenker', correct: true },
              { text: 'Sattel', correct: true },
              { text: 'Kette', correct: true },
            ],
            topic: null,
            difficulty: 1,
            prompt_lang: 'de',
            hints: [],
            worked_solution: null,
          },
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
    const items = await env.db.query<{ kind: string; prompt: string; hints: string[] }>(
      `select kind, prompt, hints from items where material_id = $1`,
      [created.body.material.id],
    );
    expect(items).toEqual([
      {
        kind: 'select_all',
        prompt: 'Was muss ein verkehrssicheres Fahrrad haben?',
        hints: ['Was brauchst du, um gesehen und gehört zu werden?'],
      },
    ]);
    const started = await l.api.post<SessionView>('/practice/sessions', {
      material_id: created.body.material.id,
    });
    expect(started.status).toBe(201);
    const si = started.body.items[0]!;
    const res = await answer(
      started.body,
      si.item.id,
      idsFor(si, [
        'Zwei unabhängige Bremsen',
        'Eine helltönende Klingel',
        'Einen roten Rückstrahler',
      ]),
    );
    expect(res.body.verdict).toBe('correct');
  });
});
