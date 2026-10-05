// Tapping inside a figure end to end (issue #248): a place on a number line, a point of a
// coordinate system, a column of a bar chart and a clock face to set — what the model writes, what
// code drops, what is stored, what the app gets back and how a tap is graded, on a real Postgres.
//
// Model calls are scripted; every answer graded below is graded by code, so the harness's failure
// on an unscripted call proves no tutor was asked.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';
import { BROKEN_TAP_ITEMS, TAP_ITEMS } from '../testing/scenarios/tap.js';

const dbReady = await testDatabaseAvailable();

async function start(env: TestEnv, l: Learner, items: unknown[]) {
  env.llm.script('explain', {
    json: { usable: true, title: 'In die Figur tippen', subject: null, items },
  });
  const res = await l.api.post<SessionView>('/practice/topic', {
    client_request_id: randomUUID(),
    kind: 'practice',
    text: 'In die Figur tippen',
  });
  expect(res.status).toBe(201);
  await env.flushBackground();
  return (await l.api.get<SessionView>(`/practice/sessions/${res.body.id}`)).body;
}

const answer = (
  l: Learner,
  s: SessionView,
  itemId: string,
  text: string,
  turn: string = randomUUID(),
) =>
  l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
    client_turn_id: turn,
    item_id: itemId,
    text,
  });

describe.skipIf(!dbReady)('a question answered by tapping its figure', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-05T09:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2016-04-12' });
  });
  afterEach(() => env.closeChecked());

  it('stores only questions whose key lies on a place of the figure that it does not mark', async () => {
    const s = await start(env, l, [...TAP_ITEMS, ...BROKEN_TAP_ITEMS]);
    expect(s.items.map((i) => i.item.prompt)).toEqual(TAP_ITEMS.map((i) => i.prompt));
    const stored = await env.db.query<{ prompt: string; tap: boolean }>(
      `select prompt, tap from items where learner_id = $1`,
      [l.learnerId],
    );
    expect(stored).toHaveLength(TAP_ITEMS.length);
    expect(stored.every((r) => r.tap)).toBe(true);
    // The app is told to offer the tap, and the clock comes without hands: nothing to copy.
    expect(s.items.every((i) => i.item.tap)).toBe(true);
    expect(s.items[3]?.item.figure).toEqual({ type: 'clock', c: [], h24: false, ask: 'none' });
  });

  it('grades every tap on the key’s place right, by code', async () => {
    const s = await start(env, l, TAP_ITEMS);
    const [line, point, column, clock] = s.items.map((i) => i.item.id) as string[];
    // What the app writes after the tap — and a key's other spellings of the same place.
    expect((await answer(l, s, line!, '2.5')).body.verdict).toBe('correct');
    expect((await answer(l, s, point!, '(2|-1)')).body.verdict).toBe('correct');
    expect((await answer(l, s, column!, 'Apr')).body.verdict).toBe('correct');
    expect((await answer(l, s, clock!, '7:45')).body.verdict).toBe('correct');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
    // Closed, the figure is only read again: the view offers no tap.
    const after = (await l.api.get<SessionView>(`/practice/sessions/${s.id}`)).body;
    expect(after.items.every((i) => !i.item.tap)).toBe(true);
  });

  it('a tap on another place is wrong for code, never the tutor’s to judge', async () => {
    const s = await start(env, l, TAP_ITEMS);
    const [line, point, column, clock] = s.items.map((i) => i.item.id) as string[];
    expect((await answer(l, s, line!, '3')).body.verdict).toBe('incorrect');
    // x and y swapped: a classic, and certainly not the point asked for.
    expect((await answer(l, s, point!, '(-1|2)')).body.verdict).toBe('incorrect');
    expect((await answer(l, s, column!, 'Mär')).body.verdict).toBe('incorrect');
    // The hands of 8:45 — the hour hand one number too far.
    expect((await answer(l, s, clock!, '8:45')).body.verdict).toBe('incorrect');
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('the same tap sent twice is one answer', async () => {
    const s = await start(env, l, TAP_ITEMS);
    const point = s.items[1]!.item.id;
    const turn = randomUUID();
    const first = await answer(l, s, point, '(1|1)', turn);
    const again = await answer(l, s, point, '(1|1)', turn);
    expect(again.body).toEqual(first.body);
    const tries = await env.db.query(
      `select 1 from practice_turns where session_id = $1 and item_id = $2 and role = 'learner'`,
      [s.id, point],
    );
    expect(tries).toHaveLength(1);
  });

  it('a stored question that no longer holds is typed, not tapped', async () => {
    const s = await start(env, l, TAP_ITEMS);
    const line = s.items[0]!.item.id;
    // The line now marks the key itself (a row edited by hand, or written under an older check).
    await env.db.query(
      `update items set figure = jsonb_set(figure, '{points}', '[{"value": 2.5, "label": "P"}]')
        where id = $1`,
      [line],
    );
    const view = (await l.api.get<SessionView>(`/practice/sessions/${s.id}`)).body;
    expect(view.items[0]?.item.tap).toBe(false);
    expect(view.items[1]?.item.tap).toBe(true);
  });

  it('another learner cannot read the session or tap its figures', async () => {
    const s = await start(env, l, TAP_ITEMS);
    const other = await onboard(env, { relation: 'child', name: 'Pia', birthDate: '2016-03-03' });
    expect((await other.api.get(`/practice/sessions/${s.id}`)).status).toBe(404);
    expect((await answer(other, s, s.items[0]!.item.id, '2.5')).status).toBe(404);
  });
});
