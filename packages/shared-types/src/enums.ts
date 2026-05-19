import { z } from 'zod';

export const Locale = z.enum(['de', 'en', 'fr', 'es', 'it']);
export type Locale = z.infer<typeof Locale>;

export const SubjectKind = z.enum([
  'math',
  'physics',
  'chemistry',
  'biology',
  'geography',
  'history',
  'language_native',
  'language_foreign',
  'religion_ethics',
  'art_music',
  'general',
  'other',
  'computer_science',
  'economics',
  'law',
  'philosophy',
  'literature',
  'sports',
]);
export type SubjectKind = z.infer<typeof SubjectKind>;

export const AnswerKind = z.enum([
  'short',
  'long',
  'numeric',
  'multiple_choice',
  'formula',
  'diagram_label',
  'fill_blank',
]);
export type AnswerKind = z.infer<typeof AnswerKind>;

export const StimulusKind = z.enum(['none', 'study_asset', 'function_plot', 'svg', 'coord_grid']);
export type StimulusKind = z.infer<typeof StimulusKind>;

export const AnswerMode = z.enum(['voice', 'text', 'multiple_choice']);
export type AnswerMode = z.infer<typeof AnswerMode>;

export const Verdict = z.enum(['correct', 'partially_correct', 'incorrect', 'skipped']);
export type Verdict = z.infer<typeof Verdict>;

export const EvaluatedBy = z.enum(['local', 'llm']);
export type EvaluatedBy = z.infer<typeof EvaluatedBy>;

export const Tier = z.enum(['trial', 'standard', 'plus']);
export type Tier = z.infer<typeof Tier>;

export const SubscriptionStatus = z.enum(['trial', 'active', 'grace', 'expired', 'cancelled']);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatus>;

export const ExtractionStatus = z.enum(['pending', 'ready', 'failed']);
export type ExtractionStatus = z.infer<typeof ExtractionStatus>;

export const SourceKind = z.enum(['photo', 'text', 'pdf']);
export type SourceKind = z.infer<typeof SourceKind>;

export const StudyAssetKind = z.enum([
  'numbered_diagram',
  'cropped_graph',
  'rendered_formula',
  'clean_image',
]);
export type StudyAssetKind = z.infer<typeof StudyAssetKind>;

export const FsrsState = z.union([
  z.literal(0), // New
  z.literal(1), // Learning
  z.literal(2), // Review
  z.literal(3), // Relearning
]);
export type FsrsState = z.infer<typeof FsrsState>;

export const RegenerateStyle = z.enum(['simpler', 'harder', 'more-variety']);
export type RegenerateStyle = z.infer<typeof RegenerateStyle>;

export const ExplainStyle = z.enum(['simpler', 'step-by-step', 'analogy']);
export type ExplainStyle = z.infer<typeof ExplainStyle>;

export const GradeLevel = z.number().int().min(1).max(13);
export type GradeLevel = z.infer<typeof GradeLevel>;

export const Uuid = z.string().uuid();
export type Uuid = z.infer<typeof Uuid>;

export const Iso8601 = z.string().datetime({ offset: true });
export type Iso8601 = z.infer<typeof Iso8601>;

/** Calendar date with no time component, ISO `YYYY-MM-DD`. The app stores
 *  every user-facing date in this shape; the UI renders it as `DD.MM.YYYY`.
 *  The `.refine` rejects impossible calendar values (e.g. `2026-02-30`) — the
 *  regex alone would let them through and the API would write garbage into
 *  Postgres. */
export const DateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const [y, m, d] = s.split('-').map((n) => Number.parseInt(n, 10));
    if (!y || !m || !d) return false;
    if (m < 1 || m > 12) return false;
    // Construct a Date in UTC; if Date "rolls over" (e.g. Feb 30 → Mar 2) the
    // round-trip won't match the inputs.
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }, 'Invalid calendar date');
export type DateOnly = z.infer<typeof DateOnly>;
