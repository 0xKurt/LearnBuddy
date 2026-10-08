// Kopfrechnen-Schnellrunde (issue #243) on a real Postgres: started from the chat, twenty tasks
// answered, and not one model call for any of it — `llm_calls` stays empty from the tap on
// Buddy's offer to the line at the end. Plus what every practice door must hold: another
// learner's round is not found, a repeated answer is recorded once, the round cannot be
// answered through the tutor's door, and the weak facts come back.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { SendMessageResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { factOf, valueOf } from '../modules/practice/drill.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const why = (body: unknown): string | undefined =>
  (body as { error?: { details?: { reason?: string } } }).error?.details?.reason;

const turn = (over: Record<string, unknown>) => ({
  json: {
    lookups: [],
    concern: false,
    also_asked: false,
    actions: [],
    reply: 'Alles klar.',
    options: null,
    asks_permission: false,
    ...over,
  },
});

/** The value of a task, read back from its fact the way the server checks it. */
async function keyOfItem(env: TestEnv, itemId: string): Promise<string> {
  const row = await env.db.one<{ drill_fact: string }>(
    `select drill_fact from items where id = $1`,
    [itemId],
  );
  const v = valueOf(factOf(row.drill_fact)!);
  return v.d === 1 ? String(v.n) : `${v.n}/${v.d}`;
}

async function llmCalls(env: TestEnv): Promise<number> {
  const r = await env.db.one<{ n: number }>(`select count(*)::int as n from llm_calls`);
  return r.n;
}

describe.skipIf(!dbReady)('Kopfrechnen: a round code writes and checks', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T14:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2016-02-10' });
  });
  afterEach(() => env.closeChecked());

  async function start(spec: Record<string, unknown>, id: string = randomUUID()) {
    return l.api.post<SessionView>('/practice/drills', { client_request_id: id, spec });
  }

  it('from "Lass uns Einmaleins üben" to the line at the end: 20 tasks, zero model calls', async () => {
    // The chat turn is the one model call of the whole story — Buddy picks the range.
    env.llm.script(
      'buddy_turn',
      turn({
        actions: [{ tool: 'offer_drill', args: { range: 'times', rows: [7, 6], carry: null } }],
        reply: 'Klar – eine schnelle Runde mit den 6ern und 7ern.',
      }),
    );
    const sent = await l.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: randomUUID(),
      text: 'Lass uns Einmaleins üben, die 6er und 7er',
    });
    expect(sent.status).toBe(200);
    const offer = sent.body.home.thread
      .flatMap((m) => m.actions)
      .find((a) => a.summary.tool === 'offer_drill');
    expect(offer?.summary).toEqual({
      tool: 'offer_drill',
      range: 'times',
      rows: [6, 7],
      carry: null,
      title: 'Einmaleins mit 6 und 7',
    });
    await env.flushBackground();
    // Everything from here on is code. The chat turn's call is the baseline.
    const before = await llmCalls(env);
    expect(before).toBe(1);

    // Her tap sends the offer's id: the same offer always opens the same round.
    const started = await start({ range: 'times', rows: [6, 7] }, offer!.id);
    expect(started.status).toBe(201);
    let view = started.body;
    expect(view.title).toBe('Einmaleins mit 6 und 7');
    expect(view.drill).toMatchObject({ input: 'whole', last: null, summary: null });
    expect(view.items).toHaveLength(20);
    // No key leaves the server while a task is open.
    expect(view.items.every((i) => i.answer === null)).toBe(true);
    // Every task may be heard: Vorlesen reads it like any question (#434).
    expect(view.items.every((i) => i.item.read_aloud)).toBe(true);
    const keys = await env.db.query<{ drill_fact: string }>(
      `select i.drill_fact from session_items si join items i on i.id = si.item_id
        where si.session_id = $1 order by si.position`,
      [view.id],
    );
    expect(new Set(keys.map((k) => k.drill_fact)).size).toBe(20);
    for (const k of keys) expect(k.drill_fact).toMatch(/^times:(\d+)x(\d+)$/);
    const again = await start({ range: 'times', rows: [6, 7] }, offer!.id);
    expect(again.body.id).toBe(view.id);

    // Twenty answers: every third one wrong.
    const wrong = new Set<string>();
    for (const [n, row] of view.items.entries()) {
      const key = await keyOfItem(env, row.item.id);
      const text = n % 3 === 0 ? String(Number(key) + 1) : key;
      if (n % 3 === 0) wrong.add(row.item.id);
      const res = await l.api.post<SessionView>(`/practice/sessions/${view.id}/drill`, {
        client_turn_id: randomUUID(),
        item_id: row.item.id,
        text,
      });
      expect(res.status).toBe(200);
      view = res.body;
      // Checked at once: the task she just answered, with its key, under the next one.
      expect(view.drill?.last).toMatchObject({
        item_id: row.item.id,
        given: text,
        correct: n % 3 !== 0,
        answer: key,
      });
    }
    expect(view.status).toBe('finished');
    // The line at the end names a row, never a number of mistakes (rule 6).
    expect(view.drill?.summary?.line).toMatch(/^(better|solid|again)$/);
    expect(JSON.stringify(view.drill?.summary)).not.toMatch(/"(wrong|count|missed)"/);
    const closed = await env.db.query<{ status: string; first_try_correct: boolean }>(
      `select status, first_try_correct from session_items where session_id = $1`,
      [view.id],
    );
    expect(closed.filter((c) => c.status === 'missed')).toHaveLength(wrong.size);
    expect(closed.filter((c) => c.status === 'correct')).toHaveLength(20 - wrong.size);

    // ZERO model calls for the whole round — not to start it, not for any answer.
    expect(await llmCalls(env)).toBe(before);
    // And nobody was woken to comment on it afterwards (that would be a call on the next tick).
    const events = await env.db.query(
      `select id from buddy_events where learner_id = $1 and type = 'session_finished'`,
      [l.learnerId],
    );
    expect(events).toHaveLength(0);

    // FSRS: every task has its state; the missed ones are marked as such.
    const states = await env.db.query<{ last_outcome: string }>(
      `select st.last_outcome from item_states st join session_items si on si.item_id = st.item_id
        where si.session_id = $1`,
      [view.id],
    );
    expect(states).toHaveLength(20);
    expect(states.filter((s) => s.last_outcome === 'revealed')).toHaveLength(wrong.size);

    // The next round: the missed facts pull. The SAME rows (one per fact) are asked again.
    env.clock.advance(60 * 60 * 1000);
    const next = await start({ range: 'times', rows: [6, 7] });
    const nextIds = new Set(next.body.items.map((i) => i.item.id));
    const back = [...wrong].filter((id) => nextIds.has(id));
    expect(back.length).toBeGreaterThanOrEqual(Math.ceil(wrong.size * 0.6));
    const facts = await env.db.one<{ n: number }>(
      `select count(*)::int as n from items where learner_id = $1 and drill_fact is not null`,
      [l.learnerId],
    );
    expect(facts.n).toBeLessThanOrEqual(36);
    expect(await llmCalls(env)).toBe(before);
  });

  it('another learner: the round is not found, and cannot be answered', async () => {
    const view = (await start({ range: 'plus_20', carry: 'with' })).body;
    const other = await onboard(env, { relation: 'self', name: 'Mo' });
    const item = view.items[0]!.item.id;
    expect((await other.api.get(`/practice/sessions/${view.id}`)).status).toBe(404);
    const res = await other.api.post(`/practice/sessions/${view.id}/drill`, {
      client_turn_id: randomUUID(),
      item_id: item,
      text: '12',
    });
    expect(res.status).toBe(404);
    // Her own round is untouched.
    const mine = await l.api.get<SessionView>(`/practice/sessions/${view.id}`);
    expect(mine.body.items.every((i) => i.status === 'open')).toBe(true);
  });

  it('the same answer sent twice is recorded once; a closed task is not answered again', async () => {
    const view = (await start({ range: 'minus_20' })).body;
    const item = view.items[0]!.item.id;
    const key = await keyOfItem(env, item);
    const turnId = randomUUID();
    const send = (id: string, text: string) =>
      l.api.post<SessionView>(`/practice/sessions/${view.id}/drill`, {
        client_turn_id: id,
        item_id: item,
        text,
      });
    const [a, b] = await Promise.all([send(turnId, key), send(turnId, key)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const replay = await send(turnId, key);
    expect(replay.status).toBe(200);
    const turns = await env.db.query(
      `select id from practice_turns where session_id = $1 and item_id = $2`,
      [view.id, item],
    );
    expect(turns).toHaveLength(1);
    const reviews = await env.db.one<{ reps: number }>(
      `select reps from item_states where item_id = $1`,
      [item],
    );
    expect(reviews.reps).toBe(1);
    const late = await send(randomUUID(), key);
    expect(late.status).toBe(409);
    expect(why(late.body)).toBe('already_closed');
  });

  it('a round is answered on its pad only: the tutor door, a hint and "Lösung zeigen" are closed', async () => {
    const view = (await start({ range: 'fractions' })).body;
    expect(view.drill?.input).toBe('fraction');
    const item = view.items[0]!.item.id;
    const answer = await l.api.post(`/practice/sessions/${view.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: item,
      text: '1/2',
    });
    expect(answer.status).toBe(409);
    expect(why(answer.body)).toBe('use_drill');
    const hint = await l.api.post(`/practice/sessions/${view.id}/hint`, {
      client_turn_id: randomUUID(),
      item_id: item,
    });
    expect(hint.status).toBe(409);
    const reveal = await l.api.post(`/practice/sessions/${view.id}/reveal`, { item_id: item });
    expect(reveal.status).toBe(409);
    // A fraction is checked by its value: every form of the right amount is right.
    const key = await keyOfItem(env, item);
    const [n, d] = key.includes('/') ? key.split('/').map(Number) : [Number(key), 1];
    const res = await l.api.post<SessionView>(`/practice/sessions/${view.id}/drill`, {
      client_turn_id: randomUUID(),
      item_id: item,
      text: `${n! * 2}/${d! * 2}`,
    });
    expect(res.body.drill?.last?.correct).toBe(true);
    // Not a number at all is not an answer: refused at the door, nothing graded.
    const junk = await l.api.post(`/practice/sessions/${view.id}/drill`, {
      client_turn_id: randomUUID(),
      item_id: view.items[1]!.item.id,
      text: 'weiß nicht',
    });
    expect(junk.status).toBe(422);
    expect(await llmCalls(env)).toBe(0);
  });

  it('a round never turns up in practice the model prepares, and a range that means nothing is refused', async () => {
    const view = (await start({ range: 'times', rows: [3] })).body;
    expect(view.items.length).toBe(19);
    const bad = await start({ range: 'plus_10', carry: 'with' });
    expect(bad.status).toBe(422);
    const rows = await start({ range: 'percent', rows: [7] });
    expect(rows.status).toBe(422);
    // An ordinary practice from her questions finds none of the round's facts.
    const practice = await l.api.post('/practice/sessions', {});
    expect([404, 422]).toContain(practice.status);
  });
});
