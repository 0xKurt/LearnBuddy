// Answers code can decide although comparing the characters says nothing (issue #227,
// findings 5 and 8): algebra, a date, a year inside a sentence — and a clock time, where the
// NOTATION is decided, and another time only when it is wrong in every reading (#175).
//
// The proof that matters is the one #209 and #212 use: nothing is scripted for the tutor, and the
// harness fails loudly on an unscripted model call. A verdict that arrives with zero tutor calls
// was reached by code, and that is not something anyone has to take on trust. The session is a
// practice test, because there a rule-certain wrong answer needs no model for the reply either.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
  topic: 'Thema',
  difficulty: 2,
  prompt_lang: 'de',
  lang: null,
  figure: null,
  source_excerpt: null,
  ...over,
});

const answer = (l: Learner, s: SessionView, itemId: string, text: string) =>
  l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
    client_turn_id: randomUUID(),
    item_id: itemId,
    text,
  });

describe.skipIf(!dbReady)('what code decides by value, without a model', () => {
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
  afterEach(() => env.closeChecked());

  it('calls algebra, a date, a time and a wrong year in a sentence wrong, without a tutor', async () => {
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Gemischt – Probetest',
        subject: { name: 'Mathe', kind: 'math' },
        items: [
          item({
            kind: 'formula',
            prompt: 'Multipliziere aus: $2(x+3)$',
            answer: '2x + 6',
            topic: 'Terme',
          }),
          item({ prompt: 'Löse: $2x = 10$. Wie heißt x?', answer: 'x = 5', topic: 'Gleichungen' }),
          item({
            prompt: 'In welchem Jahr begann die Französische Revolution?',
            answer: '1789',
            topic: 'Revolution',
          }),
          item({
            prompt: 'Wann wurde die Bastille gestürmt (TT.MM.JJJJ)?',
            answer: '14.07.1789',
            topic: 'Revolution',
          }),
          item({ prompt: 'Wann beginnt der Film?', answer: '14:30', topic: 'Uhrzeit' }),
        ],
      },
    });
    const s = (
      await l.api.post<SessionView>('/practice/topic', {
        client_request_id: randomUUID(),
        kind: 'test',
        text: 'Gemischt',
      })
    ).body;
    const [term, equation, year, date, time] = s.items.map((i) => i.item.id) as [
      string,
      string,
      string,
      string,
      string,
    ];

    // Finding 5: a summand and a sign that differ are a different value at every probe point.
    expect((await answer(l, s, term, '2x + 5')).body.verdict).toBe('incorrect');
    expect((await answer(l, s, equation, '-5')).body.verdict).toBe('incorrect');
    // Finding 8: the year inside the sentence, and a date one day off.
    expect(
      (await answer(l, s, year, 'Die Französische Revolution begann 1788.')).body.verdict,
    ).toBe('incorrect');
    expect((await answer(l, s, date, '15.07.1789')).body.verdict).toBe('incorrect');
    // Another time, wrong as a time, a ratio and a division at once (#227, `clockTime`).
    expect((await answer(l, s, time, '14:50')).body.verdict).toBe('incorrect');

    expect(env.llm.callsFor('tutor')).toHaveLength(0);
    const stored = await env.db.query<{ verdict: string; evaluated_by: string }>(
      `select verdict, evaluated_by from practice_turns
        where session_id = $1 and role = 'learner' order by seq`,
      [s.id],
    );
    expect(stored).toEqual([
      { verdict: 'incorrect', evaluated_by: 'rule' },
      { verdict: 'incorrect', evaluated_by: 'rule' },
      { verdict: 'incorrect', evaluated_by: 'rule' },
      { verdict: 'incorrect', evaluated_by: 'rule' },
      { verdict: 'incorrect', evaluated_by: 'rule' },
    ]);
  });

  it('tells the tutor the value is right when only the notation differs', async () => {
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Zeiten – Probetest',
        subject: { name: 'Mathe', kind: 'math' },
        items: [
          item({ prompt: 'Wann beginnt der Film?', answer: '14:30', topic: 'Uhrzeit' }),
          item({
            prompt: 'Wann wurde die Bastille gestürmt (TT.MM.JJJJ)?',
            answer: '14.07.1789',
            topic: 'Revolution',
          }),
        ],
      },
    });
    const s = (
      await l.api.post<SessionView>('/practice/topic', {
        client_request_id: randomUUID(),
        kind: 'test',
        text: 'Zeiten',
      })
    ).body;
    const [time, date] = s.items.map((i) => i.item.id) as [string, string];

    // "14.30" is how German writes 14:30, and "14.7.1789" is the same date written shorter. The
    // tutor still decides whether the FORM was the question (D-3) — but it is told the value is
    // right and may no longer call it wrong for the value (issue #227, finding 1).
    for (const [itemId, text] of [
      [time, '14.30'],
      [date, '14.7.1789'],
    ] as Array<[string, string]>) {
      env.llm.script('tutor', (req) => {
        expect(ScriptedGateway.textOf(req)).toContain('RULE CHECK: the VALUE is right');
        expect(ScriptedGateway.textOf(req)).not.toContain('not decidable by rules');
        return {
          intent: 'answer',
          verdict: 'correct',
          reply: 'ok',
          gave_hint: false,
          revealed_answer: false,
        };
      });
      expect((await answer(l, s, itemId, text)).body.verdict).toBe('correct');
    }
    expect(env.llm.callsFor('tutor')).toHaveLength(2);
  });
});
