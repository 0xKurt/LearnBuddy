// Vormachen for an explanation (issue #298) through the real API on a real Postgres: „Tipp" or
// „Zeig mir wie" shows ONE key point as a model sentence and asks for the next one, she explains
// it herself, the server checks it against the key points, and Buddy leads on.
//
// What is asserted, each against the database and the model calls:
//   - a step is prepared text from the key points — no model call — and never the last open
//     point; the ladder (`prepared_hints_used`) stands just past the point shown;
//   - a shown point is Buddy's: the model is not asked about it, it never gets a ✓ and never
//     enters `explained`, and it counts towards the explanation being complete;
//   - „Tipp" leads on past every point she explained herself;
//   - „Zeig mir wie" in her words shows the same step as „Tipp";
//   - the end of the ladder shows the last point and closes the question as shown, not right;
//   - failure paths: the same „Tipp" twice, another learner's ids, a model outage, a run that
//     already ended.
// docs/architecture.md §Practice („Erklär mal", Vormachen).
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LlmError } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const PHOTO = {
  prompt: 'Erklär mir, wie die Fotosynthese funktioniert.',
  topic: 'Fotosynthese',
  difficulty: 2,
  points: [
    {
      name: 'Licht',
      point: 'Licht liefert die Energie',
      ask: 'Woher kommt die Energie dafür?',
      exact: [],
    },
    {
      name: 'Ausgangsstoffe',
      point: 'aus Kohlendioxid und Wasser entstehen Zucker und Sauerstoff',
      ask: 'Was braucht die Pflanze dafür, und was entsteht?',
      exact: [],
    },
    {
      name: 'Ort',
      point: 'findet in den Chloroplasten statt',
      ask: 'Und wo in der Zelle passiert das?',
      exact: [],
    },
  ],
};

/** What the tutor says: only about the points it was asked about. */
const judges = (
  elements: Array<{ element: string; met: boolean; quote?: string }>,
  intent: 'answer' | 'help_request' = 'answer',
) => ({
  json: {
    intent,
    verdict: intent === 'answer' ? 'partially_correct' : 'not_an_attempt',
    reply: 'Gut erklärt.',
    gave_hint: intent === 'help_request',
    revealed_answer: false,
    elements: elements.map((e) => ({ quote: '', verbs: [], ...e })),
  },
});

/** The reply as she reads it, a point's non-breaking spaces as plain ones. */
const read = (r: { body: AnswerResponse }) => r.body.reply.text.replaceAll(' ', ' ');

describe.skipIf(!dbReady)('Vormachen for an explanation (#298)', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-09T09:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2011-02-10' });
  });
  afterEach(() => env.closeChecked());

  async function start(): Promise<{ s: SessionView; id: string }> {
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Fotosynthese',
        subject: { name: 'Biologie', kind: 'biology' },
        teach_back: [PHOTO],
      },
    });
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'teach_back',
      text: 'Frag mich zur Fotosynthese ab',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await env.flushBackground();
    return { s: res.body, id: res.body.items[0]!.item.id };
  }

  const tip = (s: { id: string }, id: string, turn = randomUUID(), as = l) =>
    as.api.post<AnswerResponse>(`/practice/sessions/${s.id}/hint`, {
      client_turn_id: turn,
      item_id: id,
    });
  const answer = (s: { id: string }, id: string, text: string, turn = randomUUID(), as = l) =>
    as.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: turn,
      item_id: id,
      text,
    });
  const row = (sessionId: string, id: string) =>
    env.db.one<{
      attempts: number;
      hints_used: number;
      prepared: number;
      status: string;
      explained: string[];
      first_try_correct: boolean | null;
    }>(
      `select attempts, hints_used, prepared_hints_used as prepared, status, explained, first_try_correct
         from session_items where session_id = $1 and item_id = $2`,
      [sessionId, id],
    );
  const reviews = async (id: string) =>
    (
      await env.db.one<{ n: number }>(
        `select count(*)::int as n from item_states where item_id = $1`,
        [id],
      )
    ).n;

  it('shows ONE point as a model sentence and asks for the next — no model, never the last', async () => {
    const { s, id } = await start();
    const res = await tip(s, id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.verdict).toBe('not_an_attempt');
    const reply = read(res);
    expect(reply).toContain('Licht liefert die Energie');
    expect(reply).toContain('Was braucht die Pflanze dafür, und was entsteht?');
    expect(reply).not.toContain('Kohlendioxid');
    expect(reply).not.toContain('Chloroplasten');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
    expect(await row(s.id, id)).toMatchObject({
      attempts: 0,
      hints_used: 1,
      prepared: 1,
      explained: [],
    });
  });

  it('her own point is checked, the shown one is Buddy’s — and together they complete it', async () => {
    const { s, id } = await start();
    await tip(s, id);
    env.llm.script(
      'tutor',
      judges([
        { element: 'r2', met: true, quote: 'aus Wasser und Kohlendioxid macht sie Zucker' },
        { element: 'r3', met: false },
      ]),
    );
    const mine = await answer(
      s,
      id,
      'Sie braucht CO2 – aus Wasser und Kohlendioxid macht sie Zucker.',
    );
    // The model is asked about her points only, never about the one Buddy showed.
    const seen = ScriptedGateway.textOf(env.llm.callsFor('tutor')[0]!);
    expect(seen).toContain('r2 "Ausgangsstoffe"');
    expect(seen).not.toContain('r1 "Licht"');
    const reply = read(mine);
    expect(reply).toContain('Licht vorgemacht');
    expect(reply).not.toContain('✓ Licht');
    expect(reply).toContain('✓ Ausgangsstoffe');
    // Buddy leads on: the next missing point's follow-up.
    expect(reply).toContain('Und wo in der Zelle passiert das?');
    expect(mine.body.verdict).toBe('partially_correct');
    env.llm.script('tutor', judges([{ element: 'r3', met: true, quote: 'in den Chloroplasten' }]));
    const done = await answer(s, id, 'Das passiert in den Chloroplasten.');
    expect(read(done)).toContain('Alles drin');
    expect(read(done)).toContain('Licht vorgemacht');
    expect(done.body.verdict).toBe('correct');
    // Only what she said is hers; right with help, never right at the first try.
    expect(await row(s.id, id)).toMatchObject({
      status: 'correct',
      explained: ['r2', 'r3'],
      first_try_correct: false,
    });
    expect(await reviews(id)).toBe(1);
  });

  it('leads on past a point she explained herself: the next „Tipp" shows the one after it', async () => {
    const { s, id } = await start();
    env.llm.script(
      'tutor',
      judges([
        { element: 'r1', met: true, quote: 'Licht als Energie' },
        { element: 'r2', met: false },
        { element: 'r3', met: false },
      ]),
    );
    await answer(s, id, 'Die Pflanze nimmt Licht als Energie.');
    const res = await tip(s, id);
    const reply = read(res);
    expect(reply).not.toContain('Licht liefert');
    expect(reply).toContain('aus Kohlendioxid und Wasser entstehen Zucker und Sauerstoff');
    expect(reply).toContain('Und wo in der Zelle passiert das?');
    expect(await row(s.id, id)).toMatchObject({ prepared: 2, explained: ['r1'] });
  });

  it('shows the same step when she asks in her words; a model outage shows none', async () => {
    const { s, id } = await start();
    env.llm.script('tutor', { error: new LlmError('unavailable', 'down') });
    const down = await answer(s, id, 'Zeig mir, wie das geht');
    expect(down.status).toBe(200);
    expect(read(down)).not.toContain('Licht liefert');
    expect(await row(s.id, id)).toMatchObject({ attempts: 0, hints_used: 0, prepared: 0 });
    env.llm.script('tutor', judges([], 'help_request'));
    const asked = await answer(s, id, 'Zeig mir, wie das geht');
    expect(asked.body.verdict).toBe('not_an_attempt');
    // Code writes the reply — the prepared step, never the model's words.
    expect(read(asked)).toContain('Licht liefert die Energie');
    expect(read(asked)).not.toContain('Gut erklärt');
    expect(await row(s.id, id)).toMatchObject({
      attempts: 0,
      hints_used: 1,
      prepared: 1,
      explained: [],
    });
  });

  it('ends the ladder by showing the last point: closed as shown, never as right', async () => {
    const { s, id } = await start();
    await tip(s, id);
    const second = await tip(s, id);
    expect(read(second)).toContain('aus Kohlendioxid und Wasser');
    expect(read(second)).toContain('Und wo in der Zelle passiert das?');
    const end = await tip(s, id);
    expect(read(end)).toContain('findet in den Chloroplasten statt');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
    expect(await row(s.id, id)).toMatchObject({ status: 'revealed', explained: [] });
    expect(await reviews(id)).toBe(0);
  });

  it('the same „Tipp" twice is one step; another learner and a finished run are refused', async () => {
    const { s, id } = await start();
    const turn = randomUUID();
    const one = await tip(s, id, turn);
    const two = await tip(s, id, turn);
    expect(two.body.reply).toEqual(one.body.reply);
    expect(await row(s.id, id)).toMatchObject({ hints_used: 1, prepared: 1 });
    const sam = await onboard(env, { name: 'Sam' });
    expect((await tip(s, id, randomUUID(), sam)).status).toBe(404);
    expect((await answer(s, id, 'Zeig mir, wie das geht', randomUUID(), sam)).status).toBe(404);
    expect(await row(s.id, id)).toMatchObject({ hints_used: 1, prepared: 1 });
    expect((await l.api.post(`/practice/sessions/${s.id}/finish`, {})).status).toBe(200);
    await env.flushBackground();
    expect((await tip(s, id)).status).toBe(409);
    expect(await row(s.id, id)).toMatchObject({ hints_used: 1, prepared: 1 });
  });
});
