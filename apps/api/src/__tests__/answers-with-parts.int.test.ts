// Antworten mit mehreren Teilen, end to end (issues #228, #229, #230).
//
// Was diese Datei wirklich prüft, sind drei Zusagen aus den Issues:
//
//   1. **Code entscheidet jedes Teil, das Modell keines.** Das `afterEach` unten lässt den Lauf
//      fallen, wenn irgendein unerwarteter Modellaufruf passiert ist — ein Tutor-Aufruf hier
//      würde heißen, dass eine Reihenfolge oder eine Zelle ans Modell gegangen ist.
//   2. **Eine teilweise richtige Antwort behauptet nicht mehr, als gemessen wurde.** Sie ist
//      `partially_correct`, die Frage bleibt offen, FSRS bekommt daraus nichts, und die richtige
//      Antwort danach ist `with_help` — nicht `first_try`.
//   3. **Antworten kann sie nur mit den Teilen, die die Frage hergibt.** Eine fremde Lücke, ein
//      Element zweimal, Text statt Teilen: alles abgewiesen, nichts davon wird interpretiert.
//
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type {
  AnswerPart,
  AnswerResponse,
  ItemKind,
  PartsTask,
  SessionView,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { boardOf, solutionOfParts } from '../modules/practice/parts.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const KEIMUNG: PartsTask = {
  form: 'order',
  elements: ['Samen quillt auf', 'Wurzel wächst', 'Keimblätter öffnen sich', 'Blatt wächst'],
};

const ORGANE: PartsTask = {
  form: 'match_pairs',
  pairs: [
    { left: 'Lunge', right: 'Gasaustausch' },
    { left: 'Herz', right: 'Blut pumpen' },
    { left: 'Niere', right: 'Blut filtern' },
    { left: 'Magen', right: 'Nahrung zersetzen' },
  ],
};

const WORTARTEN: PartsTask = {
  form: 'match_groups',
  groups: [
    { name: 'Nomen', members: ['Hund', 'Haus'] },
    { name: 'Verb', members: ['laufen', 'denken'] },
  ],
};

const STELLENWERT: PartsTask = {
  form: 'table_fill',
  computed: null,
  header: ['Zahl', 'H', 'Z', 'E'],
  rows: [
    [
      { cell: 'given', text: '342' },
      { cell: 'gap', expect: 'number', answer: '3', accepted: [] },
      { cell: 'gap', expect: 'number', answer: '4', accepted: [] },
      { cell: 'gap', expect: 'number', answer: '2', accepted: [] },
    ],
  ],
};

/** Buddy plans what comes next when a run finishes; he has nothing to say about this one. */
const WAIT = { json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null } };

const KIND: Record<PartsTask['form'], ItemKind> = {
  order: 'order',
  match_pairs: 'match',
  match_groups: 'match',
  table_fill: 'table_fill',
};

/** One item the scripted model "wrote" — note it never writes a key or a ref. */
function draft(task: PartsTask, prompt: string, topic: string) {
  return {
    kind: KIND[task.form],
    prompt,
    // Deliberately a key the server must ignore: the solution is computed from the task.
    answer: 'irgendwas',
    accepted_answers: [],
    unit: null,
    choices: null,
    correct_choice: null,
    topic,
    difficulty: 2,
    source_excerpt: null,
    parts_task: task,
  };
}

/** The answer that is right, derived from the task — the way the app derives it from the board. */
function rightParts(task: PartsTask): AnswerPart[] {
  switch (task.form) {
    case 'order':
      return task.elements.map((_, i) => ({ slot: `p${i + 1}`, value: `e${i + 1}` }));
    case 'match_pairs':
      return task.pairs.map((_, i) => ({ slot: `l${i + 1}`, value: `r${i + 1}` }));
    case 'match_groups': {
      const out: AnswerPart[] = [];
      let n = 0;
      task.groups.forEach((g, gi) =>
        g.members.forEach(() => out.push({ slot: `e${++n}`, value: `g${gi + 1}` })),
      );
      return out;
    }
    case 'table_fill': {
      const out: AnswerPart[] = [];
      for (const row of task.rows) {
        for (const cell of row) {
          if (cell.cell === 'gap') out.push({ slot: `c${out.length + 1}`, value: cell.answer });
        }
      }
      return out;
    }
  }
}

describe.skipIf(!dbReady)('answers with several parts', () => {
  let env: TestEnv;
  let l: Learner;

  async function prepare(tasks: PartsTask[], text = 'Bio üben'): Promise<SessionView> {
    env.llm.script('explain', () => ({
      usable: true,
      title: 'Mehrteilig',
      subject: { name: 'Biologie', kind: 'biology' },
      items: tasks.map((t, i) => draft(t, `Aufgabe ${i + 1}: bring das in Ordnung.`, 'Pflanzen')),
      bars: [],
    }));
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();
    // Since #220 a run starts with its first FIRST_BATCH questions and the rest is written behind
    // her; the response above is the run at its start. Read it again once the refill has landed,
    // or a fourth question is there only when the refill happened to win the race.
    const settled = await l.api.get<SessionView>(`/practice/sessions/${res.body.id}`);
    expect(settled.status, JSON.stringify(settled.body)).toBe(200);
    return settled.body;
  }

  async function answer(
    sessionId: string,
    itemId: string,
    body: { parts?: AnswerPart[]; text?: string },
  ) {
    return l.api.post<AnswerResponse>(`/practice/sessions/${sessionId}/answer`, {
      client_turn_id: randomUUID(),
      item_id: itemId,
      via: 'tapped',
      ...body,
    });
  }

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    env.llm.byDefault('buddy_check', WAIT);
  });
  afterEach(async () => {
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      // Any call here would mean a part went to the model, which is the whole point of #227.
      unexpected: env.llm.unexpected.map((u) => u.purpose),
      tutor: env.llm.callsFor('tutor').length,
    };
    await env.close();
    expect(report).toEqual({ scriptErrors: [], unexpected: [], tutor: 0 });
  });

  it('shows the board without the solution, and stores the one task it came from', async () => {
    const tasks = [KEIMUNG, ORGANE, WORTARTEN, STELLENWERT];
    const session = await prepare(tasks);
    expect(session.items.map((i) => i.item.kind)).toEqual([
      'order',
      'match',
      'match',
      'table_fill',
    ]);
    // No open question carries its solution, and the board never did.
    expect(session.items.map((i) => i.answer)).toEqual([null, null, null, null]);
    for (const [n, si] of session.items.entries()) {
      const task = tasks[n] as PartsTask;
      expect(si.item.board).toEqual(boardOf(task, si.item.id));
      expect(JSON.stringify(si.item.board)).not.toContain('"answer"');
      // What she has to type is nothing: there is no field on a board question.
      expect(si.item.surface).toBeNull();
    }
    // The stored task is the ONE source: the key the model wrote never reached the question.
    const rows = await env.db.query<{ answer: string; parts_task: unknown; kind: string }>(
      `select i.answer, i.parts_task, i.kind from session_items si join items i on i.id = si.item_id
        where si.session_id = $1 order by si.position`,
      [session.id],
    );
    expect(rows.map((r) => r.parts_task)).toEqual(tasks);
    expect(rows.map((r) => r.answer)).toEqual(tasks.map((t) => solutionOfParts(t)));
    expect(rows.every((r) => r.answer !== 'irgendwas')).toBe(true);
  });

  it('counts a whole board right as right, and feeds the schedule once', async () => {
    const session = await prepare([KEIMUNG]);
    const item = session.items[0]?.item.id as string;
    const res = await answer(session.id, item, { parts: rightParts(KEIMUNG) });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.verdict).toBe('correct');
    const closed = res.body.session.items[0];
    expect(closed?.status).toBe('correct');
    // Her arrangement is in the thread in words, so the conversation stays readable.
    const mine = res.body.session.turns.find((tr) => tr.role === 'learner');
    expect(mine?.text).toBe(solutionOfParts(KEIMUNG));
    const state = await env.db.query<{ last_outcome: string; reps: number }>(
      `select last_outcome, reps from item_states where item_id = $1`,
      [item],
    );
    expect(state).toEqual([{ last_outcome: 'first_try', reps: 1 }]);
  });

  it('calls a partly right order partly right, names where it breaks, and stays open', async () => {
    const session = await prepare([KEIMUNG]);
    const item = session.items[0]?.item.id as string;
    // The first two steps hold; the last two are swapped.
    const res = await answer(session.id, item, {
      parts: [
        { slot: 'p1', value: 'e1' },
        { slot: 'p2', value: 'e2' },
        { slot: 'p3', value: 'e4' },
        { slot: 'p4', value: 'e3' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe('partially_correct');
    expect(res.body.reply.text).toBe('Bis Schritt 2 stimmt alles. Schau dir Schritt 3 nochmal an.');
    const still = res.body.session.items[0];
    expect(still?.status).toBe('open');
    expect(still?.attempts).toBe(1);
    // Nothing was written to the schedule: nothing concluded, so nothing is claimed.
    const state = await env.db.query(`select 1 from item_states where item_id = $1`, [item]);
    expect(state).toEqual([]);

    // She fixes only the two steps that did not hold. It counts as right — and as "with help",
    // because it took a second try. That is the whole weighting: less, not a fraction.
    const second = await answer(session.id, item, { parts: rightParts(KEIMUNG) });
    expect(second.body.verdict).toBe('correct');
    const after = await env.db.query<{ last_outcome: string }>(
      `select last_outcome from item_states where item_id = $1`,
      [item],
    );
    expect(after).toEqual([{ last_outcome: 'with_help' }]);
  });

  it('says how many pairs hold first, and only then which one to look at', async () => {
    const session = await prepare([ORGANE]);
    const item = session.items[0]?.item.id as string;
    const swapped: AnswerPart[] = [
      { slot: 'l1', value: 'r1' },
      { slot: 'l2', value: 'r2' },
      { slot: 'l3', value: 'r4' },
      { slot: 'l4', value: 'r3' },
    ];
    const first = await answer(session.id, item, { parts: swapped });
    expect(first.body.verdict).toBe('partially_correct');
    expect(first.body.reply.text).toBe(
      '2 von 4 Paaren stimmen schon. Probier die anderen nochmal.',
    );

    // From the second try on the reply is more specific — the hint ladder, in one sentence. One
    // place, never the list of both: `chemistry.ts` settled that.
    const second = await answer(session.id, item, { parts: swapped });
    expect(second.body.verdict).toBe('partially_correct');
    expect(second.body.reply.text).toMatch(/^2 von 4 Paaren stimmen\. Schau dir „(Niere|Magen)“/);
    expect(second.body.reply.text).not.toContain('Gasaustausch');

    // The third try ends the ladder: the solution, explained, and the question closes — exactly
    // as it does for every other question (REVEAL_AFTER_MISSES).
    const third = await answer(session.id, item, { parts: swapped });
    expect(third.body.session.items[0]?.status).toBe('revealed');
    expect(third.body.session.items[0]?.item.board).toBeNull();
    const state = await env.db.query<{ last_outcome: string }>(
      `select last_outcome from item_states where item_id = $1`,
      [item],
    );
    expect(state).toEqual([{ last_outcome: 'revealed' }]);
  });

  it('names the one cell that is not right, by the words the table itself gives', async () => {
    const session = await prepare([STELLENWERT]);
    const item = session.items[0]?.item.id as string;
    const res = await answer(session.id, item, {
      parts: [
        { slot: 'c1', value: '3' },
        { slot: 'c2', value: '4' },
        { slot: 'c3', value: '7' },
      ],
    });
    expect(res.body.verdict).toBe('partially_correct');
    expect(res.body.reply.text).toBe('2 von 3 Feldern stimmen. Probier die anderen nochmal.');
    const second = await answer(session.id, item, {
      parts: [
        { slot: 'c1', value: '3' },
        { slot: 'c2', value: '4' },
        { slot: 'c3', value: '7' },
      ],
    });
    expect(second.body.reply.text).toBe(
      '2 von 3 Feldern stimmen. Schau dir E bei „342“ nochmal an.',
    );
  });

  it('takes only the shape the question offers', async () => {
    const session = await prepare([KEIMUNG, STELLENWERT]);
    const order = session.items[0]?.item.id as string;
    const table = session.items[1]?.item.id as string;

    // Typed text at a board question (invalid_input → 422, `lib/errors.ts`).
    expect((await answer(session.id, order, { text: 'Samen, Wurzel, Blatt' })).status).toBe(422);
    // A slot this question does not have.
    expect(
      (
        await answer(session.id, order, {
          parts: [
            { slot: 'p1', value: 'e1' },
            { slot: 'p2', value: 'e2' },
            { slot: 'p3', value: 'e3' },
            { slot: 'c1', value: 'e4' },
          ],
        })
      ).status,
    ).toBe(422);
    // One element in two positions.
    expect(
      (
        await answer(session.id, order, {
          parts: [
            { slot: 'p1', value: 'e1' },
            { slot: 'p2', value: 'e1' },
            { slot: 'p3', value: 'e3' },
            { slot: 'p4', value: 'e4' },
          ],
        })
      ).status,
    ).toBe(422);
    // Half a board is not a weaker answer, it is an answer that was not given.
    expect((await answer(session.id, table, { parts: [{ slot: 'c1', value: '3' }] })).status).toBe(
      422,
    );
    // The question is untouched by all of that.
    const view = await l.api.get<SessionView>(`/practice/sessions/${session.id}`);
    expect(view.body.items.map((i) => i.status)).toEqual(['open', 'open']);
    expect(view.body.items.map((i) => i.attempts)).toEqual([0, 0]);
    // Parts sent to a question with one answer, and a question of another learner.
    const other = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2013-05-05' });
    const foreign = await other.api.post<AnswerResponse>(
      `/practice/sessions/${session.id}/answer`,
      { client_turn_id: randomUUID(), item_id: order, parts: rightParts(KEIMUNG) },
    );
    expect(foreign.status).toBe(404);
  });

  it('lets a whole board right at once name the topic as one that went well', async () => {
    // Two questions of one topic, both tapped, both right at the first try. Tapping is the FORM
    // of these tasks, not a weaker substitute for producing something (issue #163), so the topic
    // counts — which is what the carve-out in summary.ts is for.
    const session = await prepare([KEIMUNG, WORTARTEN]);
    for (const [n, si] of session.items.entries()) {
      const task = (n === 0 ? KEIMUNG : WORTARTEN) as PartsTask;
      const res = await answer(session.id, si.item.id, { parts: rightParts(task) });
      expect(res.body.verdict, JSON.stringify(res.body)).toBe('correct');
    }
    const done = await l.api.post<SessionView>(`/practice/sessions/${session.id}/finish`, {});
    await env.flushBackground();
    expect(done.body.summary).toMatchObject({
      answered: 2,
      first_try: 2,
      secure_topics: ['Pflanzen'],
      shaky_topics: [],
    });
    const how = await env.db.query<{ answered_by: string }>(
      `select answered_by from session_items where session_id = $1 order by position`,
      [session.id],
    );
    expect(how).toEqual([{ answered_by: 'tapped' }, { answered_by: 'tapped' }]);
  });
});
