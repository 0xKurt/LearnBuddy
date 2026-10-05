// Questions on a stumme Karte end to end (issue #251): a Land to tap, a marked country to name, a
// continent to tap — what the model writes, what code drops, what is stored, what the app gets
// back and how an answer is graded, on a real Postgres.
//
// Model calls are scripted; every answer graded below is graded by code, so the harness's failure
// on an unscripted call proves no tutor was asked.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';
import { BROKEN_MAP_ITEMS, MAP_ITEMS } from '../testing/scenarios/map.js';

const dbReady = await testDatabaseAvailable();

async function start(env: TestEnv, l: Learner, items: unknown[]) {
  env.llm.script('explain', {
    json: { usable: true, title: 'Karten lesen', subject: null, items },
  });
  const res = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: randomUUID(),
    kind: 'practice',
    text: 'Karten lesen',
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

describe.skipIf(!dbReady)('a question on a stumme Karte', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-05T09:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2015-04-12' });
  });
  afterEach(() => env.closeChecked());

  it('stores only questions whose regions the map has, the marked ones by id', async () => {
    const s = await start(env, l, [...MAP_ITEMS, ...BROKEN_MAP_ITEMS]);
    expect(s.items.map((i) => i.item.prompt)).toEqual(MAP_ITEMS.map((i) => i.prompt));
    const rows = await env.db.query<{ prompt: string; tap: boolean; figure: unknown }>(
      `select prompt, tap, figure from items where learner_id = $1`,
      [l.learnerId],
    );
    const stored = MAP_ITEMS.map((i) => rows.find((r) => r.prompt === i.prompt));
    expect(rows).toHaveLength(MAP_ITEMS.length);
    expect(stored.map((r) => r?.tap)).toEqual([true, false, true]);
    // "France" as the model wrote it is stored as the data's id.
    expect(stored[1]?.figure).toEqual({ type: 'map', v: 'europe', hl: ['FR'] });
    // The app is told which questions to tap.
    expect(s.items.map((i) => i.item.tap)).toEqual([true, false, true]);
  });

  it('grades a tapped region and a typed name by code, in any of the five languages', async () => {
    const s = await start(env, l, MAP_ITEMS);
    const [land, country, continent] = s.items.map((i) => i.item.id) as string[];
    // What the app writes after the tap: the region's German name.
    expect((await answer(l, s, land!, 'Bayern')).body.verdict).toBe('correct');
    // Typed in English, the marked country is still France.
    expect((await answer(l, s, country!, 'France')).body.verdict).toBe('correct');
    expect((await answer(l, s, continent!, 'Südamerika')).body.verdict).toBe('correct');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('another region is wrong for code, never the tutor’s to judge', async () => {
    const s = await start(env, l, MAP_ITEMS);
    const [land, country, continent] = s.items.map((i) => i.item.id) as string[];
    // Baden-Württemberg beside Bayern: a neighbour, and certainly not the Land asked for.
    expect((await answer(l, s, land!, 'Baden-Württemberg')).body.verdict).toBe('incorrect');
    expect((await answer(l, s, country!, 'Spanien')).body.verdict).toBe('incorrect');
    expect((await answer(l, s, continent!, 'Nordamerika')).body.verdict).toBe('incorrect');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('another learner cannot answer her map question', async () => {
    const s = await start(env, l, MAP_ITEMS);
    const other = await onboard(env, { relation: 'child', name: 'Ben', birthDate: '2015-02-01' });
    const res = await other.api.post(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: s.items[0]!.item.id,
      text: 'Bayern',
    });
    expect(res.status).toBe(404);
  });
});
