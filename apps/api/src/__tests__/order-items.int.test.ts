// The order item end to end (issue #228), and with it the foundation every structured item
// stands on (#229, #230, #232): the model writes the elements, code checks them before
// anything is stored, names and shuffles them, keeps the key in `items.task` — and judges
// her answer by comparing the parts she arranged with that key. Never a model for the
// verdict (#224, Regel 0). docs/architecture.md §Practice ("Structured items").
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type {
  AnswerResponse,
  MaterialView,
  SessionItemView,
  SessionView,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ORDER_JOIN } from '../modules/practice/structured.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

/** The elements of an order's view (the view union also holds the other structured kinds). */
const elementsOf = (view: SessionItemView['item']['task_view'] | undefined) =>
  view?.type === 'order' ? view.elements : [];

/** The four steps of germination, in the right order — what the model writes. */
const KEIMUNG = [
  'Der Samen nimmt Wasser auf',
  'Die Keimwurzel wächst',
  'Der Keimstängel streckt sich',
  'Die ersten Laubblätter entfalten sich',
];

const order = (elements: string[], over: Record<string, unknown> = {}) => ({
  type: 'order',
  prompt: 'Bring die Keimung in die richtige Reihenfolge.',
  elements,
  numeric: null,
  topic: 'Keimung',
  difficulty: 2,
  prompt_lang: 'de',
  ...over,
});

describe.skipIf(!dbReady)('order items', () => {
  let env: TestEnv;
  let l: Learner;

  /** A topic's practice (or test) whose scripted model wrote these structured tasks. */
  async function prepare(
    structured: unknown[],
    kind: 'practice' | 'test' = 'practice',
  ): Promise<SessionView> {
    env.llm.script('explain', () => ({
      usable: true,
      title: 'Keimung',
      subject: { name: 'Biologie', kind: 'biology' },
      items: [],
      structured,
    }));
    // Help for a practice is written in the background, like for every question of a topic.
    if (kind === 'practice') {
      env.llm.script('hints', () => ({
        items: [
          {
            n: 1,
            hints: ['Was braucht ein Samen zuerst, bevor irgendetwas wächst?'],
            worked_solution: 'Zuerst nimmt der Samen Wasser auf, dann wächst die Wurzel …',
          },
        ],
      }));
    }
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind,
      text: 'Keimung ordnen',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();
    return res.body;
  }

  /** The ids of the shown elements, put into the order of these texts. */
  function idsFor(si: SessionItemView, texts: string[]): string[] {
    const view = si.item.task_view;
    expect(view?.type).toBe('order');
    const byText = new Map(elementsOf(view).map((e) => [e.text, e.id]));
    return texts.map((x) => byText.get(x) ?? 'zz');
  }

  async function answer(
    session: SessionView,
    itemId: string,
    ids: string[],
    turn: string = randomUUID(),
    as: Learner = l,
  ) {
    return as.api.post<AnswerResponse>(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: turn,
      item_id: itemId,
      parts: { type: 'order', order: ids },
    });
  }

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterEach(async () => {
    // A tutor call here would mean code could not decide an order it must decide.
    await env.closeChecked();
  });

  it('stores the checked task, shows it without its key, and judges it right', async () => {
    const session = await prepare([order(KEIMUNG)]);
    expect(session.items).toHaveLength(1);
    const [si] = session.items;
    expect(si?.item.kind).toBe('order');
    expect(si?.item.prompt).toBe('Bring die Keimung in die richtige Reihenfolge.');
    // Shown shuffled, with ids that are the server's and say nothing about the order.
    const shown = elementsOf(si?.item.task_view);
    expect(shown.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
    expect([...shown.map((e) => e.text)].sort()).toEqual([...KEIMUNG].sort());
    expect(shown.map((e) => e.text)).not.toEqual(KEIMUNG);
    expect(si?.answer).toBeNull();

    // What is stored: the one task the prompt's elements and the key come from.
    const row = await env.db.one<{ task: { key: string[] }; answer: string; kind: string }>(
      `select task, answer, kind from items where id = $1`,
      [si!.item.id],
    );
    expect(row.kind).toBe('order');
    expect(row.answer).toBe(KEIMUNG.join(ORDER_JOIN));
    expect(row.task.key).toEqual(idsFor(si!, KEIMUNG));

    const res = await answer(session, si!.item.id, idsFor(si!, KEIMUNG));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.verdict).toBe('correct');
    expect(res.body.reply.text).toBe('Stimmt – gut gemacht!');
    // Her answer stands in the conversation in her words, in her order.
    const mine = res.body.session.turns.find((t) => t.role === 'learner');
    expect(mine?.text).toBe(KEIMUNG.join(ORDER_JOIN));
    const closed = res.body.session.items[0];
    expect(closed?.status).toBe('correct');
    // Closed: no parts any more; the solution stands where solutions stand.
    expect(closed?.item.task_view).toBeNull();
    expect(closed?.answer).toBe(KEIMUNG.join(ORDER_JOIN));

    // FSRS heard it: a first-try review of this item.
    const state = await env.db.one<{ last_outcome: string; reps: number }>(
      `select last_outcome, reps from item_states where item_id = $1`,
      [si!.item.id],
    );
    expect(state).toEqual({ last_outcome: 'first_try', reps: 1 });
    expect(res.body.session.status).toBe('finished');
    expect(res.body.session.summary?.first_try).toBe(1);
    // One question is not a topic (summary.ts, issue #155): neither secure nor shaky.
    expect(res.body.session.summary?.shaky_topics).toEqual([]);
    const how = await env.db.one<{ answered_by: string }>(
      `select answered_by from session_items where session_id = $1`,
      [session.id],
    );
    expect(how.answered_by).toBe('tapped');
  });

  it('names the first wrong place, and shows the solution after the third miss', async () => {
    const session = await prepare([order(KEIMUNG)]);
    const si = session.items[0]!;
    const swapped = [KEIMUNG[0]!, KEIMUNG[1]!, KEIMUNG[3]!, KEIMUNG[2]!];

    const first = await answer(session, si.item.id, idsFor(si, swapped));
    expect(first.status).toBe(200);
    expect(first.body.verdict).toBe('incorrect');
    expect(first.body.reply.text).toBe(
      "Bis Schritt 2 stimmt's! Ab Schritt 3 passt die Reihenfolge noch nicht ganz.",
    );
    // Still open, still with its parts and without its key.
    expect(first.body.session.items[0]?.status).toBe('open');
    expect(elementsOf(first.body.session.items[0]?.item.task_view)).toHaveLength(4);
    expect(first.body.session.items[0]?.answer).toBeNull();

    // The second miss is answered by code too — no tutor call (afterEach holds that).
    const reversed = [...KEIMUNG].reverse();
    const second = await answer(session, si.item.id, idsFor(si, reversed));
    expect(second.body.verdict).toBe('incorrect');
    expect(second.body.reply.text).toBe(
      'Noch nicht ganz – schau nochmal, was ganz am Anfang steht.',
    );

    const third = await answer(session, si.item.id, idsFor(si, swapped));
    expect(third.body.verdict).toBe('incorrect');
    // The prepared worked solution, after the third wrong try (the hint ladder's end).
    expect(third.body.reply.text).toContain('Zuerst nimmt der Samen Wasser auf');
    const closed = third.body.session.items[0];
    expect(closed?.status).toBe('revealed');
    expect(closed?.answer).toBe(KEIMUNG.join(ORDER_JOIN));
    const state = await env.db.one<{ last_outcome: string }>(
      `select last_outcome from item_states where item_id = $1`,
      [si.item.id],
    );
    expect(state.last_outcome).toBe('revealed');
  });

  it('records one answer per client_turn_id, and refuses a closed question', async () => {
    const session = await prepare([order(KEIMUNG)]);
    const si = session.items[0]!;
    const turn = randomUUID();
    const wrong = idsFor(si, [...KEIMUNG].reverse());
    const a = await answer(session, si.item.id, wrong, turn);
    const b = await answer(session, si.item.id, wrong, turn);
    expect(b.status).toBe(200);
    expect(b.body.reply.id).toBe(a.body.reply.id);
    const turns = await env.db.one<{ n: number }>(
      `select count(*)::int as n from practice_turns where session_id = $1 and role = 'learner'`,
      [session.id],
    );
    expect(turns.n).toBe(1);
    expect(b.body.session.items[0]?.attempts).toBe(1);

    const right = await answer(session, si.item.id, idsFor(si, KEIMUNG));
    expect(right.body.verdict).toBe('correct');
    // The same id again replays the right answer; a new one meets a closed question.
    const replay = await answer(session, si.item.id, idsFor(si, KEIMUNG), undefined);
    expect(replay.status).toBe(409);
  });

  it('refuses text, a wrong shape and parts for a question that takes none', async () => {
    const session = await prepare([order(KEIMUNG)]);
    const si = session.items[0]!;
    const asText = await l.api.post(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: si.item.id,
      text: KEIMUNG.join(', '),
    });
    expect(asText.status).toBe(422);
    expect(JSON.stringify(asText.body)).toContain('use_parts');
    const ids = idsFor(si, KEIMUNG);
    for (const bad of [ids.slice(0, 3), [ids[0]!, ...ids.slice(0, 3)], [...ids.slice(0, 3), 'x']]) {
      const res = await answer(session, si.item.id, bad);
      expect(res.status, JSON.stringify(bad)).toBe(422);
    }
    // Nothing of that counted.
    const fresh = await l.api.get<SessionView>(`/practice/sessions/${session.id}`);
    expect(fresh.body.items[0]?.attempts).toBe(0);
  });

  it("never lets another learner see or answer the question; another's id is 404", async () => {
    const session = await prepare([order(KEIMUNG)]);
    const si = session.items[0]!;
    const other = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2014-05-01' });
    const theirs = await answer(session, si.item.id, idsFor(si, KEIMUNG), undefined, other);
    expect(theirs.status).toBe(404);
    expect((await other.api.get(`/practice/sessions/${session.id}`)).status).toBe(404);

    // Her own session with someone else's question in it: not in this session.
    const own = await prepare([order(['Frühling', 'Sommer', 'Herbst', 'Winter'])]);
    const foreign = await answer(own, si.item.id, idsFor(si, KEIMUNG));
    expect(foreign.status).toBe(404);
  });

  it('never sends the key while the question is open', async () => {
    const session = await prepare([order(KEIMUNG)]);
    const si = session.items[0]!;
    const row = await env.db.one<{ task: { key: string[] } }>(
      `select task from items where id = $1`,
      [si.item.id],
    );
    const keyed = JSON.stringify(row.task.key);
    const bodies = [
      JSON.stringify(session),
      JSON.stringify((await l.api.get(`/practice/sessions/${session.id}`)).body),
    ];
    // Her library and Buddy's home, which also speak about her questions and sessions.
    for (const path of ['/materials', '/buddy']) {
      const res = await l.api.get(path);
      expect(res.status, path).toBe(200);
      bodies.push(JSON.stringify(res.body));
    }
    const wrong = await answer(session, si.item.id, idsFor(si, [...KEIMUNG].reverse()));
    bodies.push(JSON.stringify(wrong.body));
    for (const body of bodies) {
      expect(body).not.toContain('"key"');
      expect(body).not.toContain(keyed);
      expect(body).not.toContain(KEIMUNG.join(ORDER_JOIN));
    }
  });

  it('drops a task Regel 0 rejects and keeps the rest of the set', async () => {
    const session = await prepare([
      order(['Keimung', 'keimung', 'Blüte']),
      order(['3', '1', '2'], { numeric: 'ascending', prompt: 'Ordne die Zahlen.' }),
      order(['1', '2', '3'], { prompt: 'Ordne die Zahlen.' }),
      order(['$\\frac{1}{4}$', '0,5', '2'], {
        numeric: 'ascending',
        prompt: 'Ordne der Größe nach, mit der kleinsten Zahl zuerst.',
        topic: 'Zahlen ordnen',
      }),
    ]);
    // Only the last one holds together; nothing of the others reached the database.
    expect(session.items.map((i) => i.item.prompt)).toEqual([
      'Ordne der Größe nach, mit der kleinsten Zahl zuerst.',
    ]);
    const stored = await env.db.one<{ n: number }>(
      `select count(*)::int as n from items where learner_id = $1 and kind = 'order'`,
      [l.learnerId],
    );
    expect(stored.n).toBe(1);
    const si = session.items[0]!;
    const res = await answer(session, si.item.id, idsFor(si, ['$\\frac{1}{4}$', '0,5', '2']));
    expect(res.body.verdict).toBe('correct');
  });

  it('works in a practice test: one try, no verdict until the end, then the solution', async () => {
    const session = await prepare(
      [order(KEIMUNG), order(['Frühling', 'Sommer', 'Herbst', 'Winter'], { topic: 'Jahr' })],
      'test',
    );
    expect(session.mode).toBe('test');
    const [first, second] = session.items;
    const wrong = await answer(session, first!.item.id, idsFor(first!, [...KEIMUNG].reverse()));
    expect(wrong.status).toBe(200);
    // A test says only that it noted the answer; the place of the mistake waits for the end.
    expect(wrong.body.reply.text).toBe("Notiert – weiter geht's.");
    expect(wrong.body.session.items[0]?.status).toBe('missed');
    expect(wrong.body.session.items[0]?.answer).toBeNull();
    const right = await answer(
      session,
      second!.item.id,
      idsFor(second!, ['Frühling', 'Sommer', 'Herbst', 'Winter']),
    );
    expect(right.body.session.status).toBe('finished');
    const review = right.body.session.items;
    expect(review.map((i) => i.status)).toEqual(['missed', 'correct']);
    expect(review[0]?.answer).toBe(KEIMUNG.join(ORDER_JOIN));
    // A test feeds no spaced repetition.
    const states = await env.db.one<{ n: number }>(
      `select count(*)::int as n from item_states where learner_id = $1`,
      [l.learnerId],
    );
    expect(states.n).toBe(0);
  });

  it('reads an order task from a photographed sheet', async () => {
    env.llm.script('extraction', {
      json: {
        is_learning_material: true,
        readable: true,
        title: 'Keimung',
        subject: { name: 'Biologie', kind: 'biology' },
        extracted_text: 'Ordne die Schritte der Keimung.',
        items: [],
        structured: [
          order(KEIMUNG, {
            prompt: 'Ordne die Schritte der Keimung.',
            hints: ['Womit fängt alles an?'],
            worked_solution: null,
          }),
          order(['A', 'a', 'B']),
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
    const items = await env.db.query<{ kind: string; prompt: string; hints: string[] }>(
      `select kind, prompt, hints from items where material_id = $1`,
      [created.body.material.id],
    );
    expect(items).toEqual([
      {
        kind: 'order',
        prompt: 'Ordne die Schritte der Keimung.',
        hints: ['Womit fängt alles an?'],
      },
    ]);
    const started = await l.api.post<SessionView>('/practice/sessions', {
      material_id: created.body.material.id,
    });
    expect(started.status).toBe(201);
    const si = started.body.items[0]!;
    expect(elementsOf(si.item.task_view)).toHaveLength(4);
    const res = await answer(started.body, si.item.id, idsFor(si, KEIMUNG));
    expect(res.body.verdict).toBe('correct');
  });
});
