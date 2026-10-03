// The one place where a MODEL judgement becomes a RULE, and then outlives everything
// (issue #227, finding 3).
//
// An answer the rules did not know, that the model judged right, is stored as an accepted
// answer and is accepted WITHOUT a model from then on. That is useful — and it had no ceiling
// and happened in a mock test too, where the model judges with less context, its reply is
// thrown away and replaced by a neutral word, and nobody reads what it decided. One mistake
// there became permanent truth about that question.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MAX_ACCEPTED } from '../modules/practice/items.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const vocab = (over: Record<string, unknown> = {}) => ({
  kind: 'vocab',
  prompt: 'der Schüler',
  answer: 'the pupil',
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Schule',
  difficulty: 2,
  prompt_lang: 'de',
  lang: 'en',
  figure: null,
  source_excerpt: null,
  ...over,
});

const tutorSays = (verdict: string) => ({
  json: {
    intent: 'answer',
    verdict,
    reply: 'Alles klar.',
    gave_hint: false,
    revealed_answer: false,
  },
});

async function start(env: TestEnv, l: Learner, kind: 'practice' | 'test') {
  env.llm.script('explain', {
    json: { usable: true, title: 'Schule', subject: null, items: [vocab()] },
  });
  const res = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: randomUUID(),
    kind,
    text: 'Schule',
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

const acceptedOf = (env: TestEnv, id: string) =>
  env.db.one<{ accepted_answers: string[] }>(`select accepted_answers from items where id = $1`, [
    id,
  ]);

describe.skipIf(!dbReady)('what the key may learn from the model', () => {
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

  it('learns a synonym the model accepted while practising', async () => {
    const s = await start(env, l, 'practice');
    const id = s.items[0]!.item.id;
    env.llm.script('tutor', tutorSays('correct'));
    expect((await answer(l, s, id, 'the student')).body.verdict).toBe('correct');
    expect((await acceptedOf(env, id)).accepted_answers).toContain('the student');
  });

  it('learns NOTHING in a mock test, however sure the model sounds', async () => {
    // There the model judges with less context, its reply is replaced by a neutral word, and
    // nobody reads what it decided — the worst moment to make a judgement permanent.
    const s = await start(env, l, 'test');
    const id = s.items[0]!.item.id;
    env.llm.script('tutor', tutorSays('correct'));
    const r = await answer(l, s, id, 'the student');
    expect(r.body.verdict).toBe('correct');
    expect((await acceptedOf(env, id)).accepted_answers).toEqual([]);
  });

  it('stops at the ceiling instead of accepting everything', async () => {
    // A key that keeps widening eventually accepts a wrong answer too. The ceiling is the same
    // number the reading prompts name. It cannot be reached inside one session — the question
    // closes on the first right answer — so the full list is seeded and the next one is offered.
    const s = await start(env, l, 'practice');
    const id = s.items[0]!.item.id;
    const full = Array.from({ length: MAX_ACCEPTED }, (_, n) => `Fassung ${n}`);
    await env.db.query(`update items set accepted_answers = $2 where id = $1`, [id, full]);

    env.llm.script('tutor', tutorSays('correct'));
    expect((await answer(l, s, id, 'eine weitere Fassung')).body.verdict).toBe('correct');

    const key = await acceptedOf(env, id);
    expect(key.accepted_answers).toHaveLength(MAX_ACCEPTED);
    expect(key.accepted_answers).not.toContain('eine weitere Fassung');
    // And nothing that was already there was pushed out to make room.
    expect(key.accepted_answers).toEqual(full);
  });

  it('still learns while there is room', async () => {
    const s = await start(env, l, 'practice');
    const id = s.items[0]!.item.id;
    const almost = Array.from({ length: MAX_ACCEPTED - 1 }, (_, n) => `Fassung ${n}`);
    await env.db.query(`update items set accepted_answers = $2 where id = $1`, [id, almost]);

    env.llm.script('tutor', tutorSays('correct'));
    await answer(l, s, id, 'die letzte Fassung');

    const key = await acceptedOf(env, id);
    expect(key.accepted_answers).toHaveLength(MAX_ACCEPTED);
    expect(key.accepted_answers).toContain('die letzte Fassung');
  });
});
