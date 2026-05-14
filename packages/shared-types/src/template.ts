import { z } from 'zod';
import { Iso8601, Uuid } from './enums.js';

export const ParamSpec = z.object({
  name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
  type: z.enum(['int', 'real']),
  min: z.number(),
  max: z.number(),
  step: z.number().optional(),
  exclude: z.array(z.number()).optional(),
});
export type ParamSpec = z.infer<typeof ParamSpec>;

export const ProblemTemplate = z.object({
  templateText: z.string(),
  params: z.array(ParamSpec).min(1),
  constraints: z.array(z.string()).default([]),
  textSubstitutions: z
    .array(z.object({ name: z.string(), rule: z.string() }))
    .default([]),
  solutionExpression: z.string(),
  answerKind: z.enum(['numeric', 'formula', 'short']),
  units: z.string().optional(),
  stimulusTemplate: z
    .object({
      kind: z.enum(['function_plot', 'svg']),
      dataTemplate: z.unknown(),
    })
    .optional(),
  topic: z.string(),
  difficulty: z.number().int().min(1).max(5),
});
export type ProblemTemplate = z.infer<typeof ProblemTemplate>;

// Persisted shape (server row).
export const ProblemTemplateRow = z.object({
  id: Uuid,
  material_id: Uuid,
  learner_id: Uuid,
  source_item_id: Uuid.nullable(),
  subject_kind: z.string(),
  topic: z.string(),
  template_text: z.string(),
  params: z.array(ParamSpec),
  constraints: z.array(z.string()),
  text_substitutions: z.array(z.object({ name: z.string(), rule: z.string() })),
  solution_expression: z.string(),
  answer_kind: z.enum(['numeric', 'formula', 'short']),
  units: z.string().nullable(),
  stimulus_template: z
    .object({ kind: z.enum(['function_plot', 'svg']), dataTemplate: z.unknown() })
    .nullable(),
  difficulty: z.number().int().min(1).max(5),
  difficulty_adjustment: z.number().int().min(-2).max(2).default(0),
  archived_at: Iso8601.nullable(),
  created_at: Iso8601,
  updated_at: Iso8601,
});
export type ProblemTemplateRow = z.infer<typeof ProblemTemplateRow>;

export const PracticeRun = z.object({
  id: Uuid,
  learner_id: Uuid,
  template_id: Uuid,
  problems_generated: z.number().int().nonnegative(),
  problems_correct: z.number().int().nonnegative(),
  avg_time_ms: z.number().int().nullable(),
  difficulty_adjustment: z.number().int().min(-2).max(2),
  started_at: Iso8601,
  ended_at: Iso8601.nullable(),
  created_at: Iso8601,
});
export type PracticeRun = z.infer<typeof PracticeRun>;

export const PracticeRunCreate = z.object({
  problems_generated: z.number().int().nonnegative(),
  problems_correct: z.number().int().nonnegative(),
  avg_time_ms: z.number().int().nullable().optional(),
  started_at: Iso8601,
  ended_at: Iso8601,
});
export type PracticeRunCreate = z.infer<typeof PracticeRunCreate>;
