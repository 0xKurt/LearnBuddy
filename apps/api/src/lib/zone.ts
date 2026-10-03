// The learner's time zone, read one way everywhere (issue #315, docs/architecture.md §Time).
//
// The zone decides what "today" and "Friday" mean, so every reader needs the same answer —
// including for a learner without a settings row: the HTTP middleware creates the row on the
// first request (http/context.ts), but a background job or another module calls the services
// directly. The #311 audit found the lookup written 8× with the fallback and once without it
// (practice/service.ts), where a missing row turned a tutor's reply into "can't check that now".

import { DEFAULT_TIMEZONE } from '@learnbuddy/shared-types/contracts';

import type { Db } from './db.js';

export { DEFAULT_TIMEZONE };

/**
 * SQL for the zone of the learner whose id is `learnerIdSql` (a column or a parameter), with
 * the default bound as parameter `$defaultParam` — pass `DEFAULT_TIMEZONE` there. For queries
 * that read the zone of many learners at once; a single learner goes through `learnerTimezone`.
 */
export function learnerZoneSql(learnerIdSql: string, defaultParam: number): string {
  return `coalesce((select timezone from buddy_settings where learner_id = ${learnerIdSql}), $${defaultParam}::text)`;
}

/** The learner's zone; the default when she has no settings row (never an error). */
export async function learnerTimezone(db: Db, learnerId: string): Promise<string> {
  const row = await db.one<{ timezone: string }>(`select ${learnerZoneSql('$1', 2)} as timezone`, [
    learnerId,
    DEFAULT_TIMEZONE,
  ]);
  return row.timezone;
}
