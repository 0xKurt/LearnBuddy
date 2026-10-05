// Circuits, logic nets and Itten's colour wheel end to end (issue #261): what the model writes,
// what is stored, what the app gets back and what is graded, on a real Postgres. A figure that
// does not hold, or a key that disagrees with the one code computes, is never stored (Regel 0:
// rejected, never repaired) — and the options code writes are the ones she taps.
//
// Model calls are scripted; every answer below is graded by code (the key, an option), so the
// harness's failure on an unscripted call proves no tutor was asked.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';
import {
  CIRCUIT_ITEMS,
  parallelLamps,
  seriesMeter,
  wheelComplement,
} from '../testing/scenarios/circuits.js';

const dbReady = await testDatabaseAvailable();

const [lit, current, rTotal, out, ones, complement, mix] = CIRCUIT_ITEMS as [
  (typeof CIRCUIT_ITEMS)[number],
  ...(typeof CIRCUIT_ITEMS)[number][],
];

/** Questions code must refuse, each next to the one it is a broken copy of. */
const BROKEN = [
  // The key says L2 lights, but its switch is open.
  { ...lit, prompt: 'Leuchtet L2 trotz offenem Schalter?', correct_choice: 0 },
  // 12 V over 300 Ω is 0,04 A, not 0,4 A.
  { ...current, prompt: 'Was zeigt das Amperemeter (falsch gerechnet)?', answer: '0.4' },
  // A battery short-circuited by a closed switch.
  {
    ...rTotal,
    prompt: 'Ersatzwiderstand eines Kurzschlusses?',
    figure: { ...seriesMeter, b: [[[{ k: 'switch', r: 0, o: false }]]], ask: 'r_total' },
  },
  // Itten's complement of red is green, not cyan.
  { ...complement, prompt: 'Komplementärfarbe von Rot (RGB)?', answer: 'Cyan' },
  // Orange and violet mix to no field of the wheel.
  {
    ...mix,
    prompt: 'Was ergeben Orange und Violett?',
    figure: { ...wheelComplement, ask: 'mix', at: ['orange', 'violet'] },
  },
];

async function start(env: TestEnv, l: Learner, items: unknown[]) {
  env.llm.script('explain', {
    json: { usable: true, title: 'Schaltungen und Farben', subject: null, items },
  });
  const res = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: randomUUID(),
    kind: 'practice',
    text: 'Stromkreise, Logikgatter und der Farbkreis',
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

describe.skipIf(!dbReady)('circuits, logic nets and the colour wheel are graded by code', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-05T09:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2012-02-10' });
  });
  afterEach(() => env.closeChecked());

  it('stores only the questions whose figure and key hold', async () => {
    const s = await start(env, l, [...CIRCUIT_ITEMS, ...BROKEN]);
    const prompts = s.items.map((i) => i.item.prompt);
    expect(prompts).toEqual(CIRCUIT_ITEMS.map((i) => i.prompt));
    const stored = await env.db.query<{ prompt: string }>(
      `select prompt from items where learner_id = $1`,
      [l.learnerId],
    );
    expect(stored.map((r) => r.prompt).sort()).toEqual([...prompts].sort());
    // The app gets the figure as it was written, and the options code wrote.
    expect(s.items[0]?.item.figure).toEqual(parallelLamps('lit', 'L2'));
    expect(s.items[0]?.item.choices).toEqual(['Ja, L2 leuchtet', 'Nein, L2 leuchtet nicht']);
    expect(s.items[6]?.item.choices).toEqual(['Orange', 'Violett', 'Grün']);
  });

  it('grades every answer by code, no tutor', async () => {
    const s = await start(env, l, CIRCUIT_ITEMS);
    const id = (p: string) => s.items.find((i) => i.item.prompt === p)!.item.id;
    const verdict = async (p: string, body: Record<string, unknown>) =>
      (await answer(l, s, id(p), body)).body.verdict;
    // Two options: a wrong tap would close the question, so the right one is tapped here and the
    // wrong-then-right path is the three-option mixture below.
    expect(await verdict(lit!.prompt, { choice: 1 })).toBe('correct');
    expect(await verdict(current!.prompt, { text: '0,04' })).toBe('correct');
    expect(await verdict(rTotal!.prompt, { text: '200' })).toBe('correct');
    expect(await verdict(out!.prompt, { choice: 1 })).toBe('correct');
    expect(await verdict(ones!.prompt, { text: '5' })).toBe('correct');
    // The name as the wheel writes it. Case alone ("grün") is the tutor's to judge gently, like
    // every short answer whose spelling is not the point (decision D-2, `evaluate.ts`).
    expect(await verdict(complement!.prompt, { text: 'Grün' })).toBe('correct');
    expect(await verdict(mix!.prompt, { choice: 0 })).toBe('incorrect');
    expect(await verdict(mix!.prompt, { choice: 2 })).toBe('correct');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });
});
