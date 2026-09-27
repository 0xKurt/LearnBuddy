// "Anders erklären" (gaps.md #3, docs/architecture.md §Practice): a new explanation after
// the session's explanation or a closed question's solution, written by the model the way
// she tapped (simpler / with an example / why), stored as turns, idempotent, and never where
// it would give something away: not in a running test, not before a question is closed,
// in homework only for a task she solved herself — and never with an open task's answer.
// requires live verification in Claude Code session (needs a running Postgres; scripted model)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LlmError } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
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
  topic: 'Brüche',
  difficulty: 2,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
  ...over,
});

const INTRO =
  'Ein Bruch hat einen Zähler und einen Nenner. Der Nenner sagt, in wie viele Teile geteilt wird.';

async function start(
  env: TestEnv,
  l: Learner,
  items: Record<string, unknown>[],
  kind: 'explain' | 'practice' | 'help' | 'test' = 'practice',
  intro: string | null = null,
  /** What she typed (homework: the tasks themselves). */
  text = 'Brüche',
): Promise<SessionView> {
  env.llm.script('explain', {
    json: { usable: true, title: 'Brüche', subject: null, intro, items },
  });
  const res = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: randomUUID(),
    kind,
    text,
  });
  expect(res.status).toBe(201);
  await env.flushBackground();
  return (await l.api.get<SessionView>(`/practice/sessions/${res.body.id}`)).body;
}

const reexplain = (
  l: Learner,
  s: SessionView,
  itemId: string | null,
  way: 'simpler' | 'example' | 'why',
  clientTurnId = randomUUID(),
) =>
  l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/reexplain`, {
    client_turn_id: clientTurnId,
    item_id: itemId,
    way,
  });

const answer = (l: Learner, s: SessionView, itemId: string, text: string) =>
  l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
    client_turn_id: randomUUID(),
    item_id: itemId,
    text,
  });

describe.skipIf(!dbReady)('explain again ("Anders erklären")', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T14:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
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

  it('explains the session’s explanation again, the way she asked, once per tap', async () => {
    const s = await start(
      env,
      l,
      [item({ prompt: 'Was steht unten?', answer: 'Nenner' })],
      'explain',
      INTRO,
    );
    env.llm.script('reexplain', (req) => {
      const text = ScriptedGateway.textOf(req);
      // The way she tapped, what to explain, and what she already read (so it is new).
      expect(text).toContain('WAY: example');
      expect(text).toContain('THE EXPLANATION TO EXPLAIN AGAIN');
      expect(text).toContain('EARLIER EXPLANATIONS');
      expect(text).toContain(INTRO);
      return { explanation: 'Stell dir eine Pizza mit 4 Stücken vor: 4 ist der Nenner.' };
    });
    const tap = randomUUID();
    const r = await reexplain(l, s, null, 'example', tap);
    expect(r.status).toBe(200);
    expect(r.body.verdict).toBe('not_an_attempt');
    expect(r.body.reply).toMatchObject({
      role: 'tutor',
      item_id: null,
      reexplain: 'example',
      text: 'Stell dir eine Pizza mit 4 Stücken vor: 4 ist der Nenner.',
    });
    // Her request is in her words, the explanation after it; no question is touched.
    const turns = r.body.session.turns;
    expect(turns.map((x) => [x.role, x.item_id, x.text])).toEqual([
      ['learner', null, 'Mit Beispiel, bitte'],
      ['tutor', null, 'Stell dir eine Pizza mit 4 Stücken vor: 4 ist der Nenner.'],
    ]);
    expect(r.body.session.items[0]).toMatchObject({ status: 'open', attempts: 0, hints_used: 0 });

    // The same tap again (a retry after a lost answer): no second model call, the same turns.
    const again = await reexplain(l, s, null, 'example', tap);
    expect(again.status).toBe(200);
    expect(again.body.reply.id).toBe(r.body.reply.id);
    expect(env.llm.callsFor('reexplain')).toHaveLength(1);

    // A second, different tap sees the first new explanation as already read.
    env.llm.script('reexplain', (req) => {
      const text = ScriptedGateway.textOf(req);
      expect(text).toContain('WAY: simpler');
      expect(text).toContain('Pizza');
      return { explanation: 'Unten steht, in wie viele Stücke du teilst.' };
    });
    const simpler = await reexplain(l, s, null, 'simpler');
    expect(simpler.body.session.turns).toHaveLength(4);
  });

  it('explains a closed question’s solution — not an open one, not in a running test', async () => {
    const s = await start(env, l, [
      item({ prompt: 'Wie heißt die Zahl unter dem Bruchstrich?', answer: 'Nenner' }),
      item({ prompt: 'Wie heißt die Zahl über dem Bruchstrich?', answer: 'Zähler' }),
    ]);
    const [first, second] = s.items.map((i) => i.item.id);
    // Open: its solution is not out yet (the tutor and "Tipp" help there).
    const early = await reexplain(l, s, first!, 'why');
    expect(early.status).toBe(409);
    expect(early.body).toMatchObject({ error: { details: { reason: 'try_first' } } });

    await answer(l, s, first!, 'Nenner');
    env.llm.script('reexplain', (req) => {
      const text = ScriptedGateway.textOf(req);
      expect(text).toContain('WAY: why');
      expect(text).toContain(
        'THE QUESTION (topic Brüche): Wie heißt die Zahl unter dem Bruchstrich?',
      );
      expect(text).toContain('ITS SOLUTION: Nenner');
      return { explanation: 'Er heißt Nenner, weil er das Ganze „benennt“: in Viertel, Fünftel …' };
    });
    const r = await reexplain(l, s, first!, 'why');
    expect(r.status).toBe(200);
    expect(r.body.reply.item_id).toBe(first);
    // Nothing about her progress changes: the question stays solved, the other stays open.
    expect(r.body.session.items.map((i) => i.status)).toEqual(['correct', 'open']);
    expect(r.body.session.current_item_id).toBe(second);

    // The last question closes, the session finishes — its solution may still be explained.
    await answer(l, s, second!, 'Zähler');
    env.llm.script('reexplain', {
      json: { explanation: 'Oben zählst du, wie viele Teile es sind.' },
    });
    const last = await reexplain(l, s, second!, 'simpler');
    expect(last.status).toBe(200);
    expect(last.body.session.status).toBe('finished');

    // A running test gives no help at all until its results.
    const test = await start(
      env,
      l,
      [item({ prompt: 'Was ist ein Bruch?', answer: 'Ein Teil' })],
      'test',
    );
    const blocked = await reexplain(l, test, test.items[0]!.item.id, 'simpler');
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ error: { details: { reason: 'reexplain_not_allowed' } } });
    // No explanation of the session's own explanation where there is none.
    const none = await reexplain(l, test, null, 'simpler');
    expect(none.status).toBe(409);
  });

  it('homework: only a task she solved herself, never with another task’s answer', async () => {
    const s = await start(
      env,
      l,
      [
        item({ kind: 'numeric', prompt: 'Berechne 7 · 4.', answer: '28' }),
        item({ kind: 'numeric', prompt: 'Berechne 6 · 9.', answer: '54' }),
      ],
      'help',
      null,
      'Berechne 7 · 4. Berechne 6 · 9.',
    );
    const [solved, open] = s.items.map((i) => i.item.id);
    // Not solved yet: nothing to explain again (homework never shows the solution).
    const early = await reexplain(l, s, solved!, 'why');
    expect(early.status).toBe(409);
    await answer(l, s, solved!, '28');

    // The model uses the other task as its example: that answer must not appear. One repair.
    env.llm.script(
      'reexplain',
      (req) => {
        expect(ScriptedGateway.textOf(req)).toContain(
          'OPEN TASKS (never solve these):\n- Berechne 6 · 9.',
        );
        return { explanation: 'Mal heißt: so oft zusammenzählen. Genauso ist 6 · 9 = 54.' };
      },
      (req) => {
        expect(ScriptedGateway.textOf(req)).toContain('SYSTEM CHECK');
        return { explanation: 'Mal heißt: so oft zusammenzählen. 7 · 4 ist 7 + 7 + 7 + 7.' };
      },
    );
    const r = await reexplain(l, s, solved!, 'example');
    expect(r.status).toBe(200);
    expect(r.body.reply.text).toBe('Mal heißt: so oft zusammenzählen. 7 · 4 ist 7 + 7 + 7 + 7.');

    // It keeps giving it away: nothing is stored, she is told it did not work.
    env.llm.script(
      'reexplain',
      { json: { explanation: 'Zum Beispiel ist 6 · 9 = 54.' } },
      { json: { explanation: 'Sechs mal neun ergibt 54.' } },
    );
    const turns = r.body.session.turns.length;
    const leaked = await reexplain(l, s, solved!, 'example');
    expect(leaked.status).toBe(503);
    expect(leaked.body).toMatchObject({ error: { details: { reason: 'reexplain_unavailable' } } });
    const view = await l.api.get<SessionView>(`/practice/sessions/${s.id}`);
    expect(view.body.turns).toHaveLength(turns);

    // The open task itself: never.
    expect((await reexplain(l, s, open!, 'why')).status).toBe(409);
  });

  it('says so honestly when the model is out, stores nothing, and works on the next tap', async () => {
    const s = await start(
      env,
      l,
      [item({ prompt: 'Was steht unten?', answer: 'Nenner' })],
      'explain',
      INTRO,
    );
    env.llm.script('reexplain', { error: new LlmError('unavailable', 'down') });
    const down = await reexplain(l, s, null, 'simpler');
    expect(down.status).toBe(503);
    expect(down.body).toMatchObject({ error: { code: 'model_unavailable' } });
    expect((await l.api.get<SessionView>(`/practice/sessions/${s.id}`)).body.turns).toEqual([]);

    env.llm.script('reexplain', {
      json: { explanation: 'Unten steht, in wie viele Teile du teilst.' },
    });
    expect((await reexplain(l, s, null, 'simpler')).status).toBe(200);

    // Invalid model output is not shown either.
    env.llm.script('reexplain', { json: { explanation: '' } });
    expect((await reexplain(l, s, null, 'why')).status).toBe(503);
  });

  it('another learner’s session or question is not found', async () => {
    const s = await start(
      env,
      l,
      [item({ prompt: 'Was steht unten?', answer: 'Nenner' })],
      'explain',
      INTRO,
    );
    const other = await onboard(env, { relation: 'self' });
    const theirs = await reexplain(other, s, null, 'simpler');
    expect(theirs.status).toBe(404);
    // Her own session, but a question that is not in it.
    const mine = await start(env, l, [item({ prompt: 'Was steht oben?', answer: 'Zähler' })]);
    const foreign = await reexplain(l, mine, s.items[0]!.item.id, 'simpler');
    expect(foreign.status).toBe(404);
    // A way that is not one of the chips is refused before anything happens.
    const odd = await l.api.post(`/practice/sessions/${s.id}/reexplain`, {
      client_turn_id: randomUUID(),
      item_id: null,
      way: 'louder',
    });
    expect(odd.status).toBe(422);
  });
});
