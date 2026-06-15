// Learner API helpers. Doc 04 §learners.

import { z } from 'zod';
import { Learner, type LearnerCreate, type LearnerUpdate } from '@learnbuddy/shared-types';

import { api, newIdempotencyKey } from './client.js';

export async function createLearner(input: LearnerCreate): Promise<Learner> {
  return api('/learners', {
    method: 'POST',
    body: input,
    schema: Learner,
    idempotencyKey: newIdempotencyKey(),
  });
}

export async function updateLearner(id: string, input: LearnerUpdate): Promise<Learner> {
  return api(`/learners/${id}`, {
    method: 'PATCH',
    body: input,
    schema: Learner,
  });
}

export async function archiveLearner(id: string): Promise<{ id: string; archived: true }> {
  return api(`/learners/${id}`, { method: 'DELETE' }) as Promise<{ id: string; archived: true }>;
}

const PushTokenResponse = z.object({
  id: z.string(),
  token: z.string(),
  platform: z.string(),
});

/** POST /learners/:id/push-tokens — idempotent upsert. Called after the
 *  user grants notification permission so the server can wake the device
 *  when async work (material extraction) completes. */
export async function registerPushToken(
  learnerId: string,
  token: string,
  platform: 'ios' | 'android' | 'web',
): Promise<z.infer<typeof PushTokenResponse>> {
  return api(`/learners/${learnerId}/push-tokens`, {
    method: 'POST',
    body: { token, platform },
    schema: PushTokenResponse,
    learnerId,
  });
}
