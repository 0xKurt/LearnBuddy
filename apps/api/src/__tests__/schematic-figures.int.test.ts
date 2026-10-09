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
  LIBRARY_ITEMS,
  LIBRARY_MORE_ITEMS,
  LIBRARY_REST_ITEMS,
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
    expect(s.items.map((i) => i.item.tap)).toEqual([false, false, false, true, true, true]);
  });

  it('grades a named part in any language and a tapped part by code, never the tutor', async () => {
    const s = await start(env, l, SCHEMATIC_ITEMS);
    const [one, two, , nucleus, frame, sign] = s.items.map((i) => i.item.id) as string[];
    expect((await answer(l, s, one!, 'Nukleus')).body.verdict).toBe('correct');
    expect((await answer(l, s, two!, 'vacuole')).body.verdict).toBe('correct');
    expect((await answer(l, s, nucleus!, 'Vakuole')).body.verdict).toBe('incorrect');
    expect((await answer(l, s, frame!, 'Rahmen')).body.verdict).toBe('correct');
    // A drawing of #252's second part: the traffic signs, the stop sign tapped for the cycle path.
    expect((await answer(l, s, sign!, 'Stoppschild')).body.verdict).toBe('incorrect');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('every drawing of the second part, numbered and tapped: stored as written, graded by code', async () => {
    const s = await start(env, l, LIBRARY_ITEMS);
    expect(s.items.map((i) => i.item.prompt)).toEqual(LIBRARY_ITEMS.map((i) => i.prompt));
    expect(s.items.map((i) => i.item.tap)).toEqual(LIBRARY_ITEMS.map((i) => 'tap' in i));
    for (const [k, { item }] of s.items.entries()) {
      const verdict = (await answer(l, s, item.id, LIBRARY_ITEMS[k]!.answer)).body.verdict;
      expect(verdict, item.prompt).toBe('correct');
    }
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('the lens, the pupil, the stigma and the stamen drawn large are tapped again (#462)', async () => {
    // The same parts in the whole drawing: a finger is too wide there, the question is dropped.
    const whole = (d: string, prompt: string, answer: string) => ({
      ...SCHEMATIC_ITEMS[2]!,
      prompt,
      answer,
      figure: { type: 'schematic', d, n: [], ask: 0 },
    });
    const large = LIBRARY_MORE_ITEMS.filter(
      (i) => ['Linse', 'Pupille', 'Narbe', 'Staubblatt'].includes(i.answer) && 'tap' in i,
    );
    expect(large).toHaveLength(4);
    const s = await start(env, l, [
      whole('eye', 'Tippe auf die Pupille im Auge.', 'Pupille'),
      whole('flower', 'Tippe auf die Narbe der Blüte.', 'Narbe'),
      ...large,
    ]);
    expect(s.items.map((i) => i.item.prompt)).toEqual(large.map((i) => i.prompt));
    const rows = await env.db.query<{ id: string; answer: string; figure: unknown; tap: boolean }>(
      `select id, answer, figure, tap from items where learner_id = $1`,
      [l.learnerId],
    );
    // The two taps on the whole drawing were never stored.
    expect(rows).toHaveLength(4);
    // In the order of the run.
    const stored = s.items.map(({ item }) => rows.find((r) => r.id === item.id)!);
    expect(stored.map((r) => [r.answer, r.tap, (r.figure as { d: string }).d])).toEqual([
      ['Linse', true, 'eye_front'],
      ['Pupille', true, 'eye_front'],
      ['Narbe', true, 'flower_section'],
      ['Staubblatt', true, 'flower_section'],
    ]);
    // Graded by code, by the part's id: any of its names counts, another part does not.
    const [lens, pupil, stigma, stamen] = s.items.map((i) => i.item.id) as string[];
    expect((await answer(l, s, lens!, 'Linse')).body.verdict).toBe('correct');
    expect((await answer(l, s, pupil!, 'Regenbogenhaut')).body.verdict).toBe('incorrect');
    expect((await answer(l, s, stigma!, 'stigma')).body.verdict).toBe('correct');
    expect((await answer(l, s, stamen!, 'Staubbeutel')).body.verdict).toBe('correct');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it.each([
    ['the first run', LIBRARY_MORE_ITEMS],
    ['the second run', LIBRARY_REST_ITEMS],
  ])(
    'every drawing of #462, %s numbered and tapped: stored as written, graded by code',
    async (_, items) => {
      const s = await start(env, l, items);
      expect(s.items.map((i) => i.item.prompt)).toEqual(items.map((i) => i.prompt));
      expect(s.items.map((i) => i.item.tap)).toEqual(items.map((i) => 'tap' in i));
      for (const [k, { item }] of s.items.entries()) {
        const verdict = (await answer(l, s, item.id, items[k]!.answer)).body.verdict;
        expect(verdict, item.prompt).toBe('correct');
      }
      expect(env.llm.callsFor('tutor')).toHaveLength(0);
    },
  );

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
