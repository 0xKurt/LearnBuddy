// Subject API helpers. Doc 04 §subjects-and-folders + §schedule-summary.

import { z } from 'zod';
import {
  Subject,
  SubjectCreate,
  SubjectUpdate,
  type SubjectCreate as SubjectCreateInput,
  type SubjectUpdate as SubjectUpdateInput,
} from '@learnbuddy/shared-types';

import { api, newIdempotencyKey } from './client.js';

const SubjectListItem = Subject.extend({
  folder_count: z.number().int().nonnegative(),
  material_count: z.number().int().nonnegative(),
  upcoming_test_in_days: z.number().int().nullable(),
});
export type SubjectListItem = z.infer<typeof SubjectListItem>;

export const ScheduleSummary = z.object({
  upcoming_tests: z.array(
    z.object({
      folder_id: z.string(),
      subject_id: z.string(),
      name: z.string(),
      scheduled_for: z.string(),
      days_until: z.number().int().nonnegative(),
    }),
  ),
  streak_current: z.number().int().nonnegative(),
  streak_longest: z.number().int().nonnegative(),
  last_session_at: z.string().nullable(),
});
export type ScheduleSummary = z.infer<typeof ScheduleSummary>;

export async function listSubjects(learnerId: string): Promise<SubjectListItem[]> {
  return api(`/learners/${learnerId}/subjects`, {
    method: 'GET',
    schema: z.array(SubjectListItem),
  });
}

export async function listArchivedSubjects(learnerId: string): Promise<SubjectListItem[]> {
  return api(`/learners/${learnerId}/subjects?show_archived=true`, {
    method: 'GET',
    schema: z.array(SubjectListItem),
  });
}

export async function createSubject(
  learnerId: string,
  input: SubjectCreateInput,
): Promise<SubjectListItem> {
  // Validate input client-side so a typo (e.g. malformed color) fails fast.
  SubjectCreate.parse(input);
  return api(`/learners/${learnerId}/subjects`, {
    method: 'POST',
    body: input,
    schema: Subject,
    idempotencyKey: newIdempotencyKey(),
  }) as Promise<SubjectListItem>;
}

export async function updateSubject(
  id: string,
  input: SubjectUpdateInput,
): Promise<SubjectListItem> {
  SubjectUpdate.parse(input);
  return api(`/subjects/${id}`, {
    method: 'PATCH',
    body: input,
    schema: Subject,
  }) as Promise<SubjectListItem>;
}

export async function archiveSubject(id: string): Promise<{ id: string; archived: true }> {
  return api(`/subjects/${id}`, { method: 'DELETE' }) as Promise<{ id: string; archived: true }>;
}

export async function restoreSubject(id: string): Promise<{ id: string; restored: true }> {
  return api(`/subjects/${id}/restore`, { method: 'POST' }) as Promise<{
    id: string;
    restored: true;
  }>;
}

export async function getScheduleSummary(learnerId: string): Promise<ScheduleSummary> {
  return api(`/learners/${learnerId}/schedule-summary`, {
    method: 'GET',
    schema: ScheduleSummary,
  });
}
