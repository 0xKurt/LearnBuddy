// A typo used to be answered with the correct spelling at once (issue #207): "Fast – so
// schreibt man es: the pencil case." What followed was copying, and the "Richtig" after it
// claimed she had known the word. A missing accent was never treated that way — it got a
// hint and no solution, which is how it should be. Now a typo works the same: the first
// time she hears WHAT slipped, the spelling only from the second try, and then it is
// recorded as help given.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const vocab = (over: Record<string, unknown>) => ({
  kind: 'vocab',
  prompt: 'das Federmäppchen',
  answer: 'the pencil case',
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Schulsachen',
  difficulty: 2,
  prompt_lang: 'de',
  lang: 'en',
  figure: null,
  source_excerpt: null,
  ...over,
});

async function start(env: TestEnv, l: Learner, items: Record<string, unknown>[]) {
  env.llm.script('explain', {
    json: { usable: true, title: 'Vokabeln', subject: null, items },
  });
  const res = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: randomUUID(),
    kind: 'practice',
    text: 'Vokabeln',
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

describe.skipIf(!dbReady)('a typo gets a hint before it gets the spelling', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T09:00:00Z' });
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

  it('names what slipped first, spells it out second, and records the help', async () => {
    const s = await start(env, l, [vocab({})]);
    const id = s.items[0]!.item.id;

    // One letter short. No model is asked: the rules see it.
    const first = await answer(l, s, id, 'the pencil cae');
    expect(first.body.verdict).toBe('partially_correct');
    expect(first.body.reply.text).toBe('Fast – da fehlt ein Buchstabe. Schau nochmal genau hin.');
    // The word itself is NOT in the reply — that was the whole bug.
    expect(first.body.reply.text).not.toContain('pencil case');
    expect(first.body.session.items[0]).toMatchObject({
      status: 'open',
      attempts: 1,
      hints_used: 0,
    });

    // Second try, still a slip: now the spelling, and it counts as help.
    const second = await answer(l, s, id, 'the pencil casse');
    expect(second.body.reply.text).toContain('the pencil case');
    expect(second.body.session.items[0]).toMatchObject({ status: 'open', hints_used: 1 });

    // And what she types now is copying, so it must not read as "knew it by herself".
    const third = await answer(l, s, id, 'the pencil case');
    expect(third.body.verdict).toBe('correct');
    expect(third.body.session.items[0]!.status).toBe('correct');
    const st = await env.db.one<{ last_outcome: string }>(
      `select last_outcome from item_states where item_id = $1`,
      [id],
    );
    expect(st.last_outcome).toBe('with_help');

    await l.api.post(`/practice/sessions/${s.id}/finish`, {});
    const done = (await l.api.get<SessionView>(`/practice/sessions/${s.id}`)).body;
    // One question is not a topic (#155), but it must not be called one that went well.
    expect(done.summary?.secure_topics).toEqual([]);
    expect(done.summary?.shaky_topics).toEqual(['Schulsachen']);
    expect(done.summary?.first_try).toBe(0);
  });

  it('tells her two letters are the wrong way round instead of sending her hunting', async () => {
    const s = await start(env, l, [
      vocab({ prompt: 'der Stundenplan', answer: 'the timetable', lang: 'en' }),
    ]);
    const id = s.items[0]!.item.id;
    const r = await answer(l, s, id, 'the timetbale');
    expect(r.body.reply.text).toBe('Fast – zwei Buchstaben stehen vertauscht. Findest du sie?');
    expect(r.body.reply.text).not.toContain('timetable');
  });

  it('talks about the accepted answer she nearly wrote, not the main one', async () => {
    const s = await start(env, l, [
      vocab({ answer: 'the pencil case', accepted_answers: ['the pencil box'] }),
    ]);
    const id = s.items[0]!.item.id;
    // "the pencil bo" is one letter short of the ACCEPTED answer, four letters from the main
    // one. A hint about the main answer would make no sense to her.
    const r = await answer(l, s, id, 'the pencil bo');
    expect(r.body.reply.text).toBe('Fast – da fehlt ein Buchstabe. Schau nochmal genau hin.');
    expect(r.body.reply.text).not.toContain('pencil');
  });

  it('leaves the accent near miss exactly as it was', async () => {
    const s = await start(env, l, [vocab({ prompt: 'die Pause', answer: 'la récré', lang: 'fr' })]);
    const id = s.items[0]!.item.id;
    const r = await answer(l, s, id, 'la recre');
    expect(r.body.verdict).toBe('partially_correct');
    expect(r.body.reply.text).toBe('Fast – schau nochmal auf die Akzente.');
    // It never gave the solution away, and still does not.
    expect(r.body.reply.text).not.toContain('récré');
    expect(r.body.session.items[0]!.hints_used).toBe(0);
  });
});
