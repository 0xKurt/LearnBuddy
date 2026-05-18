import { z } from 'zod';
import { AnswerMode, GradeLevel, Iso8601, Locale, Uuid } from './enums.js';

const HhMm = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/)
  .transform((s) => s.slice(0, 5));

export const Learner = z.object({
  id: Uuid,
  account_id: Uuid,
  display_name: z.string().min(1),
  birth_year: z.number().int().min(1900).max(2100).nullable(),
  grade_level: GradeLevel.nullable(),
  ui_locale: Locale,
  preferred_answer_mode: AnswerMode,
  avatar_id: z.number().int().min(1),
  notifications_practice_nudge_enabled: z.boolean(),
  notifications_practice_nudge_time: HhMm,
  notifications_test_heads_up_enabled: z.boolean(),
  archived_at: Iso8601.nullable(),
  created_at: Iso8601,
  updated_at: Iso8601,
});
export type Learner = z.infer<typeof Learner>;

export const LearnerCreate = z.object({
  display_name: z.string().min(1),
  birth_year: z.number().int().min(1920).max(2030),
  grade_level: GradeLevel.nullable().optional(),
  ui_locale: Locale,
  avatar_id: z.number().int().min(1),
  preferred_answer_mode: AnswerMode,
  minor_consent_version: z.string().nullable().optional(),
});
export type LearnerCreate = z.infer<typeof LearnerCreate>;

export const LearnerUpdate = z
  .object({
    display_name: z.string().min(1),
    grade_level: GradeLevel.nullable(),
    ui_locale: Locale,
    avatar_id: z.number().int().min(1),
    preferred_answer_mode: AnswerMode,
    notifications_practice_nudge_enabled: z.boolean(),
    notifications_practice_nudge_time: z.string().regex(/^\d{2}:\d{2}$/),
    notifications_test_heads_up_enabled: z.boolean(),
  })
  .partial();
export type LearnerUpdate = z.infer<typeof LearnerUpdate>;
