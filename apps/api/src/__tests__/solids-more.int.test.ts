// The rest of #255 (#368) end to end: prisms with a non-regular base, nets of solids and
// Würfelgebäude with their views — what the model writes, what is stored, what the app gets back
// and what is graded, on a real Postgres. Every key is computed by code (packages/shared-math:
// solids.ts, solidNets.ts, cubes.ts); a figure or a key that does not hold is never stored
// (Regel 0: rejected, never repaired). No tutor is scripted: every verdict is code's.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';
import {
  cubes,
  lying,
  MORE_SOLID_ITEMS,
  solid,
  STAIRS,
  VIEW_OPTIONS,
} from '../testing/scenarios/solids.js';

const dbReady = await testDatabaseAvailable();

type Item = (typeof MORE_SOLID_ITEMS)[number];
const byPrompt = (start: string) =>
  MORE_SOLID_ITEMS.find((i) => i.prompt.startsWith(start)) as Item;
const trapezoid = byPrompt('Berechne das Volumen des Prismas');
const triangle = byPrompt('Wie groß ist die Oberfläche des Dreiecksprismas');
const kind = byPrompt('Welcher Körper entsteht');
const coneKind = byPrompt('Zu welchem Körper');
const lPrism = byPrompt('Berechne das Volumen des Prismas mit L');
const house = byPrompt('Wie groß ist die Oberfläche des Prismas mit haus');
const cylinderNet = byPrompt('Berechne die Oberfläche des Zylinders');
const count = byPrompt('Aus wie vielen Würfeln');
const plan = byPrompt('Wie viele Würfel braucht');
const view = byPrompt('Welche Ansicht von vorn');

/** Questions code must refuse, each next to the one it is a broken copy of. */
const BROKEN = [
  // The trapezoid's volume is 60, not 75.
  { ...trapezoid, prompt: 'Trapezprisma falsch gerechnet?', answer: '75' },
  // A base whose top is slanted: its area does not follow from what is drawn.
  {
    ...trapezoid,
    prompt: 'Schiefes Viereck?',
    figure: lying(
      [
        [0, 0],
        [4, 0],
        [4, 2],
        [0, 3],
      ],
      5,
      'volume',
    ),
  },
  // A surface with a side of √13 she cannot read off.
  {
    ...triangle,
    prompt: 'Oberfläche mit Wurzelseite?',
    answer: '78,1',
    figure: lying(
      [
        [0, 0],
        [4, 0],
        [2, 3],
      ],
      5,
      'surface',
    ),
  },
  // A "cuboid" with three equal edges is a cube: two of the options at once (#418).
  {
    ...kind,
    prompt: 'Quadernetz eines Würfels?',
    figure: solid('cuboid', { a: 3, b: 3, h: 3 }, 'kind', { w: 'net' }),
  },
  // A prism on a square is a cuboid: two of the options at once (#418).
  {
    ...kind,
    prompt: 'Prisma auf einem Quadrat?',
    figure: solid('prism', { n: 4, a: 3, h: 5 }, 'kind', { w: 'net' }),
  },
  // An L whose inner corner opens to the top left: the lying prism would hide part of itself.
  {
    ...lPrism,
    prompt: 'Gespiegeltes L?',
    figure: lying(
      [
        [0, 0],
        [4, 0],
        [4, 3],
        [3, 3],
        [3, 1],
        [0, 1],
      ],
      5,
      'volume',
    ),
  },
  // A house whose walls differ: no house.
  {
    ...house,
    prompt: 'Schiefes Haus?',
    figure: lying(
      [
        [0, 0],
        [6, 0],
        [6, 2],
        [3, 7],
        [0, 3],
      ],
      5,
      'surface',
    ),
  },
  // The L's volume is 30, not 36 (its notch taken for filled).
  { ...lPrism, prompt: 'L als Rechteck gerechnet?', answer: '36' },
  // "Which solid?" asked of a Schrägbild: there is nothing to fold.
  {
    ...kind,
    prompt: 'Welcher Körper, im Schrägbild?',
    figure: solid('cuboid', { a: 5, b: 3, h: 2 }, 'kind'),
  },
  // A sphere has no net.
  {
    ...cylinderNet,
    prompt: 'Netz einer Kugel?',
    answer: '50,27',
    figure: solid('sphere', { r: 2 }, 'surface', { w: 'net' }),
  },
  // 9 cubes, not 8.
  { ...count, prompt: 'Würfel falsch gezählt?', answer: '8' },
  // A column of 1 behind a column of 3: from the Schrägbild it could be any height.
  {
    ...count,
    prompt: 'Versteckte Säule?',
    answer: '4',
    figure: cubes(
      [
        [3, 0],
        [1, 0],
      ],
      'oblique',
      'count',
    ),
  },
  // Heights over four.
  { ...plan, prompt: 'Zu hoher Turm?', answer: '5', figure: cubes([[5]], 'plan', 'count') },
  // The view B is the building's; the model points at A.
  { ...view, prompt: 'Ansicht falsch angekreuzt?', answer: 'Ansicht A', correct_choice: 0 },
  // Two options show the building's view.
  {
    ...view,
    prompt: 'Zwei richtige Ansichten?',
    choice_figures: [
      VIEW_OPTIONS[0],
      VIEW_OPTIONS[1],
      cubes(
        [
          [0, 0, 0],
          [3, 2, 1],
        ],
        'front',
      ),
    ],
    choices: ['Ansicht A', 'Ansicht B', 'Ansicht C'],
  },
  // Side views as options of a front-view question.
  {
    ...view,
    prompt: 'Seitenansichten als Antwort?',
    choice_figures: VIEW_OPTIONS.map((o) => ({ ...o, v: 'side' })),
  },
];

async function start(env: TestEnv, l: Learner, items: unknown[]) {
  env.llm.script('explain', { json: { usable: true, title: 'Körper', subject: null, items } });
  const res = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: randomUUID(),
    kind: 'practice',
    text: 'Prismen, Körpernetze und Würfelgebäude',
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  await env.flushBackground();
  return (await l.api.get<SessionView>(`/practice/sessions/${res.body.id}`)).body;
}

describe.skipIf(!dbReady)('the rest of #255: irregular prisms, nets, Würfelgebäude (#368)', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-05T09:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2012-02-10' });
  });
  afterEach(() => env.closeChecked());

  it('stores only the questions whose figure and key hold', async () => {
    const s = await start(env, l, [...MORE_SOLID_ITEMS, ...BROKEN]);
    expect(s.items.map((i) => i.item.prompt)).toEqual(MORE_SOLID_ITEMS.map((i) => i.prompt));
    const stored = await env.db.one<{ n: number }>(
      `select count(*)::int as n from items where learner_id = $1`,
      [l.learnerId],
    );
    expect(stored.n).toBe(MORE_SOLID_ITEMS.length);
    const at = (p: string) => s.items.find((i) => i.item.prompt === p)!.item;
    expect(at(trapezoid.prompt).figure).toMatchObject({ type: 'solid', k: 'prism', n: 4 });
    expect(at(view.prompt).figure).toMatchObject({ type: 'cubes', g: STAIRS, v: 'oblique' });
    expect(at(view.prompt).choice_figures).toHaveLength(4);
    // The options of "which solid?" are code's, in her language, never the model's: four, the
    // net's own among its neighbours, and code marks the right one (#418).
    expect(at(kind.prompt).choices).toEqual(['Würfel', 'Quader', 'Prisma', 'Pyramide']);
    expect(at(coneKind.prompt).choices).toEqual(['Prisma', 'Pyramide', 'Zylinder', 'Kegel']);
    expect(at(lPrism.prompt).figure).toMatchObject({ type: 'solid', k: 'prism', n: 6 });
    expect(at(house.prompt).figure).toMatchObject({ type: 'solid', k: 'prism', n: 5 });
  });

  it('writes the options of "which solid?" in the question’s language', async () => {
    const s = await start(env, l, [
      { ...kind, prompt: 'Which solid does this net fold into?', prompt_lang: 'en' },
    ]);
    expect(s.items[0]?.item.choices).toEqual(['cube', 'cuboid', 'prism', 'pyramid']);
  });

  it('grades every answer by code, no tutor', async () => {
    const s = await start(env, l, MORE_SOLID_ITEMS);
    const id = (p: string) => s.items.find((i) => i.item.prompt === p)!.item.id;
    const verdict = async (p: string, body: Record<string, unknown>) =>
      (
        await l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
          client_turn_id: randomUUID(),
          item_id: id(p),
          ...body,
        })
      ).body.verdict;
    expect(await verdict(trapezoid.prompt, { text: '60' })).toBe('correct');
    expect(await verdict(triangle.prompt, { text: '120' })).toBe('incorrect');
    expect(await verdict(triangle.prompt, { text: '132' })).toBe('correct');
    expect(await verdict(kind.prompt, { choice: 0 })).toBe('incorrect');
    expect(await verdict(kind.prompt, { choice: 1 })).toBe('correct');
    // The model said 0; the cone stands fourth among its options, and that is the key.
    expect(await verdict(coneKind.prompt, { choice: 3 })).toBe('correct');
    expect(await verdict(lPrism.prompt, { text: '30' })).toBe('correct');
    expect(await verdict(house.prompt, { text: '168' })).toBe('correct');
    expect(await verdict(cylinderNet.prompt, { text: '87,96' })).toBe('correct');
    expect(await verdict(count.prompt, { text: '9' })).toBe('correct');
    expect(await verdict(plan.prompt, { text: '7' })).toBe('incorrect');
    expect(await verdict(plan.prompt, { text: '8' })).toBe('correct');
    expect(await verdict(view.prompt, { choice: 1 })).toBe('correct');
    expect(await verdict(byPrompt('Welche Ansicht von links').prompt, { choice: 1 })).toBe(
      'correct',
    );
    expect(await verdict(byPrompt('Welche Ansicht von oben').prompt, { choice: 2 })).toBe(
      'correct',
    );
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });
});
