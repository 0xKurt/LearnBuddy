// "She is in the app right now" — one rule for the check and the delivery (docs/architecture.md
// §Proactivity, §Delivery): what she sees there is shown there, and an unasked look waits.

import type { Deps } from '../../deps.js';
import { retryJob, type JobRow } from '../scheduler/jobs.js';

/** She counts as in the app when she used it this recently. */
const IN_APP_WINDOW_MS = 3 * 60_000;
/** How long an unasked look waits while she is there. */
const IN_APP_DEFER_MS = 20 * 60_000;

/** Whether she used the app within the last few minutes. */
export function inAppNow(lastSeenAt: Date | null, now: Date): boolean {
  return lastSeenAt !== null && now.getTime() - lastSeenAt.getTime() < IN_APP_WINDOW_MS;
}

/** She is in the app right now: these wake-ups wait 20 minutes (true when they were moved). */
export async function deferredWhileInApp(
  deps: Deps,
  learnerId: string,
  jobs: readonly JobRow[],
): Promise<boolean> {
  const now = deps.now();
  const s = await deps.db.one<{ last_seen_at: Date | null }>(
    `select last_seen_at from buddy_settings where learner_id = $1`,
    [learnerId],
  );
  if (!inAppNow(s.last_seen_at, now)) return false;
  for (const job of jobs) {
    await retryJob(deps.db, job, {
      runAt: new Date(now.getTime() + IN_APP_DEFER_MS),
      error: 'learner_in_app',
      countAttempt: false,
      now,
    });
  }
  return true;
}
