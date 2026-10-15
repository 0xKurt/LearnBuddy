// A daily routine look asks the model only when something is new (F4-d, KI-Audit 14.10., issue
// #656). While a test is within 14 days Buddy looks every afternoon; measured, 5 of 9 of his own
// messages were never shown and 0 of 12 opened — most of those looks had nothing new to look at.
// Now a routine look whose state the model already decided about within 48 hours waits by code;
// anything new (her message, a sheet, a practice) moves the context and the model is asked.
// docs/architecture.md §Proactivity.
// requires live verification in Claude Code session (needs a running Postgres; scripted model)

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findOrCreateSubject } from '../modules/learning/state.js';
import { bumpContext } from '../modules/buddy/plan.js';
import { enqueueJob } from '../modules/scheduler/jobs.js';
import { testDatabaseAvailable } from '../testing/database.js';
import {
  createTestEnv,
  onboard,
  TEST_TICK_SECRET,
  type Learner,
  type TestEnv,
} from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

async function tick(env: TestEnv): Promise<void> {
  const res = await env.app.request('/v1/internal/tick', {
    method: 'POST',
    headers: { 'x-tick-secret': TEST_TICK_SECRET },
  });
  expect(res.status).toBe(200);
  await env.flushBackground();
}

const WAIT = {
  json: { disposition: 'wait', reason: 'nothing to add', actions: [], outreach: null },
};

describe.skipIf(!dbReady)('routine looks without anything new (#656)', () => {
  let env: TestEnv;
  let l: Learner;
  let goalId: string;
  beforeEach(async () => {
    // Monday 10:00 in Berlin; her test is on Saturday.
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    const subject = await findOrCreateSubject(env.db, l.learnerId, 'Mathe', 'math');
    const goal = await env.db.one<{ id: string }>(
      `insert into buddy_goals (learner_id, kind, title, subject_id, due_date)
       values ($1, 'exam', 'Mathearbeit', $2, '2026-10-03') returning id`,
      [l.learnerId, subject.id],
    );
    goalId = goal.id;
    const sheet = await env.db.one<{ id: string }>(
      `insert into materials (learner_id, client_request_id, goal_id, subject_id, status, photo_count, title, created_at)
       values ($1, gen_random_uuid(), $2, $3, 'ready', 1, 'Arbeitsblatt', $4) returning id`,
      [l.learnerId, goal.id, subject.id, env.clock.now()],
    );
    await env.db.query(
      `insert into items (learner_id, material_id, subject_id, kind, prompt, answer, topic)
       values ($1, $2, $3, 'short', 'Frage 1', 'Antwort 1', 'Brüche')`,
      [l.learnerId, sheet.id, subject.id],
    );
    await enqueueJob(env.db, {
      learnerId: l.learnerId,
      kind: 'buddy_check',
      runAt: new Date('2026-09-28T13:00:00Z'),
      dedupeKey: `routine:${l.learnerId}:2026-09-28`,
      payload: { reason: 'routine' },
    });
    env.llm.byDefault('buddy_check', WAIT);
  });
  afterEach(() => env.closeChecked());

  /** Every afternoon at 15:45 Berlin (past every learner's offset, `routineAt`), for `days` days from Monday. */
  async function afternoons(days: number, between?: (day: number) => Promise<void>) {
    for (let d = 0; d < days; d++) {
      if (d > 0) await between?.(d);
      env.clock.set(new Date(Date.UTC(2026, 8, 28 + d, 13, 45)).toISOString());
      await tick(env);
    }
  }

  it('four quiet afternoons ask the model twice, not four times', async () => {
    await afternoons(4);
    const routine = await env.db.query<{ status: string }>(
      `select status from jobs where learner_id = $1 and dedupe_key like 'routine:%'`,
      [l.learnerId],
    );
    // Four looks ran (and the fifth is planned) — two of them by code.
    expect(routine.filter((r) => r.status === 'done')).toHaveLength(4);
    expect(env.llm.callsFor('buddy_check')).toHaveLength(2);
  });

  it('asks again on the next afternoon when something happened in between', async () => {
    // Something she did each day (here: a change Buddy's context depends on).
    await afternoons(3, async () => {
      await env.db.tx((tx) => bumpContext(tx, l.learnerId));
    });
    expect(env.llm.callsFor('buddy_check')).toHaveLength(3);
  });

  it('a decision whose only message was suppressed moved nothing: one change after it is new', async () => {
    // Buddy raised the same topic an hour before, so the message the model proposes is
    // suppressed — the decision applies, writes nothing, and does not bump the context.
    await env.db.query(
      `insert into buddy_outreach (learner_id, kind, origin, topic_key, dedupe_key, title, body,
                                   relevance, status, expires_at, created_at)
       values ($1, 'idea', 'buddy', $2, 'earlier', 'Übung', 'Eine kurze Runde?', 0.8, 'in_app',
               '2026-09-29T12:00:00Z', '2026-09-28T12:00:00Z')`,
      [l.learnerId, `exam:${goalId}:prep`],
    );
    env.llm.script('buddy_check', {
      json: {
        disposition: 'act',
        reason: 'test on Saturday',
        actions: [],
        outreach: {
          kind: 'idea',
          topic_key: 'exam:g1:prep',
          title: 'Übung',
          body: 'Eine kurze Runde für Samstag?',
          why: 'Die Arbeit ist bald.',
          relevance: 0.8,
          expires_in_hours: 12,
          goal: 'g1',
          step: null,
        },
      },
    });
    // Then exactly one real change before the next afternoon.
    await afternoons(2, async () => {
      await env.db.tx((tx) => bumpContext(tx, l.learnerId));
    });
    const proposed = await env.db.one<{ status: string }>(
      `select status from buddy_outreach where learner_id = $1 and dedupe_key <> 'earlier'`,
      [l.learnerId],
    );
    expect(proposed.status).toBe('suppressed');
    expect(env.llm.callsFor('buddy_check')).toHaveLength(2);
  });
});
