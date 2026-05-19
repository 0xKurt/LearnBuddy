// Offline-drain batch client. Doc 04 §POST /attempts/batch.

import { z } from 'zod';

import type { OutboxEntry, BatchResponse } from '../sync/outbox.js';
import { api, newIdempotencyKey } from './client.js';

const BatchResult = z.object({
  accepted: z.array(z.string()),
  rejected: z.array(z.object({ client_attempt_id: z.string(), reason: z.string() })),
});

export async function postAttemptBatch(
  learnerId: string,
  attempts: OutboxEntry[],
): Promise<BatchResponse> {
  return api('/attempts/batch', {
    method: 'POST',
    body: { attempts },
    schema: BatchResult,
    learnerId,
    idempotencyKey: newIdempotencyKey(),
  });
}
