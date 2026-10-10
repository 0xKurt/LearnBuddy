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
//
// The tables named here are the core's. A domain's tables (LearnBuddy: sheets, questions,
// practices) come from the registry it fills at start-up (privacyTables.ts, issue #107): exported
// after the core's, their files queued in the photos stage, their rows deleted before the core's.

import type { Deps } from '../../deps.js';
import type { Db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { privacyTables } from './privacyTables.js';
import { drainStorageDeletions } from './retention.js';
import {
  enqueueJob,
  finishJob,
  rescheduleJob,
  saveJobPayload,
  type JobRow,
} from '../scheduler/jobs.js';

const DELETION_HOLD_DAYS = 7;

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
  'buddy_lookbacks',
  // What she is working on (issue #160): hers, so it is in her export.
  'buddy_focus',
  // What Buddy proposed to delete and what she answered (issue #151): hers, and part of
  // the record of what was done with her data.
  'buddy_pending_actions',
  // What was talked about on earlier days (issue #22): hers, so it is in her export.
  'buddy_session_summaries',
  'usage_daily',
  'llm_calls',
] as const;

export async function exportAccount(db: Db, accountId: string): Promise<Record<string, unknown>> {
  const account = await db.one(
    // consent_confirmed_at: when the account holder confirmed the consent by e-mail (issue #30) —
    // part of what was recorded about them, so it belongs in their export.
    `select id, locale, consent_version, consent_at, consent_confirmed_at, deletion_due_at,
            created_at
       from accounts where id = $1`,
    [accountId],
  );
  const learner = await db.maybeOne<{ id: string } & Record<string, unknown>>(
    // curriculum_region: the Bundesland her school is in (issue #199) — stored about her,
    // so it belongs in her export. Null for a profile created before it.
    `select id, relation, display_name, birth_date, level, grade, locale, curriculum_region,
            minor_consent_version, minor_consent_at, self_consent_version, self_consent_at,
            created_at
       from learners where account_id = $1`,
    [accountId],
  );
  // Wrong-PIN and request counters (counts and times only): stored about the account, so in
  // its export (docs/privacy.md §What is stored).
  const attemptCounters = await db.query(
    `select scope, window_start, count, locked_until, refused, updated_at
       from attempt_counters where account_id = $1 order by scope`,
    [accountId],
  );
  const out: Record<string, unknown> = {
    exported_format: 'learnbuddy.export.v1',
    account,
    learner,
    attempt_counters: attemptCounters,
  };
  if (!learner) return out;
  for (const table of LEARNER_TABLES) {
    // Table names come from the constant list above, never from input.
    out[table] = await db.query(`select * from ${table} where learner_id = $1`, [learner.id]);
  }
  // What the domain keeps about her, each table as it registered its export.
  for (const t of privacyTables()) {
    out[t.table] = await db.query(t.exported ?? `select * from ${t.table} where learner_id = $1`, [
      learner.id,
    ]);
  }
  // Buddy's spoken audio, kept 24 hours (ADR 0008): what exists, not the audio — the sentence
  // itself is not stored, only a hash of it (docs/privacy.md §What is stored).
  out.speech_cache = await db.query(
    `select key, mime, octet_length(audio) as bytes, created_at, expires_at
       from speech_cache where learner_id = $1 order by created_at`,
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

/** The core's learner-scoped tables, children first, so no delete waits on a cascade. */
const CORE_CONTENT = [
  'buddy_focus',
  'buddy_pending_actions',
  'buddy_outreach',
  'buddy_actions',
  'buddy_memories',
  'buddy_lookbacks',
  'buddy_messages',
  'buddy_decisions',
  'buddy_events',
  'buddy_steps',
  'buddy_goals',
  'usage_daily',
  'llm_calls',
  'push_tokens',
  'jobs',
] as const;

/**
 * Every table the content stage empties, with the query for her rows' ctids: the domain's first,
 * in the order it registered them (children first), then the core's. A domain table its parent's
 * cascade empties (`rows: null`) is not one of them.
 */
function contentTables(): Array<{ table: string; rows: string }> {
  const rowsOf = (table: string) => `select ctid from ${table} where learner_id = $1`;
  return [
    ...privacyTables().flatMap((t) =>
      t.rows === null ? [] : [{ table: t.table, rows: t.rows ?? rowsOf(t.table) }],
    ),
    ...CORE_CONTENT.map((table) => ({ table, rows: rowsOf(table) })),
  ];
}
const CONTENT_BATCH = 2000;
/** Wall-clock budget of one run of the content stage; the rest continues on the next run. */
const CONTENT_BUDGET_MS = 20_000;

type DeletionState = {
  account_id: string;
  stage?: 'photos' | 'content' | 'auth';
  auth_user_id?: string;
  learner_id?: string | null;
  /**
   * content stage: the table to go on with, by name, so a table a domain registers cannot shift
   * it. A number is an index written before #107 cut 6; none: the first table.
   */
  table?: string | number;
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
        // Every file the domain's rows point at (what it registered as `files`).
        for (const t of privacyTables()) {
          if (!t.files) continue;
          await tx.query(
            `insert into storage_deletions (path, reason, next_attempt_at, created_at)
             select f.path, 'account_deleted', $2, $2 from (${t.files}) as f(path)
             on conflict (path) do nothing`,
            [state.learner_id ?? null, deps.now()],
          );
        }
        // The content stage starts at its first table (no `table` yet).
        const next = { ...state, stage: 'content' as const, table: undefined };
        if (!(await saveJobPayload(tx, job, next))) throw new LeaseLost('lease lost');
      });
      Object.assign(state, { stage: 'content', table: undefined });
      // Try them right away; whatever Storage refuses now is retried by the queue (D-9).
      await drainStorageDeletions(deps, { prefix: `${accountId}/` });
    }

    if (state.stage === 'content') {
      const started = Date.now();
      const tables = contentTables();
      // By name; a number is an index from before #107 cut 6: start again from the first table
      // (each delete only finds what is left).
      const from = tables.findIndex((t) => t.table === state.table);
      let table = from >= 0 ? from : 0;
      while (state.learner_id && table < tables.length) {
        const t = tables[table]!;
        // Table names and row queries come from code (the core's list, the domain's
        // registration), never from input.
        const [r] = await deps.db.query<{ n: number }>(
          `with d as (delete from ${t.table}
                       where ctid = any(array(${t.rows} limit ${CONTENT_BATCH}))
                       returning 1)
           select count(*)::int as n from d`,
          [state.learner_id],
        );
        if ((r?.n ?? 0) < CONTENT_BATCH) {
          table++;
          await save({ ...state, table: tables[table]?.table });
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
