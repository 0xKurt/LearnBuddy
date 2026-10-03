// A practice run that starts before all its questions are written (issue #220).
//
// Measured 02.10.: "üben wir Brüche" is 6,45 s at the endpoint, of which the model call is 6,42 s
// for 1 432 written tokens and 0 thought tokens — she waits six seconds for a question that stood
// there after two. So the run starts on the first three questions of the SAME answer and grows
// when the rest arrives (`llm/partial.ts`).
//
// That makes a run that holds fewer questions than it will hold, and this file pins what must
// then be true — the three traps the issue names, in the order it names them:
//   1. "nothing open" is not "over" while the rest is coming: she answers all three before it
//      lands, and the run is still hers (not finished, no result, Buddy's step without evidence).
//   2. no question count that still changes: `preparing` says so, and it goes false by itself even
//      when the rest never arrives.
//   3. no duplicates and the order she was promised: the rest goes behind the first three.
// docs/architecture.md §Practice.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FIRST_BATCH, REST_WINDOW_MS } from '../modules/practice/generate.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const QUESTIONS = 9;

const draft = (n: number) => ({
  kind: 'short',
  prompt: `Frage ${n}`,
  answer: `Antwort ${n}`,
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

const SET = {
  usable: true,
  title: 'Brüche',
  subject: { name: 'Mathe', kind: 'math' },
  items: Array.from({ length: QUESTIONS }, (_, i) => draft(i + 1)),
  bars: [],
};

/**
 * A hand on the stream: it stops after the first questions until `release()` is called. Every one
 * handed out is released when the test ends, whatever happened — a stream still waiting would hold
 * the background task the environment drains on close, and the failure would be a timeout instead
 * of the assertion that actually broke.
 */
const holding: (() => void)[] = [];
function heldStream() {
  let release = () => undefined as void;
  const until = new Promise<void>((resolve) => {
    release = () => resolve();
  });
  holding.push(release);
  return { until, release };
}

async function start(l: Learner) {
  return l.api.post<SessionView>('/practice/topic', {
    client_request_id: randomUUID(),
    kind: 'practice',
    text: 'Üben wir Brüche',
  });
}

const answer = (l: Learner, sessionId: string, itemId: string, text: string) =>
  l.api.post<AnswerResponse>(`/practice/sessions/${sessionId}/answer`, {
    client_turn_id: randomUUID(),
    item_id: itemId,
    text,
  });

describe.skipIf(!dbReady)('a run that starts before its questions are all written (#220)', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    // The ladder for the new questions is written in the background and is not what this tests.
    env.llm.byDefault('hints', { json: { items: [] } });
  });
  afterEach(async () => {
    while (holding.length > 0) holding.pop()?.();
    await env.closeChecked();
  });

  it('starts on the first questions, says more is coming, and grows without repeating itself', async () => {
    const held = heldStream();
    env.llm.script('explain', {
      json: SET,
      pauseAfter: { key: 'items', n: FIRST_BATCH, until: held.until },
    });

    const started = await start(l);
    expect(started.status).toBe(201);
    // She has something to do after the first questions, not after all nine.
    expect(started.body.items.map((i) => i.item.prompt)).toEqual(['Frage 1', 'Frage 2', 'Frage 3']);
    // And the run says the number is not final, so nothing shows "Frage 1 von 3" (trap 2).
    expect(started.body.preparing).toBe(true);
    expect(started.body.current_item_id).toBe(started.body.items[0]!.item.id);

    held.release();
    await env.flushBackground();

    const grown = await l.api.get<SessionView>(`/practice/sessions/${started.body.id}`);
    expect(grown.status).toBe(200);
    // The whole set, each question once, in the order it was written (trap 3).
    expect(grown.body.items.map((i) => i.item.prompt)).toEqual(
      Array.from({ length: QUESTIONS }, (_, i) => `Frage ${i + 1}`),
    );
    // Now the count is true, so it may be shown.
    expect(grown.body.preparing).toBe(false);
    expect(grown.body.status).toBe('active');
    // One model call, not two: the rest is the same answer, so it cannot repeat itself.
    expect(env.llm.callsFor('explain')).toHaveLength(1);
  });

  it('does not end the run when she answers the first questions before the rest lands', async () => {
    const held = heldStream();
    env.llm.script('explain', {
      json: SET,
      pauseAfter: { key: 'items', n: FIRST_BATCH, until: held.until },
    });
    const started = await start(l);
    const sessionId = started.body.id;
    expect(started.body.items).toHaveLength(FIRST_BATCH);

    // The race the issue names (trap 1): all three answered while the rest is still being written.
    for (const [n, item] of started.body.items.entries()) {
      const res = await answer(l, sessionId, item.item.id, `Antwort ${n + 1}`);
      expect(res.status).toBe(200);
      // Not even the last answer ends the run, although nothing is open any more.
      expect(res.body.session.status).toBe('active');
      expect(res.body.session.summary).toBeNull();
    }

    // And the screen's own "there is nothing open, we must be done" call is a pause, not a result.
    const tooEarly = await l.api.post<SessionView>(`/practice/sessions/${sessionId}/finish`);
    expect(tooEarly.status).toBe(200);
    expect(tooEarly.body.status).toBe('active');
    expect(tooEarly.body.summary).toBeNull();
    expect(tooEarly.body.preparing).toBe(true);
    // Nothing was handed on as a finished run either.
    expect(
      await env.db.query(`select 1 from buddy_events where type = 'session_finished'`),
    ).toEqual([]);

    held.release();
    await env.flushBackground();

    // The rest arrived, behind the three she already did, and it is hers to work on.
    const grown = await l.api.get<SessionView>(`/practice/sessions/${sessionId}`);
    expect(grown.body.items).toHaveLength(QUESTIONS);
    expect(grown.body.items.slice(0, FIRST_BATCH).map((i) => i.status)).toEqual([
      'correct',
      'correct',
      'correct',
    ]);
    expect(grown.body.items.slice(FIRST_BATCH).every((i) => i.status === 'open')).toBe(true);
    expect(grown.body.preparing).toBe(false);
    expect(grown.body.current_item_id).toBe(grown.body.items[FIRST_BATCH]!.item.id);

    // Only now, with every question answered, does the run end — with all nine in its result.
    for (const item of grown.body.items.slice(FIRST_BATCH)) {
      await answer(l, sessionId, item.item.id, item.item.prompt.replace('Frage', 'Antwort'));
    }
    const done = await l.api.get<SessionView>(`/practice/sessions/${sessionId}`);
    expect(done.body.status).toBe('finished');
    expect(done.body.summary?.answered).toBe(QUESTIONS);
  });

  it('lets her finish with what she has when the rest never arrives', async () => {
    const held = heldStream();
    env.llm.script('explain', {
      json: SET,
      pauseAfter: { key: 'items', n: FIRST_BATCH, until: held.until },
    });
    const started = await start(l);
    const sessionId = started.body.id;

    // The window passes without the rest: the run is the questions it has, and she gets a result
    // for them rather than a run that can never end.
    env.clock.advance(REST_WINDOW_MS + 1_000);
    const waited = await l.api.get<SessionView>(`/practice/sessions/${sessionId}`);
    expect(waited.body.preparing).toBe(false);
    expect(waited.body.items).toHaveLength(FIRST_BATCH);

    for (const [n, item] of waited.body.items.entries()) {
      await answer(l, sessionId, item.item.id, `Antwort ${n + 1}`);
    }
    const done = await l.api.get<SessionView>(`/practice/sessions/${sessionId}`);
    expect(done.body.status).toBe('finished');
    expect(done.body.summary?.answered).toBe(FIRST_BATCH);

    // The questions still arrive, and they do NOT join a run that already has its result: they
    // stay in her library for the next time (they are her questions, just not of this run).
    held.release();
    await env.flushBackground();
    const after = await l.api.get<SessionView>(`/practice/sessions/${sessionId}`);
    expect(after.body.items).toHaveLength(FIRST_BATCH);
    expect(after.body.status).toBe('finished');
    expect(
      await env.db.query(`select id from items where learner_id = $1`, [l.learnerId]),
    ).toHaveLength(QUESTIONS);
  });

  it('waits for the whole answer when she asked for something harder', async () => {
    // `atLevel` decides against the WHOLE set: judged on the first three it would hand her the
    // easy ones she just said were too easy, so this run does not start early at all.
    env.llm.script('explain', {
      json: {
        ...SET,
        items: [
          { ...draft(1), difficulty: 1 },
          { ...draft(2), difficulty: 2 },
          { ...draft(3), difficulty: 3 },
          { ...draft(4), difficulty: 4 },
          { ...draft(5), difficulty: 5 },
        ],
      },
    });
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Üben wir Brüche',
      difficulty: 'harder',
    });
    expect(res.status).toBe(201);
    expect(res.body.preparing).toBe(false);
    expect(res.body.items.map((i) => i.item.prompt)).toEqual(['Frage 3', 'Frage 4', 'Frage 5']);
    await env.flushBackground();
  });

  it('leaves a test, a typed list and homework exactly as they were', async () => {
    // Only practice grows. A test that grew while she sat it would not be a test.
    env.llm.script('explain', { json: { ...SET, title: 'Probe' } });
    const test = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'test',
      text: 'Teste mich zu Brüchen',
    });
    expect(test.status).toBe(201);
    expect(test.body.preparing).toBe(false);
    expect(test.body.items).toHaveLength(QUESTIONS);
    await env.flushBackground();
  });
});
