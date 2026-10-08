// Her own Land as the default of a map (issue #429, owner's decision of 08.10.): where her profile
// names the Bundesland she goes to school in, a map the model wrote without a view is the map of
// Germany, and her Land is outlined on it — read by code from HER profile, never from the model,
// and never where it would point at the key. Without a Land nothing changes: a map without a view
// cannot be drawn and costs its question, a map with one is stored as before. On a real Postgres.
//
// Model calls are scripted.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { CurriculumRegion, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';
import { GRID_ITEMS, MAP_ITEMS } from '../testing/scenarios/map.js';

const dbReady = await testDatabaseAvailable();

const [tapBayern, markedFrance] = MAP_ITEMS;
const [gridDe] = GRID_ITEMS;
const map = (fig: Record<string, unknown>) => ({ type: 'map', hl: [], ...fig });

/** The questions of one run, as the model writes them for a topic like "Bundesländer". */
const ITEMS = [
  // No view: the model asks for no particular map.
  { ...tapBayern!, prompt: 'Tippe auf Hessen.', answer: 'Hessen', figure: map({}) },
  // Europe, as the topic asks: the model's view stands.
  markedFrance!,
  // Her Land is the key: never outlined.
  { ...tapBayern!, prompt: 'Tippe auf Bayern.', figure: map({ v: 'de' }) },
  // Her Land is the marked one: never outlined.
  {
    ...markedFrance!,
    prompt: 'Wie heißt das markierte Bundesland?',
    answer: 'Bayern',
    figure: map({ v: 'de', hl: ['Bayern'] }),
  },
  // A river: her Land would say where it flows.
  { ...tapBayern!, prompt: 'Tippe auf den Main.', answer: 'Main', figure: map({ l: 'rivers' }) },
  // The Gradnetz of Germany: her Land says nothing about a crossing.
  gridDe!,
];

async function learnerIn(env: TestEnv, region: CurriculumRegion | null, name: string) {
  const l = await onboard(env, {
    relation: 'child',
    name,
    birthDate: '2015-04-12',
    ...(region === null ? {} : { region }),
  });
  // `null` is the state of every profile from before #199; POST /learner requires a value.
  if (region === null) {
    await env.db.query(`update learners set curriculum_region = null where id = $1`, [l.learnerId]);
  }
  return l;
}

async function start(env: TestEnv, l: Learner, items: unknown[]) {
  env.llm.script('explain', {
    json: { usable: true, title: 'Bundesländer', subject: null, items },
  });
  const res = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: randomUUID(),
    kind: 'practice',
    text: 'Bundesländer',
  });
  expect(res.status).toBe(201);
  await env.flushBackground();
  return (await l.api.get<SessionView>(`/practice/sessions/${res.body.id}`)).body;
}

/** Her stored map questions by prompt: what she gets. */
async function storedMaps(env: TestEnv, l: Learner) {
  const rows = await env.db.query<{ prompt: string; figure: unknown }>(
    `select prompt, figure from items where learner_id = $1`,
    [l.learnerId],
  );
  return new Map(rows.map((r) => [r.prompt, r.figure]));
}

/** What the model was told about her Land in the run's one call. */
function homeLine(env: TestEnv): string | null {
  const text = env.llm
    .callsFor('explain')
    .flatMap((c) => c.contents.flatMap((m) => m.parts.map((p) => ('text' in p ? p.text : ''))))
    .join('\n');
  return /^HOME LAND: [^.]*\./m.exec(text)?.[0] ?? null;
}

describe.skipIf(!dbReady)('her own Land on a map (#429)', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-08T09:00:00Z' });
  });
  afterEach(() => env.closeChecked());

  it('in Bayern: a map without a view is Germany, her Land outlined where it gives nothing away', async () => {
    const l = await learnerIn(env, 'by', 'Mia');
    const s = await start(env, l, ITEMS);
    expect(homeLine(env)).toBe('HOME LAND: Bayern.');
    expect(s.items.map((i) => i.item.prompt)).toEqual(ITEMS.map((i) => i.prompt));
    const stored = await storedMaps(env, l);
    expect(stored.get('Tippe auf Hessen.')).toEqual(map({ v: 'de', l: 'regions', home: 'BY' }));
    expect(stored.get(markedFrance!.prompt)).toEqual(
      map({ v: 'europe', hl: ['FR'], l: 'regions' }),
    );
    expect(stored.get('Tippe auf Bayern.')).toEqual(map({ v: 'de', l: 'regions' }));
    expect(stored.get('Wie heißt das markierte Bundesland?')).toEqual(
      map({ v: 'de', hl: ['BY'], l: 'regions' }),
    );
    expect(stored.get('Tippe auf den Main.')).toEqual(map({ v: 'de', l: 'rivers' }));
    expect(stored.get(gridDe!.prompt)).toEqual(map({ v: 'de', l: 'grid', home: 'BY' }));
    // The app gets her Land with the map, and the question is answered as any other.
    const hessen = s.items.find((i) => i.item.prompt === 'Tippe auf Hessen.')!.item;
    expect(hessen.figure).toEqual(map({ v: 'de', l: 'regions', home: 'BY' }));
    const res = await l.api.post<{ verdict: string }>(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: hessen.id,
      text: 'Hessen',
    });
    expect(res.body.verdict).toBe('correct');
  });

  it('without a Land nothing changes: no outline, and a map without a view costs its question', async () => {
    const l = await learnerIn(env, null, 'Ole');
    const s = await start(env, l, ITEMS);
    expect(homeLine(env)).toBeNull();
    // The two maps without a view go; every other question is stored as before #429.
    const kept = ITEMS.filter((i) => 'v' in i.figure);
    expect(s.items.map((i) => i.item.prompt)).toEqual(kept.map((i) => i.prompt));
    const stored = await storedMaps(env, l);
    expect(stored.get('Tippe auf Bayern.')).toEqual(map({ v: 'de', l: 'regions' }));
    expect(stored.get(gridDe!.prompt)).toEqual(map({ v: 'de', l: 'grid' }));
    expect([...stored.values()].some((f) => JSON.stringify(f).includes('home'))).toBe(false);
  });

  it('not at a German school ("other", a value no Land has): no outline, no error', async () => {
    const l = await learnerIn(env, 'other', 'Noah');
    const s = await start(env, l, ITEMS);
    expect(homeLine(env)).toBeNull();
    expect(s.items).toHaveLength(ITEMS.length - 2);
    const stored = await storedMaps(env, l);
    expect(stored.get(gridDe!.prompt)).toEqual(map({ v: 'de', l: 'grid' }));
    expect([...stored.values()].some((f) => JSON.stringify(f).includes('home'))).toBe(false);
  });

  it('only her own profile counts: another learner in Bayern changes nothing for her', async () => {
    await learnerIn(env, 'by', 'Mia');
    const ole = await learnerIn(env, null, 'Ole');
    const ida = await learnerIn(env, 'sh', 'Ida');
    const forOle = await start(env, ole, ITEMS);
    expect(forOle.items).toHaveLength(ITEMS.length - 2);
    expect(JSON.stringify(forOle.items)).not.toContain('home');
    const forIda = await start(env, ida, ITEMS);
    expect(homeLine(env)).toBe('HOME LAND: Schleswig-Holstein.');
    const stored = await storedMaps(env, ida);
    expect(stored.get('Tippe auf Hessen.')).toEqual(map({ v: 'de', l: 'regions', home: 'SH' }));
    // Bayern is no longer hers to give away: outlined Schleswig-Holstein beside it.
    expect(stored.get('Tippe auf Bayern.')).toEqual(map({ v: 'de', l: 'regions', home: 'SH' }));
    expect(forIda.items).toHaveLength(ITEMS.length);
  });
});
