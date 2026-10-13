// A stored question about a labelled picture after the library changed (issue #599): the pictures
// became images, and an image does not show every part the drawing before it did — the bicycle has
// no bell, the plant no root. A question written before names such a part by its id. It stays in
// the database untouched, is never chosen for a new set, and where an older session still holds it
// it is shown without its picture — never with the other parts renumbered, which would make "Wie
// heißt Teil 2?" point at another part. On a real Postgres; no model is asked.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

/** Buddy looks at a finished run and has nothing to do: the one model call these tests allow. */
const WAIT = { json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null } };

const bicycle = (n: string[], ask: number) => ({ type: 'schematic', d: 'bicycle', n, ask });

/** Rows as they were stored while the bicycle was a drawing with a bell — and two that still hold. */
const ROWS = [
  // The bell carries the 1 and is the key.
  {
    prompt: 'Fahrrad: Wie heißt Teil 1?',
    answer: 'Klingel',
    figure: bicycle(['bell', 'saddle'], 1),
  },
  // The saddle is the key, but the bell carries the 1: without it the saddle would become "Teil 1".
  {
    prompt: 'Fahrrad: Wie heißt Teil 2?',
    answer: 'Sattel',
    figure: bicycle(['bell', 'saddle'], 2),
  },
  // A tap on the bell.
  { prompt: 'Tippe auf die Klingel.', answer: 'Klingel', figure: bicycle([], 0), tap: true },
  // These name only parts the image shows.
  {
    prompt: 'Fahrrad: Wie heißt Teil 3?',
    answer: 'Kette',
    figure: bicycle(['saddle', 'frame', 'chain'], 3),
  },
  { prompt: 'Tippe auf den Sattel.', answer: 'Sattel', figure: bicycle([], 0), tap: true },
] as const;
const STALE = ROWS.slice(0, 3).map((r) => r.prompt);
const FINE = ROWS.slice(3).map((r) => r.prompt);

/** A sheet of hers with the five questions, as an earlier version stored them. */
async function sheetOf(
  env: TestEnv,
  l: Learner,
): Promise<{ id: string; items: Map<string, string> }> {
  const sheet = await env.db.one<{ id: string }>(
    `insert into materials (learner_id, client_request_id, status, photo_count, created_at, title)
     values ($1, gen_random_uuid(), 'ready', 1, $2, 'Das Fahrrad') returning id`,
    [l.learnerId, env.clock.now()],
  );
  const items = new Map<string, string>();
  for (const [seq, row] of ROWS.entries()) {
    const { id } = await env.db.one<{ id: string }>(
      `insert into items (learner_id, material_id, kind, prompt, answer, topic, difficulty, origin,
                          figure, tap, seq, created_at)
       values ($1, $2, 'short', $3, $4, 'Fahrrad', 2, 'material', $5, $6, $7, $8) returning id`,
      [
        l.learnerId,
        sheet.id,
        row.prompt,
        row.answer,
        JSON.stringify(row.figure),
        'tap' in row,
        seq,
        env.clock.now(),
      ],
    );
    items.set(row.prompt, id);
  }
  return { id: sheet.id, items };
}

const start = (l: Learner, materialId: string) =>
  l.api.post<SessionView>('/practice/sessions', { material_id: materialId, mode: 'practice' });

const answer = (l: Learner, s: SessionView, itemId: string, text: string) =>
  l.api.post<AnswerResponse>(`/practice/sessions/${s.id}/answer`, {
    client_turn_id: randomUUID(),
    item_id: itemId,
    text,
  });

describe.skipIf(!dbReady)('a stored picture question whose part is gone', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-13T09:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2014-04-12' });
    env.llm.byDefault('buddy_check', WAIT);
  });
  afterEach(() => env.closeChecked());

  it('is never chosen for a set: the set holds the questions that still hold, and completes', async () => {
    const sheet = await sheetOf(env, l);
    const res = await start(l, sheet.id);
    expect(res.status).toBe(201);
    const s = res.body;
    expect(s.items.map((i) => i.item.prompt)).toEqual(FINE);
    // Each with its picture as stored, the tap still a tap.
    expect(s.items.map((i) => i.item.figure)).toEqual(ROWS.slice(3).map((r) => r.figure));
    expect(s.items.map((i) => i.item.tap)).toEqual([false, true]);

    expect((await answer(l, s, s.items[0]!.item.id, 'Kette')).body.verdict).toBe('correct');
    expect((await answer(l, s, s.items[1]!.item.id, 'Sattel')).body.verdict).toBe('correct');
    const done = await l.api.post<SessionView>(`/practice/sessions/${s.id}/finish`, {});
    expect(done.body.status).toBe('finished');
    expect(done.body.summary).not.toBeNull();
    await env.flushBackground();
    // Graded by code: no tutor was asked about a picture.
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });

  it('stays in the database as it was: nothing is rewritten, archived or deleted', async () => {
    const sheet = await sheetOf(env, l);
    await start(l, sheet.id);
    const rows = await env.db.query<{ prompt: string; figure: unknown; archived_at: Date | null }>(
      `select prompt, figure, archived_at from items where material_id = $1 order by seq`,
      [sheet.id],
    );
    expect(rows.map((r) => r.prompt)).toEqual(ROWS.map((r) => r.prompt));
    expect(rows.map((r) => r.figure)).toEqual(ROWS.map((r) => r.figure));
    expect(rows.every((r) => r.archived_at === null)).toBe(true);
  });

  it('a sheet with nothing but such questions gives no set — never an empty or a filled-up one', async () => {
    const sheet = await sheetOf(env, l);
    await env.db.query(`delete from items where material_id = $1 and prompt = any($2)`, [
      sheet.id,
      FINE,
    ]);
    const res = await start(l, sheet.id);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    const sessions = await env.db.query(`select 1 from practice_sessions where learner_id = $1`, [
      l.learnerId,
    ]);
    expect(sessions).toHaveLength(0);
  });

  it('in a session that already holds it, it is shown without its picture — no number shifts', async () => {
    const sheet = await sheetOf(env, l);
    // A set put together before the library changed: all five questions, one answered.
    const session = await env.db.one<{ id: string }>(
      `insert into practice_sessions (learner_id, mode, status, title, client_request_id,
                                      started_at, last_activity_at)
       values ($1, 'practice', 'active', 'Das Fahrrad', gen_random_uuid(), $2, $2) returning id`,
      [l.learnerId, env.clock.now()],
    );
    for (const [position, row] of ROWS.entries()) {
      await env.db.query(
        `insert into session_items (session_id, item_id, position) values ($1, $2, $3)`,
        [session.id, sheet.items.get(row.prompt), position],
      );
    }
    // A past turn that carried the old picture with it (an explanation's figure, #298).
    await env.db.query(
      `insert into practice_turns (session_id, learner_id, item_id, seq, role, text, figure, created_at)
       values ($1, $2, $3, 1, 'tutor', 'Schau: Teil 1 ist die Klingel, Teil 2 der Sattel.', $4, $5),
              ($1, $2, $6, 2, 'tutor', 'Teil 3 ist die Kette.', $7, $5)`,
      [
        session.id,
        l.learnerId,
        sheet.items.get(ROWS[0].prompt),
        JSON.stringify(ROWS[0].figure),
        env.clock.now(),
        sheet.items.get(ROWS[3].prompt),
        JSON.stringify(ROWS[3].figure),
      ],
    );

    const view = await l.api.get<SessionView>(`/practice/sessions/${session.id}`);
    expect(view.status).toBe(200);
    const shown = new Map(view.body.items.map((i) => [i.item.prompt, i.item]));
    for (const prompt of STALE) {
      expect(shown.get(prompt)?.figure, prompt).toBeNull();
      // Nothing to tap either: it is typed like any other question, or taken out.
      expect(shown.get(prompt)?.tap, prompt).toBe(false);
    }
    expect(shown.get(FINE[0]!)?.figure).toEqual(ROWS[3].figure);
    expect(shown.get(FINE[1]!)?.tap).toBe(true);
    // The past turns: the stale picture is gone, the one that holds is still there.
    expect(view.body.turns.map((t) => t.figure)).toEqual([null, ROWS[3].figure]);

    // The session still works: the question that holds is graded, and the run can be finished.
    const fine = shown.get(FINE[0]!)!.id;
    expect((await answer(l, view.body, fine, 'Kette')).body.verdict).toBe('correct');
    const done = await l.api.post<SessionView>(`/practice/sessions/${session.id}/finish`, {});
    expect(done.body.status).toBe('finished');
    await env.flushBackground();
  });

  it('a set Buddy prepared before the library changed starts with what can still be asked', async () => {
    const sheet = await sheetOf(env, l);
    const step = await env.db.one<{ id: string }>(
      `insert into buddy_steps (learner_id, kind, title, state, planned_date, payload, prepared_at)
       values ($1, 'practice', 'Das Fahrrad', 'prepared', '2026-10-13', $2, $3) returning id`,
      [
        l.learnerId,
        {
          item_ids: [...sheet.items.values()],
          est_minutes: 10,
          focus_topics: [],
          subject_id: null,
        },
        env.clock.now(),
      ],
    );
    const started = await l.api.post<{ session: SessionView }>(`/buddy/steps/${step.id}/start`);
    expect(started.status).toBe(200);
    // The five prepared ids, minus the three that name the bell.
    expect(started.body.session.items.map((i) => i.item.prompt)).toEqual(FINE);
    await env.flushBackground();
  });

  it('the sheet’s list of questions shows no picture beside a question that no longer holds', async () => {
    const sheet = await sheetOf(env, l);
    const list = await l.api.get<{ items: Array<{ prompt: string; figure: unknown }> }>(
      `/materials/${sheet.id}/items`,
    );
    expect(list.status).toBe(200);
    const figures = new Map(list.body.items.map((i) => [i.prompt, i.figure]));
    // "Tippe auf die Klingel" beside a bicycle without a bell: the question stands, no picture.
    for (const prompt of STALE) expect(figures.get(prompt), prompt).toBeNull();
    expect(figures.get(FINE[0]!)).toEqual(ROWS[3].figure);
    expect(figures.get(FINE[1]!)).toEqual(ROWS[4].figure);
    // Nothing of the key travels with the list.
    expect(JSON.stringify(list.body)).not.toContain('"answer"');
  });

  it('touches nobody else: another learner’s questions are chosen as before, and hers stay hers', async () => {
    const mine = await sheetOf(env, l);
    const other = await onboard(env, { relation: 'child', name: 'Ben', birthDate: '2014-02-01' });
    const theirs = await sheetOf(env, other);

    const s = (await start(other, theirs.id)).body;
    expect(s.items.map((i) => i.item.prompt)).toEqual(FINE);
    // His ids, none of hers.
    const ids = s.items.map((i) => i.item.id);
    expect(ids.every((id) => [...theirs.items.values()].includes(id))).toBe(true);
    expect(ids.some((id) => [...mine.items.values()].includes(id))).toBe(false);
    // And he cannot start on her sheet, nor answer her question in his session.
    const foreign = await start(other, mine.id);
    expect(foreign.status).toBeGreaterThanOrEqual(400);
    expect((await answer(other, s, mine.items.get(FINE[0]!)!, 'Kette')).status).toBe(404);
  });
});
