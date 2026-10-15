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

import { TUTOR_PROMPT_VERSION, TUTOR_TURNS } from '../modules/practice/answerTutor.js';
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

  it('writes down where a learned answer came from, as provisional (#675)', async () => {
    const s = await start(env, l, 'practice');
    const id = s.items[0]!.item.id;
    env.llm.script('tutor', tutorSays('correct'));
    await answer(l, s, id, 'the student');
    const row = await env.db.one<{ status: string; prompt_version: string; judged: string }>(
      `select la.status, la.prompt_version, t.text as judged
         from learned_answers la join practice_turns t on t.id = la.turn_id
        where la.item_id = $1 and la.answer = 'the student'`,
      [id],
    );
    expect(row).toEqual({
      status: 'provisional',
      prompt_version: TUTOR_PROMPT_VERSION,
      judged: 'the student',
    });
  });

  it('takes a learned answer back out of the key when she disputes the judgement (#675)', async () => {
    const s = await start(env, l, 'practice');
    const id = s.items[0]!.item.id;
    env.llm.script('tutor', tutorSays('correct'));
    await answer(l, s, id, 'the student');
    const res = await l.api.post(`/practice/sessions/${s.id}/items/${id}/dispute`, {});
    expect(res.status).toBe(200);
    expect((await acceptedOf(env, id)).accepted_answers).not.toContain('the student');
    const row = await env.db.one<{ status: string; retracted: boolean }>(
      `select status, retracted_at is not null as retracted from learned_answers where item_id = $1`,
      [id],
    );
    expect(row).toEqual({ status: 'retracted', retracted: true });
  });

  it('takes back only her own learnt answers: another learner’s key and rows stay (#675)', async () => {
    // Lena and Mia each have a question whose key learnt "the student" from the tutor.
    const mia = await onboard(env, {
      relation: 'child',
      name: 'Mia',
      birthDate: '2013-05-01',
      pin: '1357',
    });
    const sLena = await start(env, l, 'practice');
    const lenaItem = sLena.items[0]!.item.id;
    env.llm.script('tutor', tutorSays('correct'));
    await answer(l, sLena, lenaItem, 'the student');
    const sMia = await start(env, mia, 'practice');
    const miaItem = sMia.items[0]!.item.id;
    env.llm.script('tutor', tutorSays('correct'));
    await answer(mia, sMia, miaItem, 'the student');

    // Lena cannot dispute Mia's question, not even through her own session.
    const foreign = await l.api.post(`/practice/sessions/${sLena.id}/items/${miaItem}/dispute`, {});
    expect(foreign.status).toBe(404);
    expect((foreign.body as { error?: { code?: string } }).error?.code).toBe('not_found');
    const viaHers = await l.api.post(`/practice/sessions/${sMia.id}/items/${miaItem}/dispute`, {});
    expect(viaHers.status).toBe(404);

    // Her own dispute takes back only her question's answer.
    expect(
      (await l.api.post(`/practice/sessions/${sLena.id}/items/${lenaItem}/dispute`, {})).status,
    ).toBe(200);
    const rows = await env.db.query<{ item_id: string; status: string }>(
      `select item_id, status from learned_answers where item_id = any($1::uuid[]) order by status`,
      [[lenaItem, miaItem]],
    );
    expect(rows).toEqual([
      { item_id: miaItem, status: 'provisional' },
      { item_id: lenaItem, status: 'retracted' },
    ]);
    expect((await acceptedOf(env, miaItem)).accepted_answers).toContain('the student');
    expect((await acceptedOf(env, lenaItem)).accepted_answers).not.toContain('the student');
  });

  it('reads back only the latest turns of a long exchange about one question (#674)', async () => {
    const s = await start(env, l, 'practice');
    const id = s.items[0]!.item.id;
    const asks = {
      json: {
        intent: 'question',
        verdict: 'not_an_attempt',
        reply: 'Denk an die Schule.',
        gave_hint: false,
        revealed_answer: false,
      },
    };
    for (let n = 0; n < TUTOR_TURNS; n++) {
      env.llm.script('tutor', asks);
      expect((await answer(l, s, id, `Frage ${n} dazu?`)).status).toBe(200);
    }
    env.llm.script('tutor', asks);
    await answer(l, s, id, 'Noch eine Frage?');
    const last = env.llm.callsFor('tutor').at(-1)!;
    // Its context, the latest turns, her new words — never all of them.
    expect(last.contents.length).toBeLessThanOrEqual(TUTOR_TURNS + 2);
    expect(JSON.stringify(last.contents)).not.toContain('Frage 0 dazu?');
    expect(JSON.stringify(last.contents)).toContain(`Frage ${TUTOR_TURNS - 1} dazu?`);
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

  it('never learns the key of another question beside it', async () => {
    // "the teacher" judged right for "der Schüler" would make the two questions
    // interchangeable from then on — a model mistake turned into a rule (issue #227, finding 3).
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Schule',
        subject: null,
        items: [vocab(), vocab({ prompt: 'der Lehrer', answer: 'the teacher' })],
      },
    });
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Schule',
    });
    await env.flushBackground();
    const s = (await l.api.get<SessionView>(`/practice/sessions/${res.body.id}`)).body;
    const pupil = s.items.find((i) => i.item.prompt === 'der Schüler')!.item.id;

    env.llm.script('tutor', tutorSays('correct'));
    expect((await answer(l, s, pupil, 'The Teacher')).body.verdict).toBe('correct');
    expect((await acceptedOf(env, pupil)).accepted_answers).toEqual([]);
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
