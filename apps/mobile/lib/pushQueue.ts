// What the device still owes the API about push (lib/push.ts), kept across
// restarts like the answer outbox: "a message was opened" reports (the only
// proof a message reached her, rule 5 — audit M-64, opened-proof-not-durable),
// buttons pressed on a notification ("Heute nicht", "Seltener schreiben" —
// gaps #16; pressed on the lock screen, maybe offline) and a pending release of this install after a sign-out that could not reach
// the server (audit M-65, D-6). Pure: parsing and updates only (Node-testable).

import { z } from 'zod';

import type { Press } from './pushActions.js';

/** Reports older than this are pointless (the message has long expired). */
const OPENED_MAX_AGE_MS = 7 * 86_400_000;
export const OPENED_MAX = 20;

const ACTIONS = ['practice_now', 'not_today', 'less_often'] as const;
export type QueuedAction = (typeof ACTIONS)[number];

const Queue = z.object({
  opened: z.array(z.object({ id: z.string().uuid(), at: z.string() })).default([]),
  actions: z
    .array(z.object({ id: z.string().uuid(), action: z.enum(ACTIONS), at: z.string() }))
    .default([]),
  release: z.boolean().default(false),
});
export type PushQueue = z.output<typeof Queue>;

export const EMPTY_QUEUE: PushQueue = { opened: [], actions: [], release: false };

const fresh = (now: Date) => (e: { at: string }) => {
  const age = now.getTime() - Date.parse(e.at);
  return Number.isFinite(age) && age <= OPENED_MAX_AGE_MS;
};

export function parsePushQueue(raw: string | null, now: Date): PushQueue {
  if (!raw) return EMPTY_QUEUE;
  try {
    const q = Queue.safeParse(JSON.parse(raw));
    if (!q.success) return EMPTY_QUEUE;
    return {
      opened: q.data.opened.filter(fresh(now)),
      actions: q.data.actions.filter(fresh(now)),
      release: q.data.release,
    };
  } catch {
    return EMPTY_QUEUE;
  }
}

/** One report per message, the newest kept when full. */
export function withOpened(q: PushQueue, id: string, at: Date): PushQueue {
  const rest = q.opened.filter((e) => e.id !== id);
  return { ...q, opened: [...rest, { id, at: at.toISOString() }].slice(-OPENED_MAX) };
}

export function withoutOpened(q: PushQueue, id: string): PushQueue {
  return { ...q, opened: q.opened.filter((e) => e.id !== id) };
}

/** A button pressed on a notification: one per message and button, oldest first. */
export function withAction(q: PushQueue, id: string, action: QueuedAction, at: Date): PushQueue {
  const rest = q.actions.filter((e) => !(e.id === id && e.action === action));
  return {
    ...q,
    actions: [...rest, { id, action, at: at.toISOString() }].slice(-OPENED_MAX),
  };
}

export function withoutAction(q: PushQueue, id: string, action: QueuedAction): PushQueue {
  return { ...q, actions: q.actions.filter((e) => !(e.id === id && e.action === action)) };
}

export function withRelease(q: PushQueue, pending: boolean): PushQueue {
  return { ...q, release: pending };
}

/**
 * The queue after a press on one of Buddy's notifications. "Opened" is a claim about
 * the learner (rule 5: only the app may report it), so a button that answers from the
 * lock screen — "Heute nicht", "Seltener schreiben" — is kept as what it is and
 * nothing more; only the notification itself and "Jetzt üben" bring the app to the
 * front and with it the proof that she saw the message.
 */
export function afterPress(q: PushQueue, id: string, press: Press, at: Date): PushQueue {
  if (press.kind === 'open') return withOpened(q, id, at);
  const kept = withAction(q, id, press.action, at);
  return press.opens ? withOpened(kept, id, at) : kept;
}

const Payload = z.object({ type: z.literal('buddy_outreach'), outreach_id: z.string().uuid() });

/** The outreach a tapped notification is about, if it is one of Buddy's. */
export function outreachIdOf(data: unknown): string | null {
  const p = Payload.safeParse(data);
  return p.success ? p.data.outreach_id : null;
}
