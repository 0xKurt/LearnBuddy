// Solids, cube nets and points in space end to end (issue #255): what the model writes, what is
// stored, what the app gets back and what is graded, on a real Postgres. Every key here is
// computed by code; a figure or key that does not hold is never stored (Regel 0: rejected,
// never repaired).
//
// Model calls are scripted; every answer below is graded by code (a number, an option, a
// point), so the harness's failure on an unscripted call proves no tutor was asked.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';
import { net, NET_OPTIONS, solid, SOLID_ITEMS, space } from '../testing/scenarios/solids.js';

const dbReady = await testDatabaseAvailable();

type Item = (typeof SOLID_ITEMS)[number];
const byPrompt = (start: string) => SOLID_ITEMS.find((i) => i.prompt.startsWith(start)) as Item;
const cuboid = byPrompt('Wie groß ist das Volumen dieses Quaders');
const edges = byPrompt('Wie viele Kanten');
const cylinder = byPrompt('Wie groß ist die Oberfläche des Zylinders');
const fold = byPrompt('Lässt sich dieses Netz');
const opposite = byPrompt('Welches Quadrat liegt');
const choice = byPrompt('Welches dieser Netze');
const point = byPrompt('Welche Koordinaten');
const vector = byPrompt('Gib den Vektor');

/** Questions code must refuse, each next to the one it is a broken copy of. */
const BROKEN = [
  // The key contradicts the measures: 5 · 3 · 2 is 30, not 31.
  { ...cuboid, prompt: 'Quader, falsch gerechnet?', answer: '31' },
  // The right number in the wrong unit: 30 cm³ is not 30 dm³.
  { ...cuboid, prompt: 'Quader in Kubikdezimetern?', unit: 'dm³' },
  // A volume asked as an area.
  { ...cuboid, prompt: 'Quader mit Flächeneinheit?', unit: 'cm²' },
  // A volume without any unit.
  { ...cuboid, prompt: 'Quader ohne Einheit?', unit: null },
  // A cuboid with a radius: measures the kind does not use.
  {
    ...cuboid,
    prompt: 'Quader mit Radius?',
    figure: { ...solid('cuboid', { a: 5, b: 3, h: 2 }, 'volume'), r: 1 },
  },
  // A hexagonal prism has 18 edges, not 12.
  { ...edges, prompt: 'Prisma mit falscher Kantenzahl?', answer: '12' },
  // Edges of a cylinder: no schoolbook answer.
  {
    ...edges,
    prompt: 'Wie viele Kanten hat der Zylinder?',
    answer: '2',
    figure: solid('cylinder', { r: 3, h: 5 }, 'edges'),
  },
  // A number far from the computed 150,8.
  { ...cylinder, prompt: 'Zylinder grob gerundet?', answer: '200' },
  // A number about a solid that declares no key.
  {
    ...edges,
    prompt: 'Wie viele Ecken, ohne Angabe?',
    answer: '12',
    figure: solid('prism', { n: 6, a: 2, h: 4 }, 'none'),
  },
  // The cross folds; the model says it does not.
  { ...fold, prompt: 'Würfelnetz, falsch angekreuzt?', correct_choice: 1 },
  // Six squares that do not hang together.
  { ...fold, prompt: 'Zerrissenes Netz?', figure: net(['##.##', '.#..#'], 'fold') },
  // Square 2 lies opposite 5, not 4.
  { ...opposite, prompt: 'Gegenüber, falsch?', answer: '4' },
  // "Opposite" on six squares that fold into no cube.
  { ...opposite, prompt: 'Gegenüber ohne Würfel?', figure: net(['##..', '####'], 'opposite', 1) },
  // Two nets fold: no odd one out.
  {
    ...choice,
    prompt: 'Welches Netz, zwei passen?',
    choice_figures: [NET_OPTIONS[0], NET_OPTIONS[1], net(['.#..', '####', '.#..']), NET_OPTIONS[3]],
  },
  // The odd one out is B, the model points at C.
  { ...choice, prompt: 'Welches Netz, falsch angekreuzt?', answer: 'Netz C', correct_choice: 2 },
  // A is (2|3|2).
  { ...point, prompt: 'Koordinaten falsch?', answer: '(2|1|3)' },
  // The vector from A to B, written backwards.
  { ...vector, prompt: 'Vektor verkehrt herum?', answer: '(1|-1|-1)' },
  // Two points drawn on one spot: (2|1|1) sits where the origin is.
  {
    ...point,
    prompt: 'Zwei Punkte auf einer Stelle?',
    figure: {
      ...space('point', 0),
      p: [
        { l: 'O', x: 0, y: 0, z: 0 },
        { l: 'P', x: 2, y: 1, z: 1 },
      ],
    },
  },
];

async function start(env: TestEnv, l: Learner, items: unknown[]) {
  env.llm.script('explain', { json: { usable: true, title: 'Körper', subject: null, items } });
  const res = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: randomUUID(),
    kind: 'practice',
    text: 'Körper, Würfelnetze und Raumgeometrie',
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

describe.skipIf(!dbReady)('solids, nets and points in space are checked and graded by code', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-03T09:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2012-02-10' });
  });
  afterEach(() => env.closeChecked());

  it('stores only the questions whose figure and key hold', async () => {
    const s = await start(env, l, [...SOLID_ITEMS, ...BROKEN]);
    const prompts = s.items.map((i) => i.item.prompt);
    expect(prompts).toEqual(SOLID_ITEMS.map((i) => i.prompt));
    const stored = await env.db.query<{ prompt: string }>(
      `select prompt from items where learner_id = $1`,
      [l.learnerId],
    );
    expect(stored.map((r) => r.prompt).sort()).toEqual([...prompts].sort());
    expect(s.items[0]?.item.figure).toMatchObject({ type: 'solid', k: 'cuboid', ask: 'volume' });
    expect(s.items.find((i) => i.item.prompt === choice.prompt)?.item.choice_figures).toHaveLength(
      4,
    );
  });

  it('writes the options of a fold question itself, in the question’s language', async () => {
    const s = await start(env, l, [
      fold,
      { ...fold, prompt: 'Can this net be folded into a cube?', prompt_lang: 'en' },
    ]);
    expect(s.items[0]?.item.choices).toEqual([
      'Ja, das ist ein Würfelnetz',
      'Nein, das ist kein Würfelnetz',
    ]);
    expect(s.items[1]?.item.choices).toEqual(['Yes, it is a cube net', 'No, it is not a cube net']);
  });

  it('grades every answer by code, no tutor', async () => {
    const s = await start(env, l, SOLID_ITEMS);
    const id = (p: string) => s.items.find((i) => i.item.prompt === p)!.item.id;
    const verdict = async (p: string, body: Record<string, unknown>) =>
      (await answer(l, s, id(p), body)).body.verdict;
    expect(await verdict(cuboid.prompt, { text: '31' })).toBe('incorrect');
    expect(await verdict(cuboid.prompt, { text: '30' })).toBe('correct');
    expect(await verdict(edges.prompt, { text: '18' })).toBe('correct');
    // The exact value and the rounded key are both right; another number is not.
    expect(await verdict(cylinder.prompt, { text: '150,8' })).toBe('correct');
    expect(await verdict(fold.prompt, { choice: 0 })).toBe('correct');
    expect(await verdict(opposite.prompt, { text: '4' })).toBe('incorrect');
    expect(await verdict(opposite.prompt, { text: '5' })).toBe('correct');
    expect(await verdict(choice.prompt, { choice: 1 })).toBe('correct');
    expect(await verdict(point.prompt, { text: '(2|1|3)' })).toBe('incorrect');
    expect(await verdict(point.prompt, { text: 'A(2|3|2)' })).toBe('correct');
    expect(await verdict(vector.prompt, { text: '(-1|1|1)' })).toBe('correct');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });
});
