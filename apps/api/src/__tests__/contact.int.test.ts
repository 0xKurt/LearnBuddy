// Contact promises (CLAUDE.md rule 6; audit I-10, N-3): Buddy can only reduce contact, in-app
// messages count, an agreed reminder never vanishes, and a reminder keeps its subject.
// docs/architecture.md §Proactivity, §Delivery.
// requires live verification in Claude Code session (needs a running Postgres)

import type { BuddyHome, SendMessageResponse } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  findOrCreateSubject,
  scheduleExamWakeups,
  scheduleStepReminder,
} from '../modules/buddy/plan.js';
import { loadSettings } from '../modules/buddy/state.js';
import { enqueueJob } from '../modules/scheduler/jobs.js';
import { runTick } from '../modules/scheduler/tick.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import {
  createTestEnv,
  enableContact,
  onboard,
  type Learner,
  type TestEnv,
} from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

let seq = 0;
const uuid = () => `00000000-0000-4000-c000-${(++seq).toString(16).padStart(12, '0')}`;

async function send(l: Learner, text: string, id = uuid()) {
  const res = await l.api.post<SendMessageResponse>('/buddy/messages', {
    client_message_id: id,
    text,
  });
  return { ...res, id };
}

const reply = (text: string, actions: unknown[] = []) => ({
  json: { concern: false, reply: text, options: null, actions },
});

async function tick(env: TestEnv): Promise<void> {
  const stats = await runTick(env.deps);
  expect(stats.errors).toEqual([]);
}

/** An agreed reminder she asked for, planned through the real planning code. */
async function agreedStep(
  env: TestEnv,
  learnerId: string,
  opts: { title: string; date: string; time: string; at: string },
): Promise<string> {
  return env.db.tx(async (tx) => {
    const step = await tx.one<{ id: string; version: number }>(
      `insert into buddy_steps (learner_id, kind, title, state, planned_date, planned_time, agreed)
       values ($1, 'practice', $2, 'planned', $3, $4, true) returning id, version`,
      [learnerId, opts.title, opts.date, opts.time],
    );
    await scheduleStepReminder(tx, learnerId, step, new Date(opts.at));
    return step.id;
  });
}

async function outreach(env: TestEnv, learnerId: string) {
  return env.db.query<{ status: string; status_reason: string | null; origin: string }>(
    `select status, status_reason, origin from buddy_outreach where learner_id = $1 order by created_at, seq`,
    [learnerId],
  );
}

async function thread(env: TestEnv, learnerId: string): Promise<string[]> {
  const rows = await env.db.query<{ text: string }>(
    `select text from buddy_messages where learner_id = $1 and outreach_id is not null order by seq`,
    [learnerId],
  );
  return rows.map((r) => r.text);
}

async function mathItems(env: TestEnv, learnerId: string, n: number): Promise<string> {
  return env.db.tx(async (tx) => {
    const subject = await findOrCreateSubject(tx, learnerId, 'Mathe', 'math');
    const material = await tx.one<{ id: string }>(
      `insert into materials (learner_id, client_request_id, subject_id, status, photo_count, title, created_at)
       values ($1, gen_random_uuid(), $2, 'ready', 1, 'Brüche', $3) returning id`,
      [learnerId, subject.id, env.clock.now()],
    );
    for (let i = 0; i < n; i++) {
      await tx.query(
        `insert into items (learner_id, material_id, subject_id, kind, prompt, answer, topic)
         values ($1, $2, $3, 'short', $4, $5, 'Brüche')`,
        [learnerId, material.id, subject.id, `Frage ${i + 1}`, `Antwort ${i + 1}`],
      );
    }
    return subject.id;
  });
}

const idea = (topic: string, expires = 12) => ({
  json: {
    disposition: 'act',
    reason: 'useful now',
    actions: [],
    outreach: {
      kind: 'idea',
      topic_key: topic,
      title: 'Idee',
      body: 'Ich hätte da eine kurze Übung für dich.',
      why: 'Die Arbeit ist bald.',
      relevance: 0.9,
      expires_in_hours: expires,
      goal: null,
      step: null,
    },
  },
});

describe.skipIf(!dbReady)('contact promises', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z' });
  });
  afterEach(async () => {
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      unexpected: env.llm.unexpected.map((u) => u.purpose),
      pending: env.llm.pending(),
    };
    await env.close();
    expect(report).toEqual({ scriptErrors: [], unexpected: [], pending: 0 });
  });

  it('a child cannot undo "fewer messages" without the adult (rule 6)', async () => {
    const l = await onboard(env, { relation: 'child', pin: '4711' });
    await enableContact(env, l.learnerId, { max_per_week: 4 });
    env.llm.script(
      'buddy_turn',
      reply('Okay, ich schreibe dir seltener.', [
        {
          tool: 'set_contact',
          args: {
            preferred_start: null,
            preferred_end: null,
            quiet_start: null,
            avoid_weekdays: null,
            pause: null,
            fewer: true,
            quote: 'schreib mir weniger',
          },
        },
      ]),
    );
    const res = await send(l, 'Bitte schreib mir weniger');
    expect(res.body.status).toBe('done');
    const card = res.body.home.thread.flatMap((m) => m.actions)[0]!;
    expect(card.summary).toMatchObject({ tool: 'set_contact', max_per_week: 2 });
    // Not offered to her …
    expect(card.undoable).toBe(false);
    // … and refused if she tries anyway.
    const denied = await l.api.post<{ error: { code: string } }>(`/buddy/actions/${card.id}/undo`);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('admin_required');
    const settings = await l.api.get<{ max_per_week: number }>('/buddy/settings');
    expect(settings.body.max_per_week).toBe(2);
    // The adult can.
    const session = await l.api.post<{ admin_token: string }>('/account/admin-session', {
      pin: '4711',
    });
    const parent = l.api.with({ 'x-admin-token': session.body.admin_token });
    const undone = await parent.post<BuddyHome>(`/buddy/actions/${card.id}/undo`);
    expect(undone.status).toBe(200);
    expect((await l.api.get<{ max_per_week: number }>('/buddy/settings')).body.max_per_week).toBe(
      4,
    );
  });

  it('in-app messages count: with push off, a second idea the same day is held back (H-29, repro-02)', async () => {
    await env.close();
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z', push: 'disabled' });
    const l = await onboard(env);
    await enableContact(env, l.learnerId);
    await env.db.query(
      `insert into buddy_goals (learner_id, kind, title, due_date) values ($1, 'exam', 'Mathearbeit', '2026-10-02')`,
      [l.learnerId],
    );
    for (const [key, at] of [
      ['check:a', '2026-09-28T13:00:00Z'],
      ['check:b', '2026-09-28T14:00:00Z'],
    ] as const) {
      await enqueueJob(env.db, {
        learnerId: l.learnerId,
        kind: 'buddy_check',
        runAt: new Date(at),
        dedupeKey: key,
        payload: { reason: 'checkin_requested', note: key },
      });
    }
    env.clock.set('2026-09-28T13:00:00Z');
    env.llm.script('buddy_check', idea('practice:a'));
    await tick(env);
    env.clock.set('2026-09-28T14:00:00Z');
    env.llm.script('buddy_check', idea('practice:b'));
    await tick(env);
    const rows = await outreach(env, l.learnerId);
    expect(rows.map((r) => r.status)).toEqual(['in_app', 'suppressed']);
    expect(await thread(env, l.learnerId)).toHaveLength(1);
  });

  describe('an agreed reminder never vanishes (H-37, repro-15)', () => {
    it('1B: deferred by quiet hours, then paused → it waits in the app, saying it is late', async () => {
      const l = await onboard(env);
      await enableContact(env, l.learnerId, { quiet_start: '17:00', quiet_end: '19:00' });
      await agreedStep(env, l.learnerId, {
        title: 'Brüche üben',
        date: '2026-09-28',
        time: '17:30',
        at: '2026-09-28T15:30:00Z',
      });
      env.clock.set('2026-09-28T15:30:00Z');
      await tick(env);
      expect((await outreach(env, l.learnerId)).map((r) => r.status)).toEqual(['scheduled']);
      const s = await l.api.get<{ version: number }>('/buddy/settings');
      const paused = await l.api.patch('/buddy/settings', {
        paused_until: '2026-09-30T22:00:00.000Z',
        version: s.body.version,
      });
      expect(paused.status).toBe(200);
      env.clock.set('2026-09-28T17:00:00Z'); // 19:00, the end of the quiet hours
      await tick(env);
      expect(await outreach(env, l.learnerId)).toMatchObject([{ status: 'in_app' }]);
      expect(await thread(env, l.learnerId)).toEqual([
        'Ich wollte dich um 17:30 erinnern – sorry, das kommt verspätet. Wie verabredet: Brüche üben.',
      ]);
      expect(env.push.attempts).toHaveLength(0);
    });

    it('1B′: quiet hours moved over the agreed time → it waits in the app', async () => {
      const l = await onboard(env);
      await enableContact(env, l.learnerId, { quiet_start: '17:00' });
      await agreedStep(env, l.learnerId, {
        title: 'Brüche üben',
        date: '2026-09-28',
        time: '17:30',
        at: '2026-09-28T15:30:00Z',
      });
      env.clock.set('2026-09-28T15:30:00Z');
      await tick(env);
      expect(await outreach(env, l.learnerId)).toMatchObject([
        { status: 'in_app', status_reason: 'no_slot' },
      ]);
      expect(await thread(env, l.learnerId)).toEqual(['Wie verabredet: Brüche üben.']);
    });

    it('1C: the scheduler is 7 hours late → it waits in the app, saying it is late', async () => {
      const l = await onboard(env);
      await enableContact(env, l.learnerId);
      await agreedStep(env, l.learnerId, {
        title: 'Vokabeln',
        date: '2026-09-29',
        time: '08:00',
        at: '2026-09-29T06:00:00Z',
      });
      env.clock.set('2026-09-29T13:00:00Z');
      await tick(env);
      expect(await outreach(env, l.learnerId)).toMatchObject([{ status: 'in_app' }]);
      expect(await thread(env, l.learnerId)).toEqual([
        'Ich wollte dich um 08:00 erinnern – sorry, das kommt verspätet. Wie verabredet: Vokabeln.',
      ]);
    });

    it('1D: 7 hours late into quiet hours → still in the app', async () => {
      const l = await onboard(env);
      await enableContact(env, l.learnerId);
      await agreedStep(env, l.learnerId, {
        title: 'Vokabeln',
        date: '2026-09-28',
        time: '15:00',
        at: '2026-09-28T13:00:00Z',
      });
      env.clock.set('2026-09-28T20:00:00Z'); // 22:00 local
      await tick(env);
      expect(await outreach(env, l.learnerId)).toMatchObject([{ status: 'in_app' }]);
      expect((await thread(env, l.learnerId))[0]).toContain('um 15:00 erinnern');
    });
  });

  it('a reminder for English with only maths questions prepares nothing and says only what was agreed (H-30)', async () => {
    const l = await onboard(env);
    await mathItems(env, l.learnerId, 6);
    const stepId = await agreedStep(env, l.learnerId, {
      title: 'Englisch Vokabeln',
      date: '2026-09-28',
      time: '16:00',
      at: '2026-09-28T14:00:00Z',
    });
    env.clock.set('2026-09-28T14:00:00Z');
    await tick(env);
    expect(await thread(env, l.learnerId)).toEqual(['Wie verabredet: Englisch Vokabeln.']);
    const step = await env.db.one<{ state: string }>(
      `select state from buddy_steps where id = $1`,
      [stepId],
    );
    expect(step.state).toBe('planned');
  });

  it('an outreach message about an unknown goal is refused, not sent without its link (p2-outreach-links-silently-dropped)', async () => {
    const l = await onboard(env);
    await enableContact(env, l.learnerId);
    await env.db.query(
      `insert into buddy_goals (learner_id, kind, title, due_date) values ($1, 'exam', 'Mathearbeit', '2026-10-02')`,
      [l.learnerId],
    );
    await enqueueJob(env.db, {
      learnerId: l.learnerId,
      kind: 'buddy_check',
      runAt: new Date('2026-09-28T13:00:00Z'),
      dedupeKey: 'check:links',
      payload: { reason: 'checkin_requested', note: 'links' },
    });
    env.clock.set('2026-09-28T13:00:00Z');
    const about = (goal: string) => {
      const x = idea('practice:a');
      return { json: { ...x.json, outreach: { ...x.json.outreach, goal } } };
    };
    const wrong = about('g9');
    const right = about('g1');
    env.llm.script('buddy_check', wrong, (req) => {
      expect(ScriptedGateway.textOf(req)).toContain('outreach: unknown goal g9');
      return right.json;
    });
    await tick(env);
    const row = await env.db.one<{ goal_id: string | null }>(
      `select goal_id from buddy_outreach where learner_id = $1`,
      [l.learnerId],
    );
    expect(row.goal_id).not.toBeNull();
  });

  it('doing the practice a message was about answers it, without tapping the push (previous-unanswered-needs-push-tap)', async () => {
    const l = await onboard(env);
    await enableContact(env, l.learnerId);
    await env.db.query(
      `insert into buddy_goals (learner_id, kind, title, due_date) values ($1, 'exam', 'Mathearbeit', '2026-10-02')`,
      [l.learnerId],
    );
    const step = await env.db.one<{ id: string }>(
      `insert into buddy_steps (learner_id, kind, title, state, planned_date, finished_at, done_source)
       values ($1, 'practice', 'Brüche', 'done', '2026-09-28', $2, 'evidence') returning id`,
      [l.learnerId, new Date('2026-09-28T12:00:00Z')],
    );
    await env.db.query(
      `insert into buddy_outreach (learner_id, kind, origin, topic_key, dedupe_key, title, body, status,
                                   send_at, sent_at, expires_at, step_id, created_at)
       values ($1, 'idea', 'buddy', 'practice:old', 'old', 'Idee', 'Übung ist bereit', 'accepted',
               $2, $2, $3, $4, $2)`,
      [l.learnerId, new Date('2026-09-28T11:00:00Z'), new Date('2026-09-28T20:00:00Z'), step.id],
    );
    await enqueueJob(env.db, {
      learnerId: l.learnerId,
      kind: 'buddy_check',
      runAt: new Date('2026-09-29T13:00:00Z'),
      dedupeKey: 'check:answered',
      payload: { reason: 'checkin_requested', note: 'answered' },
    });
    env.clock.set('2026-09-29T13:00:00Z');
    env.llm.script('buddy_check', idea('practice:new'));
    await tick(env);
    const rows = await outreach(env, l.learnerId);
    expect(rows[1]).toBeDefined();
    expect(rows[1]!.status_reason).not.toBe('previous_unanswered');
    expect(rows[1]!.status).not.toBe('suppressed');
  });

  it('a reminder job that runs again sends nothing twice (agreed-reminder-duplicate-on-rerun)', async () => {
    const l = await onboard(env);
    await mathItems(env, l.learnerId, 6);
    const stepId = await env.db.tx(async (tx) => {
      const subject = await findOrCreateSubject(tx, l.learnerId, 'Mathe', 'math');
      const step = await tx.one<{ id: string; version: number }>(
        `insert into buddy_steps (learner_id, kind, title, state, planned_date, planned_time, agreed, payload)
         values ($1, 'practice', 'Brüche üben', 'planned', '2026-09-28', '16:00', true, $2)
         returning id, version`,
        [l.learnerId, { subject_id: subject.id, focus_topics: [] }],
      );
      await scheduleStepReminder(tx, l.learnerId, step, new Date('2026-09-28T14:00:00Z'));
      return step.id;
    });
    env.clock.set('2026-09-28T14:00:00Z');
    await tick(env);
    const step = await env.db.one<{ state: string }>(
      `select state from buddy_steps where id = $1`,
      [stepId],
    );
    expect(step.state).toBe('prepared');
    // The worker died after the reminder was stored: the job runs once more.
    await env.db.query(
      `update jobs set status = 'queued', finished_at = null, result = null
        where kind = 'buddy_check' and payload ->> 'step_id' = $1`,
      [stepId],
    );
    await tick(env);
    expect(await outreach(env, l.learnerId)).toHaveLength(1);
  });

  it('plan_step keeps the subject she named, and an agreed reminder is never silently unscheduled (M-58)', async () => {
    const l = await onboard(env);
    await mathItems(env, l.learnerId, 6);
    env.clock.set('2026-09-28T15:00:00Z'); // 17:00 local: the usual 15:00 is over
    const step = (time: string | null, days: number) => ({
      tool: 'plan_step',
      args: {
        goal: null,
        kind: 'practice',
        title: 'Brüche üben',
        day: { kind: 'in_days', days },
        time,
        agreed: true,
        quote: 'erinner mich ans Brüche üben',
        subject: 'f1',
        focus_topics: ['Brüche'],
      },
    });
    env.llm.script(
      'buddy_turn',
      reply('Mach ich!', [step(null, 0)]),
      reply('Ich erinnere dich morgen.', [step(null, 1)]),
    );
    const res = await send(l, 'Bitte erinner mich ans Brüche üben');
    expect(res.body.status).toBe('done');
    const rejected = await env.db.one<{ errors: string[] }>(
      `select errors from buddy_decisions where learner_id = $1 and disposition = 'rejected'`,
      [l.learnerId],
    );
    expect(rejected.errors.join(' ')).toContain('already over');
    const planned = await env.db.one<{ payload: { subject_id: string; focus_topics: string[] } }>(
      `select payload from buddy_steps where learner_id = $1 and agreed`,
      [l.learnerId],
    );
    expect(planned.payload.focus_topics).toEqual(['Brüche']);
    expect(planned.payload.subject_id).toBeTruthy();
    const jobs = await env.db.query(
      `select 1 from jobs where learner_id = $1 and payload ->> 'reason' = 'step_due' and status = 'queued'`,
      [l.learnerId],
    );
    expect(jobs).toHaveLength(1);
  });

  it('rules tightened after scheduling hold at send time (M-59)', async () => {
    const l = await onboard(env);
    await enableContact(env, l.learnerId);
    await l.api.post('/buddy/push-tokens', {
      token: 'ExponentPushToken[device-0001]',
      platform: 'ios',
    });
    await mathItems(env, l.learnerId, 3);
    await enqueueJob(env.db, {
      learnerId: l.learnerId,
      kind: 'buddy_check',
      runAt: new Date('2026-09-28T16:45:00Z'),
      dedupeKey: 'check:evening',
      payload: { reason: 'checkin_requested', note: 'x' },
    });
    // Monday 18:45: outside the preferred window, so the idea waits for Tuesday 15:00.
    env.clock.set('2026-09-28T16:45:00Z');
    env.llm.script('buddy_check', idea('practice:tue', 24));
    await tick(env);
    expect((await outreach(env, l.learnerId)).map((r) => r.status)).toEqual(['scheduled']);
    // Then: "bitte dienstags keine Nachrichten".
    const s = await l.api.get<{ version: number }>('/buddy/settings');
    expect(
      (await l.api.patch('/buddy/settings', { avoid_weekdays: [2], version: s.body.version }))
        .status,
    ).toBe(200);
    env.clock.set('2026-09-29T13:00:00Z');
    await tick(env);
    expect((await outreach(env, l.learnerId)).map((r) => r.status)).toEqual(['suppressed']);
    expect(env.push.attempts).toHaveLength(0);
  });

  it('a countdown delivered on the exam day says "Heute", not "Morgen" (M-60)', async () => {
    await env.close();
    env = await createTestEnv({
      start: '2026-09-28T08:00:00Z',
      model: 'disabled',
      push: 'disabled',
    });
    const l = await onboard(env);
    // Mondays without messages: the d-1 message (Monday) moves to the exam day.
    await enableContact(env, l.learnerId, { avoid_weekdays: [1] });
    await env.db.tx(async (tx) => {
      const subjectId = await (async () => {
        const subject = await findOrCreateSubject(tx, l.learnerId, 'Mathe', 'math');
        return subject.id;
      })();
      const goal = await tx.one<{ id: string }>(
        `insert into buddy_goals (learner_id, kind, title, subject_id, due_date)
         values ($1, 'exam', 'Mathearbeit', $2, '2026-09-29') returning id`,
        [l.learnerId, subjectId],
      );
      const material = await tx.one<{ id: string }>(
        `insert into materials (learner_id, client_request_id, goal_id, subject_id, status, photo_count, title, created_at)
         values ($1, gen_random_uuid(), $2, $3, 'ready', 1, 'Blatt', $4) returning id`,
        [l.learnerId, goal.id, subjectId, env.clock.now()],
      );
      for (let i = 0; i < 4; i++) {
        await tx.query(
          `insert into items (learner_id, material_id, subject_id, kind, prompt, answer, topic)
           values ($1, $2, $3, 'short', $4, 'x', 'Brüche')`,
          [l.learnerId, material.id, subjectId, `Frage ${i}`],
        );
      }
      const settings = await loadSettings(tx, l.learnerId);
      await scheduleExamWakeups(tx, l.learnerId, goal.id, '2026-09-29', settings, env.clock.now());
    });
    env.clock.set('2026-09-28T13:00:00Z'); // Monday 15:00: the d-1 wake-up
    await tick(env);
    expect(await thread(env, l.learnerId)).toEqual([]);
    env.clock.set('2026-09-29T05:00:00Z'); // Tuesday 07:00, the exam day
    await tick(env);
    const [text] = await thread(env, l.learnerId);
    expect(text).toMatch(/^Heute ist „Mathearbeit“/);
  });

  it('stopping contact does not bring the opt-in card straight back (M-62)', async () => {
    const l = await onboard(env);
    await enableContact(env, l.learnerId);
    await env.db.query(
      `insert into buddy_goals (learner_id, kind, title, due_date) values ($1, 'exam', 'Mathearbeit', '2026-10-02')`,
      [l.learnerId],
    );
    const s = await l.api.get<{ version: number }>('/buddy/settings');
    const off = await l.api.patch('/buddy/settings', {
      contact_enabled: false,
      version: s.body.version,
    });
    expect(off.status).toBe(200);
    const home = await l.api.get<BuddyHome>('/buddy');
    expect(home.body.decision).toBeNull();
  });

  it('a send whose outcome is unknown still leaves its text in the thread (M-63)', async () => {
    const l = await onboard(env);
    await env.db.query(
      `insert into buddy_outreach (learner_id, kind, origin, topic_key, dedupe_key, title, body, status,
                                   send_at, expires_at, lease_until, created_at)
       values ($1, 'idea', 'buddy', 't', 'd', 'Idee', 'Kurze Übung gefällig?', 'sending',
               $2, $3, $4, $2)`,
      [
        l.learnerId,
        new Date('2026-09-28T07:50:00Z'),
        new Date('2026-09-28T20:00:00Z'),
        new Date('2026-09-28T07:52:00Z'),
      ],
    );
    await tick(env);
    expect(await outreach(env, l.learnerId)).toMatchObject([{ status: 'send_uncertain' }]);
    expect(await thread(env, l.learnerId)).toEqual(['Kurze Übung gefällig?']);
  });

  it('"Heute nicht" moves prepared practice to tomorrow instead of skipping it for good (M-57)', async () => {
    const l = await onboard(env);
    const stepId = (
      await env.db.one<{ id: string }>(
        `insert into buddy_steps (learner_id, kind, title, state, planned_date, payload, prepared_at)
         values ($1, 'practice', 'Brüche', 'prepared', '2026-09-28', $2, $3) returning id`,
        [
          l.learnerId,
          { item_ids: ['00000000-0000-4000-8000-000000000001'], est_minutes: 5 },
          env.clock.now(),
        ],
      )
    ).id;
    const before = await l.api.get<BuddyHome>('/buddy');
    expect(before.body.now).toMatchObject({ type: 'practice_ready', step_id: stepId });
    const later = await l.api.post<BuddyHome>(`/buddy/steps/${stepId}/skip`);
    expect(later.status).toBe(200);
    expect(later.body.now).toBeNull();
    expect(later.body.next).toMatchObject([{ kind: 'step', id: stepId, date: '2026-09-29' }]);
    env.clock.set('2026-09-29T08:00:00Z');
    const tomorrow = await l.api.get<BuddyHome>('/buddy');
    expect(tomorrow.body.now).toMatchObject({ type: 'practice_ready', step_id: stepId });
  });
});
