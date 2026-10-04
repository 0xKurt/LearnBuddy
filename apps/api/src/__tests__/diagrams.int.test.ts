// Diagrams end to end (issue #247): a Wasserkreislauf with two gaps, a Nahrungskette as a word
// bank, the Gewaltenteilung, a Regelkreis — what the model writes, what is stored, what the app
// gets back and what is graded, on a real Postgres. A diagram that does not hold, or a gap whose
// answer the picture already shows, is never stored (Regel 0: rejected, never repaired).
//
// Model calls are scripted; every answer below is graded by code (the key, an option), so the
// harness's failure on an unscripted call proves no tutor was asked.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';
import { DIAGRAM_ITEMS, foodChain, waterCycle } from '../testing/scenarios/diagrams.js';

const dbReady = await testDatabaseAvailable();

const [gapA, gapB, wordBank, , control] = DIAGRAM_ITEMS as [
  (typeof DIAGRAM_ITEMS)[number],
  ...(typeof DIAGRAM_ITEMS)[number][],
];

/** Questions code must refuse, each next to the one it is a broken copy of. */
const BROKEN = [
  // The cycle does not close: the last arrow is missing.
  {
    ...gapA,
    prompt: 'Lücke A in einem offenen Kreislauf?',
    figure: { ...waterCycle, e: waterCycle.e.slice(0, 3) },
  },
  // A chain whose last box points back to the first is a cycle, not a chain.
  {
    ...wordBank,
    prompt: 'Lücke A in einer Kette, die sich schließt?',
    figure: { ...foodChain, e: [...foodChain.e, { a: 3, b: 0, l: '' }] },
  },
  // The answer to gap B stands in a box of the same picture.
  { ...gapB, prompt: 'Lücke B, aber die Antwort steht schon da?', answer: 'Verdunstung' },
  // A word too long for its box on a 360 px phone.
  {
    ...gapA,
    prompt: 'Lücke A mit einem zu langen Wort?',
    figure: { ...waterCycle, n: ['Verdunstungsvorgangsbeschreibung', '?', 'Niederschlag', '?'] },
  },
];

async function start(env: TestEnv, l: Learner, items: unknown[]) {
  env.llm.script('explain', { json: { usable: true, title: 'Schemata', subject: null, items } });
  const res = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: randomUUID(),
    kind: 'practice',
    text: 'Kreisläufe, Ketten und Regelkreise',
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

describe.skipIf(!dbReady)('diagrams are checked, stored and graded by code', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-04T09:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2012-02-10' });
  });
  afterEach(() => env.closeChecked());

  it('stores only the questions whose diagram and gap hold', async () => {
    const s = await start(env, l, [...DIAGRAM_ITEMS, ...BROKEN]);
    const prompts = s.items.map((i) => i.item.prompt);
    expect(prompts).toEqual(DIAGRAM_ITEMS.map((i) => i.prompt));
    // Nothing of the broken questions reached the database either.
    const stored = await env.db.query<{ prompt: string }>(
      `select prompt from items where learner_id = $1`,
      [l.learnerId],
    );
    expect(stored.map((r) => r.prompt).sort()).toEqual([...prompts].sort());
    // The app gets the diagram as it was written: boxes, arrows, the gaps as "?".
    expect(s.items[0]?.item.figure).toEqual(waterCycle);
    expect(s.items[4]?.item.figure).toMatchObject({ type: 'diagram', k: 'free' });
  });

  it('grades every gap by code, no tutor', async () => {
    const s = await start(env, l, DIAGRAM_ITEMS);
    const id = (p: string) => s.items.find((i) => i.item.prompt === p)!.item.id;
    const verdict = async (p: string, body: Record<string, unknown>) =>
      (await answer(l, s, id(p), body)).body.verdict;
    expect(await verdict(gapA!.prompt, { text: 'Kondensation' })).toBe('correct');
    expect(await verdict(gapB!.prompt, { text: 'Versickerung' })).toBe('correct');
    expect(await verdict(wordBank!.prompt, { choice: 1 })).toBe('incorrect');
    expect(await verdict(wordBank!.prompt, { choice: 0 })).toBe('correct');
    expect(await verdict(control!.prompt, { text: 'Stellglied' })).toBe('correct');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });
});
