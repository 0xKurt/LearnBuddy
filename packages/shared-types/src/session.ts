import { z } from 'zod';
import { Iso8601, Uuid } from './enums.js';

export const Session = z.object({
  id: Uuid,
  learner_id: Uuid,
  subject_id: Uuid.nullable(),
  test_mode: z.boolean(),
  started_at: Iso8601,
  ended_at: Iso8601.nullable(),
  attempts_count: z.number().int().nonnegative(),
  correct_count: z.number().int().nonnegative(),
  // Migration 0017 — deterministic resume + sustained-session state.
  picked_item_ids: z.array(Uuid).default([]),
  pinned_topic: z.string().nullable().default(null),
  last_turn_at: Iso8601.nullable().default(null),
  created_at: Iso8601,
});
export type Session = z.infer<typeof Session>;

export const SessionCreate = z.object({
  subject_id: Uuid.nullable().optional(),
  folder_id: Uuid.nullable().optional(),
  material_id: Uuid.nullable().optional(),
  test_mode: z.boolean().default(false),
  max_items: z.number().int().min(1).max(50).default(20),
});
export type SessionCreate = z.infer<typeof SessionCreate>;

// PATCH /sessions/:id — sustained-session controls.
//   pinned_topic: string  → lock the session onto one topic
//   pinned_topic: null    → unpin
//   keep_going: true      → refill the queue with more due items
export const SessionPatch = z.object({
  pinned_topic: z.string().min(1).max(120).nullable().optional(),
  keep_going: z.boolean().optional(),
});
export type SessionPatch = z.infer<typeof SessionPatch>;

export const SessionEnd = z.object({
  ended_at: Iso8601,
  attempts_count: z.number().int().nonnegative(),
  correct_count: z.number().int().nonnegative(),
});
export type SessionEnd = z.infer<typeof SessionEnd>;
