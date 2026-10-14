// An offer she never started is nothing to "go on with" (#599 correction, CLAUDE.md rule 5).
// Buddy prepares what he offers in the background (issue #48): the session row is there seconds
// after the offer, and the bar on top said "Weiterüben … noch 1 Aufgabe" / "Weitermachen" for a
// practice she had not opened. Only work in it makes it hers to resume.
// requires live verification in Claude Code session (needs a running Postgres)

import type {
  AnswerResponse,
  BuddyHome,
  SendMessageResponse,
  SessionView,
} from '@learnbuddy/shared-types/contracts';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const offer = (text: string) => ({
  json: {
    lookups: [],
    concern: false,
    actions: [{ tool: 'offer_learning', args: { kind: 'practice', text, goal: null } }],
    reply: 'Ich bereite dir eine Übung vor.',
    options: null,
    asks_permission: false,
  },
});

const item = (prompt: string, answer: string) => ({
  kind: 'short',
  prompt,
  answer,
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
});

const generated = (title: string) => ({
  json: {
    usable: true,
    title,
    subject: { name: 'Mathe', kind: 'math' },
    items: [item('Was ist 3/4 von 20?', '15'), item('Was ist 1/2 von 10?', '5')],
  },
});

describe.skipIf(!dbReady)('the bar on top after an offer', () => {
  let env: TestEnv;
  let l: Learner;
  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-10-13T08:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterAll(async () => {
    await env?.close();
  });

  const now = async () => (await l.api.get<BuddyHome>('/buddy')).body.now;

  it('does not offer to go on with a practice she never started — only once she worked in it', async () => {
    env.llm.script('buddy_turn', offer('Brüche üben'));
    env.llm.script('explain', generated('Brüche'));
    const sent = await l.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: randomUUID(),
      text: 'Ich will Brüche üben',
    });
    const action = sent.body.home.thread
      .flatMap((m) => m.actions)
      .find((a) => a.summary.tool === 'offer_learning');
    expect(action).toBeDefined();
    // The preparation has written the session under the offer's action id.
    await env.flushBackground();
    const prepared = await env.db.query<{ id: string }>(
      `select id from practice_sessions where learner_id = $1 and client_request_id = $2`,
      [l.learnerId, action!.id],
    );
    expect(prepared).toHaveLength(1);

    // She has not tapped it: there is nothing to resume.
    expect((await now())?.type).not.toBe('resume_practice');

    // She taps "Los geht's" and leaves without touching a question: still nothing to resume.
    const tapped = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: action!.id,
      kind: 'practice',
      text: 'Brüche üben',
    });
    expect(tapped.body.id).toBe(prepared[0]!.id);
    expect((await now())?.type).not.toBe('resume_practice');

    // She answers the first of two: now it is hers to go on with.
    const first = tapped.body.items[0]!;
    const answered = await l.api.post<AnswerResponse>(
      `/practice/sessions/${tapped.body.id}/answer`,
      { client_turn_id: randomUUID(), item_id: first.item.id, text: '15' },
    );
    expect(answered.status).toBe(200);
    expect(await now()).toMatchObject({
      type: 'resume_practice',
      session_id: tapped.body.id,
      remaining: 1,
    });
  });

  it('counts a hint she took as work in it: then there is something to go on with', async () => {
    const other = await onboard(env, { relation: 'child', name: 'Nele', birthDate: '2014-04-12' });
    env.llm.script('buddy_turn', offer('Prozent üben'));
    env.llm.script('explain', generated('Prozent'));
    const sent = await other.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: randomUUID(),
      text: 'Ich will Prozent üben',
    });
    const action = sent.body.home.thread
      .flatMap((m) => m.actions)
      .find((a) => a.summary.tool === 'offer_learning');
    await env.flushBackground();
    const tapped = await other.api.post<SessionView>('/practice/topic', {
      client_request_id: action!.id,
      kind: 'practice',
      text: 'Prozent üben',
    });
    const home = async () => (await other.api.get<BuddyHome>('/buddy')).body.now;
    expect((await home())?.type).not.toBe('resume_practice');
    // The row as practice/hint.ts leaves it after "Tipp" (written here directly: the hint's own
    // model call is not this test's subject): no attempt, the question still open.
    await env.db.query(
      `update session_items set hints_used = 1 where session_id = $1 and item_id = $2`,
      [tapped.body.id, tapped.body.items[0]!.item.id],
    );
    expect(await home()).toMatchObject({
      type: 'resume_practice',
      session_id: tapped.body.id,
    });
  });

  it('offers no session she only opened, however it began — and another learner works in his', async () => {
    // A practice she opened herself (the sheet, a photo of hers: no offer of Buddy's behind it)
    // and left before answering is nothing to go on with either (#599): the home said
    // "Weitermachen" for a practice from her photo she had only opened.
    const mia = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2014-03-11' });
    const ben = await onboard(env, { relation: 'child', name: 'Ben', birthDate: '2014-05-02' });
    const start = async (who: Learner, title: string) => {
      env.llm.script('explain', generated(title));
      const started = await who.api.post<SessionView>('/practice/topic', {
        client_request_id: randomUUID(),
        kind: 'practice',
        text: `${title} üben`,
      });
      expect(started.status === 200 || started.status === 201).toBe(true);
      await env.flushBackground();
      return started.body;
    };
    const nowOf = async (who: Learner) => (await who.api.get<BuddyHome>('/buddy')).body.now;
    const hers = await start(mia, 'Dreisatz');
    const his = await start(ben, 'Zinsen');
    expect((await nowOf(mia))?.type).not.toBe('resume_practice');
    expect((await nowOf(ben))?.type).not.toBe('resume_practice');

    // He answers in his: his is to go on with, hers stays untouched.
    const answered = await ben.api.post<AnswerResponse>(`/practice/sessions/${his.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: his.items[0]!.item.id,
      text: '15',
    });
    expect(answered.status).toBe(200);
    expect(await nowOf(ben)).toMatchObject({ type: 'resume_practice', session_id: his.id });
    expect((await nowOf(mia))?.type).not.toBe('resume_practice');

    // Once she answers in hers, it is hers to go on with.
    await mia.api.post<AnswerResponse>(`/practice/sessions/${hers.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: hers.items[0]!.item.id,
      text: '15',
    });
    expect(await nowOf(mia)).toMatchObject({ type: 'resume_practice', session_id: hers.id });
  });
});
