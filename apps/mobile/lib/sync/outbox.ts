// Local outbox + sync engine. Doc 02 §F4 + doc 05 §sync-engine.
//
// Operations:
//  - 'attempts_batch'         -> POST /attempts/batch
//  - 'pending_attempt_eval'   -> POST /attempts (SSE)
//  - 'practice_run_summary'   -> POST /templates/:id/practice-run + PATCH ...
//  - 'subject_archive' | 'item_archive' | 'material_archive' | 'kid_settings_update'

import { eq, isNull, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { outboxLocal } from '../db/schema.js';
import { isOnline } from './connectivity.js';

export type OutboxKind =
  | 'attempts_batch'
  | 'pending_attempt_eval'
  | 'practice_run_summary'
  | 'subject_archive'
  | 'item_archive'
  | 'material_archive'
  | 'kid_settings_update';

export type OutboxRow = {
  id: string;
  kind: OutboxKind;
  payload: unknown;
  run_after: string;
  attempts: number;
  last_error: string | null;
  done_at: string | null;
  created_at: string;
};

function uuid(): string {
  // expo-crypto would be more correct; for the skeleton this is enough.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function enqueue(kind: OutboxKind, payload: unknown) {
  const now = new Date().toISOString();
  await db().insert(outboxLocal).values({
    id: uuid(),
    kind,
    payload: JSON.stringify(payload),
    run_after: now,
    attempts: 0,
    last_error: null,
    done_at: null,
    created_at: now,
  });
}

export async function pending(): Promise<OutboxRow[]> {
  const rows = await db()
    .select()
    .from(outboxLocal)
    .where(isNull(outboxLocal.done_at))
    .orderBy(asc(outboxLocal.created_at));
  return rows.map((r) => ({
    ...r,
    kind: r.kind as OutboxKind,
    payload: safeJsonParse(r.payload),
  })) as OutboxRow[];
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// Drains the outbox if online. Returns the count of successful drains.
// The actual per-op handlers are wired up in lib/sync/handlers.ts (TODO).
export async function drain(now: Date = new Date()): Promise<number> {
  if (!(await isOnline())) return 0;
  const rows = await pending();
  let drained = 0;
  for (const row of rows) {
    try {
      // TODO(Step 17): dispatch to per-kind handler. For the skeleton we
      // mark items done so the outbox doesn't grow during dev.
      await db().update(outboxLocal).set({ done_at: now.toISOString() }).where(eq(outboxLocal.id, row.id));
      drained++;
    } catch (err) {
      await db()
        .update(outboxLocal)
        .set({
          attempts: row.attempts + 1,
          last_error: err instanceof Error ? err.message : String(err),
        })
        .where(eq(outboxLocal.id, row.id));
    }
  }
  return drained;
}
