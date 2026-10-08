// "Nach einer Pause" (issue #446, the second proactive moment): after two whole days without a
// single answer, Buddy offers — on his own, decided by code from data, never by the model — a short
// practice of what has fallen due for review. Through the real scheduler, the real contact policy
// and the real context fence on Postgres: a break that is too short, nothing due, a test ahead or
// something planned for today says nothing; at most once every three days, counting the review the
// day after a sheet; without consent or after an opt-out nothing reaches the phone; another
// learner's answers and questions are never hers. docs/architecture.md §Proactivity.
// requires live verification in Claude Code session (needs a running Postgres)

import type { SendMessageResponse } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../lib/db.js';
import { runLearnerJobs } from '../modules/buddy/check.js';
import { emitEvent } from '../modules/buddy/events.js';
import { findOrCreateSubject } from '../modules/buddy/plan.js';
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

/** The wake-up's reason (`REVIEW_DUE` in buddy/review.ts), written out: the contract. */
const REVIEW_DUE = 'review_due';
/** What Buddy says (de), with no count and no day in it. */
const OFFER =
  'Magst du kurz auffrischen, was du zuletzt geübt hast? Ein paar Fragen liegen bereit – so bleibt es gut im Kopf.';

const DAY = 86_400_000;
// Monday 2026-09-28, 10:00 in Berlin (CEST, UTC+2, for every day of these tests).
const START = '2026-09-28T08:00:00Z';
/** Day `n` after Monday, at `hour` in Berlin. */
const day = (n: number, hour = 10) =>
  new Date(Date.parse(START) + n * DAY + (hour - 10) * 3_600_000);

/** Buddy's ordinary look right after her own practice or reading: here it waits. */
const WAIT = { json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null } };

/** A sheet of hers with questions, none practised yet. */
async function sheet(tx: Db, learnerId: string, title: string, questions: number, at: Date) {
  const subject = await findOrCreateSubject(tx, learnerId, 'Biologie', 'biology');
  const m = await tx.one<{ id: string }>(
    `insert into materials (learner_id, client_request_id, subject_id, status, photo_count, title, created_at)
     values ($1, gen_random_uuid(), $2, 'ready', 1, $3, $4) returning id`,
    [learnerId, subject.id, title, at],
  );
  const items: string[] = [];
  for (let i = 0; i < questions; i++) {
    const item = await tx.one<{ id: string }>(
      `insert into items (learner_id, material_id, subject_id, kind, prompt, answer, topic)
       values ($1, $2, $3, 'short', $4, $5, 'Zellen') returning id`,
      [learnerId, m.id, subject.id, `${title}: Frage ${i + 1}`, `Antwort ${i + 1}`],
    );
    items.push(item.id);
  }
  return { materialId: m.id, items };
}

/**
 * A practice of hers that ends now: one answered question per entry, each with the FSRS due date
 * it got (whole days from now), and the event its end emits — as finishing a run emits it.
 */
async function practise(env: TestEnv, learnerId: string, dueInDays: readonly number[]) {
  env.llm.script('buddy_check', WAIT);
  const now = env.clock.now();
  const items = await env.db.tx(async (tx) => {
    const { items } = await sheet(tx, learnerId, 'Die Zelle', dueInDays.length, now);
    const s = await tx.one<{ id: string }>(
      `insert into practice_sessions (learner_id, status, started_at, last_activity_at, finished_at, created_at)
       values ($1, 'finished', $2, $2, $2, $2) returning id`,
      [learnerId, now],
    );
    for (const [i, id] of items.entries()) {
      const days = dueInDays[i]!;
      await tx.query(
        `insert into session_items (session_id, item_id, position, status, attempts, first_try_correct, closed_at)
         values ($1, $2, $3, 'correct', 1, true, $4)`,
        [s.id, id, i + 1, now],
      );
      await tx.query(
        `insert into item_states (item_id, learner_id, due, stability, difficulty, elapsed_days,
                                  scheduled_days, reps, lapses, state, last_review, last_outcome, updated_at)
         values ($1, $2, $3, $4::int, 5, 0, $4::int, 1, 0, 2, $5, 'first_try', $5)`,
        [id, learnerId, new Date(now.getTime() + days * DAY), days, now],
      );
    }
    await emitEvent(tx, learnerId, { type: 'session_finished', sessionId: s.id }, now);
    return items;
  });
  expect((await runTick(env.deps)).errors).toEqual([]);
  return items;
}

/** A sheet she photographed, read now: the reading's event, as the reading emits it. */
async function readSheet(env: TestEnv, learnerId: string): Promise<void> {
  env.llm.script('buddy_check', WAIT);
  await env.db.tx(async (tx) => {
    const { materialId } = await sheet(tx, learnerId, 'Die Photosynthese', 3, env.clock.now());
    await emitEvent(tx, learnerId, { type: 'material_ready', materialId }, env.clock.now());
  });
  expect((await runTick(env.deps)).errors).toEqual([]);
}

/** Her days go on until `until`, away from the app: each wake-up of hers runs when it falls due. */
async function liveUntil(env: TestEnv, learnerId: string, until: Date): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const next = await env.db.maybeOne<{ run_at: Date }>(
      `select run_at from jobs where learner_id = $1 and status = 'queued' and run_at <= $2
        order by run_at limit 1`,
      [learnerId, until],
    );
    if (!next) break;
    env.clock.set(new Date(Math.max(next.run_at.getTime() + 60_000, env.clock.now().getTime())));
    expect((await runTick(env.deps)).errors).toEqual([]);
  }
  env.clock.set(until);
}

async function breakJobs(env: TestEnv, learnerId: string) {
  return env.db.query<{ run_at: Date; status: string; result: { outcome?: string } | null }>(
    `select run_at, status, result from jobs
      where learner_id = $1 and kind = 'buddy_check' and payload ->> 'reason' = $2
      order by run_at, created_at`,
    [learnerId, REVIEW_DUE],
  );
}

async function outcomes(env: TestEnv, learnerId: string): Promise<Array<string | undefined>> {
  return (await breakJobs(env, learnerId)).map((j) => j.result?.outcome);
}

async function offers(env: TestEnv, learnerId: string) {
  return env.db.query<{
    status: string;
    status_reason: string | null;
    origin: string;
    body: string;
    step_id: string | null;
  }>(
    `select status, status_reason, origin, body, step_id from buddy_outreach
      where learner_id = $1 and topic_key like 'review:due:%' order by created_at`,
    [learnerId],
  );
}

async function stepOf(env: TestEnv, stepId: string) {
  return env.db.one<{
    state: string;
    title: string;
    payload: { item_ids: string[]; est_minutes: number };
  }>(`select state, title, payload from buddy_steps where id = $1`, [stepId]);
}

/** Thursday afternoon: the wake-up of a practice on Monday has run. */
const THURSDAY = day(3, 16);

describe.skipIf(!dbReady)('the review after a break (#446)', () => {
  let env: TestEnv;
  let l: Learner;

  beforeEach(async () => {
    env = await createTestEnv({ start: START });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  // The model is asked only for the looks scripted here: a review asks it nothing.
  afterEach(() => env.closeChecked());

  it('is woken three days after she practised, at the start of her window — once per day', async () => {
    await practise(env, l.learnerId, [1]);
    env.clock.set(day(0, 18));
    await practise(env, l.learnerId, [1]);
    env.clock.set(day(1, 9));
    await practise(env, l.learnerId, [1]);
    const local = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Berlin',
      dateStyle: 'short',
      timeStyle: 'short',
    });
    const jobs = await breakJobs(env, l.learnerId);
    expect(jobs.map((j) => local.format(j.run_at))).toEqual([
      '2026-10-01 15:00',
      '2026-10-02 15:00',
    ]);
    expect(jobs.map((j) => j.status)).toEqual(['queued', 'queued']);
  });

  it('without consent: only what is due, waiting in the app — nothing to the phone', async () => {
    const practised = await practise(env, l.learnerId, [1, 2, 10]);
    // A sheet she has not practised yet: nothing of it is due.
    await env.db.tx((tx) => sheet(tx, l.learnerId, 'Neu', 2, env.clock.now()));
    await liveUntil(env, l.learnerId, THURSDAY);

    const said = await offers(env, l.learnerId);
    expect(said).toEqual([
      {
        status: 'in_app',
        status_reason: 'contact_disabled',
        origin: 'buddy',
        body: OFFER,
        step_id: expect.any(String),
      },
    ]);
    expect(env.push.attempts).toEqual([]);
    const step = await stepOf(env, said[0]!.step_id!);
    expect(step.state).toBe('prepared');
    expect(step.title).toBe('Kurz auffrischen');
    expect(step.payload.est_minutes).toBe(5);
    expect([...step.payload.item_ids].sort()).toEqual(practised.slice(0, 2).sort());
    const thread = await env.db.query<{ text: string }>(
      `select text from buddy_messages where learner_id = $1 and outreach_id is not null`,
      [l.learnerId],
    );
    expect(thread.map((m) => m.text)).toEqual([OFFER]);
    expect(await outcomes(env, l.learnerId)).toEqual(['offered']);
    const decision = await env.db.one<{ reason: string; disposition: string }>(
      `select reason, disposition from buddy_decisions
        where learner_id = $1 and prompt_version = 'review.1'`,
      [l.learnerId],
    );
    expect(decision).toEqual({ reason: 'review after a break (code)', disposition: 'applied' });
  });

  it('with consent and a phone: the fixed lock-screen text, never a count', async () => {
    await enableContact(env, l.learnerId);
    await l.api.post('/buddy/push-tokens', {
      token: 'ExponentPushToken[device-0446b]',
      platform: 'android',
    });
    await practise(env, l.learnerId, [1, 2]);
    await liveUntil(env, l.learnerId, THURSDAY);
    expect((await offers(env, l.learnerId)).map((o) => o.status)).toEqual(['accepted']);
    expect(env.push.sent.map((m) => m.body)).toEqual(['Buddy hat eine Idee für dich.']);
  });

  it.each([
    ['"Seltener schreiben"', { phone_only_important: true }, 'only_important'],
    ['a pause', { paused_until: new Date('2026-10-10T00:00:00Z') }, 'paused'],
    ['contact switched off again', { contact_enabled: false }, 'contact_disabled'],
  ] as const)(
    'after an opt-out (%s) it never reaches the phone, and changes nothing she set',
    async (_what, optOut, reason) => {
      await enableContact(env, l.learnerId, optOut);
      await l.api.post('/buddy/push-tokens', {
        token: 'ExponentPushToken[device-0446b]',
        platform: 'android',
      });
      const contact = () =>
        env.db.one(
          `select contact_enabled, phone_only_important, paused_until, quiet_start, quiet_end,
                  preferred_start, preferred_end, avoid_weekdays
             from buddy_settings where learner_id = $1`,
          [l.learnerId],
        );
      const before = await contact();
      await practise(env, l.learnerId, [1, 2]);
      await liveUntil(env, l.learnerId, THURSDAY);
      expect((await offers(env, l.learnerId)).map((o) => [o.status, o.status_reason])).toEqual([
        ['in_app', reason],
      ]);
      expect(env.push.attempts).toEqual([]);
      expect(await contact()).toEqual(before);
    },
  );

  it('a break that is too short says nothing; the break after her last practice does', async () => {
    await practise(env, l.learnerId, [1, 2]);
    // Wednesday: she practised again — Thursday is no break.
    env.clock.set(day(2));
    await practise(env, l.learnerId, [9]);
    await liveUntil(env, l.learnerId, day(5, 16));
    expect(await outcomes(env, l.learnerId)).toEqual(['no_break', 'offered']);
    const said = await offers(env, l.learnerId);
    expect(said).toHaveLength(1);
    // Monday's questions are due; Wednesday's is not yet.
    expect((await stepOf(env, said[0]!.step_id!)).payload.item_ids).toHaveLength(2);
  });

  it('says nothing when nothing is due yet', async () => {
    await practise(env, l.learnerId, [6, 9]);
    await liveUntil(env, l.learnerId, THURSDAY);
    expect(await outcomes(env, l.learnerId)).toEqual(['nothing_due']);
    expect(await offers(env, l.learnerId)).toEqual([]);
    const steps = await env.db.query(`select 1 from buddy_steps where learner_id = $1`, [
      l.learnerId,
    ]);
    expect(steps).toEqual([]);
  });

  it('stays quiet with a test ahead: the countdown and the daily look prepare for that', async () => {
    await practise(env, l.learnerId, [1, 2]);
    await env.db.query(
      `insert into buddy_goals (learner_id, kind, title, due_date) values ($1, 'exam', 'Biotest', '2026-10-09')`,
      [l.learnerId],
    );
    await liveUntil(env, l.learnerId, THURSDAY);
    expect(await outcomes(env, l.learnerId)).toEqual(['test_ahead']);
    expect(await offers(env, l.learnerId)).toEqual([]);
  });

  it('stays quiet on a day something is already planned for her', async () => {
    await practise(env, l.learnerId, [1, 2]);
    // She agreed to practise on Thursday.
    await env.db.query(
      `insert into buddy_steps (learner_id, kind, title, state, planned_date, planned_time, agreed)
       values ($1, 'practice', 'Bio üben', 'planned', '2026-10-01', '17:00', true)`,
      [l.learnerId],
    );
    await liveUntil(env, l.learnerId, THURSDAY);
    expect(await outcomes(env, l.learnerId)).toEqual(['planned_today']);
    expect(await offers(env, l.learnerId)).toEqual([]);
  });

  it('at most once every three days: the review of a sheet the day before keeps it quiet', async () => {
    await practise(env, l.learnerId, [1, 2]);
    // Tuesday she photographs a sheet; Wednesday Buddy offers to go over it.
    env.clock.set(day(1));
    await readSheet(env, l.learnerId);
    await liveUntil(env, l.learnerId, THURSDAY);
    const sheetReview = await env.db.query(
      `select 1 from buddy_outreach where learner_id = $1 and topic_key like 'review:%'
          and topic_key not like 'review:due:%'`,
      [l.learnerId],
    );
    expect(sheetReview).toHaveLength(1);
    expect(await outcomes(env, l.learnerId)).toEqual(['too_soon']);
    expect(await offers(env, l.learnerId)).toEqual([]);
  });

  it('three days after the last review offer, it speaks again', async () => {
    // Monday a sheet, Tuesday 15:00 its review; Tuesday morning she practised something else.
    await readSheet(env, l.learnerId);
    env.clock.set(day(1));
    await practise(env, l.learnerId, [1, 2]);
    await liveUntil(env, l.learnerId, day(4, 16));
    expect(await outcomes(env, l.learnerId)).toEqual(['offered']);
    expect(await offers(env, l.learnerId)).toHaveLength(1);
  });

  it("never counts another learner's answers or offers his questions", async () => {
    const mine = await practise(env, l.learnerId, [1, 2]);
    const max = await onboard(env, { name: 'Max' });
    // Tuesday Max practises: his answers are not hers, her break holds.
    env.clock.set(day(1));
    await practise(env, max.learnerId, [1, 1, 1]);
    await liveUntil(env, l.learnerId, THURSDAY);
    const said = await offers(env, l.learnerId);
    expect(said).toHaveLength(1);
    expect([...(await stepOf(env, said[0]!.step_id!)).payload.item_ids].sort()).toEqual(
      [...mine].sort(),
    );
    // His own wake-up is Friday's, and nothing of his was said to anyone yet.
    expect(await offers(env, max.learnerId)).toEqual([]);
    expect((await breakJobs(env, max.learnerId)).map((j) => j.status)).toEqual(['queued']);
  });

  it('a wake-up that runs twice says it once and prepares it once', async () => {
    await practise(env, l.learnerId, [1, 2]);
    const [first] = await breakJobs(env, l.learnerId);
    await enqueueJob(env.db, {
      learnerId: l.learnerId,
      kind: 'buddy_check',
      runAt: first!.run_at,
      dedupeKey: `review_due:${l.learnerId}:again`,
      payload: { reason: REVIEW_DUE },
    });
    await liveUntil(env, l.learnerId, THURSDAY);
    expect(await offers(env, l.learnerId)).toHaveLength(1);
    const steps = await env.db.query(`select 1 from buddy_steps where learner_id = $1`, [
      l.learnerId,
    ]);
    expect(steps).toHaveLength(1);
    expect((await outcomes(env, l.learnerId)).sort()).toEqual(['offered', 'too_soon']);
  });

  it('a decision Buddy took before the review landed is not applied: he is asked again', async () => {
    await practise(env, l.learnerId, [1, 2]);
    const [wake] = await breakJobs(env, l.learnerId);
    env.clock.set(new Date(wake!.run_at.getTime() + 60_000));
    const reply = { concern: false, reply: 'Hallo Lena!', options: null, actions: [] };
    const asked: string[] = [];
    env.llm.script(
      'buddy_turn',
      async () => {
        // While Buddy answers her, the wake-up runs (she counts as away by then).
        env.clock.minutes(4);
        await runLearnerJobs(env.deps, l.learnerId);
        return reply;
      },
      (req) => {
        asked.push(ScriptedGateway.textOf(req));
        return reply;
      },
    );
    const res = await l.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: '00000000-0000-4000-b000-000000000446',
      text: 'Hallo Buddy',
    });
    expect(res.body.status).toBe('done');
    expect(await outcomes(env, l.learnerId)).toEqual(['offered']);
    const turns = await env.db.query<{ disposition: string }>(
      `select disposition from buddy_decisions where learner_id = $1 and mode = 'turn'`,
      [l.learnerId],
    );
    expect(turns.map((d) => d.disposition).sort()).toEqual(['applied', 'stale']);
    // Asked again, it saw what the review said.
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain(OFFER);
  });
});
