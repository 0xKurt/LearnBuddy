// Four seams of the background work the KI-Audit found (14.10., K1/K2/K4/K6, issue #663):
//   K1 a fallback that waits wrote nothing, and still made every running chat turn stale;
//   K2 a message about a step she had already started was accepted, reported `scheduled`, and
//      cancelled as obsolete before it could ever go out;
//   K4 a job that threw kept no reason: its lease ran out and `lease_expired` stood there instead;
//   K6 a reading of up to four model calls held one 180 s lease, so a second run could claim it.
// docs/architecture.md §Proactivity, §Background work, §Material.
// requires live verification in Claude Code session (needs a running Postgres; scripted model)

import { randomUUID } from 'node:crypto';

import type { MaterialView } from '@learnbuddy/shared-types/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { findOrCreateSubject } from '../modules/learning/state.js';
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

const contextVersion = async (env: TestEnv, l: Learner) =>
  (
    await env.db.one<{ context_version: number }>(
      `select context_version from buddy_settings where learner_id = $1`,
      [l.learnerId],
    )
  ).context_version;

async function goal(env: TestEnv, l: Learner, status: 'active' | 'done'): Promise<string> {
  const subject = await findOrCreateSubject(env.db, l.learnerId, 'Mathe', 'math');
  const g = await env.db.one<{ id: string }>(
    `insert into buddy_goals (learner_id, kind, title, subject_id, due_date, status)
     values ($1, 'exam', 'Mathearbeit', $2, '2026-10-01', $3) returning id`,
    [l.learnerId, subject.id, status],
  );
  return g.id;
}

async function check(env: TestEnv, l: Learner, payload: Record<string, unknown>): Promise<void> {
  await enqueueJob(env.db, {
    learnerId: l.learnerId,
    kind: 'buddy_check',
    runAt: env.clock.now(),
    dedupeKey: `test:${randomUUID()}`,
    payload,
  });
}

describe.skipIf(!dbReady)('fences of the background work (#663)', () => {
  let env: TestEnv;
  afterEach(() => env.closeChecked());

  it('K1: a fallback that waits leaves the context where it was; one that acts moves it', async () => {
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z', model: 'disabled' });
    const l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    // A test still on (so Buddy has something to work with), and a follow-up for one that is
    // over: the fixed fallback has nothing to say about that one.
    const active = await goal(env, l, 'active');
    await check(env, l, { reason: 'exam_followup', goal_id: await goal(env, l, 'done') });
    const before = await contextVersion(env, l);
    await tick(env);
    const waited = await env.db.one<{ status: string; result: { outcome: string } }>(
      `select status, result from jobs
        where learner_id = $1 and kind = 'buddy_check' and dedupe_key like 'test:%'`,
      [l.learnerId],
    );
    expect(waited).toMatchObject({ status: 'done', result: { outcome: 'fallback_wait' } });
    expect(await contextVersion(env, l)).toBe(before);

    // The same follow-up for a test still on: the fallback asks how it went — that is new state.
    await check(env, l, { reason: 'exam_followup', goal_id: active });
    await tick(env);
    expect(await contextVersion(env, l)).toBeGreaterThan(before);
  });

  it('K2: a message about a step she already started is refused and repaired, not cancelled later', async () => {
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z' });
    const l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    const g = await goal(env, l, 'active');
    await env.db.query(
      `insert into buddy_steps (learner_id, goal_id, kind, title, state, planned_date)
       values ($1, $2, 'practice', 'Brüche üben', 'in_progress', '2026-09-28')`,
      [l.learnerId, g],
    );
    const said = (step: string | null) => ({
      json: {
        disposition: 'act',
        reason: 'test soon',
        actions: [],
        outreach: {
          kind: 'idea',
          topic_key: 'exam:g1:prep',
          title: 'Übung',
          body: 'Eine kurze Runde liegt bereit.',
          why: 'Die Arbeit ist bald.',
          relevance: 0.9,
          expires_in_hours: 12,
          goal: 'g1',
          step,
        },
      },
    });
    env.llm.script('buddy_check', said('st1'));
    env.llm.script('buddy_check', said(null));
    await check(env, l, { reason: 'exam_countdown', goal_id: g });
    await tick(env);

    const calls = env.llm.callsFor('buddy_check');
    expect(calls).toHaveLength(2);
    // The repair round names why: the step is under way.
    expect(JSON.stringify(calls[1]!.contents)).toContain('st1 is in_progress');
    const rows = await env.db.query<{ step_id: string | null }>(
      `select step_id from buddy_outreach where learner_id = $1`,
      [l.learnerId],
    );
    expect(rows).toEqual([{ step_id: null }]);
  });

  it('K4: a job that fails keeps its reason and waits its backoff, not the lease', async () => {
    env = await createTestEnv({ start: '2026-09-29T09:00:00Z' });
    const l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    const long = new Date(env.clock.now().getTime() - 30 * 3_600_000);
    for (const [i, [role, text]] of (
      [
        ['learner', 'hi'],
        ['buddy', 'Hallo!'],
        ['learner', 'was machen wir heute'],
        ['buddy', 'Magst du Vokabeln üben?'],
      ] as const
    ).entries()) {
      await env.db.query(
        `insert into buddy_messages (learner_id, role, text, status, created_at)
         values ($1, $2, $3, 'done', $4)`,
        [l.learnerId, role, text, new Date(long.getTime() + i * 60_000)],
      );
    }
    // Not a summary, every time: the job throws.
    env.llm.byDefault('summary', { json: { nonsense: true } });
    await tick(env);
    const job = () =>
      env.db.one<{
        status: string;
        attempts: number;
        last_error: string | null;
        run_at: Date;
        lease_until: Date | null;
      }>(
        `select status, attempts, last_error, run_at, lease_until from jobs
          where learner_id = $1 and kind = 'summarise_session'`,
        [l.learnerId],
      );
    const first = await job();
    expect(first).toMatchObject({
      status: 'queued',
      attempts: 1,
      last_error: 'summary did not match the schema',
      lease_until: null,
    });
    expect(first.run_at.getTime() - env.clock.now().getTime()).toBe(60_000);

    // Each later run fails the same way; after the last one the job is parked with its reason.
    for (let i = 0; i < 2; i++) {
      env.clock.minutes(10);
      await tick(env);
    }
    expect(await job()).toMatchObject({
      status: 'failed',
      attempts: 3,
      last_error: 'summary did not match the schema',
    });
  });

  it('K6: a reading that takes several calls keeps its lease through all of them', async () => {
    env = await createTestEnv({ start: '2026-09-28T14:00:00Z' });
    const l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    const pair = (n: number) => ({
      kind: 'vocab',
      prompt: `mot ${n}`,
      answer: `Wort ${n}`,
      accepted_answers: [],
      unit: null,
      choices: null,
      correct_choice: null,
      topic: 'Wörter',
      difficulty: 2,
      prompt_lang: 'fr',
      lang: 'de',
      figure: null,
      source_excerpt: null,
    });
    // Each call takes 150 s of the clock: four of them outlast one 180 s lease three times.
    const leaseLeft: number[] = [];
    for (let i = 0; i < 4; i++) {
      env.llm.script('extraction', async (req) => {
        const reading = {
          is_learning_material: true,
          readable: true,
          title: 'Riesige Liste',
          subject: { name: 'Französisch', kind: 'french' },
          extracted_text: 'Liste',
          items: [pair(i * 2 + 1), pair(i * 2 + 2)],
          more_items: i < 3,
          pages: [{ page: 1, read: 'all', problem: null }],
        };
        // The choice of forms reads the answer ahead (testing/fakes.ts): no clock for that.
        if (req.purpose !== 'extraction') return reading;
        const job = await env.db.one<{ lease_until: Date }>(
          `select lease_until from jobs where learner_id = $1 and kind = 'extract_material'`,
          [l.learnerId],
        );
        leaseLeft.push(job.lease_until.getTime() - env.clock.now().getTime());
        env.clock.minutes(2.5);
        return reading;
      });
    }
    env.llm.script('buddy_check', {
      json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null },
    });
    const created = await l.api.post<{ material: MaterialView; uploads: Array<{ path: string }> }>(
      '/materials',
      { client_request_id: randomUUID(), photo_mimes: ['image/jpeg'], purpose: 'study' },
    );
    for (const u of created.body.uploads) env.storage.put(u.path);
    await l.api.post(`/materials/${created.body.material.id}/submit`);
    await env.flushBackground();

    expect(leaseLeft).toHaveLength(4);
    // Before every call the lease reaches a whole lease ahead again.
    for (const ms of leaseLeft) expect(ms).toBeGreaterThanOrEqual(180_000);
    const m = await env.db.one<{ status: string }>(`select status from materials where id = $1`, [
      created.body.material.id,
    ]);
    expect(m.status).toBe('ready');
  });
});
