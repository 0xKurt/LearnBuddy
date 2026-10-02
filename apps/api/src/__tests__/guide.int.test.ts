// "Zeig's mir Schritt für Schritt" (issue #298, docs/architecture.md §Practice): Buddy shows a
// step, she writes the next, code checks it, Buddy goes on — in the conversation of the
// question, without a new screen. On a real Postgres: offering, starting, a step that holds, a
// step that does not, her own way, the end, leaving it, a plan that does not hold, an outage,
// a duplicate tap, the wrong mode, another learner's session — and a text with key points.
// requires live verification in Claude Code session (needs a running Postgres; scripted model)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LlmError } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const item = (over: Record<string, unknown>) => ({
  kind: 'numeric',
  prompt: 'Löse: $2x + 3 = 11$',
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
  ...over,
});

const say = (line: string, s: string, hint = '') => ({ line, say: s, hint });

/** A plan that holds: four lines, the last one the key. */
const PLAN = {
  lines: [
    say('2x + 3 = 11', 'Das ist die Gleichung aus der Aufgabe.'),
    say('2x = 11 - 3', 'Die 3 kommt auf die andere Seite.', 'Bring die 3 auf die rechte Seite.'),
    say('2x = 8', 'Rechts ausgerechnet.', 'Rechne die rechte Seite aus.'),
    say('x = 4', 'Durch 2 geteilt.', 'Teile beide Seiten durch 2.'),
  ],
  figure: null,
};

async function start(
  env: TestEnv,
  l: Learner,
  items: Record<string, unknown>[],
  kind: 'practice' | 'help' | 'test' = 'practice',
): Promise<SessionView> {
  env.llm.script('explain', {
    json: { usable: true, title: 'Gleichungen', subject: { name: 'Mathe', kind: 'math' }, items },
  });
  const res = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: randomUUID(),
    kind,
    text: 'Gleichungen',
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

const guide = (l: Learner, s: SessionView, itemId: string, clientTurnId = randomUUID()) =>
  l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/guide`, {
    client_turn_id: clientTurnId,
    item_id: itemId,
  });

const stop = (l: Learner, s: SessionView, itemId: string) =>
  l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/guide/stop`, {
    client_turn_id: randomUUID(),
    item_id: itemId,
  });

/** The tutor's reply to the second wrong try (the first one is answered by the rules). */
const secondMiss = {
  json: {
    intent: 'answer',
    verdict: 'incorrect',
    reply: 'Hast du die 3 schon auf die andere Seite gebracht?',
    gave_hint: false,
    revealed_answer: false,
  },
};

/** Two wrong tries: the offer is there. */
async function twoMisses(env: TestEnv, l: Learner, s: SessionView, itemId: string) {
  await answer(l, s, itemId, '5');
  env.llm.script('tutor', secondMiss);
  const r = await answer(l, s, itemId, '6');
  expect(r.body).toMatchObject({ verdict: 'incorrect' });
  return r.body.session.items.find((i) => i.item.id === itemId)!;
}

describe.skipIf(!dbReady)('guided worked example (issue #298)', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T14:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2011-01-10' });
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

  it('is offered after the second wrong try, and not before', async () => {
    const s = await start(env, l, [item({})]);
    const id = s.items[0]!.item.id;
    expect(s.items[0]!.guide_offered).toBe(false);
    const first = await answer(l, s, id, '5');
    expect(first.body.session.items[0]!.guide_offered).toBe(false);
    // Tapping before the offer is refused.
    expect((await guide(l, s, id)).body).toMatchObject({
      error: { details: { reason: 'try_first' } },
    });
    env.llm.script('tutor', secondMiss);
    const second = await answer(l, s, id, '6');
    expect(second.body.session.items[0]).toMatchObject({ guide_offered: true, guide: null });
  });

  it('shows a step, checks hers, goes on, and closes as solved with help', async () => {
    const s = await start(env, l, [item({})]);
    const id = s.items[0]!.item.id;
    await twoMisses(env, l, s, id);

    env.llm.script('guide', (req) => {
      const text = ScriptedGateway.textOf(req);
      expect(text).toContain('QUESTION: Löse: $2x + 3 = 11$');
      expect(text).toContain('SOLUTION: 4');
      return PLAN;
    });
    const opened = await guide(l, s, id);
    expect(opened.body).toMatchObject({ verdict: 'not_an_attempt' });
    expect(opened.status).toBe(200);
    expect(opened.body.verdict).toBe('not_an_attempt');
    expect(opened.body.reply.text).toContain('$2x + 3 = 11$');
    expect(opened.body.reply.text).toContain('$2x = 11 - 3$');
    // Buddy did not show the result.
    expect(opened.body.reply.text).not.toContain('x = 4');
    const during = opened.body.session.items[0]!;
    expect(during).toMatchObject({
      guide: { kind: 'steps' },
      guide_offered: false,
      // The guide is the help while it runs; "Tipp" would talk past her step.
      hint_available: false,
      status: 'open',
      attempts: 2,
      hints_used: 1,
    });

    // Her step follows: Buddy does not show the last line, it is hers.
    const step = await answer(l, s, id, '2x = 8');
    expect(step.body.verdict).toBe('not_an_attempt');
    expect(step.body.reply.text).toContain('Stimmt');
    expect(step.body.session.items[0]).toMatchObject({ status: 'open', attempts: 2 });

    // Her last line arrives at the key: solved, with help — never "first try".
    const done = await answer(l, s, id, 'x = 4');
    expect(done.body.verdict).toBe('correct');
    expect(done.body.reply.text).toContain('$x = 4$');
    expect(done.body.session.items[0]).toMatchObject({ status: 'correct', guide: null });
    const si = await env.db.one<{ first_try_correct: boolean }>(
      `select first_try_correct from session_items where item_id = $1`,
      [id],
    );
    expect(si.first_try_correct).toBe(false);
    const g = await env.db.one<{ status: string }>(
      `select status from guided_examples where item_id = $1`,
      [id],
    );
    expect(g.status).toBe('done');
    // Exactly one model call for the plan; every step was checked by code.
    expect(env.llm.callsFor('guide')).toHaveLength(1);
  });

  it('counts a step that does not follow without counting an attempt, then shows it', async () => {
    const s = await start(env, l, [item({})]);
    const id = s.items[0]!.item.id;
    await twoMisses(env, l, s, id);
    env.llm.script('guide', { json: PLAN });
    await guide(l, s, id);

    const miss = await answer(l, s, id, '2x = 14');
    expect(miss.body.verdict).toBe('not_an_attempt');
    expect(miss.body.reply.text).toContain('Rechne die rechte Seite aus.');
    // Not an attempt: the third-try solution does not come, the question stays open.
    expect(miss.body.session.items[0]).toMatchObject({ status: 'open', attempts: 2 });

    const shown = await answer(l, s, id, '2x = 9');
    expect(shown.body.reply.text).toContain('$2x = 8$');
    expect(shown.body.session.items[0]!.guide).toEqual({ kind: 'steps' });
    const row = await env.db.one<{ at: number; misses: number; prev: string }>(
      `select at, misses, prev from guided_examples where item_id = $1`,
      [id],
    );
    expect(row).toEqual({ at: 3, misses: 0, prev: '2x = 8' });

    // A line it cannot read is never called wrong and never counted.
    const unread = await answer(l, s, id, 'weiß nicht');
    expect(unread.body.reply.text).toContain('nicht nachrechnen');
    const same = await env.db.one<{ misses: number }>(
      `select misses from guided_examples where item_id = $1`,
      [id],
    );
    expect(same.misses).toBe(0);
  });

  it('closes as shown when the last step is missed twice', async () => {
    const s = await start(env, l, [item({})]);
    const id = s.items[0]!.item.id;
    await twoMisses(env, l, s, id);
    env.llm.script('guide', { json: PLAN });
    await guide(l, s, id);
    await answer(l, s, id, '2x = 8');
    await answer(l, s, id, 'x = 3');
    const shown = await answer(l, s, id, 'x = 5');
    expect(shown.body.session.items[0]).toMatchObject({ status: 'revealed', answer: '4' });
    expect(shown.body.reply.text).toContain('$x = 4$');
  });

  it('accepts her own way when it follows', async () => {
    const s = await start(env, l, [item({})]);
    const id = s.items[0]!.item.id;
    await twoMisses(env, l, s, id);
    env.llm.script('guide', { json: PLAN });
    await guide(l, s, id);
    // Not the plan's line 3, but equivalent: hers, and the guide goes on from it.
    const own = await answer(l, s, id, 'x = 8/2');
    expect(own.body.reply.text).toContain('eigener Weg');
    const done = await answer(l, s, id, 'x = 4');
    expect(done.body.verdict).toBe('correct');
  });

  it('can be left at any step; the question is hers again, as open as before', async () => {
    const s = await start(env, l, [item({})]);
    const id = s.items[0]!.item.id;
    await twoMisses(env, l, s, id);
    env.llm.script('guide', { json: PLAN });
    await guide(l, s, id);
    const left = await stop(l, s, id);
    expect(left.status).toBe(200);
    expect(left.body.reply.text).toContain('probier');
    expect(left.body.session.items[0]).toMatchObject({
      status: 'open',
      guide: null,
      // Once per question: the offer does not come back.
      guide_offered: false,
      hint_available: true,
    });
    // Leaving twice: nothing runs any more.
    expect((await stop(l, s, id)).body).toMatchObject({
      error: { details: { reason: 'guide_not_running' } },
    });
    // Her next answer is an answer again, judged as always.
    const right = await answer(l, s, id, '4');
    expect(right.body.verdict).toBe('correct');
  });

  it('throws a plan away that does not hold — twice — and says so; the offer does not return', async () => {
    const s = await start(env, l, [item({})]);
    const id = s.items[0]!.item.id;
    await twoMisses(env, l, s, id);
    const broken = {
      lines: [
        say('2x + 3 = 11', 'Gegeben.'),
        say('2x = 14', 'Falsch gerechnet.'),
        say('x = 7', 'Geteilt.'),
      ],
      figure: null,
    };
    env.llm.script('guide', { json: broken }, (req) => {
      // The second try is told why the first was thrown away.
      expect(ScriptedGateway.textOf(req)).toContain('line 2 is not equivalent to the line before');
      return broken;
    });
    const r = await guide(l, s, id);
    expect(r.status).toBe(200);
    expect(r.body.reply.text).toContain('nicht Schritt für Schritt');
    expect(r.body.session.items[0]).toMatchObject({
      guide: null,
      guide_offered: false,
      hints_used: 0,
    });
    const g = await env.db.one<{ status: string; steps: unknown }>(
      `select status, steps from guided_examples where item_id = $1`,
      [id],
    );
    expect(g).toEqual({ status: 'unavailable', steps: null });
  });

  it('stores nothing when the model is down, so she can tap again', async () => {
    const s = await start(env, l, [item({})]);
    const id = s.items[0]!.item.id;
    await twoMisses(env, l, s, id);
    env.llm.script('guide', { error: new LlmError('unavailable', 'down') });
    const r = await guide(l, s, id);
    expect(r.status).toBe(503);
    const view = (await l.api.get<SessionView>(`/practice/sessions/${s.id}`)).body;
    expect(view.items[0]).toMatchObject({ guide_offered: true, guide: null });
    expect(
      (await env.db.query(`select 1 from guided_examples where item_id = $1`, [id])).length,
    ).toBe(0);
  });

  it('answers a repeated tap with the first result, with one plan', async () => {
    const s = await start(env, l, [item({})]);
    const id = s.items[0]!.item.id;
    await twoMisses(env, l, s, id);
    env.llm.script('guide', { json: PLAN });
    const tap = randomUUID();
    const a = await guide(l, s, id, tap);
    const b = await guide(l, s, id, tap);
    expect(b.status).toBe(200);
    expect(b.body.reply.id).toBe(a.body.reply.id);
    expect(env.llm.callsFor('guide')).toHaveLength(1);
  });

  it('starts when she asks to be shown — the tutor classifies it, no word list', async () => {
    const s = await start(env, l, [item({})]);
    const id = s.items[0]!.item.id;
    await answer(l, s, id, '5');
    env.llm.script('tutor', {
      json: {
        intent: 'show_me',
        verdict: 'not_an_attempt',
        reply: 'Klar, ich zeig es dir.',
        gave_hint: false,
        revealed_answer: false,
      },
    });
    env.llm.script('guide', { json: PLAN });
    const r = await answer(l, s, id, 'kannst du mir zeigen wie das geht?');
    expect(r.status).toBe(200);
    expect(r.body.verdict).toBe('not_an_attempt');
    expect(r.body.reply.text).toContain('$2x = 11 - 3$');
    expect(r.body.session.items[0]).toMatchObject({ guide: { kind: 'steps' }, attempts: 1 });
    // Being shown counts as help.
    expect(r.body.session.items[0]!.hints_used).toBe(1);
  });

  it('is not there in a test, and the guide routes refuse other sessions', async () => {
    const t = await start(
      env,
      l,
      [item({}), item({ prompt: 'Löse: $x + 1 = 3$', answer: '2' })],
      'test',
    );
    const tid = t.items[0]!.item.id;
    expect(t.items[0]!.guide_offered).toBe(false);
    expect((await guide(l, t, tid)).body).toMatchObject({
      error: { details: { reason: 'guide_not_allowed' } },
    });

    const other = await onboard(env, { relation: 'child', name: 'Ben', birthDate: '2011-03-03' });
    const r = await other.api.post(`/practice/sessions/${t.id}/guide`, {
      client_turn_id: randomUUID(),
      item_id: tid,
    });
    expect(r.status).toBe(404);
  });

  it('a text: Buddy writes a key point, hers counts only with a quote from her text', async () => {
    const s = await start(env, l, [
      item({
        kind: 'long',
        prompt: 'Erörtere: Sollen Handys in der Schule erlaubt sein?',
        answer: 'Eine Erörterung mit These, Argumenten und Schluss.',
        topic: 'Erörterung',
      }),
    ]);
    const id = s.items[0]!.item.id;
    env.llm.script('tutor', {
      json: {
        intent: 'answer',
        verdict: 'partially_correct',
        reply: 'Da fehlt noch ein Argument.',
        gave_hint: false,
        revealed_answer: false,
      },
    });
    await answer(l, s, id, 'Handys sind gut.');
    env.llm.script('tutor', {
      json: {
        intent: 'answer',
        verdict: 'partially_correct',
        reply: 'Begründe noch.',
        gave_hint: false,
        revealed_answer: false,
      },
    });
    const two = await answer(l, s, id, 'Handys sind wirklich gut.');
    expect(two.body.session.items[0]!.guide_offered).toBe(true);

    env.llm.script('guide', {
      json: {
        points: [
          {
            name: 'These',
            missing: 'Nenne deine Position.',
            demo: 'Ich finde, Handys sollten in der Schule erlaubt sein.',
          },
          {
            name: 'Argument mit Beispiel',
            missing: 'Begründe mit einem Beispiel.',
            demo: 'Man kann zum Beispiel Vokabeln schnell nachschlagen.',
          },
          {
            name: 'Schluss',
            missing: 'Wäge ab und nenne deine Position.',
            demo: 'Mit klaren Regeln überwiegen für mich die Vorteile.',
          },
        ],
      },
    });
    const opened = await guide(l, s, id);
    expect(opened.body.reply.text).toContain('Ich finde, Handys sollten');
    expect(opened.body.session.items[0]!.guide).toEqual({ kind: 'points' });

    // An invented quote does not count.
    env.llm.script('tutor', { json: { met: true, quote: 'Smartphones fördern die Kreativität' } });
    const invented = await answer(l, s, id, 'Handys helfen, weil man Wörter nachschlagen kann.');
    expect(invented.body.reply.text).toContain('Begründe mit einem Beispiel.');
    // A quote from her text does.
    env.llm.script('tutor', { json: { met: true, quote: 'weil man Wörter nachschlagen kann' } });
    const held = await answer(l, s, id, 'Handys helfen, weil man Wörter nachschlagen kann.');
    expect(held.body.reply.text).toContain('weil man Wörter nachschlagen kann');
    expect(held.body.reply.text).toContain('Schluss');
    env.llm.script('tutor', { json: { met: true, quote: 'überwiegen die Vorteile' } });
    const end = await answer(l, s, id, 'Am Ende überwiegen die Vorteile.');
    // No grade, never "right": the guide is done and the text is still hers to write.
    expect(end.body.verdict).toBe('not_an_attempt');
    expect(end.body.reply.text).toContain('alle Teile');
    expect(end.body.session.items[0]).toMatchObject({ status: 'open', guide: null });
  });

  it('an explanation may come with a figure: drawn as written, or not at all', async () => {
    const s = await start(env, l, [
      item({
        prompt: 'Wie verändert $a$ die Parabel $y = a x^2$?',
        answer: 'Sie wird schmaler',
        kind: 'short',
      }),
    ]);
    const id = s.items[0]!.item.id;
    // Closed by a right answer: "Anders erklären" is for a question whose solution is out.
    expect((await answer(l, s, id, 'Sie wird schmaler')).body.verdict).toBe('correct');
    const parabolas = {
      type: 'function_plot',
      functions: [
        { expr: 'x^2', label: 'a = 1' },
        { expr: '2*x^2', label: 'a = 2' },
      ],
      x_min: -3,
      x_max: 3,
      y_min: -1,
      y_max: 9,
      points: [],
    };
    env.llm.script('reexplain', (req) => {
      // The model is told it may draw, and that only data counts.
      expect(req.system).toContain('figure (optional, usually null)');
      return { explanation: 'Im Bild siehst du: je größer a, desto schmaler.', figure: parabolas };
    });
    const drawn = await l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/reexplain`, {
      client_turn_id: randomUUID(),
      item_id: id,
      way: 'example',
    });
    expect(drawn.body.reply.figure).toEqual(parabolas);

    // One curve the grammar cannot read: the whole figure goes, the words stay.
    env.llm.script('reexplain', {
      json: {
        explanation: 'Je größer a, desto schmaler.',
        figure: {
          ...parabolas,
          functions: [...parabolas.functions, { expr: 'x^^2', label: null }],
        },
      },
    });
    const dropped = await l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/reexplain`, {
      client_turn_id: randomUUID(),
      item_id: id,
      way: 'simpler',
    });
    expect(dropped.status).toBe(200);
    expect(dropped.body.reply).toMatchObject({
      text: 'Je größer a, desto schmaler.',
      figure: null,
    });
    // Stored as checked: what the session view sends is what was drawn.
    const stored = await env.db.query<{ figure: unknown }>(
      `select figure from practice_turns where item_id = $1 and role = 'tutor' and reexplain is not null order by seq`,
      [id],
    );
    expect(stored.map((r) => r.figure)).toEqual([parabolas, null]);
  });
});
