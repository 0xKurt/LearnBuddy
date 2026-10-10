// Account erasure under failure: storage and auth outages, large accounts, cancelling while
// it runs, a parked job from before, and a complete export. docs/privacy.md §Export and deletion.
// requires live verification in Claude Code session (needs a running Postgres; storage and
// auth outages are injected with the fakes in testing/fakes.ts)

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

let n = 0;
const uuid = () => `00000000-0000-4000-a000-${(++n).toString(16).padStart(12, '0')}`;
const DAY = 86_400_000;

async function tick(env: TestEnv): Promise<{ errors: string[] }> {
  const res = await env.app.request('/v1/internal/tick', {
    method: 'POST',
    headers: { 'x-tick-secret': TEST_TICK_SECRET },
  });
  expect(res.status).toBe(200);
  return (await res.json()) as { errors: string[] };
}

async function health(env: TestEnv): Promise<{
  status: number;
  body: {
    ok: boolean;
    erasure: { ok: boolean; overdue_deletions: number; pending_photos: number };
  };
}> {
  const res = await env.app.request('/v1/health');
  return { status: res.status, body: (await res.json()) as never };
}

async function withPhoto(env: TestEnv, l: Learner): Promise<string> {
  const created = await l.api.post<{ uploads: Array<{ path: string }> }>('/materials', {
    client_request_id: uuid(),
    photo_mimes: ['image/jpeg'],
  });
  expect(created.status).toBe(201);
  const path = created.body.uploads[0]!.path;
  env.storage.put(path);
  return path;
}

/** `count` photo rows in materials of 20 pages each; the first `purged` are already purged. */
async function manyPhotos(env: TestEnv, l: Learner, count: number, purged: number) {
  await env.db.query(
    `with m as (
       insert into materials (learner_id, client_request_id, photo_count, status, created_at,
                              photos_deleted_at)
       select $1, gen_random_uuid(), 20, 'ready', $3, case when g * 20 < $4 then $3::timestamptz end
         from generate_series(0, ($2 - 1) / 20) g
       returning id)
     insert into material_photos (material_id, position, storage_path, mime)
     select m.id, p, $5 || '/' || m.id || '/' || p || '.jpg', 'image/jpeg'
       from m cross join generate_series(0, 19) p`,
    [l.learnerId, count, env.clock.now(), purged, l.accountId],
  );
  const rows = await env.db.query<{ path: string; purged: boolean }>(
    `select mp.storage_path as path, m.photos_deleted_at is not null as purged
       from material_photos mp join materials m on m.id = mp.material_id where m.learner_id = $1`,
    [l.learnerId],
  );
  // Purged photos are no longer in the bucket.
  for (const r of rows) if (!r.purged) env.storage.put(r.path);
  return rows;
}

const gone = async (env: TestEnv, l: Learner) =>
  (await env.db.maybeOne(`select 1 from accounts where id = $1`, [l.accountId])) === null &&
  (await env.db.maybeOne(`select 1 from learners where id = $1`, [l.learnerId])) === null;

describe.skipIf(!dbReady)('account erasure', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z' });
  });
  afterEach(async () => {
    await env.close();
  });

  it('an auth outage at the due time is retried until the account is gone, and is visible meanwhile', async () => {
    const l = await onboard(env);
    const photo = await withPhoto(env, l);
    expect((await l.api.post('/account/deletion')).status).toBe(202);
    env.auth.failNextDelete(4);
    env.clock.advance(7 * DAY + 60_000);
    for (let i = 0; i < 4; i++) {
      await tick(env);
      env.clock.hours(1);
    }
    // Not parked: the job waits for its next try and says why.
    const job = await env.db.one<{ status: string; last_error: string | null }>(
      `select status, last_error from jobs where kind = 'delete_account' and payload ->> 'account_id' = $1`,
      [l.accountId],
    );
    expect(job.status).toBe('queued');
    expect(job.last_error).toBeTruthy();
    // The photo is not waiting for the auth user (D-9).
    expect(env.storage.objects.has(photo)).toBe(false);
    // Nobody is told "planned for <a past date>": the app sees it running, monitoring sees it overdue.
    const me = await l.api.get<{ account: { deletion_running: boolean } }>('/me');
    expect(me.status).toBe(200);
    expect(me.body.account.deletion_running).toBe(true);
    env.clock.hours(24);
    const h = await health(env);
    expect(h.body.erasure.overdue_deletions).toBe(1);
    expect(h.status).toBe(503);

    // Cancelling is refused honestly once it has started.
    const cancel = await l.api.delete('/account/deletion');
    expect(cancel.status).toBe(409);
    expect(cancel.body).toMatchObject({ error: { details: { reason: 'deletion_running' } } });

    await tick(env);
    expect(await gone(env, l)).toBe(true);
    expect(env.auth.deleted).toContain(l.userId);
    expect((await health(env)).body.erasure.overdue_deletions).toBe(0);
  });

  it('deletes the account even while storage is down; the photos follow when it is back (D-9)', async () => {
    const l = await onboard(env);
    const photo = await withPhoto(env, l);
    expect((await l.api.post('/account/deletion')).status).toBe(202);
    env.storage.failNext('remove', 3);
    env.clock.advance(7 * DAY + 60_000);
    await tick(env);
    expect(await gone(env, l)).toBe(true);
    expect(env.storage.objects.has(photo)).toBe(true);
    // Waiting photos are monitored, and retried with backoff until they are gone.
    const pending = await env.db.one<{ n: number }>(
      `select count(*)::int as n from storage_deletions`,
    );
    expect(pending.n).toBe(1);
    for (let i = 0; i < 6 && env.storage.objects.has(photo); i++) {
      env.clock.hours(2);
      await tick(env);
    }
    expect(env.storage.objects.has(photo)).toBe(false);
    expect(
      (await env.db.one<{ n: number }>(`select count(*)::int as n from storage_deletions`)).n,
    ).toBe(0);
  });

  it('deletes a long-used account: only live photos, never more than 1000 per request', async () => {
    const l = await onboard(env);
    const photos = await manyPhotos(env, l, 2400, 1000);
    expect((await l.api.post('/account/deletion')).status).toBe(202);
    env.clock.advance(7 * DAY + 60_000);
    await tick(env);
    expect(await gone(env, l)).toBe(true);
    for (const call of env.storage.removeCalls) expect(call.length).toBeLessThanOrEqual(1000);
    // Already purged photos are not sent again.
    const sent = new Set(env.storage.removeCalls.flat());
    expect(photos.filter((p) => p.purged && sent.has(p.path))).toEqual([]);
    expect(sent.size).toBe(1400);
    expect(photos.some((p) => env.storage.objects.has(p.path))).toBe(false);
  });

  it('deletes an account whose photos are no longer in storage', async () => {
    const l = await onboard(env);
    await manyPhotos(env, l, 40, 40);
    // A photo row whose object never arrived.
    await withPhoto(env, l).then((p) => env.storage.objects.delete(p));
    expect((await l.api.post('/account/deletion')).status).toBe(202);
    env.clock.advance(7 * DAY + 60_000);
    await tick(env);
    expect(await gone(env, l)).toBe(true);
  });

  it('a deletion parked by an earlier version is picked up again when requested again', async () => {
    const l = await onboard(env);
    expect((await l.api.post('/account/deletion')).status).toBe(202);
    await env.db.query(
      `update jobs set status = 'failed', attempts = 3, last_error = 'boom'
        where kind = 'delete_account' and payload ->> 'account_id' = $1`,
      [l.accountId],
    );
    env.clock.advance(8 * DAY);
    const again = await l.api.post<{ deletion_due_at: string }>('/account/deletion');
    expect(again.status).toBe(202);
    await tick(env);
    expect(await gone(env, l)).toBe(true);
  });

  it('a run killed in the middle resumes where it stopped, even after three lost leases', async () => {
    const l = await onboard(env);
    expect((await l.api.post('/account/deletion')).status).toBe(202);
    env.clock.advance(7 * DAY + 60_000);
    // A worker began, handed the photos over, deleted some tables and died (thrice).
    await env.db.query(`update accounts set deletion_started_at = $2 where id = $1`, [
      l.accountId,
      env.clock.now(),
    ]);
    await env.db.query(
      `update jobs set status = 'running', attempts = 3, lease_token = gen_random_uuid(),
                       lease_until = $2, payload = $3
        where kind = 'delete_account' and payload ->> 'account_id' = $1`,
      [
        l.accountId,
        new Date(env.clock.now().getTime() - 1000),
        {
          account_id: l.accountId,
          stage: 'content',
          table: 3,
          learner_id: l.learnerId,
          auth_user_id: l.userId,
        },
      ],
    );
    await tick(env);
    expect(await gone(env, l)).toBe(true);
    expect(env.auth.deleted).toContain(l.userId);
  });

  it('resumes the content stage at the table it saved by name (#107: the domain registers its tables)', async () => {
    const l = await onboard(env);
    expect((await l.api.post('/account/deletion')).status).toBe(202);
    env.clock.advance(7 * DAY + 60_000);
    await env.db.query(`update accounts set deletion_started_at = $2 where id = $1`, [
      l.accountId,
      env.clock.now(),
    ]);
    await env.db.query(
      `update jobs set payload = $2
        where kind = 'delete_account' and payload ->> 'account_id' = $1`,
      [
        l.accountId,
        {
          account_id: l.accountId,
          stage: 'content',
          table: 'buddy_messages',
          learner_id: l.learnerId,
          auth_user_id: l.userId,
        },
      ],
    );
    await tick(env);
    expect(await gone(env, l)).toBe(true);
    expect(env.auth.deleted).toContain(l.userId);
  });

  it('cancelling while the job runs is refused, not silently ignored', async () => {
    const l = await onboard(env);
    expect((await l.api.post('/account/deletion')).status).toBe(202);
    env.clock.advance(7 * DAY + 60_000);
    // The auth call is where a run spends its time: cancel lands during it.
    let cancelStatus = 0;
    const realDelete = env.auth.deleteUser.bind(env.auth);
    env.auth.deleteUser = async (id: string) => {
      cancelStatus = (await l.api.delete('/account/deletion')).status;
      await realDelete(id);
    };
    await tick(env);
    expect(cancelStatus).toBe(409);
    expect(await gone(env, l)).toBe(true);
  });

  it('forgets what the model wrote after 90 days, and the call log after 180 (#78)', async () => {
    const l = await onboard(env);
    const old = new Date(env.clock.now().getTime() - 100 * DAY);
    const older = new Date(env.clock.now().getTime() - 200 * DAY);
    const fresh = env.clock.now();
    for (const [at, version] of [
      [old, 'old'],
      [fresh, 'fresh'],
    ] as const) {
      await env.db.query(
        `insert into buddy_decisions (learner_id, mode, context_version, disposition, output, errors,
                                      triggers, prompt_version, created_at)
         values ($1, 'turn', 1, 'applied', '{"reply":"Das schaffst du"}'::jsonb, '[]'::jsonb,
                 '["message"]'::jsonb, $2, $3)`,
        [l.learnerId, version, at],
      );
    }
    for (const [at, version] of [
      [older, 'older'],
      [fresh, 'fresh'],
    ] as const) {
      await env.db.query(
        `insert into llm_calls (learner_id, purpose, model, prompt_version, outcome, created_at)
         values ($1, 'buddy_turn', 'scripted', $2, 'ok', $3)`,
        [l.learnerId, version, at],
      );
    }
    await tick(env);
    // The old decision keeps its shape, not her words; the young one is untouched.
    const decisions = await env.db.query<{ prompt_version: string; output: unknown }>(
      `select prompt_version, output from buddy_decisions where learner_id = $1 order by created_at`,
      [l.learnerId],
    );
    expect(decisions.map((d) => [d.prompt_version, d.output === null])).toEqual([
      ['old', true],
      ['fresh', false],
    ]);
    const calls = await env.db.query<{ prompt_version: string }>(
      `select prompt_version from llm_calls where learner_id = $1`,
      [l.learnerId],
    );
    expect(calls.map((c) => c.prompt_version)).toEqual(['fresh']);
  });

  it('the export contains model usage and background jobs, too', async () => {
    const l = await onboard(env);
    await env.db.query(
      `insert into llm_calls (learner_id, purpose, model, prompt_version, outcome, created_at)
       values ($1, 'buddy_turn', 'scripted', 'v1', 'ok', $2)`,
      [l.learnerId, env.clock.now()],
    );
    await withPhoto(env, l);
    const out = await l.api.get<Record<string, unknown[]>>('/account/export');
    expect(out.status).toBe(200);
    expect(out.body.llm_calls).toHaveLength(1);
    expect(Array.isArray(out.body.jobs)).toBe(true);
    expect(out.body.storage_deletions).toBeUndefined();
  });
});
