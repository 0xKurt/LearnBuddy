// What Buddy's home shows has to match what happened (issue #630, device check 14.10.):
//   1. the finished practice and the check-in after a test carry their own moment, so the thread
//      can stand them there instead of under everything said since;
//   2. "deine Übung liegt schon bereit … mit einem Tippen starten" only with the card that starts
//      it (`open_area` practice → a `show_ready` card), and never when nothing waits;
//   3. an offer whose run she finished says so instead of "Los geht's";
//   7. the check-in after a test stops being asked a week after it.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type {
  ActionView,
  BuddyHome,
  SendMessageResponse,
} from '@learnbuddy/shared-types/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bumpContext } from '../modules/buddy/plan.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

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

async function say(l: Learner, text: string): Promise<SendMessageResponse> {
  const res = await l.api.post<SendMessageResponse>('/buddy/messages', {
    client_message_id: randomUUID(),
    text,
  });
  expect(res.status).toBe(200);
  return res.body;
}

const home = async (l: Learner): Promise<BuddyHome> => (await l.api.get<BuddyHome>('/buddy')).body;
const actionsOf = (h: BuddyHome): ActionView[] => h.thread.flatMap((m) => m.actions);

/** One question of hers, for sessions and prepared practice to point at. */
async function item(env: TestEnv, l: Learner): Promise<string> {
  const row = await env.db.one<{ id: string }>(
    `insert into items (learner_id, kind, prompt, answer, topic, difficulty, origin)
     values ($1, 'short', 'Kürze 6/8.', '3/4', 'Brüche kürzen', 2, 'buddy') returning id`,
    [l.learnerId],
  );
  return row.id;
}

/** A practice run, finished at `at`, with one answered question. */
async function finishedRun(
  env: TestEnv,
  l: Learner,
  at: Date,
  requestId: string = randomUUID(),
): Promise<string> {
  const itemId = await item(env, l);
  const s = await env.db.one<{ id: string }>(
    `insert into practice_sessions (learner_id, mode, status, title, client_request_id,
                                    started_at, last_activity_at, finished_at)
     values ($1, 'practice', 'finished', 'Brüche', $2, $3, $3, $3) returning id`,
    [l.learnerId, requestId, at],
  );
  await env.db.query(
    `insert into session_items (session_id, item_id, position, status, first_try_correct, closed_at)
     values ($1, $2, 0, 'correct', true, $3)`,
    [s.id, itemId, at],
  );
  return s.id;
}

describe.skipIf(!dbReady)('the home tells what happened, at its moment (issue #630)', () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-10-14T12:00:00Z' });
  });
  afterAll(async () => {
    await env?.close();
  });

  it('gives the finished practice the moment it ended', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Testkind', birthDate: '2014-02-10' });
    const ended = new Date(env.clock.now().getTime() - 5 * 60_000);
    const id = await finishedRun(env, l, ended);
    const h = await home(l);
    expect(h.now).toMatchObject({ type: 'practice_result', session_id: id });
    // Without it the app could only put the card at the end — under her next message.
    expect(h.now?.type === 'practice_result' && h.now.finished_at).toBe(ended.toISOString());
  });

  it('asks how the test went from the day after it, in her zone, and for a week only', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Testkind', birthDate: '2014-02-10' });
    // The test was on Friday 9 October; today is Wednesday the 14th (Berlin).
    const goal = await env.db.one<{ id: string }>(
      `insert into buddy_goals (learner_id, kind, title, due_date)
       values ($1, 'exam', 'Mathearbeit über Brüche', '2026-10-09') returning id`,
      [l.learnerId],
    );
    const asked = await home(l);
    expect(asked.decision).toEqual({
      type: 'how_did_it_go',
      goal: expect.objectContaining({ id: goal.id }),
      // Midnight after the test day in Berlin (CEST, UTC+2).
      asked_at: '2026-10-09T22:00:00.000Z',
    });

    // A week after the test it is still asked (the 16th) …
    env.clock.set('2026-10-16T10:00:00Z');
    expect((await home(l)).decision).toMatchObject({ type: 'how_did_it_go' });
    // … and no longer after that: it stood under every message for days (rule 5: a question
    // nobody answers is not kept on screen forever).
    env.clock.set('2026-10-17T10:00:00Z');
    expect((await home(l)).decision?.type).not.toBe('how_did_it_go');
    // The test itself is not closed by that: she can still tell Buddy how it went.
    const g = await env.db.one<{ status: string }>(`select status from buddy_goals where id = $1`, [
      goal.id,
    ]);
    expect(g.status).toBe('active');
    env.clock.set('2026-10-14T12:00:00Z');
  });

  it('turns an offer she worked through into a finished card', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Testkind', birthDate: '2014-02-10' });
    env.llm.script(
      'buddy_turn',
      turn({
        actions: [
          {
            tool: 'offer_learning',
            args: { kind: 'practice', text: 'Brüche addieren', goal: null },
          },
        ],
        reply: 'Ich habe eine Übung zum Addieren von Brüchen für dich.',
      }),
    );
    // The offer's own preparation runs in the background (issue #48); it has nothing to say here.
    env.llm.script('explain', { json: { usable: false, title: '', subject: null, items: [] } });
    await say(l, 'Ich möchte Brüche addieren üben');
    await env.flushBackground();
    const offered = actionsOf(await home(l)).find((a) => a.summary.tool === 'offer_learning')!;
    expect(offered.summary).toMatchObject({ finished_session_id: null });

    // She started it and left it open: still a start (it resumes). The run carries the offer's
    // action id as its request id, as the app's tap sends it.
    const open = await env.db.one<{ id: string }>(
      `insert into practice_sessions (learner_id, mode, status, title, client_request_id,
                                      started_at, last_activity_at)
       values ($1, 'practice', 'active', 'Brüche addieren', $2, $3, $3)
       on conflict (learner_id, client_request_id) where client_request_id is not null
         do update set status = 'active'
       returning id`,
      [l.learnerId, offered.id, env.clock.now()],
    );
    expect(actionsOf(await home(l)).find((a) => a.id === offered.id)!.summary).toMatchObject({
      finished_session_id: null,
    });

    // Finished: the card says so and opens that run, no "Los geht's" any more.
    await env.db.query(
      `update practice_sessions set status = 'finished', finished_at = $2 where id = $1`,
      [open.id, env.clock.now()],
    );
    expect(actionsOf(await home(l)).find((a) => a.id === offered.id)!.summary).toMatchObject({
      finished_session_id: open.id,
    });

    // Another learner's run with the same request id is not hers to finish (tenant isolation).
    const other = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2014-02-10' });
    await finishedRun(env, other, env.clock.now(), randomUUID());
    expect(actionsOf(await home(l)).find((a) => a.id === offered.id)!.summary).toMatchObject({
      finished_session_id: open.id,
    });
  });

  it('shows the practice that waits when Buddy points to it, and only that', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Testkind', birthDate: '2014-02-10' });
    const itemId = await item(env, l);
    const step = await env.db.one<{ id: string }>(
      `insert into buddy_steps (learner_id, kind, title, state, planned_date, payload, prepared_at)
       values ($1, 'practice', 'Arbeitsblatt Brüche', 'prepared', '2026-10-14', $2, $3) returning id`,
      [l.learnerId, { item_ids: [itemId], est_minutes: 2 }, env.clock.now()],
    );
    await bumpContext(env.db, l.learnerId);

    let state = '';
    env.llm.script('buddy_turn', (req) => {
      state = ScriptedGateway.textOf(req);
      return turn({
        actions: [{ tool: 'open_area', args: { area: 'practice' } }],
        reply: 'Deine Übung zum Arbeitsblatt liegt schon bereit.',
      }).json;
    });
    expect((await say(l, 'Lass uns das Arbeitsblatt üben')).status).toBe('done');
    // STATE tells him how to point at it.
    expect(state).toContain('show it with open_area practice');
    const shown = actionsOf(await home(l)).find((a) => a.summary.tool === 'show_ready');
    expect(shown?.summary).toEqual({
      tool: 'show_ready',
      step_id: step.id,
      title: 'Arbeitsblatt Brüche',
      question_count: 1,
      est_minutes: 2,
      ready: true,
    });
    // Not something she can take back, and not a "done" line: it changes nothing.
    expect(shown?.undoable).toBe(false);
    expect((await home(l)).done.some((a) => a.summary.tool === 'show_ready')).toBe(false);

    // Started: the card no longer offers a start that is not there.
    const started = await l.api.post<{ session_id: string }>(`/buddy/steps/${step.id}/start`, {});
    expect(started.status).toBe(200);
    expect(
      actionsOf(await home(l)).find((a) => a.summary.tool === 'show_ready')?.summary,
    ).toMatchObject({ ready: false });
  });

  it('starting one waiting practice closes another of the same questions (issue #841)', async () => {
    // Device 16.10.: the bar started "Vokabeln Unité 3"; a second waiting practice of the same
    // six questions kept its "6 Aufgaben · Los geht's" card and opened question 1 again, a second
    // run beside the first.
    const l = await onboard(env, { relation: 'child', name: 'Testkind', birthDate: '2014-02-10' });
    const a = await item(env, l);
    const b = await item(env, l);
    const c = await item(env, l);
    const waiting = async (items: string[]) =>
      (
        await env.db.one<{ id: string }>(
          `insert into buddy_steps (learner_id, kind, title, state, planned_date, payload, prepared_at)
           values ($1, 'practice', 'Vokabeln Unité 3', 'prepared', '2026-10-14', $2, $3) returning id`,
          [l.learnerId, { item_ids: items, est_minutes: 2 }, env.clock.now()],
        )
      ).id;
    const first = await waiting([a, b]);
    const same = await waiting([b, a]);
    const part = await waiting([a]);
    const more = await waiting([a, b, c]);
    const started = await l.api.post<{ session_id: string }>(`/buddy/steps/${first}/start`, {});
    expect(started.status).toBe(200);
    const states = await env.db.query<{ id: string; state: string }>(
      `select id, state from buddy_steps where id = any($1::uuid[])`,
      [[same, part, more]],
    );
    const stateOf = (id: string) => states.find((s) => s.id === id)?.state;
    // Nothing of these is left to do once her run holds all of it …
    expect(stateOf(same)).toBe('cancelled');
    expect(stateOf(part)).toBe('cancelled');
    // … but a practice with a question her run does not have still waits.
    expect(stateOf(more)).toBe('prepared');
    expect((await l.api.post(`/buddy/steps/${same}/start`, {})).status).toBe(409);
  });

  it('refuses to point at practice when none waits, and the words are repaired', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Testkind', birthDate: '2014-02-10' });
    // A practice step that is only planned for later: nothing to start now.
    await env.db.one(
      `insert into buddy_steps (learner_id, kind, title, state, planned_date)
       values ($1, 'practice', 'Für Freitag', 'planned', '2026-10-16') returning id`,
      [l.learnerId],
    );
    await bumpContext(env.db, l.learnerId);
    let repair = '';
    env.llm.script(
      'buddy_turn',
      turn({
        actions: [{ tool: 'open_area', args: { area: 'practice' } }],
        reply: 'Deine Übung liegt bereit.',
      }),
      (req) => {
        repair = ScriptedGateway.textOf(req);
        return turn({ reply: 'Gerade wartet keine Übung – sollen wir eine machen?' }).json;
      },
    );
    expect((await say(l, 'Was kann ich üben?')).status).toBe('done');
    expect(repair).toContain('no practice you prepared is waiting for her');
    expect(actionsOf(await home(l)).some((a) => a.summary.tool === 'show_ready')).toBe(false);
  });
});
