// Durable progress across releases, batches and interrupted writes (issue #862).
// requires live verification in Claude Code session (real Postgres; auth is the harness fake)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { executeAccountDeletion } from '../modules/identity/privacy.js';
import * as registry from '../modules/identity/privacyTables.js';
import { claimJobs, type JobRow } from '../modules/scheduler/jobs.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();
const FIRST = 'erasure_first';
const NEXT = 'erasure_next';
const ADDED = 'erasure_added';

describe.skipIf(!dbReady)('account deletion progress across releases', () => {
  let env: TestEnv;
  let learner: Learner;
  let other: Learner;

  beforeEach(async () => {
    env = await createTestEnv();
    learner = await onboard(env);
    other = await onboard(env);
    await env.db.query(`create table erasure_visits (table_name text);
      create function record_erasure_visit() returns trigger language plpgsql as $$
        begin insert into erasure_visits values (TG_TABLE_NAME); return null; end $$;`);
    for (const table of [FIRST, NEXT, ADDED]) {
      // RESTRICT prevents the final account cascade from hiding a skipped content table.
      await env.db.query(`create table ${table} (learner_id uuid references learners(id));
        create trigger visit after delete on ${table}
        for each statement execute function record_erasure_visit()`);
      await env.db.query(`insert into ${table} values ($1), ($2)`, [
        learner.learnerId,
        other.learnerId,
      ]);
    }
    vi.spyOn(registry, 'privacyTables').mockReturnValue([{ table: FIRST }, { table: NEXT }]);
    expect((await learner.api.post('/account/deletion')).status).toBe(202);
    env.clock.hours(24 * 8);
    await env.db.query(`update accounts set deletion_started_at = $2 where id = $1`, [
      learner.accountId,
      env.clock.now(),
    ]);
    await setProgress();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await env.close();
  });

  async function setProgress(table?: string | number): Promise<void> {
    await env.db.query(
      `update jobs set payload = $2
      where kind = 'delete_account' and payload ->> 'account_id' = $1`,
      [
        learner.accountId,
        {
          account_id: learner.accountId,
          stage: 'content',
          learner_id: learner.learnerId,
          auth_user_id: learner.userId,
          table,
        },
      ],
    );
  }

  async function claim(): Promise<JobRow> {
    const [job] = await claimJobs(env.db, {
      now: env.clock.now(),
      kinds: ['delete_account'],
      limit: 1,
      leaseSeconds: 60,
    });
    expect(job).toBeDefined();
    return job!;
  }

  async function oneBatch(): Promise<JobRow> {
    const job = await claim();
    const clock = vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValue(20_001);
    try {
      await executeAccountDeletion(env.deps, job);
    } finally {
      clock.mockRestore();
    }
    return env.db.one<JobRow>('select * from jobs where id = $1', [job.id]);
  }

  async function assertDone(): Promise<void> {
    expect(
      await env.db.maybeOne('select 1 from accounts where id = $1', [learner.accountId]),
    ).toBeNull();
    for (const table of [FIRST, NEXT, ADDED]) {
      expect(await env.db.query(`select learner_id from ${table}`)).toEqual([
        { learner_id: other.learnerId },
      ]);
    }
  }

  it('visits a newly inserted table and never repeats a completed table moved later', async () => {
    const paused = await oneBatch();
    expect(paused.status).toBe('queued');
    expect(paused.payload.table).toBe(NEXT);
    vi.mocked(registry.privacyTables).mockReturnValue([
      { table: ADDED },
      { table: NEXT },
      { table: FIRST },
    ]);
    await executeAccountDeletion(env.deps, await claim());
    await assertDone();
    expect(await env.db.query('select table_name from erasure_visits')).toEqual([
      { table_name: FIRST },
      { table_name: ADDED },
      { table_name: NEXT },
    ]);
  });

  it.each([3, 999, NEXT, 'removed_table'])(
    'safely upgrades old cursor %s on resume',
    async (table) => {
      await setProgress(table);
      vi.mocked(registry.privacyTables).mockReturnValue([
        { table: FIRST },
        { table: ADDED },
        { table: NEXT },
      ]);
      await executeAccountDeletion(env.deps, await claim());
      await assertDone();
      const [job] = await env.db.query<JobRow>("select * from jobs where kind = 'delete_account'");
      expect(job?.payload.completed_tables).toEqual(expect.arrayContaining([FIRST, NEXT, ADDED]));
      expect(typeof job?.payload.table).not.toBe('number');
    },
  );

  it('does not mark a partly emptied table complete, or restart after the last table', async () => {
    vi.mocked(registry.privacyTables).mockReturnValue([
      { table: FIRST },
      { table: NEXT },
      { table: ADDED },
    ]);
    await env.db.query(`insert into ${FIRST} select $1 from generate_series(1, 2000)`, [
      learner.learnerId,
    ]);
    const paused = await oneBatch();
    expect(paused.payload.completed_tables).toEqual([]);
    expect(paused.payload.table).toBe(FIRST);
    expect(
      await env.db.query(`select count(*)::int n from ${FIRST} where learner_id = $1`, [
        learner.learnerId,
      ]),
    ).toEqual([{ n: 1 }]);
    let last = paused;
    for (let runs = 0; runs < 50 && last.status === 'queued'; runs++) last = await oneBatch();
    expect(last.status).toBe('done');
    await assertDone();
    expect(
      await env.db.query(`select table_name, count(*)::int n from erasure_visits
      group by table_name order by table_name`),
    ).toEqual([
      { table_name: ADDED, n: 1 },
      { table_name: FIRST, n: 2 },
      { table_name: NEXT, n: 1 },
    ]);
  });

  it('rolls back when the batch no longer owns the job lease', async () => {
    await env.db.query(`create function steal_erasure_lease() returns trigger language plpgsql as $$
      begin
        update jobs set lease_token = gen_random_uuid() where kind = 'delete_account';
        return null;
      end $$;
      create trigger steal_lease after delete on ${FIRST}
      for each statement execute function steal_erasure_lease()`);
    const job = await claim();
    await executeAccountDeletion(env.deps, job);
    expect(
      await env.db.query(`select learner_id from ${FIRST} where learner_id = $1`, [
        learner.learnerId,
      ]),
    ).toHaveLength(1);
    expect(await env.db.query('select * from erasure_visits')).toEqual([]);
    expect(env.auth.deleted).not.toContain(learner.userId);
  });

  it('rolls the batch back if its durable progress cannot be saved', async () => {
    await env.db
      .query(`create function refuse_erasure_progress() returns trigger language plpgsql as $$
      begin
        if new.payload -> 'completed_tables' ? '${FIRST}' then
          raise exception 'progress write interrupted';
        end if;
        return new;
      end $$;
      create trigger refuse_progress before update on jobs
      for each row execute function refuse_erasure_progress()`);
    const job = await claim();
    await expect(executeAccountDeletion(env.deps, job)).rejects.toThrow(
      'progress write interrupted',
    );
    expect(
      await env.db.query(`select learner_id from ${FIRST} where learner_id = $1`, [
        learner.learnerId,
      ]),
    ).toHaveLength(1);
    expect(await env.db.query('select * from erasure_visits')).toEqual([]);
    await env.db.query('drop trigger refuse_progress on jobs');
    vi.mocked(registry.privacyTables).mockReturnValue([
      { table: FIRST },
      { table: NEXT },
      { table: ADDED },
    ]);
    await executeAccountDeletion(env.deps, job);
    await assertDone();
  });
});
