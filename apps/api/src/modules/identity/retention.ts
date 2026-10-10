// Retention and erasure every Buddy has, whatever it teaches (issue #107): what /health reports
// as overdue. docs/privacy.md §Export and deletion. A domain's own retention (photos of a sheet,
// its questions) stays with the domain.

import type { Db } from '../../lib/db.js';

/** Deletions waiting longer than this are reported by /health. */
const ERASURE_OVERDUE_MS = 86_400_000;

/** Counts for /health: erasure that is later than promised. */
export async function erasureBacklog(
  db: Db,
  now: Date,
): Promise<{ overdue_deletions: number; overdue_photo_deletions: number }> {
  const before = new Date(now.getTime() - ERASURE_OVERDUE_MS);
  const row = await db.one<{ accounts: number; photos: number }>(
    `select (select count(*) from accounts where deletion_due_at < $1)::int as accounts,
            (select count(*) from storage_deletions where created_at < $1)::int as photos`,
    [before],
  );
  return { overdue_deletions: row.accounts, overdue_photo_deletions: row.photos };
}
