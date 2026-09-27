// Buttons on a notification (gaps.md #16; docs/architecture.md §Delivery): the server picks
// the buttons (categoryId) per message, and "Jetzt üben", "Heute nicht" and "Seltener
// schreiben" go through the API — code decides what each does (rule 5). "Seltener" only
// reduces contact: no PIN (rule 6); turning it off again needs the adult under 16.
// Real Postgres; the model and the push service are replaced.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import {
  PUSH_CATEGORY,
  type BuddyHome,
  type BuddySettingsView,
  type OutreachActionResponse,
} from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bumpContext, findOrCreateSubject, scheduleExamWakeups } from '../modules/buddy/plan.js';
import { loadSettings } from '../modules/buddy/state.js';
import { enqueueJob } from '../modules/scheduler/jobs.js';
import { testDatabaseAvailable } from '../testing/database.js';
import {
  createTestEnv,
  enableContact,
  onboard,
  TEST_TICK_SECRET,
  type Learner,
  type TestEnv,
} from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

// Monday 2026-09-28, 10:00 in Berlin.
const START = '2026-09-28T08:00:00Z';

const outreach = (step: 'new' | null, relevance = 0.9) => ({
  kind: 'idea',
  topic_key: step ? 'exam:g1:prep' : 'exam:g1:nudge',
  title: 'Übung ist bereit',
  body: 'Eine kurze Runde für Donnerstag liegt bereit – 3 von 5 hattest du letztes Mal.',
  why: 'Die Arbeit ist bald.',
  relevance,
  expires_in_hours: 12,
  goal: 'g1',
  step,
});

const PREPARE = {
  tool: 'prepare_practice',
  args: { goal: 'g1', subject: null, minutes: 5, focus_topics: [] },
};

describe.skipIf(!dbReady)('notification buttons', () => {
  let env: TestEnv;
  let l: Learner;

  beforeEach(async () => {
    env = await createTestEnv({ start: START });
  });
  afterEach(async () => {
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      unexpected: env.llm.unexpected.length,
      pending: env.llm.pending(),
    };
    await env.close();
    expect(report).toEqual({ scriptErrors: [], unexpected: 0, pending: 0 });
  });

  async function tick(): Promise<void> {
    const res = await env.app.request('/v1/internal/tick', {
      method: 'POST',
      headers: { 'x-tick-secret': TEST_TICK_SECRET },
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { errors: string[] }).errors).toEqual([]);
  }

  /** A learner with contact on, a phone, and a test on Thursday with questions. */
  async function setUp(opts: Parameters<typeof onboard>[1] = {}): Promise<void> {
    l = await onboard(env, opts);
    await enableContact(env, l.learnerId);
    await l.api.post('/buddy/push-tokens', {
      token: 'ExponentPushToken[device-0001]',
      platform: 'android',
    });
    await env.db.tx(async (tx) => {
      const subject = await findOrCreateSubject(tx, l.learnerId, 'Mathe', 'math');
      const goal = await tx.one<{ id: string }>(
        `insert into buddy_goals (learner_id, kind, title, subject_id, due_date)
         values ($1, 'exam', 'Mathearbeit', $2, '2026-10-01') returning id`,
        [l.learnerId, subject.id],
      );
      const material = await tx.one<{ id: string }>(
        `insert into materials (learner_id, client_request_id, goal_id, subject_id, status, photo_count, title, created_at)
         values ($1, gen_random_uuid(), $2, $3, 'ready', 1, 'Arbeitsblatt', $4) returning id`,
        [l.learnerId, goal.id, subject.id, env.clock.now()],
      );
      for (let i = 1; i <= 3; i++) {
        await tx.query(
          `insert into items (learner_id, material_id, subject_id, kind, prompt, answer, topic)
           values ($1, $2, $3, 'short', $4, $5, 'Brüche')`,
          [l.learnerId, material.id, subject.id, `Frage ${i}`, `Antwort ${i}`],
        );
      }
      const settings = await loadSettings(tx, l.learnerId);
      await scheduleExamWakeups(tx, l.learnerId, goal.id, '2026-10-01', settings, env.clock.now());
      await bumpContext(tx, l.learnerId);
    });
    // She has left the app.
    env.clock.minutes(10);
  }

  /** Buddy's check at 10:10 plans a message for the preferred window; at 15:00 it is pushed. */
  async function pushed(decision: { actions: unknown[]; outreach: unknown }) {
    await env.db.query(
      `update jobs set run_at = $2 where learner_id = $1 and payload ->> 'days_before' = '3'`,
      [l.learnerId, env.clock.now()],
    );
    env.llm.script('buddy_check', {
      json: { disposition: 'act', reason: 'test in 3 days', ...decision },
    });
    await tick();
    env.clock.set('2026-09-28T13:00:00Z');
    await tick();
    const row = await env.db.one<{ id: string; status: string; step_id: string | null }>(
      `select id, status, step_id from buddy_outreach where learner_id = $1 order by created_at, seq limit 1`,
      [l.learnerId],
    );
    expect(row.status).toBe('accepted');
    return row;
  }

  const act = (id: string, action: string, api = l.api) =>
    api.post<OutreachActionResponse>(`/buddy/outreach/${id}/act`, { action });

  it('practice that is ready gets "Jetzt üben", and the button starts exactly that practice', async () => {
    await setUp();
    const o = await pushed({ actions: [PREPARE], outreach: outreach('new') });
    const [message] = env.push.sent;
    expect(message?.categoryId).toBe(PUSH_CATEGORY.practice);
    // The lock screen: a fixed text by code, never the model's words or a score.
    expect(message?.body).toBe('Buddy hat eine Idee für dich.');
    expect(message?.data).toEqual({ type: 'buddy_outreach', outreach_id: o.id });

    env.clock.minutes(5);
    const res = await act(o.id, 'practice_now');
    expect(res.status).toBe(200);
    const session = await env.db.one<{ id: string; step_id: string }>(
      `select id, step_id from practice_sessions where learner_id = $1`,
      [l.learnerId],
    );
    expect(res.body.session_id).toBe(session.id);
    expect(session.step_id).toBe(o.step_id);
    // Pressed twice (a retried report): the same practice, nothing new.
    expect((await act(o.id, 'practice_now')).body.session_id).toBe(session.id);
    const row = await env.db.one<{ response: string; opened_at: Date | null }>(
      `select response, opened_at from buddy_outreach where id = $1`,
      [o.id],
    );
    expect(row.response).toBe('start');
    expect(row.opened_at?.toISOString()).toBe('2026-09-28T13:05:00.000Z');
  });

  it('any other message gets "Heute nicht" and "Seltener schreiben" only', async () => {
    await setUp();
    const o = await pushed({ actions: [], outreach: outreach(null) });
    expect(env.push.sent[0]?.categoryId).toBe(PUSH_CATEGORY.message);
    // Without practice "Jetzt üben" starts nothing: the app opens Buddy.
    expect((await act(o.id, 'practice_now')).body.session_id).toBeNull();
  });

  it('"Heute nicht" moves its practice to tomorrow and keeps Buddy quiet for the rest of the day', async () => {
    await setUp();
    const o = await pushed({ actions: [PREPARE], outreach: outreach('new') });
    // Something else Buddy planned for this evening, and one for tomorrow.
    const later = async (sendAt: string, key: string) =>
      env.db.one<{ id: string }>(
        `insert into buddy_outreach (learner_id, kind, origin, topic_key, dedupe_key, title, body,
                                     relevance, status, send_at, expires_at)
         values ($1, 'checkin', 'buddy', $2, $2, 'Kurz nachgefragt', 'Wie geht es dir mit Brüchen?',
                 0.8, 'scheduled', $3, $3::timestamptz + interval '6 hours') returning id`,
        [l.learnerId, key, sendAt],
      );
    const tonight = await later('2026-09-28T16:00:00Z', 'checkin:tonight');
    const tomorrow = await later('2026-09-29T13:00:00Z', 'checkin:tomorrow');
    const before = (await loadSettings(env.db, l.learnerId)).context_version;

    const res = await act(o.id, 'not_today');
    expect(res.status).toBe(200);
    expect(res.body.session_id).toBeNull();
    const step = await env.db.one<{ planned_date: string; state: string }>(
      `select planned_date::text, state from buddy_steps where id = $1`,
      [o.step_id],
    );
    expect(step).toEqual({ planned_date: '2026-09-29', state: 'prepared' });
    const status = async (id: string) =>
      (
        await env.db.one<{ status: string; status_reason: string | null }>(
          `select status, status_reason from buddy_outreach where id = $1`,
          [id],
        )
      ).status;
    expect(await status(tonight.id)).toBe('cancelled');
    expect(await status(tomorrow.id)).toBe('scheduled');
    const row = await env.db.one<{ response: string; opened_at: Date | null }>(
      `select response, opened_at from buddy_outreach where id = $1`,
      [o.id],
    );
    // Answered from the lock screen: not "opened" (only the app opening proves that).
    expect(row).toEqual({ response: 'not_now', opened_at: null });
    // What Buddy decides next sees it (context fence).
    expect((await loadSettings(env.db, l.learnerId)).context_version).toBeGreaterThan(before);
  });

  it('"Seltener schreiben" needs no PIN under 16, says what changed, and only important messages ring', async () => {
    await setUp({ relation: 'child', pin: '4711' });
    const o = await pushed({ actions: [], outreach: outreach(null) });
    expect((await act(o.id, 'less_often')).status).toBe(200);
    // Pressed again: nothing more happens.
    expect((await act(o.id, 'less_often')).status).toBe(200);

    const settings = (await l.api.get<BuddySettingsView>('/buddy/settings')).body;
    expect(settings.only_important).toBe(true);
    const home = (await l.api.get<BuddyHome>('/buddy')).body;
    const said = home.thread.filter((m) => m.text.startsWith('Alles klar – aufs Handy'));
    expect(said).toHaveLength(1);

    // Her next message of ordinary relevance waits in the app; an important one still rings.
    env.push.sent.length = 0;
    env.clock.set('2026-09-29T08:00:00Z');
    // Other looks that day (the daily routine while a test is near) find nothing to add.
    env.llm.byDefault('buddy_check', {
      json: { disposition: 'wait', reason: 'nothing new', actions: [], outreach: null },
    });
    env.llm.script('buddy_check', {
      json: {
        disposition: 'act',
        reason: 'a nudge',
        actions: [],
        outreach: { ...outreach(null, 0.7), topic_key: 'exam:g1:ordinary' },
      },
    });
    await enqueueJob(env.db, {
      learnerId: l.learnerId,
      kind: 'buddy_check',
      runAt: env.clock.now(),
      dedupeKey: `test:${randomUUID()}`,
      payload: { reason: 'routine' },
    });
    await tick();
    env.clock.set('2026-09-29T13:00:00Z');
    await tick();
    expect(env.push.sent).toHaveLength(0);
    const ordinary = await env.db.one<{ status: string; status_reason: string | null }>(
      `select status, status_reason from buddy_outreach where topic_key like 'exam:%:ordinary'`,
    );
    expect(ordinary).toEqual({ status: 'in_app', status_reason: 'only_important' });

    // Turning it off again allows more contact: not without the adult.
    const denied = await l.api.patch<{ error: { code: string } }>('/buddy/settings', {
      only_important: false,
      version: settings.version,
    });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('admin_required');
    const session = await l.api.post<{ admin_token: string }>('/account/admin-session', {
      pin: '4711',
    });
    const parent = l.api.with({ 'x-admin-token': session.body.admin_token });
    const back = await parent.patch<BuddySettingsView>('/buddy/settings', {
      only_important: false,
      version: settings.version,
    });
    expect(back.status).toBe(200);
    expect(back.body.only_important).toBe(false);
  });

  it("another learner's message is not found; a bad action is refused", async () => {
    await setUp();
    const o = await pushed({ actions: [], outreach: outreach(null) });
    const other = await onboard(env, { name: 'Tom' });
    expect((await act(o.id, 'less_often', other.api)).status).toBe(404);
    expect((await act(o.id, 'not_today', other.api)).status).toBe(404);
    expect((await act(randomUUID(), 'not_today')).status).toBe(404);
    expect((await act(o.id, 'delete_everything')).status).toBe(422);
    const row = await env.db.one<{ response: string | null }>(
      `select response from buddy_outreach where id = $1`,
      [o.id],
    );
    expect(row.response).toBeNull();
  });
});
