// Primary-school figures end to end (issue #254): a clock, two clocks for a span, coins and notes,
// a Zwanzigerfeld, base-ten blocks and clocks as options — what the model writes, what is stored,
// what the app gets back and what is graded, on a real Postgres.
//
// Model calls are scripted; every answer graded below is graded by code, so the harness's failure
// on an unscripted call proves no tutor was asked — except where a test scripts one on purpose.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';
import { PRIMARY_ITEMS } from '../testing/scenarios/primary.js';

const dbReady = await testDatabaseAvailable();

const base = PRIMARY_ITEMS[0]!;
const clock = (h: number, m: number) => ({ type: 'clock', c: [{ h, m }], h24: false, ask: 'time' });

/** Questions whose figure or key does not hold: none of them may reach the database. */
const BROKEN = [
  // The key is not the time the hands show.
  { ...base, prompt: 'Wie spät ist es jetzt?', answer: '8:45', figure: clock(7, 45) },
  // No clock has 25 hours: the figure does not parse, and the question goes with it.
  { ...base, prompt: 'Wie spät ist es dort?', answer: '1:00', figure: clock(25, 0) },
  // A time as a number question: "7:45" would be 7 ÷ 45.
  { ...base, kind: 'numeric', prompt: 'Welche Uhrzeit zeigt die Uhr?', answer: '7:45' },
  // There is no 3-cent coin.
  {
    ...base,
    kind: 'numeric',
    prompt: 'Wie viel Geld liegt hier?',
    answer: '0.03',
    unit: '€',
    figure: { type: 'money', p: [{ d: '3ct', n: 1 }], ask: 'sum' },
  },
  // An amount euro pieces cannot lay: 3,455 € is not what the coins make.
  {
    ...base,
    kind: 'numeric',
    prompt: 'Wie viel Geld ist in der Hand?',
    answer: '3.455',
    unit: '€',
    figure: {
      type: 'money',
      p: [
        { d: '2€', n: 1 },
        { d: '1€', n: 1 },
        { d: '20ct', n: 2 },
        { d: '5ct', n: 1 },
      ],
      ask: 'sum',
    },
  },
  // 15 + 6 dots in a field of 20.
  {
    ...base,
    kind: 'numeric',
    prompt: 'Wie viele Punkte sind gefärbt?',
    answer: '21',
    figure: { type: 'dot_field', field: 'twenty', n: [15, 6], ask: 'count' },
  },
  // An option's text is not what its clock shows (6:20 drawn, "6:15" written).
  {
    ...base,
    kind: 'multiple_choice',
    prompt: 'Welche Uhr zeigt Viertel nach sechs?',
    answer: '6:15',
    choices: ['6:15', '2:30'],
    correct_choice: 0,
    figure: null,
    choice_figures: [clock(6, 20), clock(2, 30)],
  },
];

async function start(env: TestEnv, l: Learner, items: unknown[]) {
  env.llm.script('explain', {
    json: { usable: true, title: 'Uhr und Geld', subject: null, items },
  });
  const res = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: randomUUID(),
    kind: 'practice',
    text: 'Uhr, Geld und Plättchen',
  });
  expect(res.status).toBe(201);
  await env.flushBackground();
  return (await l.api.get<SessionView>(`/practice/sessions/${res.body.id}`)).body;
}

const answer = (l: Learner, s: SessionView, itemId: string, body: Record<string, unknown>) =>
  l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
    client_turn_id: randomUUID(),
    item_id: itemId,
    ...body,
  });

describe.skipIf(!dbReady)('primary-school figures are checked, stored and graded by code', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T09:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2018-04-12' });
  });
  afterEach(() => env.closeChecked());

  it('stores only the questions whose figure and key hold', async () => {
    const s = await start(env, l, [...PRIMARY_ITEMS, ...BROKEN]);
    const prompts = s.items.map((i) => i.item.prompt);
    expect(prompts).toEqual(PRIMARY_ITEMS.map((i) => i.prompt));
    const stored = await env.db.query<{ prompt: string }>(
      `select prompt from items where learner_id = $1`,
      [l.learnerId],
    );
    expect(stored.map((r) => r.prompt).sort()).toEqual([...prompts].sort());
    expect(s.items[0]?.item.figure).toEqual(clock(7, 45));
    expect(s.items[5]?.item.choice_figures).toHaveLength(3);
  });

  it('grades a time, a span, an amount and a count without a model', async () => {
    const s = await start(env, l, PRIMARY_ITEMS);
    const [time, span, money, dots, blocks, choice] = s.items.map((i) => i.item.id) as string[];
    // 19:45 is the same position of the hands, and German writes 7.45 for 7:45.
    expect((await answer(l, s, time!, { text: '19:45' })).body.verdict).toBe('correct');
    expect((await answer(l, s, span!, { text: '45' })).body.verdict).toBe('correct');
    // The amount in cents is the same amount.
    expect((await answer(l, s, money!, { text: '845 ct' })).body.verdict).toBe('correct');
    expect((await answer(l, s, dots!, { text: '14' })).body.verdict).toBe('correct');
    expect((await answer(l, s, blocks!, { text: '234' })).body.verdict).toBe('correct');
    expect((await answer(l, s, choice!, { choice: 0 })).body.verdict).toBe('correct');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('a wrong time is wrong for code, a time in words goes to the tutor', async () => {
    const s = await start(env, l, PRIMARY_ITEMS);
    const time = s.items[0]!.item.id;
    // "8.45" is a time on this question, and certainly not the one the hands show — not a
    // ratio, and not "undecidable" (issue #175 is about a bare 14:30 WITHOUT a clock).
    expect((await answer(l, s, time, { text: '8.45' })).body.verdict).toBe('incorrect');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
    // Words are language: code has no word list for them (CLAUDE.md rule 3).
    env.llm.script('tutor', {
      json: {
        intent: 'answer',
        verdict: 'correct',
        reply: 'Genau, Viertel vor acht.',
        gave_hint: false,
        revealed_answer: false,
      },
    });
    expect((await answer(l, s, time, { text: 'Viertel vor acht' })).body.verdict).toBe('correct');
    expect(env.llm.callsFor('tutor')).toHaveLength(1);
  });

  it('another learner cannot read the session or answer its questions', async () => {
    const s = await start(env, l, PRIMARY_ITEMS);
    const other = await onboard(env, { relation: 'child', name: 'Pia', birthDate: '2017-03-03' });
    expect((await other.api.get(`/practice/sessions/${s.id}`)).status).toBe(404);
    expect((await answer(other, s, s.items[0]!.item.id, { text: '7:45' })).status).toBe(404);
  });
});
