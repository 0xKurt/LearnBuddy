// SQLite-backed OutboxStore (expo-sqlite via drizzle). Kept separate from
// outbox.ts so the pure drain logic stays node-testable.

import { eq, inArray } from 'drizzle-orm';

import { db } from '../db/index.js';
import { attemptOutbox } from '../db/schema.js';
import type { OutboxEntry, OutboxStore } from './outbox.js';

export const sqliteOutbox: OutboxStore = {
  async enqueue(learnerId, entry) {
    await db()
      .insert(attemptOutbox)
      .values({
        client_attempt_id: entry.client_attempt_id,
        learner_id: learnerId,
        payload: JSON.stringify(entry),
        created_at: entry.reviewed_at,
      })
      .onConflictDoNothing();
  },
  async pending(learnerId) {
    const rows = await db()
      .select()
      .from(attemptOutbox)
      .where(eq(attemptOutbox.learner_id, learnerId));
    return rows.map((r) => JSON.parse(r.payload) as OutboxEntry);
  },
  async remove(ids) {
    if (ids.length === 0) return;
    await db().delete(attemptOutbox).where(inArray(attemptOutbox.client_attempt_id, ids));
  },
};
