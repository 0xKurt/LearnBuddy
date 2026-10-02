// A sheet of reaction equations, judged without the model (issue #212).
//
// The acceptance criterion of the issue is the one thing a unit test cannot show: that a whole
// worksheet of equations is graded by COUNTING, with no model call at all. The harness fails
// loudly on an unscripted model call, so "no tutor was asked" is proven here by there being no
// script for one — not by an assertion someone has to trust.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const equation = (prompt: string, answer: string) => ({
  kind: 'formula',
  prompt,
  answer,
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Reaktionsgleichungen',
  difficulty: 3,
  prompt_lang: 'de',
  lang: null,
  figure: null,
  source_excerpt: null,
});

const SHEET = [
  equation(
    'Stelle die Reaktionsgleichung für die Verbrennung von Wasserstoff auf.',
    '2 H2 + O2 -> 2 H2O',
  ),
  equation('Gleiche aus: die Verbrennung von Methan.', 'CH4 + 2 O2 -> CO2 + 2 H2O'),
  equation('Gleiche aus: Eisen und Sauerstoff zu Eisen(III)-oxid.', '4 Fe + 3 O2 -> 2 Fe2O3'),
  equation('Gleiche aus: die Bildung von Ammoniak.', 'N2 + 3 H2 -> 2 NH3'),
  equation('Gleiche aus: Natrium und Chlor.', '2 Na + Cl2 -> 2 NaCl'),
];

async function start(env: TestEnv, l: Learner) {
  env.llm.script('explain', {
    json: { usable: true, title: 'Reaktionsgleichungen', subject: null, items: SHEET },
  });
  const res = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: randomUUID(),
    kind: 'practice',
    text: 'Reaktionsgleichungen',
  });
  expect(res.status).toBe(201);
  await env.flushBackground();
  return (await l.api.get<SessionView>(`/practice/sessions/${res.body.id}`)).body;
}

const answer = (l: Learner, s: SessionView, itemId: string, text: string) =>
  l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
    client_turn_id: randomUUID(),
    item_id: itemId,
    text,
  });

describe.skipIf(!dbReady)('reaction equations are counted, not guessed at', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T09:00:00Z' });
    l = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2012-02-10',
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

  it('grades a whole sheet without asking the model once', async () => {
    const s = await start(env, l);
    const ids = s.items.map((i) => i.item.id);
    expect(ids).toHaveLength(5);

    // Every one written in another order than the key, and every one right.
    const written = [
      'O2 + 2 H2 → 2 H2O',
      '2 O2 + CH4 → 2 H2O + CO2',
      '3 O2 + 4 Fe → 2 Fe2O3',
      '3 H2 + N2 → 2 NH3',
      'Cl2 + 2 Na → 2 NaCl',
    ];
    for (const [n, id] of ids.entries()) {
      const r = await answer(l, s, id, written[n]!);
      expect(r.body.verdict, `Aufgabe ${n + 1}`).toBe('correct');
    }
    // The proof: no tutor was scripted, and the harness fails on an unscripted call.
    expect(env.llm.callsFor('tutor')).toHaveLength(0);

    await l.api.post(`/practice/sessions/${s.id}/finish`, {});
    const done = (await l.api.get<SessionView>(`/practice/sessions/${s.id}`)).body;
    expect(done.summary?.first_try).toBe(5);
    expect(done.summary?.secure_topics).toEqual(['Reaktionsgleichungen']);
  });

  it('names the element that does not add up, and keeps the question open', async () => {
    const s = await start(env, l);
    const id = s.items[0]!.item.id;
    const r = await answer(l, s, id, '2 H2 + O2 → H2O');
    expect(r.body.verdict).toBe('partially_correct');
    // The place, not "falsch": four hydrogen on the left, two on the right.
    expect(r.body.reply.text).toBe('Fast – zähl das H nochmal: links 4, rechts 2.');
    expect(r.body.session.items[0]!.status).toBe('open');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);

    // Now right: the question closes, and it counts as needing help (not first try).
    const ok = await answer(l, s, id, '2 H2 + O2 → 2 H2O');
    expect(ok.body.verdict).toBe('correct');
    expect(ok.body.session.items[0]!.status).toBe('correct');
    // `first_try_correct` is deliberately not in the learner's view — it is a judgement about
    // her, not a control she needs. Checked where it is written instead.
    const si = await env.db.one<{ first_try_correct: boolean }>(
      `select first_try_correct from session_items where session_id = $1 and item_id = $2`,
      [s.id, id],
    );
    expect(si.first_try_correct).toBe(false);
  });

  it('says "right, now reduce" instead of calling a balanced equation wrong', async () => {
    const s = await start(env, l);
    const id = s.items[0]!.item.id;
    const r = await answer(l, s, id, '4 H2 + 2 O2 → 4 H2O');
    expect(r.body.verdict).toBe('partially_correct');
    expect(r.body.reply.text).toBe(
      'Richtig ausgeglichen! Jetzt noch kürzen – alle Zahlen davor lassen sich durch 2 teilen.',
    );
    expect(r.body.session.items[0]!.status).toBe('open');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('hands a different reaction to the model instead of counting it wrong', async () => {
    const s = await start(env, l);
    const id = s.items[0]!.item.id;
    // Different substances: that is a question about chemistry, and code does not answer it.
    env.llm.script('tutor', {
      json: {
        intent: 'answer',
        verdict: 'incorrect',
        reply: 'Das ist die Verbrennung von Kohlenstoff – gefragt war Wasserstoff.',
        gave_hint: false,
        revealed_answer: false,
      },
    });
    const r = await answer(l, s, id, 'C + O2 → CO2');
    expect(r.body.verdict).toBe('incorrect');
    expect(env.llm.callsFor('tutor')).toHaveLength(1);
  });
});
