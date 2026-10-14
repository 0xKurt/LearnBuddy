// The home tells what she did last (issue #643, device 14.10.): she finished eight questions, went
// back to Buddy, and the home still led with a run she had paused hours before — so the result
// never reached the home and the visit's greeting was a bare "Abend, Testkind!". The paused run
// keeps its place once the result's half hour is over; a run she touched after finishing the
// other one still comes first.
// requires live verification in Claude Code session (needs a running Postgres)

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const MIN = 60_000;

async function run(
  env: TestEnv,
  l: Learner,
  status: 'active' | 'finished',
  lastActivity: Date,
): Promise<string> {
  const item = await env.db.one<{ id: string }>(
    `insert into items (learner_id, kind, prompt, answer, topic, difficulty, origin)
     values ($1, 'short', 'Kürze 6/8.', '3/4', 'Kürzen', 2, 'buddy') returning id`,
    [l.learnerId],
  );
  const open = await env.db.one<{ id: string }>(
    `insert into items (learner_id, kind, prompt, answer, topic, difficulty, origin)
     values ($1, 'short', 'Kürze 2/4.', '1/2', 'Kürzen', 2, 'buddy') returning id`,
    [l.learnerId],
  );
  const s = await env.db.one<{ id: string }>(
    `insert into practice_sessions (learner_id, mode, status, title, started_at, last_activity_at,
                                    finished_at)
     values ($1, 'practice', $2, 'Brüche', $3, $3, case when $2 = 'finished' then $3::timestamptz end)
     returning id`,
    [l.learnerId, status, lastActivity],
  );
  await env.db.query(
    `insert into session_items (session_id, item_id, position, status, first_try_correct, closed_at)
     values ($1, $2, 0, 'correct', true, $3), ($1, $4, 1, $5, null, $6)`,
    [
      s.id,
      item.id,
      lastActivity,
      open.id,
      status === 'finished' ? 'correct' : 'open',
      status === 'finished' ? lastActivity : null,
    ],
  );
  return s.id;
}

const nowOf = async (l: Learner) => (await l.api.get<BuddyHome>('/buddy')).body.now;

describe.skipIf(!dbReady)('the home leads with what she did last (issue #643)', () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-10-14T19:00:00Z' });
  });
  afterAll(async () => {
    await env?.close();
  });

  it('the run she just finished comes before one she paused earlier', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Testkind', birthDate: '2014-02-10' });
    const t = env.clock.now().getTime();
    const paused = await run(env, l, 'active', new Date(t - 3 * 60 * MIN));
    const done = await run(env, l, 'finished', new Date(t - 2 * MIN));
    expect(await nowOf(l)).toMatchObject({ type: 'practice_result', session_id: done });

    // Half an hour later the result has had its moment: the paused run is on top again.
    env.clock.set(new Date(t + 31 * MIN).toISOString());
    expect(await nowOf(l)).toMatchObject({ type: 'resume_practice', session_id: paused });
    env.clock.set(new Date(t).toISOString());
  });

  it('a run she went on with after finishing the other stays first', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2014-02-10' });
    const t = env.clock.now().getTime();
    await run(env, l, 'finished', new Date(t - 10 * MIN));
    const going = await run(env, l, 'active', new Date(t - 2 * MIN));
    expect(await nowOf(l)).toMatchObject({ type: 'resume_practice', session_id: going });
  });
});
