import { z } from 'zod';
import { AnswerMode, DateOnly, GradeLevel, Iso8601, Locale, Uuid } from './enums.js';

/** Curated Chirp HD voice characters offered in the admin → Stimme
 *  settings. Stored bare on the learner row; the server pairs it with
 *  the learner's ui_locale to produce the full GCP voice name. */
export const TtsVoiceCharacter = z.enum(['Aoede', 'Leda', 'Kore', 'Charon', 'Fenrir', 'Puck']);
export type TtsVoiceCharacter = z.infer<typeof TtsVoiceCharacter>;

const HhMm = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/)
  .transform((s) => s.slice(0, 5));

export const Learner = z.object({
  id: Uuid,
  account_id: Uuid,
  display_name: z.string().min(1),
  birth_date: DateOnly.nullable(),
  grade_level: GradeLevel.nullable(),
  ui_locale: Locale,
  preferred_answer_mode: AnswerMode,
  avatar_id: z.number().int().min(1),
  // Optional + nullable so the mobile client parses successfully even
  // when the migration 0027 hasn't been applied to the running
  // Supabase yet (or the column was dropped in a rollback). NULL =
  // server-side defaults to Aoede for this learner.
  tts_voice: TtsVoiceCharacter.nullable().optional(),
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
  birth_date: DateOnly,
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
    tts_voice: TtsVoiceCharacter.nullable(),
    notifications_practice_nudge_enabled: z.boolean(),
    notifications_practice_nudge_time: z.string().regex(/^\d{2}:\d{2}$/),
    notifications_test_heads_up_enabled: z.boolean(),
  })
  .partial();
export type LearnerUpdate = z.infer<typeof LearnerUpdate>;
