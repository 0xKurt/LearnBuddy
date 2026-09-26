// The hint ladder (docs/architecture.md §Practice, docs/buddy/03-fahrplan.md §2):
// prepared hints handed out at once and never twice, the solution never before
// the second hint, and explained after the third wrong try — enforced by code,
// whatever the model writes.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const item = (over: Record<string, unknown>) => ({
  kind: 'short',
  prompt: 'Frage',
  answer: 'Antwort',
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Thema',
  difficulty: 2,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
  ...over,
});

const HINTS = [
  'Gefragt ist die Summe von zwei Brüchen.',
  'Bring beide Brüche auf denselben Nenner.',
  'Der gemeinsame Nenner ist 4: erweitere den ersten Bruch.',
];

async function start(
  env: TestEnv,
  l: Learner,
  items: Record<string, unknown>[],
  kind = 'practice',
) {
  env.llm.script('explain', {
    json: { usable: true, title: 'Brüche', subject: null, intro: null, items },
  });
  const res = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: randomUUID(),
    kind,
    text: 'Brüche',
  });
  expect(res.status).toBe(201);
  return res.body;
}

const answer = (l: Learner, s: SessionView, itemId: string, text: string) =>
  l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
    client_turn_id: randomUUID(),
    item_id: itemId,
    text,
  });

const hint = (l: Learner, s: SessionView, itemId: string, id = randomUUID()) =>
  l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/hint`, {
    client_turn_id: id,
    item_id: itemId,
  });

describe.skipIf(!dbReady)('hint ladder', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T14:00:00Z' });
    l = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2014-02-10',
      pin: '4826',
    });
  });
  afterEach(async () => {
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      unexpected: env.llm.unexpected.map((u) => u.purpose),
      pending: env.llm.pending(),
    };
    await env.close();
    expect(report).toEqual({ scriptErrors: [], unexpected: [], pending: 0 });
  });

  it('hands out prepared hints at once, never twice, and explains after the third miss', async () => {
    const s = await start(env, l, [
      item({
        kind: 'numeric',
        prompt: 'Berechne $\\frac{1}{2} + \\frac{1}{4}$.',
        answer: '0.75',
        accepted_answers: ['3/4'],
        hints: HINTS,
        worked_solution: '1/2 ist 2/4. 2/4 + 1/4 = 3/4.',
      }),
    ]);
    const id = s.items[0]!.item.id;
    expect(s.items[0]!.hints_left).toBe(3);
    const calls = env.llm.callsFor('tutor').length;

    const first = await answer(l, s, id, '2/6');
    expect(first.body.verdict).toBe('incorrect');
    expect(first.body.reply.text).toBe(HINTS[0]);

    // The "Tipp" button: the next one, at once — idempotent per client_turn_id.
    const turnId = randomUUID();
    const tapped = await hint(l, s, id, turnId);
    expect(tapped.status).toBe(200);
    expect(tapped.body.reply.text).toBe(HINTS[1]);
    // Asking for a hint is not an answer: nothing is graded.
    expect(tapped.body.verdict).toBe('not_an_attempt');
    expect((await hint(l, s, id, turnId)).body.reply.id).toBe(tapped.body.reply.id);
    expect(tapped.body.session.items[0]).toMatchObject({ hints_used: 2, hints_left: 1 });

    const second = await answer(l, s, id, '0,5');
    expect(second.body.reply.text).toBe(HINTS[2]);
    expect(env.llm.callsFor('tutor')).toHaveLength(calls); // no model so far

    // Third wrong try: the solution, explained — and the question comes back (FSRS).
    const third = await answer(l, s, id, '1');
    expect(third.body.reply.text).toContain('2/4 + 1/4 = 3/4');
    expect(third.body.session.items[0]).toMatchObject({ status: 'revealed', hints_left: 0 });
    // No hint for a closed question.
    expect((await hint(l, s, id)).status).toBe(409);
  });

  it('drops prepared hints that give the answer away', async () => {
    const s = await start(env, l, [
      item({
        prompt: 'Wie heißt die Zahl unter dem Bruchstrich?',
        answer: 'Nenner',
        hints: ['Sie steht unten.', 'Es ist der Nenner.'],
      }),
    ]);
    expect(s.items[0]!.hints_left).toBe(1);
  });

  it('never lets the model give the solution before the second hint', async () => {
    const s = await start(env, l, [
      item({
        kind: 'long',
        prompt: 'Warum bauten die Römer Straßen?',
        answer: 'Für schnelle Truppenbewegungen',
        hints: ['Denk an das Heer.', 'Wie kamen Soldaten schnell an die Grenze?'],
      }),
    ]);
    const id = s.items[0]!.item.id;
    env.llm.script('tutor', (req) => {
      // The model sees the ladder …
      expect(JSON.stringify(req.contents)).toContain('PREPARED HINTS');
      // … and gives the answer away anyway.
      return {
        intent: 'answer',
        verdict: 'incorrect',
        reply: 'Nicht ganz – die Antwort ist: für schnelle Truppenbewegungen.',
        gave_hint: true,
        revealed_answer: true,
      };
    });
    const r = await answer(l, s, id, 'weil sie schön sind');
    expect(r.body.reply.text).toBe('Denk an das Heer.');
    expect(r.body.session.items[0]).toMatchObject({ status: 'open', hints_used: 1 });
  });

  it('gives no hints in a test or for homework, and none for another learner', async () => {
    const test = await start(
      env,
      l,
      [item({ prompt: 'Kürze 2/4', answer: '1/2', hints: ['Teile oben und unten durch 2.'] })],
      'test',
    );
    expect(test.items[0]!.hints_left).toBe(0);
    expect((await hint(l, test, test.items[0]!.item.id)).status).toBe(409);

    const s = await start(env, l, [item({ prompt: 'Kürze 2/4', answer: '1/2', hints: HINTS })]);
    const other = await onboard(env, {
      relation: 'child',
      name: 'Mia',
      birthDate: '2014-05-01',
      pin: '1357',
    });
    expect((await hint(other, s, s.items[0]!.item.id)).status).toBe(404);
  });
});
