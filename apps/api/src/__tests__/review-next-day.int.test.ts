// "Am Tag danach" (issue #446): the day after a sheet was read, Buddy offers — on his own, decided
// by code from data, never by the model — to go over it once more. Through the real scheduler and
// the real contact policy on Postgres: no consent → nothing to the phone (it waits in the app);
// a wake-up that runs twice says it once; a sheet that was deleted, practised today or belongs to
// someone else says nothing; while she is in the app it waits. docs/architecture.md §Proactivity.
// requires live verification in Claude Code session (needs a running Postgres)

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { emitEvent } from '../modules/buddy/events.js';
import { findOrCreateSubject } from '../modules/buddy/plan.js';
import { enqueueJob } from '../modules/scheduler/jobs.js';
import { runTick } from '../modules/scheduler/tick.js';
import { testDatabaseAvailable } from '../testing/database.js';
import {
  createTestEnv,
  enableContact,
  onboard,
  type Learner,
  type TestEnv,
} from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

/** The wake-up's reason (`REVIEW_NEXT_DAY` in buddy/review.ts), written out: the contract. */
const REVIEW_NEXT_DAY = 'review_next_day';

// Monday 2026-09-28, 10:00 in Berlin.
const START = '2026-09-28T08:00:00Z';

/** A read sheet with questions, and its reading's event — as the reading itself emits it. */
async function readSheet(
  env: TestEnv,
  learnerId: string,
  opts: { title?: string | null; questions?: number; homework?: boolean } = {},
): Promise<string> {
  // The reading also wakes Buddy's ordinary look at once (`material_ready`); here it waits, so
  // every message in these tests is the review's.
  if (!opts.homework)
    env.llm.script('buddy_check', {
      json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null },
    });
  return env.db.tx(async (tx) => {
    const subject = await findOrCreateSubject(tx, learnerId, 'Biologie', 'biology');
    const m = await tx.one<{ id: string }>(
      `insert into materials (learner_id, client_request_id, subject_id, status, photo_count, title, created_at)
       values ($1, gen_random_uuid(), $2, 'ready', 1, $3, $4) returning id`,
      [
        learnerId,
        subject.id,
        opts.title === undefined ? 'Die Photosynthese' : opts.title,
        env.clock.now(),
      ],
    );
    for (let i = 0; i < (opts.questions ?? 4); i++) {
      await tx.query(
        `insert into items (learner_id, material_id, subject_id, kind, prompt, answer, topic)
         values ($1, $2, $3, 'short', $4, $5, 'Photosynthese')`,
        [learnerId, m.id, subject.id, `Frage ${i + 1}`, `Antwort ${i + 1}`],
      );
    }
    await emitEvent(
      tx,
      learnerId,
      opts.homework
        ? { type: 'homework_ready', materialId: m.id }
        : { type: 'material_ready', materialId: m.id },
      env.clock.now(),
    );
    return m.id;
  });
}

async function reviewJobs(env: TestEnv, learnerId: string) {
  return env.db.query<{ run_at: Date; status: string; result: { outcome?: string } | null }>(
    `select run_at, status, result from jobs
      where learner_id = $1 and kind = 'buddy_check' and payload ->> 'reason' = $2
      order by created_at`,
    [learnerId, REVIEW_NEXT_DAY],
  );
}

async function outreach(env: TestEnv, learnerId: string) {
  return env.db.query<{
    status: string;
    status_reason: string | null;
    origin: string;
    body: string;
  }>(
    `select status, status_reason, origin, body from buddy_outreach
      where learner_id = $1 and topic_key like 'review:%' order by created_at`,
    [learnerId],
  );
}

async function reviewSteps(env: TestEnv, learnerId: string) {
  return env.db.query<{ state: string; payload: { item_ids: string[]; material_id: string } }>(
    `select state, payload from buddy_steps where learner_id = $1 and payload ? 'material_id'`,
    [learnerId],
  );
}

/** The next morning, when the wake-up is due, and she is not in the app. */
async function nextMorning(env: TestEnv, learnerId: string): Promise<void> {
  const [job] = await reviewJobs(env, learnerId);
  expect(job).toBeDefined();
  env.clock.set(new Date(job!.run_at.getTime() + 60_000).toISOString());
  const stats = await runTick(env.deps);
  expect(stats.errors).toEqual([]);
}

describe.skipIf(!dbReady)('the review the day after (#446)', () => {
  let env: TestEnv;
  let l: Learner;

  beforeEach(async () => {
    env = await createTestEnv({ start: START });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  // No model may be asked: an unexpected model call fails here.
  afterEach(() => env.closeChecked());

  it('is woken once per sheet, the next day at the start of her window — never for homework', async () => {
    const sheet = await readSheet(env, l.learnerId);
    // The same reading's event again (a retried job): no second wake-up.
    await env.db.tx((tx) =>
      emitEvent(tx, l.learnerId, { type: 'material_ready', materialId: sheet }, env.clock.now()),
    );
    await readSheet(env, l.learnerId, { homework: true });
    const jobs = await reviewJobs(env, l.learnerId);
    expect(jobs).toHaveLength(1);
    const window = await env.db.one<{ preferred_start: string }>(
      `select preferred_start from buddy_settings where learner_id = $1`,
      [l.learnerId],
    );
    const local = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Berlin',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(jobs[0]!.run_at);
    expect(local).toBe(`2026-09-29 ${window.preferred_start.slice(0, 5)}`);
    // Today only the ordinary look runs (the scripted "wait"); the review is not due yet.
    expect((await runTick(env.deps)).errors).toEqual([]);
    expect((await reviewJobs(env, l.learnerId))[0]!.status).toBe('queued');
  });

  it('without consent: nothing reaches the phone; the offer and its practice wait in the app', async () => {
    const sheet = await readSheet(env, l.learnerId);
    await nextMorning(env, l.learnerId);

    expect(await outreach(env, l.learnerId)).toEqual([
      {
        status: 'in_app',
        status_reason: 'contact_disabled',
        origin: 'buddy',
        body: 'Magst du „Die Photosynthese“ kurz nochmal durchgehen? Ein paar Fragen liegen bereit – nach einer Nacht sitzt es dann besser.',
      },
    ]);
    expect(env.push.attempts).toEqual([]);
    // The practice it offers is from that sheet, ready to start.
    const steps = await reviewSteps(env, l.learnerId);
    expect(steps).toHaveLength(1);
    expect(steps[0]!.state).toBe('prepared');
    expect(steps[0]!.payload.material_id).toBe(sheet);
    expect(steps[0]!.payload.item_ids).toHaveLength(4);
    // It stands in the thread, as Buddy's words.
    const said = await env.db.query<{ text: string }>(
      `select text from buddy_messages where learner_id = $1 and outreach_id is not null`,
      [l.learnerId],
    );
    expect(said.map((m) => m.text)).toEqual([
      'Magst du „Die Photosynthese“ kurz nochmal durchgehen? Ein paar Fragen liegen bereit – nach einer Nacht sitzt es dann besser.',
    ]);
    const [job] = await reviewJobs(env, l.learnerId);
    expect(job!.result?.outcome).toBe('offered');
  });

  it('with consent and a phone: it goes out with the fixed lock-screen text, no count, no title', async () => {
    await enableContact(env, l.learnerId);
    await l.api.post('/buddy/push-tokens', {
      token: 'ExponentPushToken[device-0446]',
      platform: 'android',
    });
    await readSheet(env, l.learnerId);
    await nextMorning(env, l.learnerId);
    expect((await outreach(env, l.learnerId)).map((o) => o.status)).toEqual(['accepted']);
    expect(env.push.sent.map((m) => m.body)).toEqual(['Buddy hat eine Idee für dich.']);
  });

  it('a wake-up that runs twice says it once and prepares it once', async () => {
    const sheet = await readSheet(env, l.learnerId);
    const [first] = await reviewJobs(env, l.learnerId);
    await enqueueJob(env.db, {
      learnerId: l.learnerId,
      kind: 'buddy_check',
      runAt: first!.run_at,
      dedupeKey: `review:${sheet}:again`,
      payload: { reason: REVIEW_NEXT_DAY, material_id: sheet },
    });
    await nextMorning(env, l.learnerId);
    expect(await outreach(env, l.learnerId)).toHaveLength(1);
    expect(await reviewSteps(env, l.learnerId)).toHaveLength(1);
    const outcomes = (await reviewJobs(env, l.learnerId)).map((j) => j.result?.outcome).sort();
    expect(outcomes).toEqual(['obsolete', 'offered']);
  });

  it('says nothing about a sheet that was deleted since', async () => {
    const sheet = await readSheet(env, l.learnerId);
    await env.db.query(`update materials set archived_at = $2 where id = $1`, [
      sheet,
      env.clock.now(),
    ]);
    await nextMorning(env, l.learnerId);
    expect(await outreach(env, l.learnerId)).toEqual([]);
    expect(await reviewSteps(env, l.learnerId)).toEqual([]);
    expect((await reviewJobs(env, l.learnerId))[0]!.result?.outcome).toBe('obsolete');
  });

  it.each([
    ['finished', 'practised_today'],
    ['active', 'in_progress'],
  ] as const)(
    'says nothing when a practice of hers holds it — %s that morning → %s',
    async (status, outcome) => {
      const sheet = await readSheet(env, l.learnerId);
      const [job] = await reviewJobs(env, l.learnerId);
      // Early that morning, before the wake-up: one of its questions answered.
      env.clock.set(new Date(job!.run_at.getTime() - 30 * 60_000).toISOString());
      await env.db.tx(async (tx) => {
        const s = await tx.one<{ id: string }>(
          `insert into practice_sessions (learner_id, status, started_at, last_activity_at, created_at)
           values ($1, $2, $3, $3, $3) returning id`,
          [l.learnerId, status, env.clock.now()],
        );
        const item = await tx.one<{ id: string }>(
          `select id from items where material_id = $1 order by seq limit 1`,
          [sheet],
        );
        await tx.query(
          `insert into session_items (session_id, item_id, position, status, closed_at)
           values ($1, $2, 1, 'correct', $3)`,
          [s.id, item.id, env.clock.now()],
        );
      });
      await nextMorning(env, l.learnerId);
      expect(await outreach(env, l.learnerId)).toEqual([]);
      expect((await reviewJobs(env, l.learnerId))[0]!.result?.outcome).toBe(outcome);
    },
  );

  it('does not turn up days late when the wake-up could not run on its day', async () => {
    await readSheet(env, l.learnerId);
    const [job] = await reviewJobs(env, l.learnerId);
    env.clock.set(new Date(job!.run_at.getTime() + 2 * 86_400_000).toISOString());
    expect((await runTick(env.deps)).errors).toEqual([]);
    expect(await outreach(env, l.learnerId)).toEqual([]);
    expect(await reviewSteps(env, l.learnerId)).toEqual([]);
    expect((await reviewJobs(env, l.learnerId))[0]!.result?.outcome).toBe('obsolete');
  });

  it("never touches another learner's sheet", async () => {
    const other = await onboard(env, { name: 'Max' });
    const theirs = await readSheet(env, other.learnerId, { title: 'Geheim' });
    const [mine] = (await reviewJobs(env, other.learnerId)).slice(0, 1);
    // A wake-up for Lena that names Max's sheet.
    await enqueueJob(env.db, {
      learnerId: l.learnerId,
      kind: 'buddy_check',
      runAt: mine!.run_at,
      dedupeKey: `review:forged:${theirs}`,
      payload: { reason: REVIEW_NEXT_DAY, material_id: theirs },
    });
    await nextMorning(env, l.learnerId);
    expect(await outreach(env, l.learnerId)).toEqual([]);
    expect(await reviewSteps(env, l.learnerId)).toEqual([]);
    expect((await reviewJobs(env, l.learnerId))[0]!.result?.outcome).toBe('obsolete');
  });

  it('waits while she is in the app, like every unasked look', async () => {
    await readSheet(env, l.learnerId);
    const [job] = await reviewJobs(env, l.learnerId);
    const due = new Date(job!.run_at.getTime() + 60_000);
    env.clock.set(due.toISOString());
    await env.db.query(`update buddy_settings set last_seen_at = $2 where learner_id = $1`, [
      l.learnerId,
      due,
    ]);
    const stats = await runTick(env.deps);
    expect(stats.errors).toEqual([]);
    expect(await outreach(env, l.learnerId)).toEqual([]);
    const [moved] = await reviewJobs(env, l.learnerId);
    expect(moved!.status).toBe('queued');
    expect(moved!.run_at.getTime()).toBe(due.getTime() + 20 * 60_000);
  });

  it('bumps the context in the same change, so a decision taken before it is stale', async () => {
    await readSheet(env, l.learnerId);
    const before = await env.db.one<{ v: number }>(
      `select context_version as v from buddy_settings where learner_id = $1`,
      [l.learnerId],
    );
    await nextMorning(env, l.learnerId);
    const after = await env.db.one<{ v: number }>(
      `select context_version as v from buddy_settings where learner_id = $1`,
      [l.learnerId],
    );
    expect(after.v).toBeGreaterThan(before.v);
  });
});
