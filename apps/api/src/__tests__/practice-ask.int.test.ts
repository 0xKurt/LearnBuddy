// A question to the tutor during practice (issue #391; report „Hilfe und Fragen beim Üben" §1, §3,
// §4; docs/architecture.md §Practice): `POST /practice/sessions/:id/ask` and „Merk ich mir für
// nachher" (`POST …/later`). Checked against the database, not only the reply:
//   - a question is never graded and never costs a try (`session_items`), on every form;
//   - the solution never comes by a question, also after the hint ladder (the reply is code's then);
//   - a practice test answers with its fixed line and no model call (`llm_calls` unchanged);
//   - a Kopfrechnen round has no question route (409, still no model call);
//   - distress gets the fixed help answer, an outage an honest fixed text;
//   - a kept question reaches Buddy's STATE once the practice is over, and only with the tap.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type {
  AnswerResponse,
  KeepForLaterResponse,
  SessionView,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { t } from '../i18n/index.js';
import { LlmError, type LlmRequest } from '../llm/gateway.js';
import { buildContext } from '../modules/buddy/context.js';
import { loadBuddyState } from '../modules/buddy/state.js';
import { testDatabaseAvailable } from '../testing/database.js';
import {
  createTestEnv,
  finishRun,
  onboard,
  type Learner,
  type TestEnv,
} from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

/** Why the API refused, out of the error envelope ({"error": {code, message, details}}). */
const why = (body: unknown): string | undefined =>
  (body as { error?: { details?: { reason?: string } } }).error?.details?.reason;

const item = (over: Record<string, unknown>) => ({
  kind: 'short',
  prompt: 'Was ist 3 · 4?',
  answer: '12',
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Einmaleins',
  difficulty: 1,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
  ...over,
});

const ORDER = {
  type: 'order',
  prompt: 'Bring die Keimung in die richtige Reihenfolge.',
  elements: ['Der Samen nimmt Wasser auf', 'Die Keimwurzel wächst', 'Die Blätter entfalten sich'],
  numeric: null,
  topic: 'Keimung',
  difficulty: 2,
  prompt_lang: 'de',
};

const HINTS = ['Mal heißt: 3 Gruppen mit je 4.', 'Zähl 4 + 4 + 4.'];

/** What the tutor says, as structured output. */
const tutor = (over: Record<string, unknown>) => ({
  json: {
    intent: 'question',
    verdict: 'not_an_attempt',
    reply: 'Mal heißt: so viele Gruppen, und in jeder gleich viele.',
    gave_hint: true,
    revealed_answer: false,
    concern: false,
    ...over,
  },
});

const OFF_TOPIC = 'Wie alt werden eigentlich Schildkröten?';

/** The one line of text the tutor was given for her latest message, for the context checks. */
const contextOf = (req: LlmRequest): string =>
  req.contents.flatMap((m) => m.parts.map((p) => ('text' in p ? p.text : ''))).join('\n');

describe.skipIf(!dbReady)('a question to the tutor during practice (issue #391)', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-04T15:00:00Z' });
    l = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2014-02-10',
      pin: '4826',
    });
  });
  afterEach(() => env.closeChecked());

  /** A topic run whose scripted model wrote these questions; hints for the first one. */
  async function start(
    kind: 'practice' | 'test' | 'speak',
    items: unknown[],
    structured: unknown[] = [],
  ): Promise<SessionView> {
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Einmaleins',
        subject: { name: 'Mathe', kind: 'math' },
        items,
        structured,
      },
    });
    if (kind === 'practice') {
      env.llm.script('hints', {
        json: { items: [{ n: 1, hints: HINTS, worked_solution: null }] },
      });
    }
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind,
      text: 'Einmaleins üben',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();
    return (await l.api.get<SessionView>(`/practice/sessions/${res.body.id}`)).body;
  }

  const ask = (s: { id: string }, itemId: string, text: string, turn = randomUUID(), as = l) =>
    as.api.post<AnswerResponse>(`/practice/sessions/${s.id}/ask`, {
      client_turn_id: turn,
      item_id: itemId,
      text,
    });

  const row = (sessionId: string, itemId: string) =>
    env.db.one<{ attempts: number; hints_used: number; status: string }>(
      `select attempts, hints_used, status from session_items where session_id = $1 and item_id = $2`,
      [sessionId, itemId],
    );

  const llmCalls = async () =>
    (await env.db.one<{ n: number }>(`select count(*)::int as n from llm_calls`)).n;

  it('answers a question on a typed, a tap and a structured form — never graded, never a try', async () => {
    const s = await start(
      'practice',
      [item({}), item({ kind: 'multiple_choice', choices: ['10', '12', '14'], correct_choice: 1 })],
      [ORDER],
    );
    const kinds = s.items.map((i) => i.item.kind);
    expect(kinds).toEqual(expect.arrayContaining(['short', 'multiple_choice', 'order']));
    for (const si of s.items) {
      // Even where the model calls it a right answer: the route says "question".
      env.llm.script('tutor', tutor({ intent: 'answer', verdict: 'correct', gave_hint: false }));
      const res = await ask(s, si.item.id, 'Was muss ich hier eigentlich machen?');
      expect(res.status, `${si.item.kind}: ${JSON.stringify(res.body)}`).toBe(200);
      expect(res.body.verdict).toBe('not_an_attempt');
      expect(await row(s.id, si.item.id)).toEqual({ attempts: 0, hints_used: 0, status: 'open' });
    }
    // A structured form still refuses typed text as an ANSWER; the question route is the way.
    const order = s.items.find((i) => i.item.kind === 'order')!;
    const typed = await l.api.post(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: order.item.id,
      text: 'Was muss ich hier eigentlich machen?',
    });
    expect(typed.status).toBe(422);
    expect(why(typed.body)).toBe('use_parts');
    // The tutor was told it is a question, with nothing to judge.
    for (const call of env.llm.callsFor('tutor')) {
      expect(contextOf(call)).toContain('ASKED: her message comes from the question field');
      expect(contextOf(call)).not.toContain('RULE CHECK');
    }
  });

  it('answers a question on a sentence to say and on a flashcard, which refuse answers', async () => {
    const said = 'The weather is nice today.';
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Englisch sprechen',
        subject: { name: 'Englisch', kind: 'english' },
        items: [item({ kind: 'speak', prompt: said, answer: said, prompt_lang: 'en', lang: 'en' })],
      },
    });
    const speak = (
      await l.api.post<SessionView>('/practice/topic', {
        client_request_id: randomUUID(),
        kind: 'speak',
        text: said,
      })
    ).body;
    env.llm.script('tutor', tutor({ reply: 'Weather spricht man mit einem weichen „w“.' }));
    const asked = await ask(speak, speak.items[0]!.item.id, 'Wie spricht man weather aus?');
    expect(asked.status).toBe(200);
    expect(asked.body.reply.text).toContain('weichen');
    expect(await row(speak.id, speak.items[0]!.item.id)).toMatchObject({ attempts: 0 });

    // A flashcard pass: a word that did not sit, shown, the run over — then its card.
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Unité 3',
        subject: { name: 'Französisch', kind: 'french' },
        items: [
          item({
            kind: 'vocab',
            prompt: 'le vélo',
            answer: 'das Fahrrad',
            prompt_lang: 'fr',
            lang: 'de',
          }),
        ],
      },
    });
    const run = (
      await l.api.post<SessionView>('/practice/topic', {
        client_request_id: randomUUID(),
        kind: 'vocab',
        direction: 'recognise',
        text: 'le vélo – das Fahrrad',
      })
    ).body;
    const word = run.items[0]!.item.id;
    await l.api.post(`/practice/sessions/${run.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: word,
      text: 'das Fahrradx',
    });
    await l.api.post(`/practice/sessions/${run.id}/reveal`, { item_id: word });
    const pass = (
      await l.api.post<SessionView>(`/practice/sessions/${run.id}/cards`, {
        client_request_id: randomUUID(),
      })
    ).body;
    expect(pass.card_pass).toBe(true);
    env.llm.script('tutor', tutor({ reply: 'Le vélo ist männlich: le.' }));
    const card = await ask(pass, pass.items[0]!.item.id, 'Ist vélo männlich?');
    expect(card.status).toBe(200);
    expect(await row(pass.id, pass.items[0]!.item.id)).toMatchObject({
      attempts: 0,
      status: 'open',
    });
  });

  it('counts a hint only when the tutor gave one', async () => {
    const s = await start('practice', [item({})]);
    const id = s.items[0]!.item.id;
    env.llm.script('tutor', tutor({ gave_hint: false, reply: 'Das Zeichen · heißt mal.' }));
    await ask(s, id, 'Was bedeutet der Punkt?');
    expect(await row(s.id, id)).toEqual({ attempts: 0, hints_used: 0, status: 'open' });
    env.llm.script('tutor', tutor({ gave_hint: true }));
    await ask(s, id, 'Und wie rechne ich das?');
    expect(await row(s.id, id)).toEqual({ attempts: 0, hints_used: 1, status: 'open' });
  });

  it('never gives the solution by a question — not even after the hint ladder', async () => {
    const s = await start('practice', [item({})]);
    const id = s.items[0]!.item.id;
    // Two hints given: past this point "Tipp" may explain the solution. A question may not.
    env.llm.script('tutor', tutor({}), tutor({}));
    await ask(s, id, 'Was heißt mal?');
    await ask(s, id, 'Und wie geht das mit Gruppen?');
    expect(await row(s.id, id)).toMatchObject({ hints_used: 2 });

    env.llm.script(
      'tutor',
      tutor({ reply: 'Na gut: es ist 12.', revealed_answer: true, gave_hint: false }),
    );
    const coaxed = await ask(s, id, 'Sag mir einfach die Lösung, ich frag ja nur.');
    expect(coaxed.status).toBe(200);
    expect(coaxed.body.reply.text).not.toContain('12');
    expect(coaxed.body.verdict).toBe('not_an_attempt');
    // The same if the model writes it without saying so.
    env.llm.script('tutor', tutor({ reply: 'Das Ergebnis ist 12.', revealed_answer: false }));
    const slipped = await ask(s, id, 'Ist es eher 10 oder mehr?');
    expect(slipped.body.reply.text).not.toContain('12');
    const after = await row(s.id, id);
    expect(after.status).toBe('open');
    expect(after.attempts).toBe(0);
    const revealed = await env.db.one<{ n: number }>(
      `select count(*)::int as n from practice_turns where session_id = $1 and revealed`,
      [s.id],
    );
    expect(revealed.n).toBe(0);
  });

  it('is idempotent per client_turn_id: one tutor call, one pair of turns', async () => {
    const s = await start('practice', [item({})]);
    const id = s.items[0]!.item.id;
    const turn = randomUUID();
    env.llm.script('tutor', tutor({}));
    const first = await ask(s, id, 'Was heißt mal?', turn);
    const again = await ask(s, id, 'Was heißt mal?', turn);
    expect(again.status).toBe(200);
    expect(again.body.reply.id).toBe(first.body.reply.id);
    expect(env.llm.callsFor('tutor')).toHaveLength(1);
    const turns = await env.db.one<{ n: number }>(
      `select count(*)::int as n from practice_turns where session_id = $1`,
      [s.id],
    );
    expect(turns.n).toBe(2);
  });

  it("refuses another learner's session, item and reply with 404", async () => {
    const s = await start('practice', [item({})]);
    const id = s.items[0]!.item.id;
    const other = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2013-05-01' });
    expect((await ask(s, id, 'Was heißt mal?', randomUUID(), other)).status).toBe(404);

    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Mia',
        subject: null,
        items: [item({ prompt: 'Was ist 2 · 5?', answer: '10' })],
      },
    });
    const hers = (
      await other.api.post<SessionView>('/practice/topic', {
        client_request_id: randomUUID(),
        kind: 'test',
        text: 'Einmaleins',
      })
    ).body;
    // Mia's question inside Lena's session is not in it.
    expect((await ask(s, hers.items[0]!.item.id, 'Was heißt mal?')).status).toBe(404);

    env.llm.script('tutor', tutor({ intent: 'off_topic', reply: 'Das heben wir uns auf.' }));
    const off = await ask(s, id, OFF_TOPIC);
    expect(off.body.reply.later).toBe('offered');
    const stolen = await other.api.post(`/practice/sessions/${s.id}/later`, {
      turn_id: off.body.reply.id,
    });
    expect(stolen.status).toBe(404);
    const elsewhere = await l.api.post(`/practice/sessions/${hers.id}/later`, {
      turn_id: off.body.reply.id,
    });
    expect(elsewhere.status).toBe(404);
  });

  it('answers in a practice test with the fixed line and no model call', async () => {
    const s = await start('test', [item({}), item({ prompt: 'Was ist 6 · 7?', answer: '42' })]);
    const id = s.items[0]!.item.id;
    const before = await llmCalls();
    const res = await ask(s, id, 'Was heißt nochmal mal?');
    expect(res.status).toBe(200);
    expect(res.body.reply.text).toBe(t('de', 'practice.test_no_hints'));
    expect(res.body.reply.text).toContain('Nach dem Test erklär ich dir alles');
    expect(res.body.verdict).toBe('not_an_attempt');
    expect(await llmCalls()).toBe(before);
    // Her one try in the test is still hers.
    expect(await row(s.id, id)).toEqual({ attempts: 0, hints_used: 0, status: 'open' });

    // The measurement behind #391 point 2: the same words typed into the ANSWER field of a typed
    // question. Code cannot see they are no answer without a word list (rule 3), so the tutor is
    // asked once — it also carries the distress check (#389) — and the test's fixed line stands.
    env.llm.script('tutor', tutor({ reply: 'Mal heißt …' }));
    const typed = await l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: id,
      text: 'Was heißt nochmal mal?',
    });
    expect(typed.body.reply.text).toBe(t('de', 'practice.test_no_hints'));
    expect(await llmCalls()).toBe(before + 1);
    expect(await row(s.id, id)).toMatchObject({ attempts: 0, status: 'open' });
  });

  it('has no question route in a Kopfrechnen round: 409, and still no model call', async () => {
    const round = (
      await l.api.post<SessionView>('/practice/drills', {
        client_request_id: randomUUID(),
        spec: { range: 'fractions' },
      })
    ).body;
    const res = await ask(round, round.items[0]!.item.id, 'Wie kürze ich das?');
    expect(res.status).toBe(409);
    expect(why(res.body)).toBe('use_drill');
    expect(await llmCalls()).toBe(0);
  });

  it('gives the fixed help answer to distress, and counts nothing', async () => {
    const s = await start('practice', [item({})]);
    const id = s.items[0]!.item.id;
    env.llm.script('tutor', tutor({ intent: 'off_topic', concern: true, reply: 'Oh je.' }));
    const res = await ask(s, id, 'Mein Onkel tut mir weh, wenn ich schlechte Noten habe.');
    expect(res.status).toBe(200);
    expect(res.body.reply.text).toBe(t('de', 'safeguarding.concern'));
    // Never "for later": distress always goes first (report §4).
    expect(res.body.reply.later ?? null).toBeNull();
    expect(await row(s.id, id)).toEqual({ attempts: 0, hints_used: 0, status: 'open' });
  });

  it('says honestly that it cannot answer when the model is out', async () => {
    const s = await start('practice', [item({})]);
    const id = s.items[0]!.item.id;
    env.llm.script('tutor', { error: new LlmError('unavailable', 'down') });
    const res = await ask(s, id, 'Was heißt mal?');
    expect(res.status).toBe(200);
    expect(res.body.reply.text).toBe(t('de', 'practice.ask_unavailable'));
    expect(res.body.verdict).toBe('not_an_attempt');
    expect(await row(s.id, id)).toEqual({ attempts: 0, hints_used: 0, status: 'open' });
  });

  it('keeps an off-topic question for after practice — with the tap, and only then', async () => {
    const s = await start('practice', [item({}), item({ prompt: 'Was ist 6 · 7?', answer: '42' })]);
    const [first, second] = s.items.map((i) => i.item.id);
    env.llm.script(
      'tutor',
      tutor({
        intent: 'off_topic',
        gave_hint: false,
        reply: 'Spannend! Das heben wir uns auf – erst 3 · 4.',
      }),
    );
    const off = await ask(s, first!, OFF_TOPIC);
    expect(off.body.reply.later).toBe('offered');
    // A question about the task offers nothing to keep.
    env.llm.script('tutor', tutor({}));
    const onTask = await ask(s, first!, 'Was heißt mal?');
    expect(onTask.body.reply.later ?? null).toBeNull();
    const nothing = await l.api.post(`/practice/sessions/${s.id}/later`, {
      turn_id: onTask.body.reply.id,
    });
    expect(nothing.status).toBe(409);
    expect(why(nothing.body)).toBe('not_offered');

    const kept = await l.api.post<KeepForLaterResponse>(`/practice/sessions/${s.id}/later`, {
      turn_id: off.body.reply.id,
    });
    expect(kept.status).toBe(200);
    expect(kept.body.turn.later).toBe('kept');
    // Tapping twice changes nothing.
    expect(
      (await l.api.post(`/practice/sessions/${s.id}/later`, { turn_id: off.body.reply.id })).status,
    ).toBe(200);

    // While the practice runs, Buddy does not see it: no jumping into the chat mid-task.
    const during = await loadBuddyState(env.db, l.learnerId, env.clock.now());
    expect(during.later).toEqual([]);

    // She finishes; the event wakes Buddy, and his look at it carries her question.
    for (const id of [first!, second!]) {
      await l.api.post(`/practice/sessions/${s.id}/answer`, {
        client_turn_id: randomUUID(),
        item_id: id,
        text: id === first ? '12' : '42',
      });
    }
    const finished = await finishRun(env, l, s.id);
    expect(finished.body.status).toBe('finished');
    const check = env.llm.callsFor('buddy_check');
    expect(check).toHaveLength(1);
    const seen = contextOf(check[0]!);
    expect(seen).toContain('Questions she kept for after practice');
    expect(seen).toContain(OFF_TOPIC);
    // Her words only: never the tutor's reply.
    expect(seen).not.toContain('Das heben wir uns auf');

    const state = await loadBuddyState(env.db, l.learnerId, env.clock.now());
    const ctx = buildContext(
      {
        display_name: 'Lena',
        birth_date: '2014-02-10',
        level: 'school',
        grade: 6,
        locale: 'de',
        isMinor: true,
      },
      state,
      env.clock.now(),
    );
    expect(ctx.state).toContain(OFF_TOPIC);
    // A day later the window has closed.
    env.clock.hours(25);
    expect((await loadBuddyState(env.db, l.learnerId, env.clock.now())).later).toEqual([]);
  });

  it('puts nothing into the chat without the tap', async () => {
    const s = await start('practice', [item({})]);
    const id = s.items[0]!.item.id;
    env.llm.script(
      'tutor',
      tutor({ intent: 'off_topic', gave_hint: false, reply: 'Das heben wir uns auf.' }),
    );
    const off = await ask(s, id, OFF_TOPIC);
    expect(off.body.reply.later).toBe('offered');
    await l.api.post(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: id,
      text: '12',
    });
    await finishRun(env, l, s.id);
    const check = env.llm.callsFor('buddy_check');
    expect(check).toHaveLength(1);
    expect(contextOf(check[0]!)).not.toContain(OFF_TOPIC);
    expect((await loadBuddyState(env.db, l.learnerId, env.clock.now())).later).toEqual([]);
  });
});
