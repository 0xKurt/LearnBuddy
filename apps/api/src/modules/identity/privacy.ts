// Data export and account deletion (DSGVO Art. 15/17/20). docs/privacy.md.
//
// Export: everything stored about the learner, as JSON, immediately.
// Deletion: scheduled with a 7-day cancellable hold; the job removes the
// photos from storage and deletes the auth user, which cascades through
// account → learner → every learner-scoped table.

import type { Deps } from '../../deps.js';
import type { Db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { enqueueJob, finishJob, type JobRow } from '../scheduler/jobs.js';

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
  return out;
}

export async function requestDeletion(deps: Deps, accountId: string): Promise<Date> {
  const now = deps.now();
  const due = new Date(now.getTime() + DELETION_HOLD_DAYS * 86_400_000);
  return deps.db.tx(async (tx) => {
    const acc = await tx.one<{ deletion_due_at: Date | null }>(
      `select deletion_due_at from accounts where id = $1 for update`,
      [accountId],
    );
    if (acc.deletion_due_at) return acc.deletion_due_at;
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
    await tx.query(`update accounts set deletion_due_at = null where id = $1`, [accountId]);
    await tx.query(
      `update jobs set status = 'cancelled'
        where kind = 'delete_account' and status = 'queued' and payload ->> 'account_id' = $1`,
      [accountId],
    );
  });
}

export async function executeAccountDeletion(deps: Deps, job: JobRow): Promise<void> {
  const accountId = String(job.payload.account_id ?? '');
  const acc = await deps.db.maybeOne<{ auth_user_id: string; deletion_due_at: Date | null }>(
    `select auth_user_id, deletion_due_at from accounts where id = $1`,
    [accountId],
  );
  if (!acc || !acc.deletion_due_at || acc.deletion_due_at > deps.now()) {
    // Cancelled or already gone.
    await finishJob(deps.db, job, deps.now(), { status: 'done', result: { outcome: 'not_due' } });
    return;
  }
  const photos = await deps.db.query<{ storage_path: string }>(
    `select mp.storage_path from material_photos mp join materials m on m.id = mp.material_id
       join learners l on l.id = m.learner_id where l.account_id = $1`,
    [accountId],
  );
  await deps.storage.remove(photos.map((p) => p.storage_path));
  await deps.auth.deleteUser(acc.auth_user_id);
  // Cascades account → learner → all learner data (also when the auth user is already gone).
  await deps.db.query(`delete from accounts where id = $1`, [accountId]);
  await finishJob(deps.db, job, deps.now(), {
    status: 'done',
    result: { outcome: 'deleted', photos: photos.length },
  });
}

export function assertNotDeleting(deletionDueAt: Date | null): void {
  if (deletionDueAt)
    throw new AppError('conflict', 'Account deletion is scheduled', {
      reason: 'deletion_scheduled',
    });
}
