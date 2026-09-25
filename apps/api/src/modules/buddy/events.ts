// Buddy's event log (ADR 0005 §Events and schedules, stage 4). A module that
// changes something worth reacting to emits an event in the SAME transaction
// as the change; the event is stored once per (type, row) and handed to its
// subscribers, which decide what follows — today: wake Buddy for a check.
// Schedules (exam countdowns, agreed reminders, routine) are jobs, not events.
// Contact rules stay in the check and delivery code: an event can make Buddy
// prepare something, never contact the learner beyond what they allowed.

import type { Db } from '../../lib/db.js';
import { enqueueJob } from '../scheduler/jobs.js';

export type BuddyEvent =
  /** Photos of learning material were read and questions made. */
  | { type: 'material_ready'; materialId: string }
  /** Photos of homework were read (a help session exists; Buddy is not woken). */
  | { type: 'homework_ready'; materialId: string }
  /** A practice session ended with at least one answer. */
  | { type: 'session_finished'; sessionId: string };

export type EventType = BuddyEvent['type'];

type Subscriber = (
  db: Db,
  learnerId: string,
  eventId: string,
  e: BuddyEvent,
  at: Date,
) => Promise<void>;

/** Wake Buddy now to look at what happened (the check sees it as its trigger). */
const wakeBuddy: Subscriber = async (db, learnerId, eventId, e, at) => {
  const ref = refOf(e);
  await enqueueJob(db, {
    learnerId,
    kind: 'buddy_check',
    runAt: at,
    dedupeKey: `${e.type}:${ref}`,
    payload: {
      reason: e.type,
      event_id: eventId,
      ...(e.type === 'session_finished' ? { session_id: ref } : { material_id: ref }),
    },
  });
};

/** Who reacts to what. An event without subscribers is only recorded. */
export const SUBSCRIBERS: { [T in EventType]: readonly Subscriber[] } = {
  material_ready: [wakeBuddy],
  session_finished: [wakeBuddy],
  // Homework help starts right away in the app; no background look is needed.
  homework_ready: [],
};

function refOf(e: BuddyEvent): string {
  return e.type === 'session_finished' ? e.sessionId : e.materialId;
}

/**
 * Records the event (once per type and row) and runs its subscribers, inside
 * the caller's transaction. Returns the event id, or null when it was already
 * recorded (a retried job, a repeated request): subscribers then don't run again.
 */
export async function emitEvent(
  tx: Db,
  learnerId: string,
  e: BuddyEvent,
  at: Date,
  data: Record<string, unknown> = {},
): Promise<string | null> {
  const row = await tx.maybeOne<{ id: string }>(
    `insert into buddy_events (learner_id, type, ref_id, data, created_at)
     values ($1, $2, $3, $4, $5)
     on conflict (type, ref_id) do nothing
     returning id`,
    [learnerId, e.type, refOf(e), data, at],
  );
  if (!row) return null;
  for (const sub of SUBSCRIBERS[e.type]) await sub(tx, learnerId, row.id, e, at);
  return row.id;
}

/** A check looked at these events. */
export async function markHandled(
  db: Db,
  learnerId: string,
  eventIds: string[],
  at: Date,
): Promise<void> {
  if (eventIds.length === 0) return;
  await db.query(
    `update buddy_events set handled_at = $3
      where learner_id = $1 and id = any($2::uuid[]) and handled_at is null`,
    [learnerId, eventIds, at],
  );
}
