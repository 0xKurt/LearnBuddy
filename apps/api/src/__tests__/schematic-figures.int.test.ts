// Labelled pictures end to end (issue #252): a labelling task code turns into one question per
// number, a part to name, a part to tap — what the model writes, what code drops, what is stored,
// what the app gets back and how an answer is graded, on a real Postgres.
//
// Model calls are scripted; every answer graded below is graded by code, so the harness's failure
// on an unscripted call proves no tutor was asked.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';
import {
  BROKEN_SCHEMATIC_ITEMS,
  SCHEMATIC_ITEMS,
  SCHEMATIC_PROMPTS,
} from '../testing/scenarios/schematic.js';

const dbReady = await testDatabaseAvailable();

async function start(env: TestEnv, l: Learner, items: unknown[]) {
  env.llm.script('explain', {
    json: { usable: true, title: 'Bilder beschriften', subject: null, items },
  });
  const res = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: randomUUID(),
    kind: 'practice',
    text: 'Bilder beschriften',
  });
  expect(res.status).toBe(201);
  await env.flushBackground();
  return (await l.api.get<SessionView>(`/practice/sessions/${res.body.id}`)).body;
}

const answer = (l: Learner, s: SessionView, itemId: string, text: string) =>
  l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
    client_turn_id: randomUUID(),
    item_id: itemId,
    text,
  });

describe.skipIf(!dbReady)('a labelled picture', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-05T09:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2014-04-12' });
  });
  afterEach(() => env.closeChecked());

  it('"Zelle beschriften" gives five questions, every word and key of them from code', async () => {
    const label = {
      ...SCHEMATIC_ITEMS[0]!,
      figure: {
        type: 'schematic',
        d: 'plant_cell',
        n: ['Zellkern', 'Vakuole', 'Chloroplast', 'Zellwand', 'Zellmembran'],
        ask: 0,
      },
    };
    const s = await start(env, l, [label]);
    expect(s.items.map((i) => i.item.prompt)).toEqual(
      [1, 2, 3, 4, 5].map((n) => `Pflanzenzelle: Wie heißt Teil ${n}?`),
    );
    const rows = await env.db.query<{ prompt: string; answer: string; figure: unknown }>(
      `select prompt, answer, figure from items where learner_id = $1`,
      [l.learnerId],
    );
    const third = rows.find((r) => r.prompt.endsWith('Teil 3?'));
    expect(third?.answer).toBe('Chloroplast');
    // Stored by id, the number asked with it.
    expect(third?.figure).toEqual({
      type: 'schematic',
      d: 'plant_cell',
      n: ['nucleus', 'vacuole', 'chloroplast', 'wall', 'membrane'],
      ask: 3,
    });
  });

  it('stores only questions about parts the drawing has, a tap only on a part a finger can hit', async () => {
    const s = await start(env, l, [...SCHEMATIC_ITEMS, ...BROKEN_SCHEMATIC_ITEMS]);
    expect(s.items.map((i) => i.item.prompt)).toEqual(SCHEMATIC_PROMPTS);
    expect(s.items.map((i) => i.item.tap)).toEqual([false, false, false, true, true]);
  });

  it('grades a named part in any language and a tapped part by code, never the tutor', async () => {
    const s = await start(env, l, SCHEMATIC_ITEMS);
    const [one, two, , nucleus, frame] = s.items.map((i) => i.item.id) as string[];
    expect((await answer(l, s, one!, 'Nukleus')).body.verdict).toBe('correct');
    expect((await answer(l, s, two!, 'vacuole')).body.verdict).toBe('correct');
    expect((await answer(l, s, nucleus!, 'Vakuole')).body.verdict).toBe('incorrect');
    expect((await answer(l, s, frame!, 'Rahmen')).body.verdict).toBe('correct');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('a tapped part stands in the thread in her language', async () => {
    const en = await onboard(env, {
      relation: 'child',
      name: 'Emma',
      birthDate: '2014-03-01',
      locale: 'en',
    });
    const s = await start(env, en, SCHEMATIC_ITEMS);
    const nucleus = s.items[3]!.item.id;
    expect((await answer(en, s, nucleus, 'Zellkern')).body.verdict).toBe('correct');
    const view = (await en.api.get<SessionView>(`/practice/sessions/${s.id}`)).body;
    const mine = view.turns.find((t) => t.item_id === nucleus && t.role === 'learner');
    expect(mine?.text).toBe('nucleus');
  });

  it('another learner cannot answer her picture question', async () => {
    const s = await start(env, l, SCHEMATIC_ITEMS);
    const other = await onboard(env, { relation: 'child', name: 'Ben', birthDate: '2014-02-01' });
    expect((await answer(other, s, s.items[0]!.item.id, 'Zellkern')).status).toBe(404);
  });
});
