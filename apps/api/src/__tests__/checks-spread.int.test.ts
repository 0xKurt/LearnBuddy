// The afternoon's checks do not queue up behind each other (K3, KI-Audit 14.10., issue #680).
// Every routine look and countdown fell on the start of the preferred window (15:00 by default)
// and ran one learner after the other: at ~4 s per check six to eight learners per run, so at
// 1 000 learners the last look came an hour late and /health turned red. Now a run works on
// CHECKS_AT_ONCE learners side by side, and each learner's daily look has an offset of her own.
// docs/architecture.md §Proactivity.
// requires live verification in Claude Code session (needs a running Postgres; scripted model)

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { routineAt } from '../modules/buddy/plan.js';
import { findOrCreateSubject } from '../modules/learning/state.js';
import { enqueueJob } from '../modules/scheduler/jobs.js';
import { runTick } from '../modules/scheduler/tick.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

/** A learner with a test ahead and a question — something for Buddy to look at. */
async function withTestAhead(env: TestEnv, l: Learner): Promise<void> {
  const subject = await findOrCreateSubject(env.db, l.learnerId, 'Mathe', 'math');
  const goal = await env.db.one<{ id: string }>(
    `insert into buddy_goals (learner_id, kind, title, subject_id, due_date)
     values ($1, 'exam', 'Mathearbeit', $2, '2026-10-03') returning id`,
    [l.learnerId, subject.id],
  );
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
}

describe.skipIf(!dbReady)('the afternoon checks (#680)', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T13:00:00Z' });
  });
  afterEach(() => env.closeChecked());

  it('works on three learners side by side, and on every due one within the run', async () => {
    const learners: Learner[] = [];
    for (let i = 0; i < 9; i++) {
      const l = await onboard(env, {
        relation: 'child',
        name: `Kind ${i}`,
        birthDate: '2014-02-10',
      });
      await withTestAhead(env, l);
      await enqueueJob(env.db, {
        learnerId: l.learnerId,
        kind: 'buddy_check',
        runAt: env.clock.now(),
        dedupeKey: `routine:${l.learnerId}:2026-09-28`,
        payload: { reason: 'routine' },
      });
      learners.push(l);
    }
    // A model that takes its time, and a count of how many checks wait on it at once.
    let now = 0;
    let most = 0;
    env.llm.byDefault('buddy_check', async () => {
      now++;
      most = Math.max(most, now);
      await new Promise((r) => setTimeout(r, 150));
      now--;
      return { disposition: 'wait', reason: 'n/a', actions: [], outreach: null };
    });
    await runTick(env.deps);
    expect(most).toBe(3);
    const done = await env.db.query(
      `select 1 from jobs where kind = 'buddy_check' and status = 'done' and dedupe_key like 'routine:%:2026-09-28'`,
    );
    expect(done).toHaveLength(9);
  });

  it("spreads each learner's routine look over the start of her window, the same every day", () => {
    const s = { timezone: 'Europe/Berlin', preferred_start: '15:00', preferred_end: '19:00' };
    const start = new Date('2026-09-29T13:00:00Z').getTime();
    const offsets = new Set<number>();
    for (let i = 0; i < 60; i++) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
      const at = routineAt('2026-09-29', s, id).getTime() - start;
      expect(at).toBeGreaterThanOrEqual(0);
      expect(at).toBeLessThan(30 * 60_000);
      // The same learner, the same minute, every day.
      expect(routineAt('2026-09-30', s, id).getTime() - at).toBe(
        new Date('2026-09-30T13:00:00Z').getTime(),
      );
      offsets.add(at);
    }
    expect(offsets.size).toBeGreaterThan(10);
    // A short window keeps the look in its first half.
    const short = { ...s, preferred_end: '15:20' };
    expect(routineAt('2026-09-29', short, 'x').getTime() - start).toBeLessThan(10 * 60_000);
  });
});
