// Learner API helpers. Doc 04 §learners.

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
