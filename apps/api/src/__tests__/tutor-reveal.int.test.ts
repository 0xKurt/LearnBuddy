// The tutor's reply decides what she saw, not its own flag (F9-b, KI-Audit 14.10., issue #661).
// `mentionsSolution` — exact code that already filters every prepared hint — ran on tutor replies
// only in homework. In practice the model's `revealed_answer` counted: a reply that named the
// key without setting it left the question open, she typed the key off the screen, and the
// question counted as right with help. Now a reply she reads that states the solution has
// revealed it; her own right answer, confirmed, has not. docs/architecture.md §Practice.
// requires live verification in Claude Code session (needs a running Postgres; scripted model)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const ITEM = {
  kind: 'numeric',
  prompt: 'Berechne $\\frac{1}{2} + \\frac{1}{4}$.',
  answer: '0.75',
  accepted_answers: ['3/4'],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Brüche',
  difficulty: 2,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
};

const HINTS = ['Gefragt ist eine Summe.', 'Bring beide auf denselben Nenner.'];

const tutorSays = (reply: string, verdict: string, revealed = false) => ({
  json: { intent: 'answer', verdict, reply, gave_hint: false, revealed_answer: revealed },
});

describe.skipIf(!dbReady)('a tutor reply that names the solution (#661)', () => {
  let env: TestEnv;
  let l: Learner;
  let s: SessionView;
  let id: string;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T14:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    env.llm.script('explain', {
      json: { usable: true, title: 'Brüche', subject: null, items: [ITEM] },
    });
    env.llm.script('hints', {
      json: { items: [{ n: 1, hints: HINTS, worked_solution: '1/2 ist 2/4; 2/4 + 1/4 = 3/4.' }] },
    });
    const started = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Brüche',
    });
    await env.flushBackground();
    s = started.body;
    id = s.items[0]!.item.id;
    // A first miss (the rules answer it) and both hints: the ladder no longer holds the solution.
    await answer('2/6');
    for (let i = 0; i < 2; i++)
      await l.api.post(`/practice/sessions/${s.id}/hint`, {
        client_turn_id: randomUUID(),
        item_id: id,
      });
  });
  afterEach(() => env.closeChecked());

  const answer = (text: string) =>
    l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: id,
      text,
    });

  it('marks it revealed, so typing the key off the screen is not "right with help"', async () => {
    env.llm.script(
      'tutor',
      tutorSays('Fast! Richtig ist 3/4: erst erweitern, dann addieren.', 'incorrect'),
    );
    const second = await answer('0,5');
    expect(second.body.reply.text).toContain('3/4');
    expect(second.body.session.items[0]).toMatchObject({ status: 'revealed' });
  });

  it('leaves her own right answer, confirmed with its value, a right answer', async () => {
    env.llm.script('tutor', tutorSays('Genau, 3/4!', 'correct'));
    const right = await answer('drei Viertel');
    expect(right.body.session.items[0]!.status).not.toBe('revealed');
  });
});
