// The context fence, the lock order and lease fencing under real concurrency (audit N-2:
// repro-01 apply-vs-tap-lock-order-deadlock, repro-17 check-lease-shorter-than-runtime,
// repro-21 timezone-header-no-context-bump, repro-22 quote-checked-against-trigger-only,
// p2-turn-day-offsets-anchored-to-now-resolved-at-message-time, schedule-check-compatible-dst).
// docs/architecture.md §Turns, §Buddy decisions, §Background work.
// requires live verification in Claude Code session (needs a running Postgres)

import type { SendMessageResponse } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LlmError } from '../llm/gateway.js';
import { enqueueJob } from '../modules/scheduler/jobs.js';
import { runTick } from '../modules/scheduler/tick.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

let seq = 0;
const uuid = () => `00000000-0000-4000-b000-${(++seq).toString(16).padStart(12, '0')}`;

async function send(l: Learner, text: string, id = uuid()) {
  const res = await l.api.post<SendMessageResponse>('/buddy/messages', {
    client_message_id: id,
    text,
  });
  return { ...res, id };
}

const reply = (text: string, actions: unknown[] = []) => ({
  concern: false,
  reply: text,
  options: null,
  actions,
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

async function until(check: () => Promise<boolean>, what: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`timed out waiting for ${what}`);
}

describe.skipIf(!dbReady)('context fence, lock order, leases', () => {
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

  it('a tap during an apply waits instead of deadlocking (repro-01)', async () => {
    const l = await onboard(env);
    const step = await env.db.one<{ id: string }>(
      `insert into buddy_steps (learner_id, kind, title, state, planned_date)
       values ($1, 'practice', 'Brüche üben', 'planned', '2026-09-28') returning id`,
      [l.learnerId],
    );
    const dbName = (await env.db.one<{ d: string }>(`select current_database() as d`)).d;
    const deadlocks = async () =>
      (
        await env.db.one<{ n: string }>(
          `select deadlocks::text as n from pg_stat_database where datname = $1`,
          [dbName],
        )
      ).n;
    const before = await deadlocks();
    const waiting = async () =>
      (
        await env.db.one<{ n: number }>(
          `select count(*)::int as n from pg_stat_activity
            where datname = $1 and wait_event_type = 'Lock'`,
          [dbName],
        )
      ).n;

    let tap: Promise<{ status: number }> | null = null;
    env.llm.script(
      'buddy_turn',
      async () => {
        // Something else holds the step for a moment (another tap, a practice start) …
        const locked = deferred();
        const release = deferred();
        void env.db.tx(async (tx) => {
          await tx.query(`select 1 from buddy_steps where id = $1 for update`, [step.id]);
          locked.resolve();
          await release.promise;
        });
        await locked.promise;
        // … she taps "Heute nicht" on the card while Buddy is answering …
        tap = l.api.post(`/buddy/steps/${step.id}/skip`);
        await until(async () => (await waiting()) >= 1, 'the tap to wait');
        // … and Buddy's decision about the same step is applied: let go once both wait.
        void until(async () => (await waiting()) >= 2, 'the apply to wait').then(() =>
          release.resolve(),
        );
        return reply('Super, erledigt!', [
          { tool: 'mark_step_done', args: { step: 'st1', quote: 'schon geübt' } },
        ]);
      },
      // The tap came first: the decision is stale and Buddy is asked again.
      { json: reply('Alles klar, dann ein andermal.') },
    );
    const res = await send(l, 'Ich hab Brüche schon geübt');
    expect(res.body.status).toBe('done');
    expect(tap).not.toBeNull();
    expect((await tap!).status).toBe(200);
    await env.db.query(`select pg_stat_clear_snapshot()`);
    await new Promise((r) => setTimeout(r, 600));
    expect(await deadlocks()).toBe(before);
    const decisions = await env.db.query<{ disposition: string }>(
      `select disposition from buddy_decisions where learner_id = $1 order by created_at, id`,
      [l.learnerId],
    );
    expect(decisions.map((d) => d.disposition).sort()).toEqual(['applied', 'stale']);
  });

  it('a check that outlives one lease keeps it, and is applied exactly once (repro-17)', async () => {
    const l = await onboard(env);
    await env.db.query(
      `insert into buddy_goals (learner_id, kind, title, due_date) values ($1, 'exam', 'Mathearbeit', '2026-10-05')`,
      [l.learnerId],
    );
    // She left the app a while ago.
    env.clock.minutes(10);
    await enqueueJob(env.db, {
      learnerId: l.learnerId,
      kind: 'buddy_check',
      runAt: env.clock.now(),
      dedupeKey: 'check:lease-test',
      payload: { reason: 'checkin_requested', note: 'nachfragen' },
    });
    const outcomes: string[] = [];
    env.llm.script(
      'buddy_check',
      async () => {
        env.clock.advance(100_000); // a slow first round …
        return { disposition: 'act' }; // … that has to be repaired
      },
      async () => {
        env.clock.advance(100_000); // 200 s in: longer than one lease
        // Another scheduler run starts meanwhile.
        const other = await runTick(env.deps);
        outcomes.push(...other.errors);
        return {
          disposition: 'act',
          reason: 'nachfragen',
          actions: [
            {
              tool: 'schedule_check',
              args: { day: { kind: 'in_days', days: 2 }, time: null, reason: 'nochmal' },
            },
          ],
          outreach: null,
        };
      },
    );
    const stats = await runTick(env.deps);
    expect(stats.errors).toEqual([]);
    expect(outcomes).toEqual([]);
    expect(env.llm.callsFor('buddy_check')).toHaveLength(2);
    const applied = await env.db.query(
      `select 1 from buddy_decisions where learner_id = $1 and mode = 'check' and disposition = 'applied'`,
      [l.learnerId],
    );
    expect(applied).toHaveLength(1);
    const job = await env.db.one<{ status: string; attempts: number }>(
      `select status, attempts from jobs where dedupe_key = 'check:lease-test'`,
    );
    expect(job).toMatchObject({ status: 'done', attempts: 1 });
  });

  it('a time-zone change while Buddy thinks makes the decision stale, not a day off (repro-21)', async () => {
    // Monday 05:00 in Berlin = Sunday 23:00 in New York.
    env.clock.set('2026-09-28T03:00:00Z');
    const l = await onboard(env);
    const plan = (days: number) =>
      reply('Eingetragen!', [
        {
          tool: 'plan_exam',
          args: {
            title: 'Mathearbeit',
            subject: 'Mathe',
            subject_kind: 'math',
            day: { kind: 'in_days', days },
            topics: [],
            quote: 'Mathearbeit am Dienstag',
          },
        },
      ]);
    let secondState = '';
    env.llm.script(
      'buddy_turn',
      async () => {
        // Her phone reports another zone (travel, a second device) mid-turn.
        const r = await l.api.with({ 'x-timezone': 'America/New_York' }).get('/buddy');
        expect(r.status).toBe(200);
        return plan(1); // Tuesday, counted in Berlin
      },
      async (req) => {
        secondState = ScriptedGateway.textOf(req);
        return plan(2); // Tuesday, counted from Sunday in New York
      },
    );
    const res = await send(l, 'Ich schreibe eine Mathearbeit am Dienstag');
    expect(res.body.status).toBe('done');
    expect(secondState).toContain('America/New_York');
    const goal = await env.db.one<{ due_date: string }>(
      `select to_char(due_date, 'YYYY-MM-DD') as due_date from buddy_goals where learner_id = $1`,
      [l.learnerId],
    );
    expect(goal.due_date).toBe('2026-09-29');
  });

  it('several quick messages count as her words together (repro-22)', async () => {
    const l = await onboard(env);
    let second: Promise<{ body: SendMessageResponse }> | null = null;
    env.llm.script(
      'buddy_turn',
      async () => {
        // She sends the rest of the sentence while Buddy thinks about the first half.
        second = send(l, 'über Brüche');
        await second;
        return reply('Okay.');
      },
      {
        json: reply('Eingetragen: Mathearbeit am Freitag über Brüche.', [
          {
            tool: 'plan_exam',
            args: {
              title: 'Mathearbeit Brüche',
              subject: 'Mathe',
              subject_kind: 'math',
              day: { kind: 'in_days', days: 4 },
              topics: ['Brüche'],
              quote: 'Mathearbeit am Freitag',
            },
          },
        ]),
      },
    );
    const first = await send(l, 'Mathearbeit am Freitag');
    expect(first.body.status).toBe('done');
    expect((await second!).body.status).toBe('done');
    const goals = await env.db.query<{ title: string }>(
      `select title from buddy_goals where learner_id = $1`,
      [l.learnerId],
    );
    expect(goals).toEqual([{ title: 'Mathearbeit Brüche' }]);
  });

  it('a message resent days later resolves days from the day the model counted from', async () => {
    const l = await onboard(env);
    env.llm.script('buddy_turn', { error: new LlmError('unavailable', 'down') });
    const failed = await send(l, 'Mathearbeit am Freitag'); // Monday
    expect(failed.body.status).toBe('failed');
    env.clock.set('2026-09-30T08:00:00Z'); // Wednesday
    let seen = '';
    env.llm.script('buddy_turn', async (req) => {
      seen = ScriptedGateway.textOf(req);
      return reply('Eingetragen!', [
        {
          tool: 'plan_exam',
          args: {
            title: 'Mathearbeit',
            subject: 'Mathe',
            subject_kind: 'math',
            day: { kind: 'in_days', days: 2 }, // Friday, counted from Wednesday
            topics: [],
            quote: 'Mathearbeit am Freitag',
          },
        },
      ]);
    });
    const again = await send(l, 'Mathearbeit am Freitag', failed.id);
    expect(again.body.status).toBe('done');
    expect(seen).toContain('wrote their latest message on Monday 2026-09-28');
    const goal = await env.db.one<{ due_date: string }>(
      `select to_char(due_date, 'YYYY-MM-DD') as due_date from buddy_goals where learner_id = $1`,
      [l.learnerId],
    );
    expect(goal.due_date).toBe('2026-10-02');
  });

  it('schedule_check rejects a time that exists twice on a clock change (rule 2)', async () => {
    env.clock.set('2026-10-20T08:00:00Z');
    const l = await onboard(env);
    const check = (time: string) =>
      reply('Ich schaue am Sonntag nochmal.', [
        {
          tool: 'schedule_check',
          args: { day: { kind: 'date', date: '2026-10-25' }, time, reason: 'nachfragen' },
        },
      ]);
    env.llm.script('buddy_turn', { json: check('02:30') }, { json: check('10:00') });
    const res = await send(l, 'Frag mich am Sonntag nochmal');
    expect(res.body.status).toBe('done');
    const rejected = await env.db.one<{ errors: string[] }>(
      `select errors from buddy_decisions where learner_id = $1 and disposition = 'rejected'`,
      [l.learnerId],
    );
    expect(rejected.errors.join(' ')).toContain('exists twice');
    const job = await env.db.one<{ run_at: Date }>(
      `select run_at from jobs where learner_id = $1 and payload ->> 'reason' = 'checkin_requested'`,
      [l.learnerId],
    );
    expect(job.run_at.toISOString()).toBe('2026-10-25T09:00:00.000Z');
  });
});
