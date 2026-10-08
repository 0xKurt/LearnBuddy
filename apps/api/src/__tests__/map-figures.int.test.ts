// Questions on a stumme Karte end to end (issue #251): a Land to tap, a marked country to name, a
// continent to tap; since #429 a small country on the closer Ausschnitt code picks, a river to tap
// and one to name, a capital to tap, and on the Gradnetz a crossing to tap and the coordinates of
// a marked one to type — in her language, where "60° O" is west in French — what the model
// writes, what code drops, what is stored, what the app gets back and how an answer is graded, on
// a real Postgres.
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
  BROKEN_MAP_ITEMS,
  FRENCH_GRID_ITEM,
  GRID_ITEMS,
  MAP_ITEMS,
} from '../testing/scenarios/map.js';

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
    const good = [...MAP_ITEMS, ...GRID_ITEMS];
    const s = await start(env, l, [...good, ...BROKEN_MAP_ITEMS]);
    expect(s.items.map((i) => i.item.prompt)).toEqual(good.map((i) => i.prompt));
    const rows = await env.db.query<{ prompt: string; tap: boolean; figure: unknown }>(
      `select prompt, tap, figure from items where learner_id = $1`,
      [l.learnerId],
    );
    const stored = good.map((i) => rows.find((r) => r.prompt === i.prompt));
    expect(rows).toHaveLength(good.length);
    const taps = [true, false, true, true, false, true, false, true, true, true, false];
    expect(stored.map((r) => r?.tap)).toEqual(taps);
    // "France" as the model wrote it is stored as the data's id.
    expect(stored[1]?.figure).toEqual({ type: 'map', v: 'europe', hl: ['FR'], l: 'regions' });
    // Luxembourg is too small on the whole of Europe: code stores the closer view she taps on (#429).
    expect(stored[2]?.figure).toEqual({ type: 'map', v: 'eu_central', hl: [], l: 'regions' });
    // A marked river by its id, on its layer.
    expect(stored[4]?.figure).toEqual({ type: 'map', v: 'de', hl: ['elbe'], l: 'rivers' });
    // The app is told which questions to tap.
    expect(s.items.map((i) => i.item.tap)).toEqual(taps);
  });

  it('stores a crossing of the Gradnetz as code writes it, never zoomed (#429)', async () => {
    const s = await start(env, l, GRID_ITEMS);
    const rows = await env.db.query<{ prompt: string; answer: string; figure: unknown }>(
      `select prompt, answer, figure from items where learner_id = $1`,
      [l.learnerId],
    );
    const stored = (i: number) => rows.find((r) => r.prompt === GRID_ITEMS[i]!.prompt);
    // Mia goes to school in Niedersachsen (the harness's Land): code outlines it (#429, the
    // default; `map-home.int.test.ts`).
    expect(stored(0)?.figure).toEqual({ type: 'map', v: 'de', hl: [], l: 'grid', home: 'NI' });
    // "60°N 10°O" as the model wrote it: stored as code writes it, on the whole of Europe.
    expect(stored(1)?.answer).toBe('60° N, 10° O');
    expect(stored(1)?.figure).toEqual({ type: 'map', v: 'europe', hl: [], l: 'grid' });
    expect(stored(2)?.figure).toEqual({
      type: 'map',
      v: 'world',
      hl: ['30° S, 60° W'],
      l: 'grid',
    });
    expect(s.items.map((i) => i.item.tap)).toEqual([true, true, false]);
  });

  it('grades a tapped crossing and typed coordinates by code (#429)', async () => {
    const s = await start(env, l, GRID_ITEMS);
    const [de, europe, world] = s.items.map((i) => i.item.id) as string[];
    // What the app writes after the tap: the crossing as German writes it.
    expect((await answer(l, s, de!, '51° N, 10° O')).body.verdict).toBe('incorrect');
    expect((await answer(l, s, de!, '50° N, 10° O')).body.verdict).toBe('correct');
    expect((await answer(l, s, europe!, '60° N, 10° O')).body.verdict).toBe('correct');
    // Typed in her own notation; east where the key is west is wrong.
    expect((await answer(l, s, world!, '30° S, 60° O')).body.verdict).toBe('incorrect');
    expect((await answer(l, s, world!, '30°S 60°W')).body.verdict).toBe('correct');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('reads "O" as her language means it: west for a French learner (#429)', async () => {
    const fr = await onboard(env, {
      relation: 'child',
      name: 'Léa',
      birthDate: '2015-05-01',
      locale: 'fr',
    });
    const tap = {
      ...GRID_ITEMS[0]!,
      prompt: 'Touche le point 50° N, 10° E.',
      answer: '50° N, 10° E',
    };
    const s = await start(env, fr, [tap, FRENCH_GRID_ITEM]);
    const rows = await env.db.query<{ answer: string; figure: unknown }>(
      `select answer, figure from items where learner_id = $1 and prompt = $2`,
      [fr.learnerId, FRENCH_GRID_ITEM.prompt],
    );
    // "60° O" as the French model wrote it is west: stored as code writes it, W in every language.
    expect(rows[0]?.answer).toBe('30° S, 60° W');
    expect(rows[0]?.figure).toEqual({ type: 'map', v: 'world', hl: ['30° S, 60° W'], l: 'grid' });
    const [tapped, typed] = s.items.map((i) => i.item.id) as string[];
    expect((await answer(fr, s, typed!, '30° S, 60° E')).body.verdict).toBe('incorrect');
    expect((await answer(fr, s, typed!, '30° S, 60° O')).body.verdict).toBe('correct');
    // A tap stands in the thread as she reads it: east is E in French.
    expect((await answer(fr, s, tapped!, '50° N, 10° O')).body.verdict).toBe('correct');
    const view = (await fr.api.get<SessionView>(`/practice/sessions/${s.id}`)).body;
    const mine = view.turns.find((t) => t.item_id === tapped && t.role === 'learner');
    expect(mine?.text).toBe('50° N, 10° E');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('grades a tapped region and a typed name by code, in any of the five languages', async () => {
    const s = await start(env, l, MAP_ITEMS);
    const [land, country, small, river, marked, city, range, continent] = s.items.map(
      (i) => i.item.id,
    ) as string[];
    // What the app writes after the tap: the place's German name.
    expect((await answer(l, s, land!, 'Bayern')).body.verdict).toBe('correct');
    // Typed in English, the marked country is still France.
    expect((await answer(l, s, country!, 'France')).body.verdict).toBe('correct');
    expect((await answer(l, s, small!, 'Luxemburg')).body.verdict).toBe('correct');
    expect((await answer(l, s, river!, 'Rhein')).body.verdict).toBe('correct');
    expect((await answer(l, s, marked!, 'Elbe')).body.verdict).toBe('correct');
    expect((await answer(l, s, city!, 'München')).body.verdict).toBe('correct');
    expect((await answer(l, s, range!, 'Harz')).body.verdict).toBe('correct');
    expect((await answer(l, s, continent!, 'Südamerika')).body.verdict).toBe('correct');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('another region is wrong for code, never the tutor’s to judge', async () => {
    const s = await start(env, l, MAP_ITEMS);
    const [land, country, small, river, marked, city, range, continent] = s.items.map(
      (i) => i.item.id,
    ) as string[];
    // Baden-Württemberg beside Bayern: a neighbour, and certainly not the Land asked for.
    expect((await answer(l, s, land!, 'Baden-Württemberg')).body.verdict).toBe('incorrect');
    expect((await answer(l, s, country!, 'Spanien')).body.verdict).toBe('incorrect');
    expect((await answer(l, s, small!, 'Belgien')).body.verdict).toBe('incorrect');
    // The Main flows into the Rhein: close, and still another river.
    expect((await answer(l, s, river!, 'Main')).body.verdict).toBe('incorrect');
    expect((await answer(l, s, marked!, 'Oder')).body.verdict).toBe('incorrect');
    expect((await answer(l, s, city!, 'Stuttgart')).body.verdict).toBe('incorrect');
    expect((await answer(l, s, range!, 'Erzgebirge')).body.verdict).toBe('incorrect');
    expect((await answer(l, s, continent!, 'Nordamerika')).body.verdict).toBe('incorrect');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('a tapped region stands in the thread in her language, a typed answer as she typed it', async () => {
    const en = await onboard(env, {
      relation: 'child',
      name: 'Emma',
      birthDate: '2015-03-01',
      locale: 'en',
    });
    const s = await start(env, en, MAP_ITEMS);
    const [land, country, , river] = s.items.map((i) => i.item.id) as string[];
    // The app writes a tap as the data's German name; the server writes it as she reads it.
    expect((await answer(en, s, land!, 'Bayern')).body.verdict).toBe('correct');
    expect((await answer(en, s, country!, 'Frankreich')).body.verdict).toBe('correct');
    expect((await answer(en, s, river!, 'Rhein')).body.verdict).toBe('correct');
    const view = (await en.api.get<SessionView>(`/practice/sessions/${s.id}`)).body;
    const mine = (id: string) => view.turns.find((t) => t.item_id === id && t.role === 'learner');
    expect(mine(land!)?.text).toBe('Bavaria');
    // A tapped river too (#429).
    expect(mine(river!)?.text).toBe('Rhine');
    // Not tapped: her own words stay hers.
    expect(mine(country!)?.text).toBe('Frankreich');
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
