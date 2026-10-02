// Structured items (issues #228–#230) in the two places the per-kind files do not walk through:
//
//   1. Homework help from a photo. A printed ordering task keeps its form there too, with its
//      prepared hints, and help mode keeps its promise: code judges every try, "Tipp" gives the
//      next prepared hint, and the solution is never shown — not after three misses either.
//   2. A practice run that starts before its questions are all written (#220). The structured list
//      stands after `items` in the model's answer, so a run that starts on its first FIRST_BATCH
//      questions starts on ordinary ones, and the order arrives with the rest — once, behind them.
//
// Both replace coverage the removed `answers-with-parts.int.test.ts` claimed for `parts` (#224).
// No model is asked for any verdict: `afterEach` fails on any unexpected call.
// docs/architecture.md §Practice ("Structured items").
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type {
  AnswerResponse,
  MaterialView,
  SessionItemView,
  SessionView,
  StaffTask,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FIRST_BATCH } from '../modules/practice/generate.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const STEPS = [
  'Der Samen nimmt Wasser auf',
  'Die Keimwurzel wächst',
  'Der Keimstängel streckt sich',
  'Die Laubblätter entfalten sich',
];

const ORDER = {
  type: 'order',
  prompt: 'Bring die Keimung in die richtige Reihenfolge.',
  elements: STEPS,
  numeric: null,
  topic: 'Keimung',
  difficulty: 2,
  prompt_lang: 'de',
};

/** The ids of an order's elements in the RIGHT order, read off the view by their texts. */
function rightOrder(si: SessionItemView | undefined): string[] {
  const view = si?.item.task_view;
  if (view?.type !== 'order') return [];
  return STEPS.map((text) => view.elements.find((e) => e.text === text)?.id ?? '');
}

const sendOrder = (l: Learner, sessionId: string, itemId: string, order: string[]) =>
  l.api.post<AnswerResponse>(`/practice/sessions/${sessionId}/answer`, {
    client_turn_id: randomUUID(),
    item_id: itemId,
    parts: { type: 'order', order },
  });

describe.skipIf(!dbReady)('structured items in help mode and in a run that grows', () => {
  let env: TestEnv;
  let l: Learner;
  const holding: (() => void)[] = [];

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterEach(async () => {
    while (holding.length > 0) holding.pop()?.();
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      // A tutor call would mean a structured answer went to a model.
      unexpected: env.llm.unexpected.map((u) => u.purpose),
      pending: env.llm.pending(),
    };
    await env.close();
    expect(report).toEqual({ scriptErrors: [], unexpected: [], pending: 0 });
  });

  it('helps with a photographed ordering task: code judges, hints come, the solution never', async () => {
    env.llm.script('extraction', (req) => {
      // The homework prompt, which knows the structured forms too.
      expect(req.system).toContain('help to solve it THEMSELVES');
      expect(req.system).toContain('Order tasks ("structured", type "order")');
      return {
        is_learning_material: true,
        readable: true,
        title: 'Hausaufgabe Keimung',
        subject: { name: 'Biologie', kind: 'biology' },
        extracted_text: 'Ordne die Schritte der Keimung.',
        items: [],
        structured: [
          {
            ...ORDER,
            hints: ['Was braucht ein Samen als Erstes?', 'Die Wurzel kommt vor dem Stängel.'],
          },
        ],
      };
    });
    const created = await l.api.post<{ material: MaterialView; uploads: Array<{ path: string }> }>(
      '/materials',
      { client_request_id: randomUUID(), photo_mimes: ['image/jpeg'], purpose: 'homework' },
    );
    expect(created.status).toBe(201);
    env.storage.put(created.body.uploads[0]!.path);
    await l.api.post(`/materials/${created.body.material.id}/submit`);
    await env.flushBackground();

    const material = (await l.api.get<MaterialView>(`/materials/${created.body.material.id}`)).body;
    expect(material).toMatchObject({ status: 'ready', purpose: 'homework' });
    const session = (await l.api.get<SessionView>(`/practice/sessions/${material.session_id}`))
      .body;
    expect(session).toMatchObject({ mode: 'help', reveal_allowed: false });
    const si = session.items[0]!;
    expect(si.item).toMatchObject({ kind: 'order', origin: 'homework' });
    expect(si.answer).toBeNull();
    const right = rightOrder(si);
    expect(right.every((id) => id !== '')).toBe(true);

    // Wrong three times: every reply is code's, and none of them is the solution.
    const wrong = [right[0]!, right[1]!, right[3]!, right[2]!];
    for (let n = 0; n < 3; n++) {
      const res = await sendOrder(l, session.id, si.item.id, wrong);
      expect(res.status).toBe(200);
      expect(res.body.verdict).toBe('incorrect');
      expect(res.body.reply.text).toContain("Bis Schritt 2 stimmt's");
      expect(res.body.reply.text).not.toContain(STEPS.join(' → '));
      const open = res.body.session.items[0]!;
      expect(open.status).toBe('open');
      expect(open.answer).toBeNull();
      // Still answerable, with its parts and without a key.
      expect(open.item.task_view?.type).toBe('order');
    }
    expect(env.llm.callsFor('tutor')).toHaveLength(0);

    // "Tipp": the prepared hint, at once and without a model.
    const tip = await l.api.post<AnswerResponse>(`/practice/sessions/${session.id}/hint`, {
      client_turn_id: randomUUID(),
      item_id: si.item.id,
    });
    expect(tip.status).toBe(200);
    expect(tip.body.reply.text).toContain('Was braucht ein Samen als Erstes?');

    // "Lösung zeigen" does not exist for homework, for an order neither.
    const reveal = await l.api.post(`/practice/sessions/${session.id}/reveal`, {
      item_id: si.item.id,
    });
    expect(reveal.status).toBe(409);

    // She solves it herself: confirmed, and the solution is still not sent.
    const solved = await sendOrder(l, session.id, si.item.id, right);
    expect(solved.body.verdict).toBe('correct');
    expect(solved.body.reply.text).toContain('selbst gelöst');
    expect(solved.body.session.items[0]).toMatchObject({ status: 'correct', answer: null });
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('starts a growing run on ordinary questions and adds the order with the rest (#220)', async () => {
    env.llm.byDefault('hints', { json: { items: [] } });
    let release = () => undefined as void;
    const until = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    holding.push(release);
    const draft = (n: number) => ({
      kind: 'short',
      prompt: `Frage ${n}`,
      answer: `Antwort ${n}`,
      accepted_answers: [],
      unit: null,
      choices: null,
      correct_choice: null,
      topic: 'Keimung',
      difficulty: 2,
      prompt_lang: null,
      lang: null,
      figure: null,
      source_excerpt: null,
    });
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Keimung',
        subject: { name: 'Biologie', kind: 'biology' },
        items: Array.from({ length: 5 }, (_, i) => draft(i + 1)),
        bars: [],
        structured: [ORDER],
      },
      pauseAfter: { key: 'items', n: FIRST_BATCH, until },
    });

    const started = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Üben wir die Keimung',
    });
    expect(started.status).toBe(201);
    // The run starts on the first ordinary questions; nothing structured is among them.
    expect(started.body.items.map((i) => i.item.kind)).toEqual(['short', 'short', 'short']);
    expect(started.body.preparing).toBe(true);

    release();
    await env.flushBackground();

    const grown = await l.api.get<SessionView>(`/practice/sessions/${started.body.id}`);
    // The rest arrived behind the first three: the other two questions, then the order — once.
    expect(grown.body.items.map((i) => i.item.prompt)).toEqual([
      'Frage 1',
      'Frage 2',
      'Frage 3',
      'Frage 4',
      'Frage 5',
      ORDER.prompt,
    ]);
    expect(grown.body.preparing).toBe(false);
    const order = grown.body.items[5]!;
    expect(order.item.kind).toBe('order');
    expect(order.item.task_view?.type).toBe('order');
    // Stored with its key in `items.task`, and the row agrees with the kind (migration 0079).
    const [row] = await env.db.query<{ task: { type: string; key: string[] } }>(
      `select task from items where id = $1`,
      [order.item.id],
    );
    expect(row?.task.type).toBe('order');
    expect(row?.task.key).toEqual(rightOrder(order));
    // One model call for the whole answer, and it is judged without another.
    expect(env.llm.callsFor('explain')).toHaveLength(1);
    const res = await sendOrder(l, started.body.id, order.item.id, rightOrder(order));
    expect(res.body.verdict).toBe('correct');
  });

  // Issue #277: `addTheRest` appended only `items`, `structured` and `bars`, so the note lines of
  // a run that started early never arrived. Two of the same kind on purpose: their prompts are
  // written by code and read the same, and a dedup by prompt would keep only one.
  it('adds the note lines of a run that started early with the rest (#277)', async () => {
    env.llm.byDefault('hints', { json: { items: [] } });
    let release = () => undefined as void;
    const until = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    holding.push(release);
    const notes: StaffTask[] = [
      { task: 'name_note', clef: 'treble', pitch: { name: 'E', octave: 4 } },
      { task: 'name_note', clef: 'treble', pitch: { name: 'G', octave: 4 } },
    ];
    const draft = (n: number) => ({
      kind: 'short',
      prompt: `Was bedeutet Zeichen ${n}?`,
      answer: `Bedeutung ${n}`,
      accepted_answers: [],
      unit: null,
      choices: null,
      correct_choice: null,
      topic: 'Notenlehre',
      difficulty: 2,
      prompt_lang: null,
      lang: null,
      figure: null,
      source_excerpt: null,
    });
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Notenlehre',
        subject: { name: 'Musik', kind: 'art_music' },
        items: Array.from({ length: 4 }, (_, i) => draft(i + 1)),
        bars: [],
        staffs: notes,
      },
      pauseAfter: { key: 'items', n: FIRST_BATCH, until },
    });
    const started = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Üben wir Notenlehre',
    });
    expect(started.status).toBe(201);
    expect(started.body.items).toHaveLength(FIRST_BATCH);
    expect(started.body.preparing).toBe(true);

    release();
    await env.flushBackground();

    const grown = await l.api.get<SessionView>(`/practice/sessions/${started.body.id}`);
    expect(grown.body.preparing).toBe(false);
    // The fourth ordinary question, then both note lines — none dropped.
    expect(grown.body.items).toHaveLength(FIRST_BATCH + 1 + notes.length);
    const rows = await env.db.query<{ staff_task: StaffTask | null }>(
      `select i.staff_task from session_items si join items i on i.id = si.item_id
        where si.session_id = $1 order by si.position`,
      [started.body.id],
    );
    expect(rows.slice(FIRST_BATCH + 1).map((r) => r.staff_task)).toEqual(notes);
  });
});
