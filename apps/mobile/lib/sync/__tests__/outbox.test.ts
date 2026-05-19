// Pure outbox drain tests (node) — batching, accepted+rejected clearing,
// transport-error resilience.

import { describe, it, expect } from 'vitest';

import { drainOutbox, type OutboxEntry, type OutboxStore } from '../outbox.js';

function entry(n: number): OutboxEntry {
  return {
    client_attempt_id: `c-${n}`,
    item_id: `i-${n}`,
    mode: 'text',
    kid_answer: 'x',
    verdict: 'correct',
    evaluated_by: 'local',
    hints_used: 0,
    duration_ms: 100,
    test_mode: false,
    reviewed_at: '2026-05-16T10:00:00Z',
  };
}

function memStore(initial: OutboxEntry[]): OutboxStore & { rows: OutboxEntry[] } {
  const rows = [...initial];
  return {
    rows,
    enqueue: async (_l, e) => {
      rows.push(e);
    },
    pending: async () => rows.slice(),
    remove: async (ids) => {
      for (const id of ids) {
        const i = rows.findIndex((r) => r.client_attempt_id === id);
        if (i >= 0) rows.splice(i, 1);
      }
    },
  };
}

describe('drainOutbox', () => {
  it('sends ≤200 per batch and clears accepted + rejected', async () => {
    const store = memStore(Array.from({ length: 250 }, (_, i) => entry(i)));
    const batchSizes: number[] = [];
    const res = await drainOutbox(store, 'L', async (chunk) => {
      batchSizes.push(chunk.length);
      // Reject the last one of each chunk to prove rejected is cleared too.
      const rejected = [
        { client_attempt_id: chunk[chunk.length - 1]!.client_attempt_id, reason: 'item_not_found' },
      ];
      const accepted = chunk.slice(0, -1).map((c) => c.client_attempt_id);
      return { accepted, rejected };
    });
    expect(batchSizes).toEqual([200, 50]);
    expect(res.drained).toBe(248); // 250 minus 2 rejected
    expect(store.rows).toHaveLength(0); // queue fully cleared (no wedge)
  });

  it('is a no-op when nothing is queued', async () => {
    const store = memStore([]);
    let called = false;
    const res = await drainOutbox(store, 'L', async () => {
      called = true;
      return { accepted: [], rejected: [] };
    });
    expect(called).toBe(false);
    expect(res.drained).toBe(0);
  });

  it('leaves the queue intact if the transport throws', async () => {
    const store = memStore([entry(1), entry(2)]);
    await expect(
      drainOutbox(store, 'L', async () => {
        throw new Error('offline');
      }),
    ).rejects.toThrow('offline');
    expect(store.rows).toHaveLength(2);
  });
});
