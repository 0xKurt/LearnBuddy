// What woke a background check: the job, and the goal, step, material, session or event it names.
// Split from check.ts (#311); docs/architecture.md §Proactivity.

import type { JobRow } from '../scheduler/jobs.js';

export type Trigger = {
  job: JobRow;
  reason: string;
  goalId: string | null;
  stepId: string | null;
  materialId: string | null;
  sessionId: string | null;
  /** The event that woke Buddy (ADR 0005 stage 4); null for schedules. */
  eventId: string | null;
};

export function triggerOf(job: JobRow): Trigger {
  const p = job.payload;
  const str = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : null);
  return {
    job,
    reason: str('reason') ?? 'routine',
    goalId: str('goal_id'),
    stepId: str('step_id'),
    materialId: str('material_id'),
    sessionId: str('session_id'),
    eventId: str('event_id'),
  };
}
