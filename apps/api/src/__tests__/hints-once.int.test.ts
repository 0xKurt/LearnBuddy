// Hints are written once per question (F9-a, KI-Audit 14.10., issue #660). Measured in
// production: 2 of 2 runs wrote them twice from the same input — the route started `prepareHints`
// on every `POST /practice/topic`, also on the replay that only finds the run, and on the early
// path the call for the rest sent the first questions again while their own call still ran.
// Hints start on open (#868). Database claims keep the first batch, concurrent opens and
// streamed remainders disjoint; an unopened offer generates questions only.
// docs/architecture.md §Practice.
// requires live verification in Claude Code session (needs a running Postgres; scripted model)

import { randomUUID } from 'node:crypto';

import {
  ActionSummary,
  type AnswerResponse,
  type SessionView,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LlmError, type LlmRequest } from '../llm/gateway.js';
import { FIRST_BATCH } from '../modules/practice/generate.js';
import { prepareOffered } from '../modules/practice/prepare.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

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

const set = (n: number) => ({
  usable: true,
  title: 'Brüche',
  subject: { name: 'Mathe', kind: 'math' },
  items: Array.from({ length: n }, (_, i) => draft(i + 1)),
  bars: [],
});

/** The question numbers a hints request asks about, read from its prompt. */
const asked = (req: LlmRequest): string[] =>
  [...JSON.stringify(req.contents).matchAll(/QUESTION: (Frage \d+)/g)].map((m) => m[1]!);

/** A hints answer for every question it was asked about. */
const ladder = (req: LlmRequest) => ({
  items: asked(req).map((_, i) => ({
    n: i + 1,
    hints: ['Was ist gefragt?', 'Welche Regel passt?'],
    worked_solution: null,
  })),
});

const gates: (() => void)[] = [];
function gate() {
  let open = () => undefined as void;
  const until = new Promise<void>((resolve) => {
    open = () => resolve();
  });
  gates.push(open);
  return { until, open };
}

describe.skipIf(!dbReady)('hints once per question (#660)', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterEach(async () => {
    while (gates.length > 0) gates.pop()?.();
    await env.closeChecked();
  });

  it('a request sent twice at once, and once more later, writes the hints once', async () => {
    env.llm.script('explain', { json: set(2) });
    env.llm.byDefault('hints', (req: LlmRequest) => ladder(req));
    const body = {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Brüche',
      difficulty: 'easier',
    };
    const [a, b] = await Promise.all([
      l.api.post<SessionView>('/practice/topic', body),
      l.api.post<SessionView>('/practice/topic', body),
    ]);
    expect(a.body.id).toBe(b.body.id);
    await env.flushBackground();
    // Her lost reply, sent again.
    expect((await l.api.post<SessionView>('/practice/topic', body)).body.id).toBe(a.body.id);
    await env.flushBackground();
    expect(env.llm.callsFor('hints')).toHaveLength(1);
  });

  it('the rest of an early run gets hints of its own, never the first questions again', async () => {
    const held = gate();
    env.llm.script('explain', {
      json: set(6),
      pauseAfter: { key: 'items', n: FIRST_BATCH, until: held.until },
    });
    // The first questions' ladder is still being written when the rest arrives.
    const firstLadder = gate();
    env.llm.script('hints', async (req: LlmRequest) => {
      await firstLadder.until;
      return ladder(req);
    });
    env.llm.script('hints', (req: LlmRequest) => ladder(req));
    const started = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Brüche',
    });
    expect(started.status).toBe(201);
    held.open();
    // Let the rest land and its own hints call run, while the first one still waits.
    for (let i = 0; i < 20 && env.llm.callsFor('hints').length < 2; i++)
      await new Promise((r) => setTimeout(r, 10));
    firstLadder.open();
    await env.flushBackground();

    const calls = env.llm.callsFor('hints').map(asked);
    expect(calls).toEqual([
      ['Frage 1', 'Frage 2', 'Frage 3'],
      ['Frage 4', 'Frage 5', 'Frage 6'],
    ]);
    const view = (await l.api.get<SessionView>(`/practice/sessions/${started.body.id}`)).body;
    expect(view.items.every((i) => i.hints_left === 2)).toBe(true);
  });

  function prepare(kind: 'practice' | 'test' = 'practice') {
    const id = randomUUID();
    prepareOffered(env.deps, l.learnerId, [
      {
        id,
        summary: ActionSummary.parse({
          tool: 'offer_learning',
          kind,
          text: 'Brüche',
          material_id: null,
          goal_id: null,
          difficulty: 'easier',
          direction: null,
          minutes: null,
        }),
      },
    ]);
    return { client_request_id: id, kind, text: 'Brüche', difficulty: 'easier' };
  }

  it.each(['practice', 'test'] as const)(
    'an unopened %s offer prepares questions without hints; opening writes them once',
    async (kind) => {
      env.llm.script('explain', { json: set(2) });
      env.llm.byDefault('hints', (req: LlmRequest) => ladder(req));
      const body = prepare(kind);
      await env.flushBackground();
      expect(env.llm.callsFor('explain')).toHaveLength(1);
      expect(env.llm.callsFor('hints')).toHaveLength(0);

      const [a, b] = await Promise.all([
        l.api.post<SessionView>('/practice/topic', body),
        l.api.post<SessionView>('/practice/topic', body),
      ]);
      expect(a.status).toBe(201);
      expect(a.body.id).toBe(b.body.id);
      await env.flushBackground();
      await l.api.get(`/practice/sessions/${a.body.id}`);
      await env.flushBackground();
      expect(env.llm.callsFor('hints')).toHaveLength(1);
      expect(env.llm.callsFor('explain')).toHaveLength(1);
    },
  );

  it('opens while hints are held, then serves the first Tipp without another model wait', async () => {
    env.llm.script('explain', { json: set(2) });
    const body = prepare();
    await env.flushBackground();
    const writing = gate();
    const began = gate();
    let finished = false;
    env.llm.script('hints', async (req: LlmRequest) => {
      began.open();
      await writing.until;
      // A known provider delay, overlapping the time she reads the first question.
      await new Promise((resolve) => setTimeout(resolve, 150));
      finished = true;
      return ladder(req);
    });
    const openingAt = performance.now();
    const tapped = await l.api.post<SessionView>('/practice/topic', body);
    const openMs = performance.now() - openingAt;
    expect(tapped.status).toBe(201);
    await began.until;
    expect(finished).toBe(false); // model delay cannot be part of opening the run
    writing.open();
    await env.flushBackground(); // the reading interval has elapsed
    const calls = env.llm.calls.length;
    const hintAt = performance.now();
    const first = await l.api.post<AnswerResponse>(`/practice/sessions/${tapped.body.id}/hint`, {
      client_turn_id: randomUUID(),
      item_id: tapped.body.items[0]!.item.id,
    });
    const hintMs = performance.now() - hintAt;
    expect(first.status).toBe(200);
    expect(first.body.reply.text).toBe('Was ist gefragt?');
    expect(env.llm.calls.length).toBe(calls);
    expect(env.llm.callsFor('hints')).toHaveLength(1);
    console.info(
      `[hints-on-open] open=${openMs.toFixed(1)}ms first-hint=${hintMs.toFixed(1)}ms provider=150ms (background)`,
    );
  });

  it.each([false, true])(
    'streamed offer, opened before the rest arrives: %s',
    async (openEarly) => {
      const held = gate();
      const firstStored = gate();
      env.llm.script('explain', {
        json: set(6),
        pauseAfter: { key: 'items', n: FIRST_BATCH, until: held.until },
      });
      env.llm.byDefault('hints', (req: LlmRequest) => ladder(req));
      // Observe preparation's completion without flushing its still-streaming remainder.
      const background = env.deps.background;
      env.deps.background = (task) =>
        background(async () => {
          await task();
          firstStored.open();
        });
      const body = prepare();
      await firstStored.until;
      expect(env.llm.callsFor('hints')).toHaveLength(0);
      if (openEarly) await l.api.post('/practice/topic', body);
      held.open();
      await env.flushBackground();
      if (!openEarly) {
        expect(env.llm.callsFor('hints')).toHaveLength(0);
        await l.api.post('/practice/topic', body);
        await env.flushBackground();
      }
      const questions = env.llm.callsFor('hints').flatMap(asked).sort();
      expect(questions).toEqual(Array.from({ length: 6 }, (_, i) => `Frage ${i + 1}`));
    },
  );

  it('prefetch is read-only; only an explicit open starts hints and requires the owner', async () => {
    env.llm.script('explain', { json: set(2) });
    env.llm.byDefault('hints', (req: LlmRequest) => ladder(req));
    const body = prepare();
    await env.flushBackground();
    const run = await env.db.one<{ id: string }>(
      'select id from practice_sessions where learner_id = $1 and client_request_id = $2',
      [l.learnerId, body.client_request_id],
    );
    const other = await onboard(env);
    expect((await other.api.get(`/practice/sessions/${run.id}`)).status).toBe(404);
    await env.flushBackground();
    expect(env.llm.callsFor('hints')).toHaveLength(0);
    expect((await l.api.get(`/practice/sessions/${run.id}`)).status).toBe(200);
    await env.flushBackground();
    expect(env.llm.callsFor('hints')).toHaveLength(0);
    expect((await other.api.post(`/practice/sessions/${run.id}/open`)).status).toBe(404);
    expect((await l.api.post(`/practice/sessions/${run.id}/open`)).status).toBe(204);
    await env.flushBackground();
    expect(env.llm.callsFor('hints')).toHaveLength(1);
  });

  it('keeps opening fast after a hints outage and falls back to the tutor without retrying the batch', async () => {
    env.llm.script('explain', { json: set(2) });
    const body = prepare();
    await env.flushBackground();
    env.llm.script('hints', { error: new LlmError('unavailable', 'provider down') });
    const opened = await l.api.post<SessionView>('/practice/topic', body);
    expect(opened.status).toBe(201);
    await env.flushBackground();
    await l.api.get(`/practice/sessions/${opened.body.id}`);
    await env.flushBackground();
    expect(env.llm.callsFor('hints')).toHaveLength(1);
    env.llm.script('tutor', {
      json: {
        intent: 'answer',
        verdict: 'incorrect',
        reply: 'Welche Regel passt hier?',
        gave_hint: true,
        revealed_answer: false,
      },
    });
    const first = await l.api.post<AnswerResponse>(`/practice/sessions/${opened.body.id}/hint`, {
      client_turn_id: randomUUID(),
      item_id: opened.body.items[0]!.item.id,
    });
    expect(first.status).toBe(200);
    expect(first.body.reply.text).toBe('Welche Regel passt hier?');
    expect(env.llm.callsFor('tutor')).toHaveLength(1);
  });
});
