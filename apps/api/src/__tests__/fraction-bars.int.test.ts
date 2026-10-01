// Der Bruchbalken end to end (issue #162): the model picks a reviewed task, the server
// writes the question, draws the bars, computes the solution — and grades her answer by
// the amount it names, never by how she wrote it.
//
// What this file is really about is the acceptance criterion of #162: the representation,
// the question text and the solution come from ONE validated object. So it does not only
// check that the question looks right — it reads the stored task back out of the database
// and derives the question from it again, and the two must be the same thing.
// docs/architecture.md §Practice.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, BarTask, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { barItem } from '../modules/practice/bars.js';
import { closeIdleSessions, PRACTICE_IDLE_MS } from '../modules/practice/lifecycle.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

/** "Eine Hälfte in Viertel teilen", "1/2 + 1/4", "was ist mehr?" — the issue's own three. */
const TASKS: BarTask[] = [
  { task: 'shade', parts: 4, units: 2 },
  { task: 'add', parts: 4, first: 2, second: 1 },
  { task: 'compare', left: '1/2', right: '3/5' },
];

describe.skipIf(!dbReady)('fraction bars', () => {
  let env: TestEnv;
  let l: Learner;

  /**
   * One prepared practice. Note what the scripted model is given room to say: `bars` holds
   * tasks and numbers, and the attempts at a prompt and a key below are not part of the
   * contract — they are dropped before anything is stored, which is the point.
   */
  async function prepare(tasks: BarTask[], text = 'Brüche mit Balken üben'): Promise<SessionView> {
    env.llm.script('explain', () => ({
      usable: true,
      title: 'Bruchbalken',
      subject: { name: 'Mathe', kind: 'math' },
      items: [],
      bars: tasks.map((t) => ({ ...t, prompt: 'Wie viel ist ein Achtel?', answer: '9/4' })),
    }));
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();
    return res.body;
  }

  async function answer(session: SessionView, itemId: string, text: string, turn = randomUUID()) {
    return l.api.post<AnswerResponse>(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: turn,
      item_id: itemId,
      text,
      via: 'tapped',
    });
  }

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-01T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterEach(async () => {
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      // A tutor call here would mean a rule could not decide an amount it must decide.
      unexpected: env.llm.unexpected.map((u) => u.purpose),
      pending: env.llm.pending(),
    };
    await env.close();
    expect(report).toEqual({ scriptErrors: [], unexpected: [], pending: 0 });
  });

  it('writes the question, draws the bars and keeps the solution, from the task alone', async () => {
    const session = await prepare(TASKS);
    expect(session.items).toHaveLength(3);
    const [shade, add, compare] = session.items;

    // The model's attempt at a prompt and a key never reached the question: the contract has
    // no field for either, so what she reads is what code wrote.
    expect(shade?.item.prompt).toBe('Färbe $\\frac{1}{2}$ ein.');
    expect(shade?.item.prompt).not.toContain('Achtel');
    expect(add?.item.prompt).toBe(
      'Rechne $\\frac{1}{2}$ + $\\frac{1}{4}$ und färbe das Ergebnis ein.',
    );
    expect(compare?.item.prompt).toBe(
      'Welcher Bruch ist größer: $\\frac{1}{2}$ oder $\\frac{3}{5}$?',
    );

    // A figure is what she READS, a surface what she WORKS with. The sum has both.
    expect(shade?.item.figure).toBeNull();
    expect(shade?.item.surface).toEqual({ mode: 'shade', parts: 4 });
    expect(add?.item.figure).toEqual({
      type: 'fraction',
      shape: 'bar',
      fractions: [
        { parts: 4, filled: 2 },
        { parts: 4, filled: 1 },
      ],
    });
    expect(add?.item.surface).toEqual({ mode: 'shade', parts: 4 });
    expect(compare?.item.surface).toEqual({
      mode: 'pick',
      bars: [
        { parts: 2, filled: 1 },
        { parts: 5, filled: 3 },
      ],
    });

    // No open question ever carries its solution, surface or not.
    expect(session.items.map((i) => i.answer)).toEqual([null, null, null]);
    // Prepared help is there from the first second: these hints were computed, not awaited.
    expect(session.items.every((i) => i.hints_left >= 2)).toBe(true);
  });

  // The acceptance criterion of #162, measured rather than asserted in prose: what is stored
  // is one object, and everything the learner sees is a function of it.
  it('stores the one task every part of the question came from', async () => {
    const session = await prepare(TASKS);
    const rows = await env.db.query<{
      prompt: string;
      answer: string;
      figure: unknown;
      hints: string[];
      worked_solution: string | null;
      bar_task: unknown;
    }>(
      `select i.prompt, i.answer, i.figure, i.hints, i.worked_solution, i.bar_task
         from session_items si join items i on i.id = si.item_id
        where si.session_id = $1 order by si.position`,
      [session.id],
    );
    expect(rows.map((r) => r.bar_task)).toEqual(TASKS);
    for (const row of rows) {
      const again = barItem(row.bar_task as BarTask, 'de');
      expect(again).not.toBeNull();
      expect({
        prompt: row.prompt,
        answer: row.answer,
        figure: row.figure,
        hints: row.hints,
        worked_solution: row.worked_solution,
      }).toEqual({
        prompt: again?.prompt,
        answer: again?.answer,
        figure: again?.figure,
        hints: again?.hints,
        worked_solution: again?.worked_solution,
      });
    }
  });

  it('counts any way of writing the right amount as right, and a different amount as wrong', async () => {
    const session = await prepare(TASKS);
    const shade = session.items[0]!.item.id;
    const add = session.items[1]!.item.id;

    // A different amount is wrong, decided by a rule and without a model.
    const wrong = await answer(session, shade, '3/4');
    expect(wrong.body.verdict).toBe('incorrect');
    expect(wrong.body.session.items[0]?.status).toBe('open');

    // 1/2 and 2/4 are one answer: the question asked for an amount, not for a notation
    // (and the task that WROTE it is what makes that certain — issue #162, D-3).
    const other = await answer(session, shade, '1/2');
    expect(other.body.verdict).toBe('correct');
    expect(other.body.session.items[0]?.status).toBe('correct');

    // The same for a decimal on the sum: 1/2 + 1/4 shaded is 3/4 is 0,75.
    const decimal = await answer(session, add, '0,75');
    expect(decimal.body.verdict).toBe('correct');

    // Nothing was asked of the model for any of it (the afterEach would see it).
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('lets her tap the bigger bar — and does not hand her the answer by elimination', async () => {
    const session = await prepare(TASKS);
    const right = await answer(session, session.items[2]!.item.id, '3/5');
    expect(right.body.verdict).toBe('correct');

    // Two bars are two options: once one is ruled out, tapping the other is elimination
    // and not knowledge, so the question closes with the solution shown (user feedback #9).
    const second = await prepare(
      [{ task: 'compare', left: '1/3', right: '1/4' }],
      'nochmal Balken',
    );
    const item = second.items[0]!.item.id;
    const missed = await answer(second, item, '1/4');
    expect(missed.body.verdict).toBe('incorrect');
    const closed = missed.body.session.items[0];
    expect(closed?.status).toBe('revealed');
    expect(closed?.answer).toBe('1/3');
    // Shown, never counted as right.
    expect(missed.body.reply).toMatchObject({ role: 'tutor' });
    expect(missed.body.reply.text).toContain('\\frac{1}{3}');
  });

  it('moves the context fence exactly once for the whole preparation (rule 4)', async () => {
    const before = await env.db.one<{ v: number }>(
      `select context_version as v from buddy_settings where learner_id = $1`,
      [l.learnerId],
    );
    const session = await prepare(TASKS);
    const after = await env.db.one<{ v: number }>(
      `select context_version as v from buddy_settings where learner_id = $1`,
      [l.learnerId],
    );
    // The questions, the session and the bump are one transaction: anything Buddy decided
    // against the version before this is stale and cannot be applied on top of it.
    expect(after.v).toBe(before.v + 1);

    // The same request again is the same session, and the fence does not move a second time.
    env.llm.script('explain', () => {
      throw new Error('a repeated request must not ask the model again');
    });
    const same = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: (
        await env.db.one<{ cid: string }>(
          `select client_request_id as cid from practice_sessions where id = $1`,
          [session.id],
        )
      ).cid,
      kind: 'practice',
      text: 'Brüche mit Balken üben',
    });
    expect(same.status).toBe(201);
    expect(same.body.id).toBe(session.id);
    const unchanged = await env.db.one<{ v: number }>(
      `select context_version as v from buddy_settings where learner_id = $1`,
      [l.learnerId],
    );
    expect(unchanged.v).toBe(after.v);
    env.llm.reset();
  });

  it('answers a repeated submission with the first result instead of grading twice', async () => {
    const session = await prepare(TASKS);
    const item = session.items[0]!.item.id;
    const turn = randomUUID();
    const first = await answer(session, item, '2/4', turn);
    const again = await answer(session, item, '2/4', turn);
    expect(first.body.verdict).toBe('correct');
    expect(again.body.verdict).toBe('correct');
    expect(again.body.reply.id).toBe(first.body.reply.id);
    const turns = await env.db.one<{ n: number }>(
      `select count(*)::int as n from practice_turns
        where session_id = $1 and item_id = $2 and role = 'learner'`,
      [session.id, item],
    );
    expect(turns.n).toBe(1);
    // And the spaced repetition saw this question exactly once.
    const reps = await env.db.one<{ reps: number }>(
      `select reps from item_states where item_id = $1 and learner_id = $2`,
      [item, l.learnerId],
    );
    expect(reps.reps).toBe(1);
  });

  it('never answers another learner’s question, whatever the session', async () => {
    const mine = await prepare(TASKS);
    const other = await onboard(env, { relation: 'child', name: 'Mara', birthDate: '2013-05-02' });
    env.llm.script('explain', () => ({
      usable: true,
      title: 'Bruchbalken',
      subject: { name: 'Mathe', kind: 'math' },
      items: [],
      bars: [{ task: 'shade', parts: 6, units: 3 }],
    }));
    const hers = await other.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Brüche mit Balken üben',
    });
    expect(hers.status).toBe(201);
    await env.flushBackground();

    const stolen = await answer(mine, hers.body.items[0]!.item.id, '3/6');
    expect(stolen.status).toBe(404);
    // And her question is untouched: no turn, no spaced-repetition state.
    const turns = await env.db.one<{ n: number }>(
      `select count(*)::int as n from practice_turns where item_id = $1`,
      [hers.body.items[0]!.item.id],
    );
    expect(turns.n).toBe(0);
  });

  it('refuses an answer to a session that ended while she was away', async () => {
    const session = await prepare(TASKS);
    const item = session.items[0]!.item.id;
    // Interrupted: she put the phone down, and three days later the sweep closed it.
    env.clock.advance(PRACTICE_IDLE_MS + 60_000);
    expect(await closeIdleSessions(env.deps)).toBe(1);
    expect(
      await env.db.one<{ status: string }>(`select status from practice_sessions where id = $1`, [
        session.id,
      ]),
    ).toEqual({ status: 'abandoned' });

    const late = await answer(session, item, '2/4');
    expect(late.status).toBe(409);
    const turns = await env.db.one<{ n: number }>(
      `select count(*)::int as n from practice_turns where session_id = $1`,
      [session.id],
    );
    expect(turns.n).toBe(0);

    // A closed question refuses a second answer behind the same lock.
    const open = await prepare([{ task: 'shade', parts: 4, units: 3 }], 'noch ein Balken');
    const only = open.items[0]!.item.id;
    expect((await answer(open, only, '3/4')).body.verdict).toBe('correct');
    expect((await answer(open, only, '3/4')).status).toBe(409);
  });

  it('is offered only where it belongs: never in a test, never for homework', async () => {
    for (const kind of ['test', 'help'] as const) {
      env.llm.script('explain', () => ({
        usable: true,
        title: 'Brüche',
        subject: { name: 'Mathe', kind: 'math' },
        items: [
          {
            kind: 'numeric',
            prompt: 'Berechne $\\frac{1}{2} + \\frac{1}{4}$.',
            answer: '3/4',
            accepted_answers: [],
            unit: null,
            choices: null,
            correct_choice: null,
            topic: 'Brüche addieren',
            difficulty: 2,
            prompt_lang: null,
            lang: null,
            figure: null,
            source_excerpt: null,
          },
        ],
        bars: TASKS,
      }));
      const res = await l.api.post<SessionView>('/practice/topic', {
        client_request_id: randomUUID(),
        kind,
        text: 'Berechne $\\frac{1}{2} + \\frac{1}{4}$.',
      });
      expect(res.status, kind).toBe(201);
      await env.flushBackground();
      expect(res.body.items, kind).toHaveLength(1);
      expect(res.body.items[0]?.item.surface, kind).toBeNull();
    }
  });
});
