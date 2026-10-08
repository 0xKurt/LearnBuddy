// A guided worked example (issue #298: Vormachen → Mitmachen → Selbermachen;
// docs/architecture.md §Practice), checked against the database, not only the reply:
//   - the way the hints call writes is kept only when code proves it: every line follows from the
//     one before (`checkPath`), the first stands in the question, the last is the key — and the
//     database refuses a stored way of the wrong shape;
//   - kept, its steps are the hint ladder — each „Tipp" shows the next one, never the last; „Zeig
//     mir wie" in her words shows the same step once the tutor read it as a request for help;
//   - after a step was shown, a line she writes that follows from the task is "Der Schritt stimmt
//     – und weiter?", no try and no model, and Buddy leads on after it; one that does not follow
//     is a miss; the third miss, „Lösung zeigen" or the end of the run break the example off;
//   - a broken way, an outage, a duplicate, a late answer, a test and another learner change
//     nothing of that.
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

/** A longer way: three steps between the task and the result. */
const LONG_TASK = 'Löse die Gleichung 3(2x - 4) = 2x + 8.';
const LONG_STEPS = [
  { line: '3(2x - 4) = 2x + 8', note: 'Die Gleichung' },
  { line: '6x - 12 = 2x + 8', note: 'Klammer auflösen' },
  { line: '4x - 12 = 8', note: 'Auf beiden Seiten 2x abziehen' },
  { line: '4x = 20', note: '12 addieren' },
  { line: 'x = 5', note: 'Durch 4 teilen' },
];

/** What the tutor answers when it reads her words as a request for help, or as a try. */
const tutorSays = (intent: 'help_request' | 'answer', reply: string) => ({
  json: {
    intent,
    verdict: intent === 'answer' ? 'incorrect' : 'not_an_attempt',
    reply,
    gave_hint: intent === 'help_request',
    revealed_answer: false,
    concern: false,
  },
});

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
  async function start(
    ladder: unknown,
    opts: { kind?: 'practice' | 'test'; task?: string; answer?: string } = {},
  ) {
    const task = opts.task ?? TASK;
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Gleichungen',
        subject: { name: 'Mathe', kind: 'math' },
        items: [
          { ...equation, prompt: task, answer: opts.answer ?? '4' },
          { ...equation, prompt: 'Löse 3x = 12.', answer: '4', topic: 'Andere' },
        ],
      },
    });
    env.llm.script('hints', ladder as never);
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: opts.kind ?? 'practice',
      text: 'Gleichungen lösen',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();
    const s = (await l.api.get<SessionView>(`/practice/sessions/${res.body.id}`)).body;
    return { s, id: s.items.find((i) => i.item.prompt === task)!.item.id };
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
    env.db.one<{ attempts: number; hints_used: number; prepared: number; status: string }>(
      `select attempts, hints_used, prepared_hints_used as prepared, status
         from session_items where session_id = $1 and item_id = $2`,
      [sessionId, id],
    );
  const turns = async (sessionId: string, id: string) =>
    (
      await env.db.one<{ n: number }>(
        `select count(*)::int as n from practice_turns where session_id = $1 and item_id = $2`,
        [sessionId, id],
      )
    ).n;
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
    const step = await answer(s, id, 'x + 3 = 7', turn);
    expect(step.status, JSON.stringify(step.body)).toBe(200);
    expect(step.body.verdict).toBe('not_an_attempt');
    expect(step.body.reply.text).toBe(t('de', 'practice.step_ok'));
    expect(await llmCalls()).toBe(before);
    expect(await row(s.id, id)).toEqual({
      attempts: 0,
      hints_used: 1,
      prepared: 1,
      status: 'open',
    });
    // The same tap again, twice at once, is the same turn, counted once.
    const again = await Promise.all([
      answer(s, id, 'x + 3 = 7', turn),
      answer(s, id, 'x + 3 = 7', turn),
    ]);
    expect(again.map((a) => a.body.reply.id)).toEqual([step.body.reply.id, step.body.reply.id]);
    expect(await turns(s.id, id)).toBe(4);
    // Copying the step just shown is no step of hers: the rules and the tutor judge it as before.
    env.llm.script('tutor', tutorSays('answer', 'Schau nochmal.'));
    const copied = await answer(s, id, '2x + 6 = 14');
    expect(copied.body.reply.text).not.toBe(t('de', 'practice.step_ok'));
    // The result: right, with help (a step was shown).
    const done = await answer(s, id, 'x = 4');
    expect(done.body.verdict).toBe('correct');
    // A step that arrives after the question closed is refused, and nothing is added.
    const count = await turns(s.id, id);
    expect((await answer(s, id, '2x = 8')).status).toBe(409);
    expect(await turns(s.id, id)).toBe(count);
  });

  it('leads on after a step of the way she wrote herself: the next „Tipp" is the one after it', async () => {
    const { s, id } = await start(withSteps(LONG_STEPS), { task: LONG_TASK, answer: '5' });
    expect((await tip(s, id)).body.reply.text).toBe('Klammer auflösen: $6x - 12 = 2x + 8$');
    // She does the next step herself — the way's second step.
    const mine = await answer(s, id, '4x - 12 = 8');
    expect(mine.body.reply.text).toBe(t('de', 'practice.step_ok'));
    // Her step is no hint: the ladder moves past it, the help she took stays one.
    expect(await row(s.id, id)).toMatchObject({ attempts: 0, hints_used: 1, prepared: 2 });
    const next = await tip(s, id);
    expect(next.body.reply.text).toBe('12 addieren: $4x = 20$');
    expect((await answer(s, id, 'x = 5')).body.verdict).toBe('correct');
  });

  it('shows the next step when she asks in her words, exactly as „Tipp" — then checks hers', async () => {
    const { s, id } = await start(withSteps(STEPS));
    // The tutor reads her words; code writes the reply: the way's line, never a paraphrase.
    env.llm.script('tutor', tutorSays('help_request', 'Klar: erst die Klammer, dann 6 abziehen.'));
    const turn = randomUUID();
    const shown = await answer(s, id, 'Zeig mir, wie das geht', turn);
    expect(shown.status, JSON.stringify(shown.body)).toBe(200);
    expect(shown.body.verdict).toBe('not_an_attempt');
    expect(shown.body.reply.text).toBe('Klammer auflösen: $2x + 6 = 14$');
    expect(await row(s.id, id)).toMatchObject({ attempts: 0, hints_used: 1, prepared: 1 });
    // Sent twice: the same turn, no second model call, the ladder moved once.
    const before = await llmCalls();
    expect((await answer(s, id, 'Zeig mir, wie das geht', turn)).body.reply.id).toBe(
      shown.body.reply.id,
    );
    expect(await llmCalls()).toBe(before);
    expect(await row(s.id, id)).toMatchObject({ prepared: 1 });
    // Now she does the next step, and code checks it.
    const step = await answer(s, id, '2x = 8');
    expect(step.body.reply.text).toBe(t('de', 'practice.step_ok'));
    expect(await llmCalls()).toBe(before);
  });

  it('shows no step when the tutor cannot read her words: the ladder stays where it was', async () => {
    const { s, id } = await start(withSteps(STEPS));
    env.llm.script('tutor', { error: new LlmError('unavailable', 'down') });
    const asked = await answer(s, id, 'Zeig mir, wie das geht');
    expect(asked.status).toBe(200);
    expect(asked.body.reply.text).not.toContain('Klammer auflösen');
    expect(await row(s.id, id)).toMatchObject({ attempts: 0, hints_used: 0, prepared: 0 });
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

  it('keeps her right step a step at the end of the ladder — never the solution', async () => {
    const { s, id } = await start(withSteps(STEPS));
    await tip(s, id);
    await tip(s, id);
    const step = await answer(s, id, 'x + 3 = 7');
    expect(step.body.verdict).toBe('not_an_attempt');
    expect(step.body.reply.text).toBe(t('de', 'practice.step_ok'));
    expect(await row(s.id, id)).toMatchObject({ attempts: 0, status: 'open' });
  });

  it('breaks off with the worked solution at the third wrong step', async () => {
    const { s, id } = await start(withSteps(STEPS));
    await tip(s, id);
    expect((await answer(s, id, '2x = 20')).body.reply.text).toBe(t('de', 'practice.step_wrong'));
    expect((await answer(s, id, '2x = 12')).body.reply.text).toBe(t('de', 'practice.step_wrong'));
    const third = await answer(s, id, '2x = 10');
    expect(third.body.verdict).toBe('incorrect');
    expect(third.body.reply.text).toBe(`${t('de', 'practice.worked_intro')} So geht es.`);
    expect(await row(s.id, id)).toMatchObject({ attempts: 3, status: 'revealed' });
  });

  it('breaks off with „Lösung zeigen" mid-way: closed, her steps no tries', async () => {
    const { s, id } = await start(withSteps(STEPS));
    await tip(s, id);
    await answer(s, id, '2x = 8');
    const shown = await l.api.post<SessionView>(`/practice/sessions/${s.id}/reveal`, {
      item_id: id,
    });
    expect(shown.status).toBe(200);
    expect(await row(s.id, id)).toMatchObject({ attempts: 0, status: 'skipped' });
  });

  it('refuses a step that comes after the run ended: 409, nothing stored', async () => {
    const { s, id } = await start(withSteps(STEPS));
    await tip(s, id);
    // Nothing answered yet: ending the run wakes nobody (no Buddy look, no model call).
    expect((await l.api.post(`/practice/sessions/${s.id}/finish`, {})).status).toBe(200);
    await env.flushBackground();
    const late = await answer(s, id, '2x = 8');
    expect(late.status).toBe(409);
    expect(await turns(s.id, id)).toBe(2);
    expect(await row(s.id, id)).toMatchObject({ attempts: 0, hints_used: 1, prepared: 1 });
  });

  it('is no guided step before a step was shown', async () => {
    const { s, id } = await start(withSteps(STEPS));
    env.llm.script('tutor', tutorSays('answer', 'Schau nochmal.'));
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

  it('refuses a stored way of the wrong shape in the database', async () => {
    const { id } = await start(withSteps(STEPS));
    const set = (value: unknown) =>
      env.db.query(`update items set worked_steps = $2 where id = $1`, [id, JSON.stringify(value)]);
    for (const bad of [
      STEPS.slice(0, 2),
      { line: '2x = 8', note: 'x' },
      [...STEPS.slice(0, 2), { line: '2x = 8' }],
      [...STEPS.slice(0, 2), { line: 8, note: 'x' }],
      [...STEPS.slice(0, 2), { line: '', note: 'x' }],
      [...STEPS.slice(0, 2), 'x = 4'],
      [...STEPS.slice(0, 2), [STEPS[2]]],
    ]) {
      await expect(set(bad), JSON.stringify(bad)).rejects.toMatchObject({ code: '23514' });
    }
    expect((await stored(id)).worked_steps).toEqual(STEPS);
  });

  it('leaves the question as it was when the hints call fails', async () => {
    const { id } = await start({ error: new LlmError('unavailable', 'down') });
    expect(await stored(id)).toEqual({ hints: [], worked_steps: null });
  });

  it('shows no step in a test, and a line there is no guided step', async () => {
    const { s, id } = await start(withSteps(STEPS), { kind: 'test' });
    expect((await tip(s, id)).status).toBe(409);
    env.llm.script('tutor', tutorSays('answer', 'x'));
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
    expect(await row(s.id, id)).toEqual({
      attempts: 0,
      hints_used: 1,
      prepared: 1,
      status: 'open',
    });
  });
});
