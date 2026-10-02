// Figures that state numbers, end to end (issues #253 and #257): what the model writes, what
// is stored, what the app gets back, and what is graded — on a real Postgres.
//
// Model calls are scripted; every answer below is graded by code (a number, an option), so the
// harness's failure on an unscripted call proves no tutor was asked.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const base = {
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  difficulty: 2,
  prompt_lang: 'de',
  lang: null,
  source_excerpt: null,
};

const rad = (d: number) => (d * Math.PI) / 180;
/** A triangle with 50° at A and 60° at B on AB = 6, as the model would write it. */
const C = {
  x: Math.round(((6 * Math.sin(rad(60))) / Math.sin(rad(70))) * Math.cos(rad(50)) * 1000) / 1000,
  y: Math.round(((6 * Math.sin(rad(60))) / Math.sin(rad(70))) * Math.sin(rad(50)) * 1000) / 1000,
};
const triangle = {
  type: 'geometry',
  points: [
    { name: 'A', x: 0, y: 0 },
    { name: 'B', x: 6, y: 0 },
    { name: 'C', ...C },
  ],
  segments: [],
  polygons: [['A', 'B', 'C']],
  circles: [],
  angles: [
    { at: ['B', 'A', 'C'], deg: 50, label: null },
    { at: ['A', 'B', 'C'], deg: 60, label: null },
    { at: ['A', 'C', 'B'], deg: null, label: '?' },
  ],
};

const forces = {
  type: 'geometry',
  points: [
    { name: 'P', x: 0, y: 0 },
    { name: 'Q', x: 3, y: 0 },
    { name: 'S', x: 0, y: 4 },
    { name: 'R', x: 3, y: 4 },
  ],
  segments: [],
  polygons: [],
  circles: [],
  arrows: [
    { from: 'P', to: 'Q', value: 30, label: 'F₁ = 30 N', resultant: false },
    { from: 'P', to: 'S', value: 40, label: 'F₂ = 40 N', resultant: false },
    { from: 'P', to: 'R', value: null, label: '?', resultant: true },
  ],
};

const water = (h: number) => ({
  type: 'molecule',
  style: 'lewis',
  atoms: [{ id: 'a1', el: 'O', h, charge: 0 }],
  bonds: [],
  ask: 'lone_pairs',
});

const SHEET = [
  {
    ...base,
    kind: 'numeric',
    prompt: 'Wie groß ist der Winkel bei C?',
    answer: '70',
    unit: '°',
    topic: 'Winkelsumme',
    figure: triangle,
  },
  // The same drawing with a key that contradicts it: never stored.
  {
    ...base,
    kind: 'numeric',
    prompt: 'Wie groß ist der Winkel bei C im Dreieck?',
    answer: '80',
    unit: '°',
    topic: 'Winkelsumme',
    figure: triangle,
  },
  {
    ...base,
    kind: 'numeric',
    prompt: 'Wie groß ist die resultierende Kraft?',
    answer: '50',
    unit: 'N',
    topic: 'Kräfte',
    figure: forces,
  },
  {
    ...base,
    kind: 'multiple_choice',
    prompt: 'Wie viele freie Elektronenpaare hat das Sauerstoffatom?',
    answer: '2',
    choices: ['1', '2', '3', '4'],
    correct_choice: 1,
    topic: 'Lewis-Formeln',
    figure: water(2),
  },
  // An oxygen with three hydrogens and no charge: no molecule, so no question.
  {
    ...base,
    kind: 'multiple_choice',
    prompt: 'Wie viele freie Elektronenpaare hat dieses Teilchen?',
    answer: '1',
    choices: ['1', '2', '3', '4'],
    correct_choice: 0,
    topic: 'Lewis-Formeln',
    figure: water(3),
  },
];

async function start(env: TestEnv, l: Learner) {
  env.llm.script('explain', {
    json: { usable: true, title: 'Figuren', subject: null, items: SHEET },
  });
  const res = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: randomUUID(),
    kind: 'practice',
    text: 'Winkel, Kräfte und Lewis-Formeln',
  });
  expect(res.status).toBe(201);
  await env.flushBackground();
  return (await l.api.get<SessionView>(`/practice/sessions/${res.body.id}`)).body;
}

const answer = (l: Learner, s: SessionView, itemId: string, body: Record<string, unknown>) =>
  l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
    client_turn_id: randomUUID(),
    item_id: itemId,
    ...body,
  });

describe.skipIf(!dbReady)('figures that state numbers are checked, stored and graded', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T09:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2012-02-10' });
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

  it('stores only the questions whose figure holds, and grades them by code', async () => {
    const s = await start(env, l);
    const prompts = s.items.map((i) => i.item.prompt);
    expect(prompts).toEqual([
      'Wie groß ist der Winkel bei C?',
      'Wie groß ist die resultierende Kraft?',
      'Wie viele freie Elektronenpaare hat das Sauerstoffatom?',
    ]);
    // Nothing of the two contradicting questions reached the database either.
    const stored = await env.db.query<{ prompt: string }>(
      `select prompt from items where learner_id = $1`,
      [l.learnerId],
    );
    expect(stored.map((r) => r.prompt).sort()).toEqual([...prompts].sort());

    const [angle, force, lewis] = s.items;
    expect(angle?.item.figure).toMatchObject({ type: 'geometry', arrows: [], rays: [] });
    expect(lewis?.item.figure).toMatchObject({ type: 'molecule', style: 'lewis', mark: [] });

    expect((await answer(l, s, angle!.item.id, { text: '70' })).body.verdict).toBe('correct');
    expect((await answer(l, s, force!.item.id, { text: '50' })).body.verdict).toBe('correct');
    expect((await answer(l, s, lewis!.item.id, { choice: 1 })).body.verdict).toBe('correct');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('a figure stored before #257 reads back with the new fields empty', async () => {
    const s = await start(env, l);
    const id = s.items[0]!.item.id;
    // A row as it was written before angles, sides, arrows, rays and lines existed.
    await env.db.query(`update items set figure = $2 where id = $1`, [
      id,
      JSON.stringify({
        type: 'geometry',
        points: triangle.points,
        segments: [],
        polygons: [['A', 'B', 'C']],
        circles: [],
      }),
    ]);
    const again = (await l.api.get<SessionView>(`/practice/sessions/${s.id}`)).body;
    expect(again.items[0]?.item.figure).toEqual({
      type: 'geometry',
      points: triangle.points,
      segments: [],
      polygons: [['A', 'B', 'C']],
      circles: [],
      angles: [],
      lengths: [],
      arrows: [],
      rays: [],
      lines: [],
    });
  });

  it('another learner cannot read the session or answer its questions', async () => {
    const s = await start(env, l);
    const other = await onboard(env, { relation: 'child', name: 'Pia', birthDate: '2013-03-03' });
    expect((await other.api.get(`/practice/sessions/${s.id}`)).status).toBe(404);
    const r = await answer(other, s, s.items[0]!.item.id, { text: '70' });
    expect(r.status).toBe(404);
  });
});
