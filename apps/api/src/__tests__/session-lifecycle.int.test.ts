// Sessions over their whole life: homework help that can be paused, set aside and found
// again, answers that are never lost, idle sessions that are closed, and summaries that say
// one true thing. docs/architecture.md §Practice (session lifecycle); audit I-3, I-4
// (H-7–H-16, M-28, M-33, M-36), decision D-5, user feedback #1, #3, #7–#9.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type {
  AnswerResponse,
  BuddyHome,
  MaterialView,
  SessionView,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runTick } from '../modules/scheduler/tick.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const item = (over: Record<string, unknown>) => ({
  kind: 'short',
  prompt: 'Frage',
  answer: 'Antwort',
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Thema',
  difficulty: 2,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
  ...over,
});

const tutor = (reply: string, over: Record<string, unknown> = {}) => ({
  json: {
    intent: 'answer',
    verdict: 'incorrect',
    reply,
    gave_hint: true,
    revealed_answer: false,
    ...over,
  },
});

const WAIT = { json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null } };

/** Three homework tasks: fractions, a decimal key and an equation. */
const HOMEWORK = [
  item({ prompt: 'Berechne $\\frac{2}{3} + \\frac{1}{4}$.', answer: '11/12', topic: 'Brüche' }),
  item({ prompt: 'Kürze $\\frac{6}{8}$.', answer: '$\\frac{3}{4}$', topic: 'Brüche' }),
  item({
    prompt: 'Berechne $\\frac{3}{4} + \\frac{1}{8}$.',
    answer: '7/8',
    topic: 'Brüche',
  }),
];

async function sendSheet(
  env: TestEnv,
  l: Learner,
  opts: {
    purpose: 'study' | 'homework';
    items: unknown[];
    requestId?: string;
    extra?: Record<string, unknown>;
  },
): Promise<MaterialView> {
  env.llm.script('extraction', {
    json: {
      is_learning_material: true,
      readable: true,
      title: opts.purpose === 'homework' ? 'Hausaufgabe Brüche' : 'Brüche',
      subject: { name: 'Mathe', kind: 'math' },
      extracted_text: 'Brüche',
      items: opts.items,
    },
  });
  const created = await l.api.post<{ material: MaterialView; uploads: Array<{ path: string }> }>(
    '/materials',
    {
      client_request_id: opts.requestId ?? randomUUID(),
      photo_mimes: ['image/jpeg'],
      purpose: opts.purpose,
      ...opts.extra,
    },
  );
  expect(created.status).toBe(201);
  for (const u of created.body.uploads) env.storage.put(u.path);
  expect((await l.api.post(`/materials/${created.body.material.id}/submit`)).status).toBe(202);
  await env.flushBackground();
  return (await l.api.get<MaterialView>(`/materials/${created.body.material.id}`)).body;
}

async function answer(l: Learner, sessionId: string, itemId: string, text: string) {
  return l.api.post<AnswerResponse>(`/practice/sessions/${sessionId}/answer`, {
    client_turn_id: randomUUID(),
    item_id: itemId,
    text,
  });
}

describe.skipIf(!dbReady)('session lifecycle', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T14:00:00Z' });
    l = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2014-02-10',
      pin: '4826',
    });
    env.llm.byDefault('buddy_check', WAIT);
  });
  afterEach(async () => {
    // Buddy's wake-up after a session the server finished runs in the background.
    await env.flushBackground();
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      unexpected: env.llm.unexpected.map((u) => u.purpose),
      pending: env.llm.pending(),
    };
    await env.close();
    expect(report).toEqual({ scriptErrors: [], unexpected: [], pending: 0 });
  });

  it('H-7 (repro-05), H-8: homework paused with "Beenden" is found again the next day and after two weeks', async () => {
    const sheet = await sendSheet(env, l, { purpose: 'homework', items: HOMEWORK });
    expect(sheet).toMatchObject({ purpose: 'homework', session_status: 'active' });
    const sessionId = sheet.session_id!;

    // "Beenden" with three open tasks is a pause (D-5), not the end.
    const paused = await l.api.post<SessionView>(`/practice/sessions/${sessionId}/finish`);
    expect(paused.body.status).toBe('active');
    expect(paused.body.summary).toBeNull();

    // 13 hours later (repro-05: the card was gone at 13 h): still on the home card …
    env.clock.hours(13);
    let home = (await l.api.get<BuddyHome>('/buddy')).body;
    expect(home.now).toMatchObject({
      type: 'resume_practice',
      session_id: sessionId,
      mode: 'help',
      remaining: 3,
    });
    // … and the sheet's button leads to it, never to "no questions".
    const again = await l.api.post<SessionView>('/practice/sessions', {
      material_id: sheet.id,
      mode: 'practice',
    });
    expect(again.status).toBe(201);
    expect(again.body.id).toBe(sessionId);
    expect(again.body.mode).toBe('help');

    // Solve one; the others stay open and answerable.
    const solved = await answer(l, sessionId, again.body.items[0]!.item.id, '11/12');
    expect(solved.body.verdict).toBe('correct');
    expect(solved.body.session.status).toBe('active');

    // Two weeks without touching it: the scheduler closes it …
    env.clock.hours(24 * 14 + 1);
    await runTick(env.deps);
    expect((await l.api.get<SessionView>(`/practice/sessions/${sessionId}`)).body.status).toBe(
      'abandoned',
    );
    home = (await l.api.get<BuddyHome>('/buddy')).body;
    expect(home.now?.type === 'resume_practice').toBe(false);
    // … and the sheet still leads to help, with only what she has not solved yet.
    const fresh = await l.api.post<SessionView>('/practice/sessions', { material_id: sheet.id });
    expect(fresh.status).toBe(201);
    expect(fresh.body).toMatchObject({ mode: 'help', status: 'active' });
    expect(fresh.body.id).not.toBe(sessionId);
    expect(fresh.body.items.map((i) => i.item.prompt)).toEqual([
      HOMEWORK[1]!.prompt,
      HOMEWORK[2]!.prompt,
    ]);
  });

  it('H-11: "Später" sets a task aside without solving or showing anything', async () => {
    const sheet = await sendSheet(env, l, { purpose: 'homework', items: HOMEWORK });
    const s = (await l.api.get<SessionView>(`/practice/sessions/${sheet.session_id}`)).body;
    const [t1, t2, t3] = s.items.map((i) => i.item.id) as [string, string, string];
    expect(s.current_item_id).toBe(t1);

    const later = await l.api.post<SessionView>(`/practice/sessions/${s.id}/items/${t1}/defer`);
    expect(later.status).toBe(200);
    expect(later.body.current_item_id).toBe(t2);
    expect(later.body.items[0]).toMatchObject({ status: 'open', deferred: true, answer: null });
    expect(later.body.turns).toEqual([]);

    // Solving task 2 moves on to task 3, then back to the task set aside.
    await answer(l, s.id, t2, '3/4');
    const after3 = await l.api.post<SessionView>(`/practice/sessions/${s.id}/items/${t3}/defer`);
    expect(after3.body.current_item_id).toBe(t1);
    // Working on it puts it back in line.
    env.llm.script('tutor', tutor('Welcher Nenner passt zu 3 und 4?'));
    const tried = await answer(l, s.id, t1, 'weiß nicht, 3/7?');
    expect(tried.body.session.items[0]!.deferred).toBe(false);
    expect(tried.body.session.current_item_id).toBe(t1);

    // Not in practice, and never for another learner.
    const other = await onboard(env, { relation: 'child', name: 'Tom', birthDate: '2013-05-01' });
    expect((await other.api.post(`/practice/sessions/${s.id}/items/${t3}/defer`)).status).toBe(404);
  });

  it('H-9, M-28: the leak check runs on the final verdict and never trusts her guesses', async () => {
    const sheet = await sendSheet(env, l, { purpose: 'homework', items: HOMEWORK });
    const s = (await l.api.get<SessionView>(`/practice/sessions/${sheet.session_id}`)).body;
    const [t1, , t3] = s.items.map((i) => i.item.id) as [string, string, string];

    // The tutor over-praises a step and states the result: demoted, and the result is gone.
    env.llm.script(
      'tutor',
      tutor('Super, genau! Also $\\frac{8}{12} + \\frac{3}{12} = \\frac{11}{12}$.', {
        verdict: 'correct',
        gave_hint: false,
      }),
    );
    const step = await answer(l, s.id, t1, 'Hauptnenner 12');
    expect(step.body.verdict).toBe('partially_correct');
    expect(step.body.reply.text).not.toMatch(/11/);
    expect(step.body.reply.text).toContain('Endergebnis');
    expect(step.body.session.items[0]!.status).toBe('open');

    // She lists candidates; the tutor names the right one: repaired, then a safe hint.
    env.llm.script(
      'tutor',
      tutor('Von deinen Vorschlägen stimmt 7/8.', { verdict: 'partially_correct' }),
      tutor('Richtig ist die letzte: 7/8.', { verdict: 'partially_correct' }),
    );
    const guesses = await answer(l, s.id, t3, 'Ist es 1/8, 3/8, 5/8 oder 7/8?');
    expect(guesses.body.reply.text).not.toContain('7/8');
    expect(guesses.body.reply.text).toContain('Schritt für Schritt');
    expect(guesses.body.session.items[2]!.status).toBe('open');

    // Even a "correct" on a list of guesses closes nothing and shows nothing.
    env.llm.script('tutor', tutor('Ja, 7/8 ist richtig!', { verdict: 'correct' }));
    const listed = await answer(l, s.id, t3, '1/8, 3/8, 5/8 oder 7/8');
    expect(listed.body.verdict).toBe('partially_correct');
    expect(listed.body.reply.text).not.toContain('7/8');
    expect(listed.body.session.items[2]!.status).toBe('open');
  });

  it('H-10: a right homework answer written differently from the key closes the task', async () => {
    const sheet = await sendSheet(env, l, { purpose: 'homework', items: HOMEWORK });
    const s = (await l.api.get<SessionView>(`/practice/sessions/${sheet.session_id}`)).body;
    const t2 = s.items[1]!.item.id;
    env.llm.script(
      'tutor',
      tutor('Genau, das ist richtig!', { verdict: 'correct', gave_hint: false }),
    );
    const res = await answer(l, s.id, t2, '0,75');
    expect(res.body.verdict).toBe('correct');
    expect(res.body.session.items[1]).toMatchObject({ status: 'correct', answer: null });
  });

  it('feedback #7: "Tipp" works in homework help and never carries the solution', async () => {
    const sheet = await sendSheet(env, l, { purpose: 'homework', items: HOMEWORK });
    const s = (await l.api.get<SessionView>(`/practice/sessions/${sheet.session_id}`)).body;
    expect(s.items[0]).toMatchObject({ hint_available: true, reveal_available: false });
    const t3 = s.items[2]!.item.id;
    env.llm.script(
      'tutor',
      (req) => {
        expect(ScriptedGateway.textOf(req)).toContain('MODE: HOMEWORK');
        return tutor('Tipp: Das Ergebnis ist 7/8.', {
          intent: 'help_request',
          verdict: 'not_an_attempt',
        }).json;
      },
      tutor('Mach die Nenner gleich: welcher passt zu 4 und 8?', {
        intent: 'help_request',
        verdict: 'not_an_attempt',
      }),
    );
    const hint = await l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/hint`, {
      client_turn_id: randomUUID(),
      item_id: t3,
    });
    expect(hint.status).toBe(200);
    expect(hint.body.verdict).toBe('not_an_attempt');
    expect(hint.body.reply.text).toContain('Nenner gleich');
    expect(hint.body.reply.text).not.toContain('7/8');
    expect(hint.body.session.items[2]).toMatchObject({ status: 'open', hints_used: 1 });
  });

  it('H-12: the last answer finishes the session on the server; a lost /finish loses nothing', async () => {
    const study = await sendSheet(env, l, {
      purpose: 'study',
      items: [
        item({
          prompt: 'Wie heißt der untere Teil eines Bruchs?',
          answer: 'Nenner',
          topic: 'Begriffe',
        }),
        item({ prompt: 'Kürze 4/8.', answer: '1/2', topic: 'Kürzen' }),
      ],
    });
    const items = await env.db.query<{ id: string }>(
      `select id from items where material_id = $1 order by seq`,
      [study.id],
    );
    const step = await env.db.one<{ id: string }>(
      `insert into buddy_steps (learner_id, kind, title, state, payload, created_at)
       values ($1, 'practice', 'Brüche üben', 'prepared', $2, $3) returning id`,
      [l.learnerId, { item_ids: items.map((i) => i.id), est_minutes: 5 }, env.clock.now()],
    );
    const started = await l.api.post<{ session_id: string }>(`/buddy/steps/${step.id}/start`);
    const s = (await l.api.get<SessionView>(`/practice/sessions/${started.body.session_id}`)).body;
    expect(s.status).toBe('active');
    await answer(l, s.id, s.items[0]!.item.id, 'Nenner');
    const last = await answer(l, s.id, s.items[1]!.item.id, '1/2');
    await env.flushBackground();
    // No /finish call: the session is finished anyway, with evidence on Buddy's step.
    expect(last.body.session.status).toBe('finished');
    expect(last.body.session.summary).toMatchObject({ answered: 2, first_try: 2 });
    const st = await env.db.one<{ state: string; evidence: { session_id: string } }>(
      `select state, evidence from buddy_steps where id = $1`,
      [step.id],
    );
    expect(st).toMatchObject({ state: 'done', evidence: { session_id: s.id } });
    const home = (await l.api.get<BuddyHome>('/buddy')).body;
    expect(home.now).toMatchObject({ type: 'practice_result', session_id: s.id, mode: 'practice' });
    // A late /finish from the app changes nothing.
    const late = await l.api.post<SessionView>(`/practice/sessions/${s.id}/finish`);
    expect(late.body.summary).toEqual(last.body.session.summary);
    // An answer after the end is refused behind the session lock.
    expect((await answer(l, s.id, s.items[0]!.item.id, 'Nenner')).status).toBe(409);
  });

  it('M-33: a practice session idle for 3 days is abandoned and its step offered again', async () => {
    const study = await sendSheet(env, l, {
      purpose: 'study',
      items: [
        item({ prompt: 'Wie heißt der untere Teil eines Bruchs?', answer: 'Nenner' }),
        item({ prompt: 'Kürze 4/8.', answer: '1/2' }),
      ],
    });
    const items = await env.db.query<{ id: string }>(
      `select id from items where material_id = $1 order by seq`,
      [study.id],
    );
    const step = await env.db.one<{ id: string }>(
      `insert into buddy_steps (learner_id, kind, title, state, payload, created_at)
       values ($1, 'practice', 'Brüche üben', 'prepared', $2, $3) returning id`,
      [l.learnerId, { item_ids: items.map((i) => i.id), est_minutes: 5 }, env.clock.now()],
    );
    const started = await l.api.post<{ session_id: string }>(`/buddy/steps/${step.id}/start`);
    const s = (await l.api.get<SessionView>(`/practice/sessions/${started.body.session_id}`)).body;
    await answer(l, s.id, s.items[0]!.item.id, 'Nenner');

    // Two days later it is still there to go on with (not on top: nothing hides Buddy's plan).
    env.clock.hours(48);
    await runTick(env.deps);
    let home = (await l.api.get<BuddyHome>('/buddy')).body;
    expect(home.now).toMatchObject({ type: 'resume_practice', session_id: s.id });

    env.clock.hours(25);
    await runTick(env.deps);
    expect((await l.api.get<SessionView>(`/practice/sessions/${s.id}`)).body.status).toBe(
      'abandoned',
    );
    const st = await env.db.one<{ state: string }>(`select state from buddy_steps where id = $1`, [
      step.id,
    ]);
    expect(st.state).toBe('prepared');
    home = (await l.api.get<BuddyHome>('/buddy')).body;
    expect(home.now).toMatchObject({ type: 'practice_ready', step_id: step.id });
    // Starting it again opens a new session.
    const next = (await l.api.post<{ session_id: string }>(`/buddy/steps/${step.id}/start`)).body;
    expect(next.session_id).not.toBe(s.id);
  });

  it('M-36: a test handed in early shows untouched questions with their solution', async () => {
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Brüche – Probetest',
        subject: { name: 'Mathe', kind: 'math' },
        items: [
          item({ prompt: 'Kürze 4/8.', answer: '1/2', topic: 'Kürzen' }),
          item({ prompt: 'Kürze 2/6.', answer: '1/3', topic: 'Kürzen' }),
          item({ prompt: 'Wie heißt der untere Teil?', answer: 'Nenner', topic: 'Begriffe' }),
        ],
      },
    });
    const s = (
      await l.api.post<SessionView>('/practice/topic', {
        client_request_id: randomUUID(),
        kind: 'test',
        text: 'Brüche',
      })
    ).body;
    // No "Lösung zeigen" while a test runs (it has "Überspringen" instead).
    expect(s.items[0]!.reveal_available).toBe(false);
    await answer(l, s.id, s.items[0]!.item.id, '1/2');
    const done = await l.api.post<SessionView>(`/practice/sessions/${s.id}/finish`);
    expect(done.body.status).toBe('finished');
    expect(done.body.items.map((i) => [i.status, i.answer])).toEqual([
      ['correct', '1/2'],
      ['open', '1/3'],
      ['open', 'Nenner'],
    ]);
    // Only what she answered counts.
    expect(done.body.summary).toMatchObject({ answered: 1, secure_topics: ['Kürzen'] });
  });

  it('feedback #3: "Sitzt" and "Nochmal" never name the same topic, on the result and the home card', async () => {
    const study = await sendSheet(env, l, {
      purpose: 'study',
      items: [
        item({ prompt: 'Kürze 4/8.', answer: '1/2', topic: 'Kürzen' }),
        item({ prompt: 'Kürze 2/6.', answer: '1/3', topic: 'kürzen ' }),
        item({ prompt: 'Wie heißt der untere Teil?', answer: 'Nenner', topic: 'Begriffe' }),
      ],
    });
    const s = (await l.api.post<SessionView>('/practice/sessions', { material_id: study.id })).body;
    const byPrompt = (p: string) => s.items.find((i) => i.item.prompt === p)!.item.id;
    await answer(l, s.id, byPrompt('Kürze 4/8.'), '1/2');
    // Wrong first (the rules know it: kind feedback, no model), then right.
    await answer(l, s.id, byPrompt('Kürze 2/6.'), '2/3');
    await answer(l, s.id, byPrompt('Kürze 2/6.'), '1/3');
    const last = await answer(l, s.id, byPrompt('Wie heißt der untere Teil?'), 'Nenner');
    const summary = last.body.session.summary!;
    expect(summary.shaky_topics.map((x) => x.toLowerCase())).toEqual(['kürzen']);
    expect(summary.secure_topics).toEqual(['Begriffe']);
    const home = (await l.api.get<BuddyHome>('/buddy')).body;
    expect(home.now).toMatchObject({
      type: 'practice_result',
      result: {
        secure_topics: summary.secure_topics,
        shaky_topics: summary.shaky_topics,
      },
    });
  });

  it('feedback #9: with two options, a miss does not leave the other one to tap as "right"', async () => {
    const study = await sendSheet(env, l, {
      purpose: 'study',
      items: [
        item({
          kind: 'multiple_choice',
          prompt: 'Ist 3/4 größer als 2/3?',
          answer: 'Ja',
          choices: ['Ja', 'Nein'],
          correct_choice: 0,
          topic: 'Vergleichen',
        }),
        item({ prompt: 'Kürze 4/8.', answer: '1/2', topic: 'Kürzen' }),
      ],
    });
    const s = (await l.api.post<SessionView>('/practice/sessions', { material_id: study.id })).body;
    const mc = s.items.find((i) => i.item.kind === 'multiple_choice')!.item.id;
    const miss = await l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: mc,
      choice: 1,
    });
    expect(miss.body.verdict).toBe('incorrect');
    const closed = miss.body.session.items.find((i) => i.item.id === mc)!;
    // Closed as shown, with the solution explained — never as right.
    expect(closed).toMatchObject({ status: 'revealed', answer: 'Ja' });
    expect(miss.body.reply.text).toContain('Ja');
    expect(
      (
        await l.api.post(`/practice/sessions/${s.id}/answer`, {
          client_turn_id: randomUUID(),
          item_id: mc,
          choice: 0,
        })
      ).status,
    ).toBe(409);
  });
  it('H-13 (repro-12): a draft resent after its upload was given up becomes a new sheet', async () => {
    const requestId = randomUUID();
    const first = await l.api.post<{ material: MaterialView }>('/materials', {
      client_request_id: requestId,
      photo_mimes: ['image/jpeg'],
      purpose: 'study',
    });
    expect(first.status).toBe(201);
    // The photos never arrived; a day later the scheduler gives the upload up.
    env.clock.hours(25);
    await runTick(env.deps);
    expect((await l.api.get(`/materials/${first.body.material.id}`)).status).toBe(404);
    // The draft on her phone is sent again with the same request id: a new sheet, twice the same.
    const again = await l.api.post<{ material: MaterialView; uploads: unknown[] }>('/materials', {
      client_request_id: requestId,
      photo_mimes: ['image/jpeg'],
      purpose: 'study',
    });
    expect(again.status).toBe(201);
    expect(again.body.material.id).not.toBe(first.body.material.id);
    expect(again.body.uploads).toHaveLength(1);
    const repeat = await l.api.post<{ material: MaterialView }>('/materials', {
      client_request_id: requestId,
      photo_mimes: ['image/jpeg'],
      purpose: 'study',
    });
    expect(repeat.body.material.id).toBe(again.body.material.id);
  });

  it('H-14, H-15: one rich or broken item never costs the other questions', async () => {
    const eight = Array.from({ length: 8 }, (_, n) => `Übersetzung ${n + 1}`);
    const sheet = await sendSheet(env, l, {
      purpose: 'study',
      items: [
        item({
          kind: 'vocab',
          prompt: 'to get',
          answer: 'bekommen',
          accepted_answers: [...eight, 'kriegen'],
          prompt_lang: 'en',
          lang: 'de',
        }),
        item({
          prompt: 'Fülle die Wertetabelle aus: y für x = 2.',
          answer: '4',
          figure: {
            type: 'table',
            header: ['x', '-3', '-2', '-1', '0', '1', '2', '3'],
            rows: [['y', '9', '4', '1', '0', '1', '?', '9']],
          },
        }),
        item({ prompt: 'Eine Frage ohne Antwort', answer: '' }),
        item({ prompt: 'Kürze 4/8.', answer: '1/2' }),
      ],
    });
    expect(sheet.status).toBe('ready');
    const rows = await env.db.query<{
      prompt: string;
      accepted_answers: string[];
      figure: unknown;
    }>(`select prompt, accepted_answers, figure from items where material_id = $1 order by seq`, [
      sheet.id,
    ]);
    expect(rows.map((r) => r.prompt)).toEqual([
      'to get',
      'Fülle die Wertetabelle aus: y für x = 2.',
      'Kürze 4/8.',
      'bekommen',
    ]);
    // Clipped to the bound the prompt names, the figure over its bound dropped.
    expect(rows[0]!.accepted_answers).toEqual(eight);
    expect(rows[1]!.figure).toBeNull();
  });

  it('H-16: a photo sent with the composer camera completes the one open capture step', async () => {
    const goal = await env.db.one<{ id: string }>(
      `insert into buddy_goals (learner_id, kind, title, due_date, created_at)
       values ($1, 'exam', 'Mathearbeit Brüche', '2026-10-02', $2) returning id`,
      [l.learnerId, env.clock.now()],
    );
    const step = await env.db.one<{ id: string }>(
      `insert into buddy_steps (learner_id, goal_id, kind, title, state, created_at)
       values ($1, $2, 'capture', 'Foto vom Arbeitsblatt', 'planned', $3) returning id`,
      [l.learnerId, goal.id, env.clock.now()],
    );
    // No step or goal in the request (buddy.tsx, library.tsx).
    const sheet = await sendSheet(env, l, {
      purpose: 'study',
      items: [item({ prompt: 'Kürze 4/8.', answer: '1/2' })],
    });
    expect(sheet.goal_id).toBe(goal.id);
    const st = await env.db.one<{ state: string }>(`select state from buddy_steps where id = $1`, [
      step.id,
    ]);
    expect(st.state).toBe('done');
    // Two open capture steps: none is guessed.
    for (const title of ['Foto 1', 'Foto 2']) {
      await env.db.query(
        `insert into buddy_steps (learner_id, kind, title, state, created_at)
         values ($1, 'capture', $2, 'planned', $3)`,
        [l.learnerId, title, env.clock.now()],
      );
    }
    const loose = await sendSheet(env, l, {
      purpose: 'study',
      items: [item({ prompt: 'Kürze 2/6.', answer: '1/3' })],
    });
    expect(loose.goal_id).toBeNull();
  });

  it('M-38: a university learner gets topics pitched at the university, not refused as "not school"', async () => {
    await env.db.query(`update learners set level = 'university' where id = $1`, [l.learnerId]);
    env.llm.script('explain', (req) => {
      const text = ScriptedGateway.textOf(req);
      expect(text).toContain('level university');
      expect(req.system).not.toContain('not about school learning');
      expect(req.system).toContain('university student');
      return {
        usable: true,
        title: 'Fehler 1. und 2. Art',
        subject: { name: 'Statistik', kind: 'math' },
        items: [
          item({
            kind: 'multiple_choice',
            prompt: 'H0 ist wahr, wird aber verworfen. Welcher Fehler?',
            answer: '1. Art',
            choices: ['1. Art', '2. Art', 'kein Fehler'],
            correct_choice: 0,
            topic: 'Hypothesentest',
          }),
        ],
      };
    });
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Fehler 1. und 2. Art beim Hypothesentest',
    });
    expect(res.status).toBe(201);
    await env.flushBackground();
  });
});
