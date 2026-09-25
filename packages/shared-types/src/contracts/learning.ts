import { z } from 'zod';

import { IsoDateTime, SubjectKind, Uuid } from './common.js';

// ─────────────── material (photographed worksheets) ───────────────

export const MaterialStatus = z.enum([
  'awaiting_upload',
  'queued',
  'processing',
  'ready',
  'failed',
]);
export type MaterialStatus = z.infer<typeof MaterialStatus>;

export const MaterialFailure = z.enum([
  'photos_missing',
  'unreadable',
  'not_learning_material',
  'model_error',
  'budget_exhausted',
]);
export type MaterialFailure = z.infer<typeof MaterialFailure>;

export const CreateMaterialRequest = z.object({
  client_request_id: Uuid,
  photo_mimes: z
    .array(z.enum(['image/jpeg', 'image/png']))
    .min(1)
    .max(20),
  goal_id: Uuid.nullable().optional(),
  /** The capture step (Buddy asked for this photo); it is done once the photos are read. */
  step_id: Uuid.nullable().optional(),
});
export type CreateMaterialRequest = z.infer<typeof CreateMaterialRequest>;

export const MaterialView = z.object({
  id: Uuid,
  title: z.string().nullable(),
  status: MaterialStatus,
  failure_reason: MaterialFailure.nullable(),
  item_count: z.number().int(),
  subject_name: z.string().nullable(),
  goal_id: Uuid.nullable(),
  created_at: IsoDateTime,
});
export type MaterialView = z.infer<typeof MaterialView>;

export const CreateMaterialResponse = z.object({
  material: MaterialView,
  uploads: z.array(
    z.object({ position: z.number().int(), path: z.string(), url: z.string(), token: z.string() }),
  ),
});
export type CreateMaterialResponse = z.infer<typeof CreateMaterialResponse>;

export const LibraryView = z.object({
  subjects: z.array(
    z.object({
      id: Uuid,
      name: z.string(),
      kind: SubjectKind,
      materials: z.array(MaterialView),
    }),
  ),
  unsorted: z.array(MaterialView),
});
export type LibraryView = z.infer<typeof LibraryView>;

// ─────────────── practice ───────────────

export const ItemKind = z.enum(['short', 'long', 'numeric', 'multiple_choice', 'formula']);
export type ItemKind = z.infer<typeof ItemKind>;

/** A question as shown while it is open: never includes the answer. */
export const ItemView = z.object({
  id: Uuid,
  kind: ItemKind,
  prompt: z.string(),
  choices: z.array(z.string()).nullable(),
  unit: z.string().nullable(),
  topic: z.string().nullable(),
});
export type ItemView = z.infer<typeof ItemView>;

export const SessionItemView = z.object({
  item: ItemView,
  status: z.enum(['open', 'correct', 'revealed', 'skipped']),
  attempts: z.number().int(),
  hints_used: z.number().int(),
  /** Only once the item is closed. */
  answer: z.string().nullable(),
});
export type SessionItemView = z.infer<typeof SessionItemView>;

export const PracticeTurnView = z.object({
  id: Uuid,
  item_id: Uuid,
  role: z.enum(['learner', 'tutor']),
  text: z.string(),
  verdict: z.enum(['correct', 'partially_correct', 'incorrect', 'not_an_attempt']).nullable(),
  created_at: IsoDateTime,
});
export type PracticeTurnView = z.infer<typeof PracticeTurnView>;

export const PracticeSummary = z.object({
  answered: z.number().int(),
  first_try: z.number().int(),
  secure_topics: z.array(z.string()),
  shaky_topics: z.array(z.string()),
});
export type PracticeSummary = z.infer<typeof PracticeSummary>;

export const SessionView = z.object({
  id: Uuid,
  mode: z.enum(['practice', 'test']),
  status: z.enum(['active', 'finished', 'abandoned']),
  title: z.string(),
  items: z.array(SessionItemView),
  turns: z.array(PracticeTurnView),
  current_item_id: Uuid.nullable(),
  summary: PracticeSummary.nullable(),
});
export type SessionView = z.infer<typeof SessionView>;

export const StartPracticeRequest = z.object({
  subject_id: Uuid.nullable().optional(),
  material_id: Uuid.nullable().optional(),
  goal_id: Uuid.nullable().optional(),
  mode: z.enum(['practice', 'test']).default('practice'),
});
export type StartPracticeRequest = z.infer<typeof StartPracticeRequest>;

export const AnswerRequest = z
  .object({
    client_turn_id: Uuid,
    item_id: Uuid,
    text: z.string().trim().min(1).max(2000).nullable().optional(),
    choice: z.number().int().min(0).max(5).nullable().optional(),
  })
  .refine((v) => (v.text ?? null) !== null || (v.choice ?? null) !== null, {
    message: 'text or choice is required',
  });
export type AnswerRequest = z.infer<typeof AnswerRequest>;

export const AnswerVerdict = z.enum([
  'correct',
  'partially_correct',
  'incorrect',
  'not_an_attempt',
]);
export type AnswerVerdict = z.infer<typeof AnswerVerdict>;

export const AnswerResponse = z.object({
  session: SessionView,
  /** How the learner's answer was judged; null = could not be judged (no model), nothing was graded. */
  verdict: AnswerVerdict.nullable(),
  /** The tutor turn created for this answer. */
  reply: PracticeTurnView,
});
export type AnswerResponse = z.infer<typeof AnswerResponse>;
