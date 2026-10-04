// „Erklär mal" (issue #236) through the real API on a real Postgres: she explains, the server
// checks key point by key point, and asks ONE follow-up about a missing point.
//
// What is asserted, each against the database and the model calls:
//   - the generator's key points are held to their rules before a question exists (Regel 0);
//   - one tutor call per answer; a point counts only with a quote the server finds in HER words,
//     and its exact part (a number, a formula) only when it stands there — an invented quote buys
//     nothing;
//   - 2 of 3 points → exactly one follow-up, the prepared one of the third point;
//   - her answer to the follow-up adds to the explanation; a confirmed point stays confirmed
//     (migration 0088) and the model is not asked about it again;
//   - no grade, no count, no solution — also not after the third try, which closes with a line;
//   - failure paths: the same answer twice, a question already closed, a model outage, another
//     learner's ids.
// docs/architecture.md §Practice („Erklär mal").
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type {
  AnswerResponse,
  SendMessageResponse,
  SessionView,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LlmError } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const point = (name: string, statement: string, ask: string, exact: string[] = []) => ({
  name,
  point: statement,
  ask,
  exact,
});

const PHOTO = {
  prompt: 'Erklär mir, wie die Fotosynthese funktioniert.',
  topic: 'Fotosynthese',
  difficulty: 2,
  points: [
    point('Licht', 'Licht liefert die Energie', 'Woher kommt die Energie dafür?'),
    point(
      'Ausgangsstoffe',
      'aus Kohlendioxid und Wasser entstehen Zucker und Sauerstoff',
      'Was braucht die Pflanze dafür, und was entsteht?',
    ),
    point('Ort', 'findet in den Chloroplasten statt', 'Und wo in der Zelle passiert das?'),
  ],
};

const SET = (drafts: unknown[]) => ({
  json: {
    usable: true,
    title: 'Fotosynthese',
    subject: { name: 'Biologie', kind: 'biology' },
    teach_back: drafts,
  },
});

const FIRST =
  'Die Pflanze nimmt Licht als Energie. Aus Wasser und Kohlendioxid macht sie Zucker und Sauerstoff.';

/** What the tutor says: only about the points it was asked about. */
const judges = (elements: Array<{ element: string; met: boolean; quote?: string }>) => ({
  json: {
    intent: 'answer',
    verdict: 'partially_correct',
    reply: 'Gut erklärt.',
    gave_hint: false,
    revealed_answer: false,
    elements: elements.map((e) => ({ quote: '', verbs: [], ...e })),
  },
});

describe.skipIf(!dbReady)('„Erklär mal": an explanation checked point by point (#236)', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-04T09:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2012-02-10' });
  });
  afterEach(() => env.closeChecked());

  async function start(drafts: unknown[] = [PHOTO], extra: Record<string, unknown> = {}) {
    env.llm.script('explain', SET(drafts));
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'teach_back',
      text: 'Frag mich zur Fotosynthese ab',
      ...extra,
    });
    await env.flushBackground();
    return res;
  }

  const answer = (s: SessionView, text: string, turn = randomUUID(), who: Learner = l) =>
    who.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: turn,
      item_id: s.items[0]!.item.id,
      text,
    });

  const explained = (s: SessionView) =>
    env.db
      .one<{
        explained: string[];
      }>(`select explained from session_items where session_id = $1 and item_id = $2`, [
        s.id,
        s.items[0]!.item.id,
      ])
      .then((r) => r.explained);

  const reviews = (s: SessionView) =>
    env.db
      .one<{
        n: number;
      }>(`select count(*)::int as n from item_states where item_id = $1`, [s.items[0]!.item.id])
      .then((r) => r.n);

  it('keeps only questions whose key points hold, and never shows a point', async () => {
    const res = await start([
      PHOTO,
      // The question already states its point.
      {
        ...PHOTO,
        prompt: 'Erklär, warum Licht liefert die Energie bei der Fotosynthese.',
        points: PHOTO.points,
      },
      // Two points that are one.
      {
        ...PHOTO,
        prompt: 'Erklär die Atmung.',
        points: [PHOTO.points[0], PHOTO.points[0], PHOTO.points[2]],
      },
      // A follow-up that is no question.
      {
        ...PHOTO,
        prompt: 'Erklär den Wasserkreislauf.',
        points: [PHOTO.points[0], PHOTO.points[1], point('Ort', 'im Meer', 'Sag mir den Ort.')],
      },
      // A follow-up that hands over its exact term.
      {
        ...PHOTO,
        prompt: 'Erklär, wann Wasser siedet.',
        points: [
          PHOTO.points[0],
          PHOTO.points[1],
          point('Temperatur', 'bei 100 Grad', 'Siedet es bei 100 Grad?', ['100']),
        ],
      },
      // Too few points: the schema itself refuses it.
      { ...PHOTO, prompt: 'Erklär den Mond.', points: PHOTO.points.slice(0, 2) },
    ]);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.mode).toBe('practice');
    expect(res.body.items).toHaveLength(1);
    const view = res.body.items[0]!;
    expect(view.item.kind).toBe('long');
    expect(view.item.prompt).toBe(PHOTO.prompt);
    // Nothing of the points reaches the screen while it is open — not even as "the solution".
    expect(view.answer).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain('Chloroplasten');
    // The follow-ups are its prepared hints, in order; no hint call to the model.
    const row = await env.db.one<{ hints: string[]; worked_solution: string | null }>(
      `select hints, worked_solution from items where id = $1`,
      [view.item.id],
    );
    expect(row.hints).toEqual(PHOTO.points.map((p) => p.ask));
    expect(row.worked_solution).toBeNull();
    expect(env.llm.callsFor('hints')).toHaveLength(0);
  });

  it('2 of 3 points: ✓ for each, and ONE follow-up on the third, from one model call', async () => {
    const s = (await start()).body;
    env.llm.script(
      'tutor',
      judges([
        { element: 'r1', met: true, quote: 'Licht als Energie' },
        { element: 'r2', met: true, quote: 'Aus Wasser und Kohlendioxid macht sie Zucker' },
        { element: 'r3', met: false },
      ]),
    );
    const res = await answer(s, FIRST);
    expect(env.llm.callsFor('tutor')).toHaveLength(1);
    const reply = res.body.reply.text.replaceAll('\u00a0', ' ');
    expect(reply).toContain('✓ Licht');
    expect(reply).toContain('✓ Ausgangsstoffe');
    expect(reply).toContain('Ort fehlt noch');
    // Exactly one follow-up, the third point's prepared one; none of the others.
    expect(reply).toContain('Und wo in der Zelle passiert das?');
    expect(reply).not.toContain('Woher kommt die Energie');
    expect(reply).not.toContain('Chloroplast');
    // No grade, no count, not the model's own sentence.
    expect(reply).not.toMatch(/\d\s*(von|\/)\s*\d/);
    expect(reply).not.toContain('Gut erklärt');
    expect(res.body.verdict).toBe('partially_correct');
    expect(await explained(s)).toEqual(['r1', 'r2']);
    // The model saw the points to judge, never was asked to grade.
    const seen = ScriptedGateway.textOf(env.llm.callsFor('tutor')[0]!);
    expect(seen).toContain('key point: "findet in den Chloroplasten statt"');
    expect(await reviews(s)).toBe(0);
  });

  it('her answer to the follow-up completes the explanation; confirmed points are not asked again', async () => {
    const s = (await start()).body;
    env.llm.script(
      'tutor',
      judges([
        { element: 'r1', met: true, quote: 'Licht als Energie' },
        { element: 'r2', met: true, quote: 'Aus Wasser und Kohlendioxid macht sie Zucker' },
        { element: 'r3', met: false },
      ]),
    );
    await answer(s, FIRST);
    env.llm.script('tutor', judges([{ element: 'r3', met: true, quote: 'in den Chloroplasten' }]));
    const res = await answer(s, 'Das passiert in den Chloroplasten.');
    const seen = ScriptedGateway.textOf(env.llm.callsFor('tutor')[1]!);
    expect(seen).toContain('r3 "Ort"');
    expect(seen).not.toContain('r1 "Licht"');
    expect(seen).not.toContain('r2 "Ausgangsstoffe"');
    expect(res.body.reply.text.replaceAll('\u00a0', ' ')).toContain('✓ Licht');
    expect(res.body.reply.text.replaceAll('\u00a0', ' ')).toContain('✓ Ort');
    expect(res.body.reply.text.replaceAll('\u00a0', ' ')).toContain('Alles drin');
    expect(res.body.verdict).toBe('correct');
    expect(await explained(s)).toEqual(['r1', 'r2', 'r3']);
    // Complete: the question closes and feeds spaced repetition like any right answer.
    const after = (await l.api.get<SessionView>(`/practice/sessions/${s.id}`)).body;
    expect(after.items[0]!.status).toBe('correct');
    expect(await reviews(s)).toBe(1);
  });

  it('an invented quote buys nothing, and neither does a point without its exact term', async () => {
    const water = {
      prompt: 'Erklär mir, was beim Sieden von Wasser passiert.',
      topic: 'Aggregatzustände',
      difficulty: 2,
      points: [
        point('Temperatur', 'Wasser siedet bei 100 Grad Celsius', 'Bei welcher Temperatur?', [
          '100',
        ]),
        point('Zustand', 'es wird gasförmig', 'Was wird aus dem Wasser?'),
        point('Teilchen', 'die Teilchen bewegen sich schneller', 'Was machen die Teilchen?'),
      ],
    };
    const s = (await start([water])).body;
    env.llm.script(
      'tutor',
      judges([
        // The words are hers, but the number is not in what she said.
        { element: 'r1', met: true, quote: 'wenn es sehr heiß ist' },
        // Words she never said.
        { element: 'r2', met: true, quote: 'es geht in die Gasphase über' },
        { element: 'r3', met: true, quote: 'die Teilchen werden schneller' },
      ]),
    );
    const res = await answer(s, 'Wenn es sehr heiß ist, die Teilchen werden schneller.');
    const reply = res.body.reply.text.replaceAll('\u00a0', ' ');
    expect(reply).toContain('Temperatur fehlt noch');
    expect(reply).toContain('Zustand fehlt noch');
    expect(reply).toContain('✓ Teilchen');
    expect(reply).toContain('Bei welcher Temperatur?');
    expect(await explained(s)).toEqual(['r3']);
  });

  it('the third try closes with a line — no solution, no review', async () => {
    const s = (await start()).body;
    env.llm.script(
      'tutor',
      judges([
        { element: 'r1', met: true, quote: 'Licht als Energie' },
        { element: 'r2', met: false },
        { element: 'r3', met: false },
      ]),
    );
    await answer(s, 'Die Pflanze nimmt Licht als Energie.');
    env.llm.script(
      'tutor',
      judges([
        { element: 'r2', met: false },
        { element: 'r3', met: false },
      ]),
    );
    const second = await answer(s, 'Weiß ich nicht genau.');
    expect(second.body.reply.text.replaceAll('\u00a0', ' ')).toContain(
      'Was braucht die Pflanze dafür',
    );
    env.llm.script(
      'tutor',
      judges([
        { element: 'r2', met: false },
        { element: 'r3', met: false },
      ]),
    );
    const third = await answer(s, 'Irgendwas mit Erde.');
    const reply = third.body.reply.text.replaceAll('\u00a0', ' ');
    expect(reply).toContain('✓ Licht');
    expect(reply).toContain('beim nächsten Mal');
    expect(reply).not.toContain('?');
    expect(reply).not.toContain('Lösung');
    expect(reply).not.toContain('Chloroplast');
    const after = (await l.api.get<SessionView>(`/practice/sessions/${s.id}`)).body;
    expect(after.items[0]!.status).toBe('revealed');
    expect(after.items[0]!.answer).toBeNull();
    expect(await reviews(s)).toBe(0);
  });

  it('the same answer twice is one answer; a closed question is a conflict', async () => {
    const s = (await start()).body;
    env.llm.script(
      'tutor',
      judges([
        { element: 'r1', met: true, quote: 'Licht als Energie' },
        { element: 'r2', met: true, quote: 'Aus Wasser und Kohlendioxid macht sie Zucker' },
        { element: 'r3', met: true, quote: 'Sauerstoff' },
      ]),
    );
    const turn = randomUUID();
    const one = await answer(s, FIRST, turn);
    const two = await answer(s, FIRST, turn);
    expect(two.body.reply).toEqual(one.body.reply);
    expect(env.llm.callsFor('tutor')).toHaveLength(1);
    // Whether a quote of hers states the point is the one thing the model judges (the quote
    // itself is checked by code); all three held, so the question is complete and closed.
    expect(one.body.verdict).toBe('correct');
    const late = await answer(s, 'Und in den Chloroplasten.');
    expect(late.status).toBe(409);
    expect(await explained(s)).toEqual(['r1', 'r2', 'r3']);
  });

  it('a model outage measures nothing and confirms nothing', async () => {
    const s = (await start()).body;
    env.llm.script('tutor', { error: new LlmError('unavailable', 'down') });
    const res = await answer(s, FIRST);
    expect(res.status).toBe(200);
    expect(res.body.verdict).toBeNull();
    expect(res.body.reply.text.replaceAll('\u00a0', ' ')).not.toContain('✓');
    expect(res.body.reply.text.replaceAll('\u00a0', ' ')).not.toContain('fehlt noch');
    expect(await explained(s)).toEqual([]);
    const after = (await l.api.get<SessionView>(`/practice/sessions/${s.id}`)).body;
    expect(after.items[0]!.status).toBe('open');
    expect(after.items[0]!.attempts).toBe(0);
  });

  it('another learner’s session and sheet are a 404', async () => {
    const s = (await start()).body;
    const sam = await onboard(env, { name: 'Sam' });
    expect((await answer(s, FIRST, randomUUID(), sam)).status).toBe(404);
    const sheet = await env.db.one<{ id: string }>(
      `insert into materials (learner_id, client_request_id, status, photo_count, extracted_text, created_at)
       values ($1, gen_random_uuid(), 'ready', 1, 'Fotosynthese', $2) returning id`,
      [l.learnerId, env.clock.now()],
    );
    const stolen = await sam.api.post('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'teach_back',
      text: 'Fotosynthese',
      material_id: sheet.id,
    });
    expect(stolen.status).toBe(404);
  });

  it('comes from Buddy’s offer on her sheet, and its exact terms must stand on it', async () => {
    await env.db.query(
      `insert into materials (learner_id, client_request_id, status, photo_count, title, extracted_text, created_at)
       values ($1, gen_random_uuid(), 'ready', 1, 'Bio-Blatt', $2, $3)`,
      [
        l.learnerId,
        'Fotosynthese: Licht, Wasser und CO2 werden in den Chloroplasten zu Glucose und O2.',
        env.clock.now(),
      ],
    );
    env.llm.script('buddy_turn', {
      json: {
        lookups: [],
        concern: false,
        also_asked: false,
        actions: [
          { tool: 'offer_learning', args: { kind: 'teach_back', text: 'Bio-Blatt', sheet: 'sh1' } },
        ],
        reply: 'Gern – ich frag dich zu deinem Blatt ab.',
        options: null,
        asks_permission: false,
      },
    });
    const onSheet = {
      ...PHOTO,
      points: [
        PHOTO.points[0],
        point('Ausgangsstoffe', 'Wasser und CO2', 'Was braucht die Pflanze?', ['CO2']),
        PHOTO.points[2],
      ],
    };
    const offSheet = {
      ...PHOTO,
      prompt: 'Erklär mir die Zellatmung.',
      points: [
        PHOTO.points[0],
        point('Energie', 'es entsteht ATP', 'Was entsteht dabei?', ['ATP']),
        PHOTO.points[2],
      ],
    };
    env.llm.script('explain', SET([onSheet, offSheet]));
    const said = await l.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: randomUUID(),
      text: 'Frag mich zu meinem Bio-Blatt ab',
    });
    expect(said.status).toBe(200);
    const offer = said.body.home.thread
      .flatMap((m) => m.actions)
      .find((a) => a.summary.tool === 'offer_learning');
    expect(offer?.summary).toMatchObject({ kind: 'teach_back', startable: true });
    const materialId = (offer!.summary as { material_id: string | null }).material_id;
    expect(materialId).not.toBeNull();
    await env.flushBackground();
    const tap = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: offer!.id,
      kind: 'teach_back',
      text: 'Bio-Blatt',
      material_id: materialId,
    });
    expect(tap.status).toBe(201);
    // ATP is not on her sheet: that question is not asked.
    expect(tap.body.items.map((i) => i.item.prompt)).toEqual([PHOTO.prompt]);
    const sent = JSON.stringify(env.llm.callsFor('explain')[0]);
    expect(sent).toContain('SHEET TEXT (her photographed sheet');
    expect(env.llm.callsFor('explain')).toHaveLength(1);
  });
});
