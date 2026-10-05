// A guided worked example (issue #298: Vormachen → Mitmachen → Selbermachen;
// docs/architecture.md §Practice), checked against the database, not only the reply:
//   - the way the hints call writes is kept only when code proves it: every line follows from the
//     one before (`checkPath`), the first stands in the question, the last is the key;
//   - kept, its steps are the hint ladder — each „Tipp" shows the next one, never the last;
//   - after a step was shown, a line she writes that follows from the task is "Der Schritt stimmt
//     – und weiter?", no try and no model; one that does not follow is a miss with the place;
//   - a broken way, an outage, a test and another learner change nothing of that.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { t } from '../i18n/index.js';
import { LlmError } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const TASK = 'Löse die Gleichung 2(x + 3) = 14.';
const equation = {
  kind: 'numeric',
  prompt: TASK,
  answer: '4',
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Gleichungen',
  difficulty: 2,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
};

/** The way as the hints call writes it: the task's equation, two steps, the result. */
const STEPS = [
  { line: '2(x + 3) = 14', note: 'Die Gleichung' },
  { line: '2x + 6 = 14', note: 'Klammer auflösen' },
  { line: '2x = 8', note: 'Auf beiden Seiten 6 abziehen' },
  { line: 'x = 4', note: 'Durch 2 teilen' },
];
const TEXT_HINTS = ['Löse zuerst die Klammer auf.', 'Bring die Zahlen auf eine Seite.'];

describe.skipIf(!dbReady)('a guided worked example (issue #298)', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-05T16:00:00Z' });
    l = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2010-02-10',
      pin: '4826',
    });
  });
  afterEach(() => env.closeChecked());

  /** A run with the equation; the hints call answers `ladder` (or fails with it). */
  async function start(ladder: unknown, kind: 'practice' | 'test' = 'practice') {
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Gleichungen',
        subject: { name: 'Mathe', kind: 'math' },
        items: [equation, { ...equation, prompt: 'Löse 3x = 12.', answer: '4', topic: 'Andere' }],
      },
    });
    env.llm.script('hints', ladder as never);
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind,
      text: 'Gleichungen lösen',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();
    const s = (await l.api.get<SessionView>(`/practice/sessions/${res.body.id}`)).body;
    return { s, id: s.items.find((i) => i.item.prompt === TASK)!.item.id };
  }
  const withSteps = (steps: unknown) => ({
    json: {
      items: [{ n: 1, hints: TEXT_HINTS, worked_solution: 'So geht es.', why: null, steps }],
    },
  });
  const stored = (id: string) =>
    env.db.one<{ hints: string[]; worked_steps: unknown }>(
      `select hints, worked_steps from items where id = $1`,
      [id],
    );
  const tip = (s: { id: string }, id: string, as = l) =>
    as.api.post<AnswerResponse>(`/practice/sessions/${s.id}/hint`, {
      client_turn_id: randomUUID(),
      item_id: id,
    });
  const answer = (s: { id: string }, id: string, text: string, turn = randomUUID(), as = l) =>
    as.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: turn,
      item_id: id,
      text,
    });
  const row = (sessionId: string, id: string) =>
    env.db.one<{ attempts: number; hints_used: number; status: string }>(
      `select attempts, hints_used, status from session_items where session_id = $1 and item_id = $2`,
      [sessionId, id],
    );
  const llmCalls = async () =>
    (await env.db.one<{ n: number }>(`select count(*)::int as n from llm_calls`)).n;

  it('keeps a proven way, and its steps are the ladder — never the last line', async () => {
    const { s, id } = await start(withSteps(STEPS));
    const kept = await stored(id);
    expect(kept.worked_steps).toEqual(STEPS);
    expect(kept.hints).toEqual([
      'Klammer auflösen: $2x + 6 = 14$',
      'Auf beiden Seiten 6 abziehen: $2x = 8$',
    ]);
    const first = await tip(s, id);
    expect(first.body.reply.text).toBe('Klammer auflösen: $2x + 6 = 14$');
    const second = await tip(s, id);
    expect(second.body.reply.text).toBe('Auf beiden Seiten 6 abziehen: $2x = 8$');
    expect(second.body.reply.text).not.toContain('x = 4');
  });

  it('answers a right step with "und weiter?" — no try, no model — and the result as right', async () => {
    const { s, id } = await start(withSteps(STEPS));
    await tip(s, id);
    const before = await llmCalls();
    const turn = randomUUID();
    const step = await answer(s, id, '2x = 8', turn);
    expect(step.status, JSON.stringify(step.body)).toBe(200);
    expect(step.body.verdict).toBe('not_an_attempt');
    expect(step.body.reply.text).toBe(t('de', 'practice.step_ok'));
    expect(await llmCalls()).toBe(before);
    expect(await row(s.id, id)).toEqual({ attempts: 0, hints_used: 1, status: 'open' });
    // The same tap again is the same turn, counted once.
    const again = await answer(s, id, '2x = 8', turn);
    expect(again.body.reply.id).toBe(step.body.reply.id);
    const turns = await env.db.one<{ n: number }>(
      `select count(*)::int as n from practice_turns where session_id = $1 and item_id = $2`,
      [s.id, id],
    );
    expect(turns.n).toBe(4);
    // Copying the step just shown is no step of hers: the rules and the tutor judge it as before.
    env.llm.script('tutor', {
      json: {
        intent: 'answer',
        verdict: 'incorrect',
        reply: 'Schau nochmal.',
        gave_hint: false,
        revealed_answer: false,
        concern: false,
      },
    });
    const copied = await answer(s, id, '2x + 6 = 14');
    expect(copied.body.reply.text).not.toBe(t('de', 'practice.step_ok'));
    // The result: right, with help (a step was shown).
    const done = await answer(s, id, 'x = 4');
    expect(done.body.verdict).toBe('correct');
  });

  it('names a step that does not follow, and counts it as a miss', async () => {
    const { s, id } = await start(withSteps(STEPS));
    await tip(s, id);
    const before = await llmCalls();
    const wrong = await answer(s, id, '2x = 20');
    expect(wrong.body.verdict).toBe('incorrect');
    expect(wrong.body.reply.text).toBe(t('de', 'practice.step_wrong'));
    expect(await llmCalls()).toBe(before);
    expect(await row(s.id, id)).toMatchObject({ attempts: 1, status: 'open' });
  });

  it('is no guided step before a step was shown', async () => {
    const { s, id } = await start(withSteps(STEPS));
    env.llm.script('tutor', {
      json: {
        intent: 'answer',
        verdict: 'incorrect',
        reply: 'Schau nochmal.',
        gave_hint: false,
        revealed_answer: false,
        concern: false,
      },
    });
    const own = await answer(s, id, '2x = 8');
    expect(own.body.reply.text).not.toBe(t('de', 'practice.step_ok'));
  });

  it('never keeps a way that breaks, starts elsewhere or ends off the key — the text hints stay', async () => {
    const broken = [
      STEPS[0],
      STEPS[1],
      { line: '2x = 7', note: 'Abziehen' },
      { line: 'x = 3.5', note: 'Teilen' },
    ];
    const { id } = await start(withSteps(broken));
    expect(await stored(id)).toEqual({ hints: TEXT_HINTS, worked_steps: null });

    const elsewhere = [
      { line: '3x = 12', note: 'Die Gleichung' },
      { line: 'x = 4', note: 'Teilen' },
      { line: '4 = x', note: 'Umdrehen' },
    ];
    const other = await start(withSteps(elsewhere));
    expect(await stored(other.id)).toEqual({ hints: TEXT_HINTS, worked_steps: null });

    const offKey = [
      STEPS[0],
      STEPS[1],
      { line: '2x = 6', note: 'Abziehen' },
      { line: 'x = 3', note: 'Teilen' },
    ];
    const third = await start(withSteps(offKey));
    expect(await stored(third.id)).toEqual({ hints: TEXT_HINTS, worked_steps: null });
  });

  it('leaves the question as it was when the hints call fails', async () => {
    const { id } = await start({ error: new LlmError('unavailable', 'down') });
    expect(await stored(id)).toEqual({ hints: [], worked_steps: null });
  });

  it('shows no step in a test, and a line there is no guided step', async () => {
    const { s, id } = await start(withSteps(STEPS), 'test');
    expect((await tip(s, id)).status).toBe(409);
    env.llm.script('tutor', {
      json: {
        intent: 'answer',
        verdict: 'incorrect',
        reply: 'x',
        gave_hint: false,
        revealed_answer: false,
        concern: false,
      },
    });
    const line = await answer(s, id, '2x = 8');
    expect(line.body.reply.text).not.toBe(t('de', 'practice.step_ok'));
  });

  it("refuses another learner's step: 404, nothing stored", async () => {
    const { s, id } = await start(withSteps(STEPS));
    await tip(s, id);
    const mia = await onboard(env, {
      relation: 'child',
      name: 'Mia',
      birthDate: '2010-05-01',
      pin: '1357',
    });
    expect((await answer(s, id, '2x = 8', randomUUID(), mia)).status).toBe(404);
    expect((await tip(s, id, mia)).status).toBe(404);
    expect(await row(s.id, id)).toEqual({ attempts: 0, hints_used: 1, status: 'open' });
  });
});
