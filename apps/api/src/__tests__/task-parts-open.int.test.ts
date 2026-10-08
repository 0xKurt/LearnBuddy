// Open parts of a task in parts end to end (issue #297, step 2): a „Begründe …" part is a free text
// checked against key points on the one path every key point in the app takes („Erklär mal", #236;
// the quote check of #258) — one tutor call per answer, a point only with her own words the server
// finds in what she wrote, a ✓ per point and ONE prepared follow-up, never a grade. A task mixes
// computed parts (key and Folgefehler decided by code, no model) and open ones; the tutor judges an
// open part on the task's situation. docs/architecture.md §Practice ("Aufgaben mit Teilaufgaben").
// Failure paths: the same turn twice, another learner's part, a model outage while checking, a
// judgement that arrives after she skipped the part (stale), and drafts code refuses to store.
// requires live verification in Claude Code session (needs a running Postgres; scripted model)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LlmError } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';
import {
  RIDE_POINTS,
  RIDE_STEM,
  RIDE_WHY,
  rideTask,
  tariffTask,
} from '../testing/scenarios/taskParts.js';

const dbReady = await testDatabaseAvailable();

const TOPIC = 'Bewegung, Aufgaben wie in der Klassenarbeit';

/** Her first try at the open part: the speed point, not yet the distance. */
const FIRST = 'Er fährt langsamer, er schafft in jeder Stunde weniger Kilometer.';
/** Her answer to the follow-up about the distance. */
const THEN = 'Die Strecke ist bei beiden gleich lang.';

/** What the tutor says: only about the points it was asked about. */
const judges = (elements: Array<{ element: string; met: boolean; quote?: string }>) => ({
  json: {
    intent: 'answer',
    verdict: 'partially_correct',
    reply: 'Schon gut begründet.',
    gave_hint: false,
    revealed_answer: false,
    elements: elements.map((e) => ({ quote: '', verbs: [], ...e })),
  },
});

const SPEED_ONLY = judges([
  { element: 'r1', met: false },
  { element: 'r2', met: true, quote: 'schafft in jeder Stunde weniger Kilometer' },
]);

describe.skipIf(!dbReady)('open parts of a task in parts (#297, step 2)', () => {
  let env: TestEnv;
  let l: Learner;

  async function prepare(
    partTasks: unknown[],
    kind: 'practice' | 'test' = 'practice',
  ): Promise<SessionView> {
    env.llm.script('explain', () => ({
      usable: true,
      title: 'Radtour',
      subject: { name: 'Physik', kind: 'physics' },
      items: [],
      part_tasks: partTasks,
    }));
    // Hints for the computed parts; an open part brings its follow-ups as its hints.
    env.llm.script('hints', () => ({
      items: Array.from({ length: 6 }, (_, i) => ({
        n: i + 1,
        hints: ['Lies die Lage noch einmal genau.'],
        worked_solution: null,
      })),
    }));
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind,
      text: TOPIC,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();
    return (await l.api.get<SessionView>(`/practice/sessions/${res.body.id}`)).body;
  }

  function answer(
    s: SessionView,
    itemId: string,
    text: string,
    turn = randomUUID(),
    who: Learner = l,
  ) {
    return who.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: turn,
      item_id: itemId,
      text,
    });
  }

  const ids = (s: SessionView) => s.items.map((i) => i.item.id) as [string, string, string];
  const flat = (reply: string) => reply.replaceAll(' ', ' ');

  const state = (s: SessionView, itemId: string) =>
    env.db.one<{ status: string; attempts: number; explained: string[]; turns: number }>(
      `select si.status, si.attempts, si.explained,
              (select count(*)::int from practice_turns t
                where t.session_id = si.session_id and t.item_id = si.item_id) as turns
         from session_items si where si.session_id = $1 and si.item_id = $2`,
      [s.id, itemId],
    );

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-08T15:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2010-04-02' });
  });
  // An unexpected or unused model call fails the test: code decides what code must decide.
  afterEach(async () => {
    await env.closeChecked();
  });

  it('stores the open part as a free text with its key points — none of them on screen', async () => {
    const s = await prepare([rideTask()]);
    expect(s.items.map((i) => [i.item.task_part?.part, i.item.kind])).toEqual([
      ['a', 'numeric'],
      ['b', 'numeric'],
      ['c', 'long'],
    ]);
    const c = s.items[2]!;
    expect(c.item.prompt).toBe(RIDE_WHY);
    expect(c.item.task_part).toEqual({
      ref: 'p1',
      part: 'c',
      letters: ['a', 'b', 'c'],
      stem: RIDE_STEM,
    });
    expect(c.answer).toBeNull();
    for (const p of RIDE_POINTS) expect(JSON.stringify(s)).not.toContain(p.point);
    const row = await env.db.one<{
      hints: string[];
      worked_solution: string | null;
      rubric: { elements: { check: { by: string } }[] };
      task_part: { from: string | null };
    }>(`select hints, worked_solution, rubric, task_part from items where id = $1`, [c.item.id]);
    expect(row.hints).toEqual(RIDE_POINTS.map((p) => p.ask));
    expect(row.worked_solution).toBeNull();
    expect(row.rubric.elements.map((e) => e.check.by)).toEqual(['key_point', 'key_point']);
    expect(row.task_part.from).toBeNull();
    // The hint call writes hints for the computed parts only.
    const asked = ScriptedGateway.textOf(env.llm.callsFor('hints')[0]!);
    expect(asked).toContain('Wie weit fährt er');
    expect(asked).not.toContain(RIDE_WHY);
  });

  it('a mixed task: b) follows her wrong a) by code, c) is judged on its points with ONE follow-up', async () => {
    const s = await prepare([rideTask()]);
    const [a, b, c] = ids(s);
    expect((await answer(s, a, '30 km')).body.verdict).toBe('incorrect');
    const followed = await answer(s, b, '2 h');
    expect(followed.body.verdict).toBe('correct');
    expect(followed.body.reply.text).toContain('mit deinem Ergebnis aus a)');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);

    env.llm.script('tutor', SPEED_ONLY);
    const first = await answer(s, c, FIRST);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(env.llm.callsFor('tutor')).toHaveLength(1);
    const reply = flat(first.body.reply.text);
    expect(reply).toContain('Strecke fehlt noch');
    expect(reply).toContain('✓ Tempo');
    // Exactly one follow-up: the prepared one of the missing point; no grade, no count.
    expect(reply).toContain('Was ist bei beiden Fahrten gleich?');
    expect(reply).not.toContain('Wie weit kommt er');
    expect(reply).not.toMatch(/\d\s*(von|\/)\s*\d/);
    expect(reply).not.toContain('Schon gut begründet');
    expect(first.body.verdict).toBe('partially_correct');
    // The tutor judged the part on its situation and its points, and was asked for nothing else.
    const seen = ScriptedGateway.textOf(env.llm.callsFor('tutor')[0]!);
    expect(seen).toContain(`STUDY MATERIAL:\n${RIDE_STEM}`);
    expect(seen).toContain(`key point: "${RIDE_POINTS[0]!.point}"`);
    expect(await state(s, c)).toMatchObject({ status: 'open', attempts: 1, explained: ['r2'] });

    env.llm.script(
      'tutor',
      judges([{ element: 'r1', met: true, quote: 'Die Strecke ist bei beiden gleich' }]),
    );
    const then = await answer(s, c, THEN);
    const again = ScriptedGateway.textOf(env.llm.callsFor('tutor')[1]!);
    expect(again).toContain('r1 "Strecke"');
    expect(again).not.toContain('r2 "Tempo"');
    expect(flat(then.body.reply.text)).toContain('Alles drin');
    expect(then.body.verdict).toBe('correct');
    expect(await state(s, c)).toMatchObject({ status: 'correct', explained: ['r1', 'r2'] });
    // Her a) stays wrong: nothing about c) touched it.
    expect(then.body.session.items[0]!.status).toBe('open');
  });

  it('the same answer twice is one answer and one model call', async () => {
    const s = await prepare([rideTask()]);
    const c = ids(s)[2];
    env.llm.script('tutor', SPEED_ONLY);
    const turn = randomUUID();
    const one = await answer(s, c, FIRST, turn);
    const two = await answer(s, c, FIRST, turn);
    expect(two.body.reply).toEqual(one.body.reply);
    expect(env.llm.callsFor('tutor')).toHaveLength(1);
    expect(await state(s, c)).toMatchObject({ attempts: 1, explained: ['r2'], turns: 2 });
  });

  it('another learner gets 404 for her open part, and no model is asked', async () => {
    const s = await prepare([rideTask()]);
    const tom = await onboard(env, { relation: 'child', name: 'Tom', birthDate: '2010-05-01' });
    const theirs = await answer(s, ids(s)[2], FIRST, randomUUID(), tom);
    expect(theirs.status).toBe(404);
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
    expect(await state(s, ids(s)[2])).toMatchObject({ attempts: 0, turns: 0 });
  });

  it('a model outage while checking measures nothing: no verdict, no try, no point', async () => {
    const s = await prepare([rideTask()]);
    const c = ids(s)[2];
    env.llm.script('tutor', { error: new LlmError('unavailable', 'down') });
    const res = await answer(s, c, FIRST);
    expect(res.status).toBe(200);
    expect(res.body.verdict).toBeNull();
    expect(flat(res.body.reply.text)).not.toContain('✓');
    expect(flat(res.body.reply.text)).not.toContain('fehlt noch');
    expect(await state(s, c)).toMatchObject({ status: 'open', attempts: 0, explained: [] });
  });

  it('stale: a judgement that arrives after she skipped the part is not applied', async () => {
    const s = await prepare([rideTask()]);
    const c = ids(s)[2];
    env.llm.script(
      'tutor',
      judges([
        { element: 'r1', met: false },
        { element: 'r2', met: false },
      ]),
    );
    await answer(s, c, 'Weil er langsamer ist.');
    // While the tutor still judges her second try, she taps "Überspringen" and moves on.
    env.llm.script('tutor', async () => {
      const skipped = await l.api.post(`/practice/sessions/${s.id}/reveal`, { item_id: c });
      expect(skipped.status).toBe(200);
      return SPEED_ONLY.json;
    });
    const late = await answer(s, c, FIRST);
    expect(late.status).toBe(409);
    // Nothing of the late judgement stands: no turn, no try, no point.
    expect(await state(s, c)).toMatchObject({
      status: 'skipped',
      attempts: 1,
      explained: [],
      turns: 2,
    });
  });

  it('drops a task whose open part does not hold, and keeps the others whole', async () => {
    const ride = rideTask();
    const [a, b, c] = ride.parts;
    // A point that needs her b) to be the key: with her own wrong b) she could never make it.
    const hangs = {
      ...ride,
      parts: [
        a,
        b,
        {
          ...c,
          points: [
            RIDE_POINTS[0],
            { ...RIDE_POINTS[1], point: 'er braucht 3 Stunden statt 2,5', exact: ['3 Stunden'] },
          ],
        },
      ],
    };
    const s = await prepare([hangs, tariffTask()]);
    expect(s.items.map((i) => i.item.task_part?.part)).toEqual(['a', 'b', 'c']);
    expect(s.items.every((i) => i.item.kind === 'numeric')).toBe(true);
    const stored = await env.db.one<{ n: number }>(
      `select count(*)::int as n from items where learner_id = $1 and kind = 'long'`,
      [l.learnerId],
    );
    expect(stored.n).toBe(0);
  });

  it('a part whose solution she saw pulls nothing between the parts of its task', async () => {
    // History, Klasse 9: a number, an open part, a number — one topic, two forms.
    const number = (prompt: string, answer: string) => ({
      ...rideTask().parts[0],
      prompt,
      answer,
      unit: null,
    });
    const wall = {
      stem: 'Die Berliner Mauer wurde 1961 gebaut und am 9. November 1989 geöffnet. Tausende Menschen gingen noch in der Nacht nach West-Berlin.',
      topic: 'Deutsche Teilung',
      difficulty: 2,
      prompt_lang: 'de',
      parts: [
        number('Wie viele Jahre stand die Mauer?', '28'),
        {
          ...rideTask().parts[2],
          prompt: 'Erkläre, warum so viele Menschen noch in der Nacht über die Grenze gingen.',
          points: [
            {
              name: 'Reisen',
              point: 'sie durften zum ersten Mal seit Jahrzehnten frei reisen',
              ask: 'Was durften die Menschen vorher nicht?',
              exact: [],
            },
            {
              name: 'Zweifel',
              point: 'niemand wusste, ob die Grenze offen bleiben würde',
              ask: 'Wussten sie, wie lange das so bleibt?',
              exact: [],
            },
          ],
        },
        number('Wie viele Jahre nach dem Mauerbau wurde die Mauer geöffnet?', '28'),
      ],
    };
    const s = await prepare([wall]);
    const [a, b, c] = ids(s);
    expect((await answer(s, a, '30')).body.verdict).toBe('incorrect');
    const shown = await l.api.post<SessionView>(`/practice/sessions/${s.id}/reveal`, {
      item_id: a,
    });
    expect(shown.status).toBe(200);
    // c) is a number on the same topic, like a) — and still stays behind b).
    expect(shown.body.items.map((i) => i.item.id)).toEqual([a, b, c]);
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('a practice test has no open part: not offered to the model, not kept', async () => {
    const s = await prepare([rideTask(), tariffTask()], 'test');
    // The part the decoder could write: no long answer, and no key points to fill.
    type Node = { properties: Record<string, Node>; items: Node; enum?: string[] };
    const sent = env.llm.callsFor('explain')[0]!.schema as unknown as Node;
    const part = sent.properties.part_tasks!.items.properties.parts!.items.properties;
    expect(part.kind?.enum).toEqual(['numeric', 'short', 'multiple_choice']);
    expect(Object.keys(part)).not.toContain('points');
    // The ride task carried an open part, so it is not a task of this run at all.
    expect(s.items).toHaveLength(3);
    expect(s.items.every((i) => i.item.kind === 'numeric')).toBe(true);
  });
});
