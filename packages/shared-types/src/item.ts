import { z } from 'zod';
import { AnswerKind, Iso8601, Locale, StimulusKind, Uuid } from './enums.js';

// ─── Stimulus data shapes ───────────────────────────────────────────────────

export const Axis = z.object({
  min: z.number(),
  max: z.number(),
  tick_step: z.number().optional(),
  label: z.string().optional(),
});

export const FunctionPlot = z.object({
  series: z.array(
    z.union([
      z.object({
        kind: z.literal('line'),
        expression: z.string(),
        color: z.string().optional(),
        label: z.string().optional(),
      }),
      z.object({
        kind: z.literal('points'),
        points: z.array(z.tuple([z.number(), z.number()])),
        color: z.string().optional(),
        label: z.string().optional(),
      }),
    ]),
  ),
  x: Axis,
  y: Axis,
  grid: z.boolean().optional(),
  highlights: z
    .array(z.object({ x: z.number(), y: z.number(), label: z.string().optional() }))
    .optional(),
});
export type FunctionPlot = z.infer<typeof FunctionPlot>;

export const SvgStimulus = z.object({
  viewBox: z.string(),
  content: z.string(),
});
export type SvgStimulus = z.infer<typeof SvgStimulus>;

export const CoordGrid = z.object({
  x: Axis,
  y: Axis,
});
export type CoordGrid = z.infer<typeof CoordGrid>;

export const StudyAssetRef = z.object({
  study_asset_id: Uuid,
});
export type StudyAssetRef = z.infer<typeof StudyAssetRef>;

export const EmptyStimulus = z.object({}).strict();

export const StimulusData = z.union([
  EmptyStimulus,
  StudyAssetRef,
  FunctionPlot,
  SvgStimulus,
  CoordGrid,
]);
export type StimulusData = z.infer<typeof StimulusData>;

// ─── Item ────────────────────────────────────────────────────────────────────

export const Item = z.object({
  id: Uuid,
  material_id: Uuid,
  learner_id: Uuid,
  question: z.string().min(1),
  expected_answer: z.string(),
  acceptable_answers: z.array(z.string()).default([]),
  answer_kind: AnswerKind,
  mc_options: z.array(z.string()).nullable().optional(),
  mc_correct_index: z.number().int().nonnegative().nullable().optional(),
  mc_option_stimuli: z.array(StimulusData.nullable()).nullable().optional(),
  units: z.string().nullable().optional(),
  latex_expected: z.string().nullable().optional(),
  latex_acceptable: z.array(z.string()).default([]).optional(),
  fill_blank_template: z.string().nullable().optional(),
  fill_blank_answers: z.array(z.string()).default([]).optional(),
  study_asset_id: Uuid.nullable().optional(),
  diagram_label_index: z.number().int().min(1).nullable().optional(),
  stimulus_kind: StimulusKind,
  stimulus_data: StimulusData,
  difficulty: z.number().int().min(1).max(5),
  topic: z.string().nullable().optional(),
  language: Locale,
  source_excerpt: z.string().max(200).nullable().optional(),
  generated_by_model: z.string().nullable().optional(),
  generated_by_prompt_version: z.string().nullable().optional(),
  problem_template_id: Uuid.nullable().optional(),
  archived_at: Iso8601.nullable(),
  created_at: Iso8601,
  updated_at: Iso8601,
});
export type Item = z.infer<typeof Item>;

// ─── LLM-generated item (pre-persistence) ────────────────────────────────────
// camelCase form, exactly as the gateway emits.

export const GeneratedItem = z.object({
  question: z.string().min(3),
  expectedAnswer: z.string().min(1),
  acceptableAnswers: z.array(z.string()).default([]),
  answerKind: AnswerKind,
  mcOptions: z.array(z.string()).optional(),
  mcCorrectIndex: z.number().int().nonnegative().optional(),
  mcOptionStimuli: z.array(StimulusData.nullable()).optional(),
  units: z.string().optional(),
  latexExpected: z.string().optional(),
  latexAcceptable: z.array(z.string()).default([]).optional(),
  fillBlankTemplate: z.string().optional(),
  fillBlankAnswers: z.array(z.string()).optional(),
  diagramRef: z
    .object({
      diagramIndex: z.number().int().nonnegative(),
      labelIndex: z.number().int().min(1),
    })
    .optional(),
  stimulusKind: StimulusKind.default('none'),
  stimulusData: StimulusData.default({}),
  difficulty: z.number().int().min(1).max(5),
  topic: z.string().optional(),
  language: Locale,
  sourceExcerpt: z.string().max(200).optional(),
});
export type GeneratedItem = z.infer<typeof GeneratedItem>;

// ─── Local item state (FSRS) ────────────────────────────────────────────────

export const ItemState = z.object({
  item_id: Uuid,
  learner_id: Uuid,
  stability: z.number(),
  difficulty: z.number(),
  elapsed_days: z.number().int(),
  scheduled_days: z.number().int(),
  reps: z.number().int(),
  lapses: z.number().int(),
  state: z.number().int().min(0).max(3),
  last_review: Iso8601.nullable(),
  due: Iso8601,
  mastery_score: z.number().int(),
  updated_at: Iso8601,
});
export type ItemState = z.infer<typeof ItemState>;
