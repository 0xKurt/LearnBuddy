// A multiple choice about fractions, end to end (issue #521): "Welcher Bruch ist größer?" with
// the options written as "2/3" and "3/5" stood in her tiles and in her answer bubble with a
// slash. Code sets a fraction option as math before it is stored (`fractionChoice`), so the app
// gets "$\frac{2}{3}$" everywhere it shows the option: the tile, her answer, the solution of the
// closed question. Nothing about judging changes: a tap by its index, a spoken "2/3" by its value.
// docs/architecture.md §Practice.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const TWO = '$\\frac{2}{3}$';
const THREE = '$\\frac{3}{5}$';

const compare = (over: Record<string, unknown> = {}) => ({
  kind: 'multiple_choice',
  prompt: 'Welcher Bruch ist größer: 2/3 oder 3/5?',
  answer: '2/3',
  accepted_answers: [],
  unit: null,
  choices: ['2/3', '3/5'],
  correct_choice: 0,
  topic: 'Brüche vergleichen',
  difficulty: 2,
  prompt_lang: 'de',
  lang: null,
  figure: null,
  source_excerpt: null,
  hints: [],
  worked_solution: null,
  ...over,
});

describe.skipIf(!dbReady)('fractions as options', () => {
  let env: TestEnv;
  let l: Learner;

  async function prepare(items: unknown[]): Promise<SessionView> {
    env.llm.script('explain', () => ({
      usable: true,
      title: 'Brüche',
      subject: { name: 'Mathe', kind: 'math' },
      items,
    }));
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Brüche vergleichen',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();
    return res.body;
  }

  async function answer(
    session: SessionView,
    itemId: string,
    body: { choice: number } | { text: string },
    opts: { as?: Learner; turn?: string } = {},
  ) {
    return (opts.as ?? l).api.post<AnswerResponse>(`/practice/sessions/${session.id}/answer`, {
      client_turn_id: opts.turn ?? randomUUID(),
      item_id: itemId,
      ...body,
    });
  }

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-09T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  // A tap on an option is judged by code; a tutor call would mean it could not be.
  afterEach(() => env.closeChecked());

  it('stores the options as math and sends them set, with the question naming them', async () => {
    const session = await prepare([compare()]);
    const si = session.items[0]!;
    expect(si.item.choices).toEqual([TWO, THREE]);
    expect(si.item.prompt).toBe('Welcher Bruch ist größer: 2/3 oder 3/5?');
    const row = await env.db.one<{ choices: string[]; correct_choice: number }>(
      `select choices, correct_choice from items where id = $1`,
      [si.item.id],
    );
    expect(row).toEqual({ choices: [TWO, THREE], correct_choice: 0 });
  });

  it('keeps her tapped option as math, and sends the solution set once the question is closed', async () => {
    const session = await prepare([compare()]);
    const id = session.items[0]!.item.id;
    const wrong = await answer(session, id, { choice: 1 });
    expect(wrong.status, JSON.stringify(wrong.body)).toBe(200);
    expect(wrong.body.verdict).toBe('incorrect');
    expect(wrong.body.session.turns.find((t) => t.role === 'learner')?.text).toBe(THREE);
    // Two options, one wrong: nothing is left to try, the question closes with its solution.
    const closed = wrong.body.session.items[0]!;
    expect(closed.status).toBe('revealed');
    // The options still come with the closed question (the app keeps them on screen), and the
    // solution is one of them, word for word — so the app can mark that tile.
    expect(closed.item.choices).toEqual([TWO, THREE]);
    expect(closed.answer).toBe(TWO);
  });

  it('still takes a spoken or typed "2/3" as the first option, by its value', async () => {
    const session = await prepare([compare()]);
    const res = await answer(session, session.items[0]!.item.id, { text: '2/3' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.verdict).toBe('correct');
  });

  it('counts a repeated answer once', async () => {
    const session = await prepare([compare()]);
    const id = session.items[0]!.item.id;
    const turn = randomUUID();
    const first = await answer(session, id, { choice: 0 }, { turn });
    const again = await answer(session, id, { choice: 0 }, { turn });
    expect(again.status).toBe(first.status);
    expect(again.body.session.turns.filter((t) => t.role === 'learner')).toHaveLength(1);
  });

  it("never lets another learner answer it; another's id is 404", async () => {
    const session = await prepare([compare()]);
    const other = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2014-05-01' });
    const res = await answer(session, session.items[0]!.item.id, { choice: 0 }, { as: other });
    expect(res.status).toBe(404);
  });

  it('leaves word options with a slash and a calculation as written', async () => {
    const session = await prepare([
      compare({
        prompt: 'Welches Wortpaar verbindet zwei Hauptsätze?',
        answer: 'und/oder',
        choices: ['und/oder', 'weil/da'],
      }),
    ]);
    expect(session.items[0]!.item.choices).toEqual(['und/oder', 'weil/da']);
  });
});
