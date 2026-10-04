// The periodic table end to end (issue #250): what the model writes, what is stored, what the app
// gets back and what is graded, on a real Postgres. Every key here is computed by code from the
// element data; a figure or key that does not hold is never stored (Regel 0: rejected, never
// repaired).
//
// Model calls are scripted; every answer below is graded by code (a number, an option), so the
// harness's failure on an unscripted call proves no tutor was asked.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';
import { PERIODIC_ITEMS, table } from '../testing/scenarios/periodic.js';

const dbReady = await testDatabaseAvailable();

const [neutrons, valence, cls, en, radius, protons] = PERIODIC_ITEMS as [
  (typeof PERIODIC_ITEMS)[number],
  ...(typeof PERIODIC_ITEMS)[number][],
];

/** Questions code must refuse, each a broken copy of one that holds. */
const BROKEN = [
  // Chlorine has 18 neutrons (35 − 17), not 17.
  { ...neutrons, prompt: 'Neutronen, falsch gezählt?', answer: '17' },
  // The main-group table numbers its groups I–VIII: sulfur is in group 6 there, not 16.
  {
    ...valence,
    prompt: 'In welcher Hauptgruppe steht Schwefel?',
    answer: '16',
    figure: table('main', ['S'], 'group', 'S'),
  },
  // Iron is no main-group element: the table the model chose does not have it.
  {
    ...protons,
    prompt: 'Protonen von Eisen, Hauptgruppen?',
    figure: table('main', ['Fe'], 'protons', 'Fe'),
  },
  // Valence electrons of a transition metal are no school question: no key to compute.
  {
    ...protons,
    prompt: 'Valenzelektronen von Eisen?',
    answer: '2',
    figure: table('full', ['Fe'], 'valence', 'Fe'),
  },
  // The model points at sodium; chlorine is the most electronegative.
  { ...en, prompt: 'Elektronegativität, falsch angekreuzt?', correct_choice: 0, answer: 'Na' },
  // Lithium and magnesium share neither group nor period: the position does not decide it.
  {
    ...radius,
    prompt: 'Größeres Atom: Li oder Mg?',
    choices: ['Li', 'Mg'],
    correct_choice: 1,
    answer: 'Mg',
    figure: table('main', ['Li', 'Mg'], 'radius_max'),
  },
  // A symbol that is no element.
  { ...protons, prompt: 'Protonen von Xy?', figure: table('full', ['Xy'], 'protons', 'Xy') },
  // A number next to a table that declares no question: nothing to check the key by.
  {
    ...protons,
    prompt: 'Wie viele Elemente sind markiert?',
    answer: '1',
    figure: table('full', ['Fe']),
  },
  // The question is about an element the table does not mark.
  {
    ...protons,
    prompt: 'Protonen von Cobalt?',
    answer: '27',
    figure: table('full', ['Fe'], 'protons', 'Co'),
  },
  // A count with a unit the key cannot have.
  { ...neutrons, prompt: 'Neutronen mit Einheit?', unit: 'u' },
];

async function start(env: TestEnv, l: Learner, items: unknown[]) {
  env.llm.script('explain', { json: { usable: true, title: 'PSE', subject: null, items } });
  const res = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: randomUUID(),
    kind: 'practice',
    text: 'Periodensystem: Atombau und Trends',
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

describe.skipIf(!dbReady)('periodic-table questions are checked, stored and graded by code', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-03T09:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2012-02-10' });
  });
  afterEach(() => env.closeChecked());

  it('stores only the questions whose table and key hold', async () => {
    const s = await start(env, l, [...PERIODIC_ITEMS, ...BROKEN]);
    const prompts = s.items.map((i) => i.item.prompt);
    expect(prompts).toEqual(PERIODIC_ITEMS.map((i) => i.prompt));
    const stored = await env.db.query<{ prompt: string }>(
      `select prompt from items where learner_id = $1`,
      [l.learnerId],
    );
    expect(stored.map((r) => r.prompt).sort()).toEqual([...prompts].sort());
    expect(s.items[0]?.item.figure).toEqual(table('main', ['Cl'], 'neutrons', 'Cl'));
    expect(s.items[5]?.item.figure).toMatchObject({ type: 'periodic_table', v: 'full' });
  });

  it('writes the options of a class and a trend question itself', async () => {
    const s = await start(env, l, [
      // The model's own words for the classes are replaced by code's.
      { ...cls, choices: ['Metall', 'Halbmetall (Metalloid)', 'Nichtmetall'] },
      en,
      { ...cls, prompt: 'Is silicon a metal, a metalloid or a nonmetal?', prompt_lang: 'en' },
    ]);
    expect(s.items.map((i) => i.item.choices)).toEqual([
      ['Metall', 'Halbmetall', 'Nichtmetall'],
      ['Na', 'Mg', 'Cl'],
      ['metal', 'metalloid', 'nonmetal'],
    ]);
  });

  it('grades every answer by code, no tutor', async () => {
    const s = await start(env, l, PERIODIC_ITEMS);
    const id = (p: string) => s.items.find((i) => i.item.prompt === p)!.item.id;
    const verdict = async (p: string, body: Record<string, unknown>) =>
      (await answer(l, s, id(p), body)).body.verdict;
    expect(await verdict(neutrons!.prompt, { text: '17' })).toBe('incorrect');
    expect(await verdict(neutrons!.prompt, { text: '18' })).toBe('correct');
    expect(await verdict(valence!.prompt, { text: '6' })).toBe('correct');
    expect(await verdict(cls!.prompt, { choice: 1 })).toBe('correct');
    expect(await verdict(en!.prompt, { choice: 0 })).toBe('incorrect');
    expect(await verdict(en!.prompt, { choice: 2 })).toBe('correct');
    expect(await verdict(radius!.prompt, { choice: 2 })).toBe('correct');
    expect(await verdict(protons!.prompt, { text: '26' })).toBe('correct');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });
});
