// Data export and account deletion (DSGVO Art. 15/17/20). docs/privacy.md.
//
// Export: everything stored about the learner, as JSON, immediately.
// Deletion: scheduled with a 7-day cancellable hold, then run as a resumable job
// (stages stored in the job payload, each idempotent):
//   start   → the account is marked as being deleted; cancelling is refused from here
//   photos  → every live photo path is handed to the Storage deletion queue (D-9: the
//             account does not wait for Storage; the queue retries until they are gone)
//   content → the learner's rows, table by table in batches (cost follows her own data)
//   auth    → the auth user, which cascades the account and the learner profile
// The job is never parked: it retries with backoff and /health reports it once overdue.

import type { Deps } from '../../deps.js';
import type { Db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { drainStorageDeletions } from '../materials/purge.js';
import {
  enqueueJob,
  finishJob,
  rescheduleJob,
  saveJobPayload,
  type JobRow,
} from '../scheduler/jobs.js';

export const DELETION_HOLD_DAYS = 7;

const LEARNER_TABLES = [
  'buddy_settings',
  'buddy_memories',
  'buddy_goals',
  'buddy_steps',
  'buddy_messages',
  'buddy_decisions',
  'buddy_actions',
  'buddy_outreach',
  'buddy_events',
  'subjects',
  'materials',
  'items',
  'item_states',
  'practice_sessions',
  'practice_turns',
  'usage_daily',
  'llm_calls',
] as const;

export async function exportAccount(db: Db, accountId: string): Promise<Record<string, unknown>> {
  const account = await db.one(
    `select id, locale, consent_version, consent_at, deletion_due_at, created_at from accounts where id = $1`,
    [accountId],
  );
  const learner = await db.maybeOne<{ id: string } & Record<string, unknown>>(
    `select id, relation, display_name, birth_date, level, grade, locale, minor_consent_version,
            minor_consent_at, created_at from learners where account_id = $1`,
    [accountId],
  );
  const out: Record<string, unknown> = {
    exported_format: 'learnbuddy.export.v1',
    account,
    learner,
  };
  if (!learner) return out;
  for (const table of LEARNER_TABLES) {
    // Table names come from the constant list above, never from input.
    out[table] = await db.query(`select * from ${table} where learner_id = $1`, [learner.id]);
  }
  out.session_items = await db.query(
    `select si.* from session_items si join practice_sessions ps on ps.id = si.session_id where ps.learner_id = $1`,
    [learner.id],
  );
  out.material_photos = await db.query(
    `select mp.material_id, mp.position, mp.mime, mp.created_at from material_photos mp
       join materials m on m.id = mp.material_id where m.learner_id = $1`,
    [learner.id],
  );
  out.push_tokens = await db.query(
    `select platform, status, registered_at from push_tokens where learner_id = $1`,
    [learner.id],
  );
  // Background work planned or done for her (ids and outcomes; lease internals left out).
  out.jobs = await db.query(
    `select id, kind, status, run_at, dedupe_key, payload, attempts, last_error, result,
            created_at, finished_at
       from jobs where learner_id = $1 or payload ->> 'account_id' = $2::text
      order by created_at`,
    [learner.id, accountId],
  );
  return out;
}

/** A request while a deletion is already scheduled keeps its date, and makes sure a job runs it. */
export async function requestDeletion(deps: Deps, accountId: string): Promise<Date> {
  const now = deps.now();
  const due = new Date(now.getTime() + DELETION_HOLD_DAYS * 86_400_000);
  return deps.db.tx(async (tx) => {
    const acc = await tx.one<{ deletion_due_at: Date | null }>(
      `select deletion_due_at from accounts where id = $1 for update`,
      [accountId],
    );
    if (acc.deletion_due_at) {
      // A job parked by an earlier version (or lost) would leave "planned" forever.
      const live = await tx.maybeOne(
        `select 1 from jobs where kind = 'delete_account' and payload ->> 'account_id' = $1
            and status in ('queued','running') limit 1`,
        [accountId],
      );
      if (!live) {
        const runAt = acc.deletion_due_at > now ? acc.deletion_due_at : now;
        await enqueueJob(tx, {
          learnerId: null,
          kind: 'delete_account',
          runAt,
          dedupeKey: `delete:${accountId}:${acc.deletion_due_at.toISOString()}:${now.toISOString()}`,
          payload: { account_id: accountId },
        });
      }
      return acc.deletion_due_at;
    }
    await tx.query(`update accounts set deletion_due_at = $2 where id = $1`, [accountId, due]);
    await enqueueJob(tx, {
      learnerId: null,
      kind: 'delete_account',
      runAt: due,
      dedupeKey: `delete:${accountId}:${due.toISOString()}`,
      payload: { account_id: accountId },
    });
    return due;
  });
}

export async function cancelDeletion(deps: Deps, accountId: string): Promise<void> {
  await deps.db.tx(async (tx) => {
    // Same row lock as the job's start: either the cancel wins, or it is refused.
    const acc = await tx.one<{ deletion_started_at: Date | null }>(
      `select deletion_started_at from accounts where id = $1 for update`,
      [accountId],
    );
    assertNotDeleting(acc.deletion_started_at);
    await tx.query(`update accounts set deletion_due_at = null where id = $1`, [accountId]);
    await tx.query(
      `update jobs set status = 'cancelled'
        where kind = 'delete_account' and status = 'queued' and payload ->> 'account_id' = $1`,
      [accountId],
    );
  });
}

/** Learner-scoped tables, children first, so no delete waits on a cascade. */
const CONTENT_TABLES: ReadonlyArray<{ table: string; rows: string }> = [
  { table: 'practice_turns', rows: `select ctid from practice_turns where learner_id = $1` },
  {
    table: 'session_items',
    rows: `select si.ctid from session_items si join practice_sessions ps on ps.id = si.session_id
            where ps.learner_id = $1`,
  },
  { table: 'practice_sessions', rows: `select ctid from practice_sessions where learner_id = $1` },
  { table: 'item_states', rows: `select ctid from item_states where learner_id = $1` },
  { table: 'items', rows: `select ctid from items where learner_id = $1` },
  {
    table: 'material_photos',
    rows: `select mp.ctid from material_photos mp join materials m on m.id = mp.material_id
            where m.learner_id = $1`,
  },
  { table: 'materials', rows: `select ctid from materials where learner_id = $1` },
  { table: 'buddy_outreach', rows: `select ctid from buddy_outreach where learner_id = $1` },
  { table: 'buddy_actions', rows: `select ctid from buddy_actions where learner_id = $1` },
  { table: 'buddy_memories', rows: `select ctid from buddy_memories where learner_id = $1` },
  { table: 'buddy_messages', rows: `select ctid from buddy_messages where learner_id = $1` },
  { table: 'buddy_decisions', rows: `select ctid from buddy_decisions where learner_id = $1` },
  { table: 'buddy_events', rows: `select ctid from buddy_events where learner_id = $1` },
  { table: 'buddy_steps', rows: `select ctid from buddy_steps where learner_id = $1` },
  { table: 'buddy_goals', rows: `select ctid from buddy_goals where learner_id = $1` },
  { table: 'subjects', rows: `select ctid from subjects where learner_id = $1` },
  { table: 'usage_daily', rows: `select ctid from usage_daily where learner_id = $1` },
  { table: 'llm_calls', rows: `select ctid from llm_calls where learner_id = $1` },
  { table: 'push_tokens', rows: `select ctid from push_tokens where learner_id = $1` },
  { table: 'jobs', rows: `select ctid from jobs where learner_id = $1` },
];
const CONTENT_BATCH = 2000;
/** Wall-clock budget of one run of the content stage; the rest continues on the next run. */
const CONTENT_BUDGET_MS = 20_000;

type DeletionState = {
  account_id: string;
  stage?: 'photos' | 'content' | 'auth';
  auth_user_id?: string;
  learner_id?: string | null;
  /** content stage: index into CONTENT_TABLES. */
  table?: number;
};

class LeaseLost extends Error {}

export async function executeAccountDeletion(deps: Deps, job: JobRow): Promise<void> {
  const state = { ...(job.payload as DeletionState) };
  const accountId = String(state.account_id ?? '');
  const save = async (next: DeletionState) => {
    if (!(await saveJobPayload(deps.db, job, next))) throw new LeaseLost('lease lost');
    Object.assign(state, next);
  };

  try {
    if (!state.stage) {
      const began = await deps.db.tx(async (tx) => {
        const acc = await tx.maybeOne<{
          auth_user_id: string;
          deletion_due_at: Date | null;
          deletion_started_at: Date | null;
        }>(
          `select auth_user_id, deletion_due_at, deletion_started_at from accounts where id = $1
             for update`,
          [accountId],
        );
        if (!acc) return 'gone' as const;
        if (!acc.deletion_started_at) {
          if (!acc.deletion_due_at || acc.deletion_due_at > deps.now()) return 'not_due' as const;
          await tx.query(`update accounts set deletion_started_at = $2 where id = $1`, [
            accountId,
            deps.now(),
          ]);
        }
        const learner = await tx.maybeOne<{ id: string }>(
          `select id from learners where account_id = $1`,
          [accountId],
        );
        const next: DeletionState = {
          account_id: accountId,
          stage: 'photos',
          auth_user_id: acc.auth_user_id,
          learner_id: learner?.id ?? null,
        };
        if (!(await saveJobPayload(tx, job, next))) throw new LeaseLost('lease lost');
        Object.assign(state, next);
        return 'started' as const;
      });
      if (began !== 'started') {
        // Cancelled, rescheduled, or already gone.
        await finishJob(deps.db, job, deps.now(), { status: 'done', result: { outcome: began } });
        return;
      }
    }

    if (state.stage === 'photos') {
      await deps.db.tx(async (tx) => {
        await tx.query(
          `with q as (
             insert into storage_deletions (path, reason, next_attempt_at, created_at)
             select mp.storage_path, 'account_deleted', $2, $2
               from material_photos mp join materials m on m.id = mp.material_id
              where m.learner_id = $1 and m.photos_deleted_at is null
             on conflict (path) do nothing
             returning 1)
           select count(*)::int as n from q`,
          [state.learner_id ?? null, deps.now()],
        );
        if (!(await saveJobPayload(tx, job, { ...state, stage: 'content', table: 0 })))
          throw new LeaseLost('lease lost');
      });
      Object.assign(state, { stage: 'content', table: 0 });
      // Try them right away; whatever Storage refuses now is retried by the queue (D-9).
      await drainStorageDeletions(deps, { prefix: `${accountId}/` });
    }

    if (state.stage === 'content') {
      const started = Date.now();
      let table = state.table ?? 0;
      while (state.learner_id && table < CONTENT_TABLES.length) {
        const t = CONTENT_TABLES[table]!;
        // Table names and row queries come from the constant list above, never from input.
        const [r] = await deps.db.query<{ n: number }>(
          `with d as (delete from ${t.table}
                       where ctid = any(array(${t.rows} limit ${CONTENT_BATCH}))
                       returning 1)
           select count(*)::int as n from d`,
          [state.learner_id],
        );
        if ((r?.n ?? 0) < CONTENT_BATCH) {
          table++;
          await save({ ...state, table });
        }
        if (Date.now() - started > CONTENT_BUDGET_MS) {
          // Resumes from the saved table on the next run (soon, not after a backoff).
          await rescheduleJob(deps.db, job, {
            now: deps.now(),
            runAt: deps.now(),
            error: 'continues',
          });
          return;
        }
      }
      await save({ ...state, stage: 'auth' });
    }

    if (state.stage === 'auth') {
      if (state.auth_user_id) await deps.auth.deleteUser(state.auth_user_id);
      // Cascades what is left: the account, the learner profile and her settings.
      await deps.db.query(`delete from accounts where id = $1`, [accountId]);
      await finishJob(deps.db, job, deps.now(), {
        status: 'done',
        result: { outcome: 'deleted' },
      });
    }
  } catch (err) {
    if (err instanceof LeaseLost) return; // another run owns the job now
    throw err;
  }
}

/**
 * Once a deletion has started, the account takes no more changes (and the deletion can no
 * longer be cancelled): what is written now would be deleted anyway, or would outlive it.
 */
export function assertNotDeleting(deletionStartedAt: Date | null): void {
  if (deletionStartedAt)
    throw new AppError('conflict', 'The account is being deleted', {
      reason: 'deletion_running',
    });
}
