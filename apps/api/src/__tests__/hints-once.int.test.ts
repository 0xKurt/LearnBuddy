// Hints are written once per question (F9-a, KI-Audit 14.10., issue #660). Measured in
// production: 2 of 2 runs wrote them twice from the same input — the route started `prepareHints`
// on every `POST /practice/topic`, also on the replay that only finds the run, and on the early
// path the call for the rest sent the first questions again while their own call still ran.
// Now the call that creates a run writes hints for the questions it brought, the call that adds
// the rest for exactly those, and a run Buddy prepared ahead has its hints before she taps.
// docs/architecture.md §Practice.
// requires live verification in Claude Code session (needs a running Postgres; scripted model)

import { randomUUID } from 'node:crypto';

import type { SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LlmRequest } from '../llm/gateway.js';
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

  it('a run Buddy prepares ahead has its hints before she taps, and her tap writes none', async () => {
    env.llm.script('explain', { json: set(2) });
    env.llm.byDefault('hints', (req: LlmRequest) => ladder(req));
    const offerId = randomUUID();
    prepareOffered(env.deps, l.learnerId, [
      {
        id: offerId,
        summary: {
          tool: 'offer_learning',
          kind: 'practice',
          text: 'Brüche',
          material_id: null,
          goal_id: null,
          difficulty: 'easier',
        } as Parameters<typeof prepareOffered>[2][number]['summary'],
      },
    ]);
    await env.flushBackground();
    expect(env.llm.callsFor('hints')).toHaveLength(1);

    const tapped = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: offerId,
      kind: 'practice',
      text: 'Brüche',
      difficulty: 'easier',
    });
    expect(tapped.body.items.every((i) => i.hints_left === 2)).toBe(true);
    await env.flushBackground();
    expect(env.llm.callsFor('hints')).toHaveLength(1);
  });
});
