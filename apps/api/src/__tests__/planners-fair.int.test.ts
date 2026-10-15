// The planners reach every learner, and an idle run stays light (F7, KI-Audit 14.10., issue #659).
// Measured (`messskripte/starve.mts`): 150 learners, 10 due → after 5 runs only 2 had a summary
// job. `planSummaries` took 50 learners in no order, already summarised ones included, so the
// learners after them never came; `planConsolidations` the same. And every run swept retention
// in full, every minute. docs/architecture.md §Background work.
// requires live verification in Claude Code session (needs a running Postgres; scripted model)

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import {
  createTestEnv,
  onboard,
  TEST_TICK_SECRET,
  type Learner,
  type TestEnv,
} from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();
const HOUR = 3_600_000;

/** One run of the scheduler; the database round trips it took, from its Server-Timing header. */
async function tick(env: TestEnv): Promise<number> {
  const res = await env.app.request('/v1/internal/tick', {
    method: 'POST',
    headers: { 'x-tick-secret': TEST_TICK_SECRET },
  });
  expect(res.status).toBe(200);
  await env.flushBackground();
  const m = /db;dur=[\d.]+;desc="(\d+) queries"/.exec(res.headers.get('server-timing') ?? '');
  return Number(m?.[1] ?? NaN);
}

/** A conversation of four messages that ended a day ago. */
async function talkedYesterday(env: TestEnv, l: Learner): Promise<Date> {
  const at = new Date(env.clock.now().getTime() - 26 * HOUR);
  const lines = ['hi', 'Hallo!', 'was machen wir heute', 'Magst du Vokabeln üben?'];
  for (const [i, text] of lines.entries())
    await env.db.query(
      `insert into buddy_messages (learner_id, role, text, status, created_at)
       values ($1, $2, $3, 'done', $4)`,
      [l.learnerId, i % 2 === 0 ? 'learner' : 'buddy', text, new Date(at.getTime() + i * 60_000)],
    );
  return new Date(at.getTime() + (lines.length - 1) * 60_000);
}

describe.skipIf(!dbReady)('planners that reach everyone (#659)', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-29T09:00:00Z' });
    env.llm.byDefault('summary', {
      json: { summary: 'Sie wollte Vokabeln üben.', topics: ['Vokabeln'] },
    });
  });
  afterEach(() => env.closeChecked());

  it('plans the summary of every learner whose conversation is due, past the first 50', async () => {
    // 140 learners whose conversation is written down already — the first in the table.
    for (let i = 0; i < 140; i++) {
      const l = await onboard(env, {
        relation: 'child',
        name: `Kind ${i}`,
        birthDate: '2014-02-10',
      });
      const ended = await talkedYesterday(env, l);
      await env.db.query(
        `insert into buddy_session_summaries (learner_id, day, started_at, ended_at, summary, topics)
         values ($1, '2026-09-28', $2, $2, 'Schon notiert.', '[]'::jsonb)`,
        [l.learnerId, ended],
      );
    }
    // Ten whose conversation is due.
    const due: Learner[] = [];
    for (let i = 0; i < 10; i++) {
      const l = await onboard(env, {
        relation: 'child',
        name: `Neu ${i}`,
        birthDate: '2014-02-10',
      });
      await talkedYesterday(env, l);
      due.push(l);
    }
    await tick(env);
    for (const l of due) {
      const planned = await env.db.query(
        `select 1 from jobs where learner_id = $1 and kind = 'summarise_session'`,
        [l.learnerId],
      );
      expect(planned, `summary planned for ${l.learnerId}`).toHaveLength(1);
    }
  }, 60_000);

  it('an idle run stays under 40 round trips, the sweeps at most every 15 minutes', async () => {
    await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    const first = await tick(env);
    env.clock.minutes(1);
    const idle = await tick(env);
    expect(idle).toBeLessThanOrEqual(40);
    expect(idle).toBeLessThan(first);
    // A quarter of an hour later the retention pass runs again, and says so on /health.
    env.clock.minutes(15);
    await tick(env);
    const health = (await (await env.app.request('/v1/health')).json()) as {
      scheduler: { retention: { last_run_at: string | null } };
    };
    expect(health.scheduler.retention.last_run_at).toBe(env.clock.now().toISOString());
  });
});
