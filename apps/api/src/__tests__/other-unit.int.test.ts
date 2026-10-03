// An answer in another unit of the same quantity (issue #227, short finding A6): "1,4 m" for a
// key of 150 cm is certainly another length, "1,5 m" the same one. Both used to reach the tutor
// as "not decidable by rules", and on that it may say anything. Code converts exactly
// (`shared-math/src/units.ts`) and decides the different amount itself; for the same amount it
// tells the tutor the VALUE is right and leaves only whether the unit was the question (D-3).
//
// The proof is the one decided-by-value.int.test.ts uses: nothing is scripted for the tutor where
// code decides, and the harness fails loudly on an unscripted model call.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const numeric = (prompt: string, answer: string, unit: string) => ({
  kind: 'numeric',
  prompt,
  answer,
  accepted_answers: [],
  unit,
  choices: null,
  correct_choice: null,
  topic: 'Größen',
  difficulty: 2,
  prompt_lang: 'de',
  lang: null,
  figure: null,
  source_excerpt: null,
});

const answer = (l: Learner, s: SessionView, itemId: string, text: string) =>
  l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
    client_turn_id: randomUUID(),
    item_id: itemId,
    text,
  });

async function startTest(l: Learner, env: TestEnv): Promise<SessionView> {
  env.llm.script('explain', {
    json: {
      usable: true,
      title: 'Größen – Probetest',
      subject: { name: 'Mathe', kind: 'math' },
      items: [
        numeric('Wie lang ist das Brett?', '150', 'cm'),
        numeric('Wie lange dauert der Film?', '1.5', 'h'),
        numeric('Wie schwer ist das Paket?', '2.5', 'kg'),
        numeric('Wie lang ist der Weg?', '5', 'min'),
      ],
    },
  });
  return (
    await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'test',
      text: 'Größen',
    })
  ).body;
}

describe.skipIf(!dbReady)('an answer in another unit (#227 A6)', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-03T09:00:00Z' });
    l = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2012-02-10',
      pin: '4826',
    });
  });
  afterEach(() => env.closeChecked());

  it('calls a different amount wrong after converting, with no tutor call', async () => {
    const s = await startTest(l, env);
    const [board, film, parcel] = s.items.map((i) => i.item.id) as [string, string, string];

    expect((await answer(l, s, board, '1,4 m')).body.verdict).toBe('incorrect');
    expect((await answer(l, s, film, '80 min')).body.verdict).toBe('incorrect');
    expect((await answer(l, s, parcel, '2050 g')).body.verdict).toBe('incorrect');

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
    ]);
  });

  it('tells the tutor the value is right in another unit, and holds it to that', async () => {
    const s = await startTest(l, env);
    const [board, , , walk] = s.items.map((i) => i.item.id) as [string, string, string, string];

    // Same length, other unit: the tutor decides whether "in cm" was the question — and may
    // not call it wrong for the value. It tries; code keeps it from doing so.
    env.llm.script('tutor', (req) => {
      expect(ScriptedGateway.textOf(req)).toContain('RULE CHECK: the VALUE is right');
      return {
        intent: 'answer',
        verdict: 'incorrect',
        reply: 'Leider falsch.',
        gave_hint: false,
        revealed_answer: false,
      };
    });
    const same = await answer(l, s, board, '1,5 m');
    expect(same.status).toBe(200);
    expect(same.body.verdict).toBe('partially_correct');

    // Another quantity ("m" is no time) is not converted: the tutor still gets "not decidable".
    env.llm.script('tutor', (req) => {
      expect(ScriptedGateway.textOf(req)).not.toContain('the VALUE is right');
      return {
        intent: 'answer',
        verdict: 'incorrect',
        reply: 'Das ist eine Länge, keine Zeit.',
        gave_hint: false,
        revealed_answer: false,
      };
    });
    expect((await answer(l, s, walk, '5 m')).body.verdict).toBe('incorrect');
    expect(env.llm.callsFor('tutor')).toHaveLength(2);
  });
});
