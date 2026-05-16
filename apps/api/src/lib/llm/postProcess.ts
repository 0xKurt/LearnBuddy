// Vision-result post-processing. Doc 06 §vision-result-post-processing.
//
// In Slice D1 we ship:
//   1. JSON.parse + Zod-shape validation
//   2. Item-level rejection (min question/expected length, Doc 06 §step 2)
//   3. Drop diagram-dependent items because the diagram processor lands in
//      a follow-up slice (sharp + study-asset upload). Items with
//      stimulus_kind='study_asset' or diagram_ref are dropped.
//   4. Drop problem_templates wholesale (MathLite feasibility validation
//      lands in D3). Items that referenced a template have their
//      problem_template_ref stripped.
//
// Doc 06 says ≥3 valid items must remain or the call is extraction_failed.
// We surface that as a sentinel in the parsed result; the route refunds.

import { z } from 'zod';

import type { VisionDiagram, VisionProblemTemplate, VisionResult } from './gateway.js';

const AnswerKind = z.enum([
  'short',
  'long',
  'numeric',
  'multiple_choice',
  'formula',
  'fill_blank',
  'diagram_label',
]);

const StimulusKind = z.enum(['none', 'study_asset', 'function_plot', 'svg', 'coord_grid']);

const LocaleSchema = z.enum(['de', 'en', 'fr', 'es', 'it']);

const VisionItemSchema = z
  .object({
    question: z.string(),
    expected_answer: z.string(),
    acceptable_answers: z.array(z.string()).default([]),
    answer_kind: AnswerKind,
    mc_options: z.array(z.string()).optional(),
    mc_correct_index: z.number().int().nonnegative().optional(),
    units: z.string().optional(),
    latex_expected: z.string().optional(),
    latex_acceptable: z.array(z.string()).optional(),
    fill_blank_template: z.string().optional(),
    fill_blank_answers: z.array(z.string()).optional(),
    diagram_ref: z
      .object({
        diagram_index: z.number().int().nonnegative(),
        label_index: z.number().int().nonnegative(),
      })
      .optional(),
    stimulus_kind: StimulusKind.default('none'),
    stimulus_data: z.record(z.unknown()).default({}),
    difficulty: z.number().int().min(1).max(5),
    topic: z.string().optional(),
    language: LocaleSchema,
    source_excerpt: z.string().max(400).optional(),
    problem_template_ref: z.number().int().nonnegative().optional(),
  })
  .passthrough();

const VisionDiagramSchema = z
  .object({
    page_index: z.number().int().nonnegative(),
    title: z.string().nullable().default(null),
    bounding_box: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    labels: z.array(
      z.object({
        text: z.string(),
        label_text_box: z.tuple([z.number(), z.number(), z.number(), z.number()]),
        connector_box: z.tuple([z.number(), z.number(), z.number(), z.number()]),
        target_xy: z.tuple([z.number(), z.number()]),
      }),
    ),
    graph_meta: z.record(z.unknown()).optional(),
  })
  .passthrough();

const VisionTemplateSchema = z
  .object({
    template_text: z.string(),
    params: z.array(
      z.object({
        name: z.string(),
        type: z.enum(['int', 'real']),
        min: z.number(),
        max: z.number(),
        exclude: z.array(z.number()).optional(),
      }),
    ),
    constraints: z.array(z.string()),
    solution_expression: z.string(),
    answer_kind: z.enum(['numeric', 'formula', 'short']),
    units: z.string().optional(),
    topic: z.string(),
    difficulty: z.number().int().min(1).max(5),
    stimulus_template: z.record(z.unknown()).optional(),
  })
  .passthrough();

const VisionPayloadSchema = z.object({
  detected_language: z.enum(['de', 'en', 'fr', 'es', 'it']).nullable(),
  extracted_markdown: z.string(),
  items: z.array(VisionItemSchema),
  diagrams: z.array(VisionDiagramSchema).default([]),
  problem_templates: z.array(VisionTemplateSchema).default([]),
  error: z.enum(['not_educational', 'unreadable']).nullable().default(null),
});

export type ParseResult =
  | { ok: true; value: Omit<VisionResult, 'usage'> }
  | { ok: false; error: string };

/** Parse + post-process the raw LLM text. Pure — no I/O. */
export async function parseVisionPayload(rawText: string): Promise<ParseResult> {
  // Strip Markdown fences if the model added them.
  const trimmed = rawText
    .trim()
    .replace(/^```(?:json)?\s*/u, '')
    .replace(/```\s*$/u, '');

  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch (e) {
    return { ok: false, error: `JSON.parse: ${e instanceof Error ? e.message : String(e)}` };
  }

  const parsed = VisionPayloadSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Zod: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    };
  }

  // Doc 06 §post-processing #2 — reject minimal items.
  // Drop diagram-dependent items (Slice D1 doesn't process diagrams yet).
  const surviving = parsed.data.items.filter((it) => {
    if (it.question.trim().length < 5) return false;
    if (it.expected_answer.trim().length < 1) return false;
    if (it.answer_kind === 'diagram_label') return false;
    if (it.stimulus_kind === 'study_asset') return false;
    return true;
  });

  // Strip references to problem_templates because D1 drops templates wholesale.
  const items = surviving.map((it) => {
    const { problem_template_ref: _t, ...rest } = it;
    return rest;
  });

  return {
    ok: true,
    value: {
      detected_language: parsed.data.detected_language,
      extracted_markdown: parsed.data.extracted_markdown,
      items,
      diagrams: parsed.data.diagrams as VisionDiagram[],
      problem_templates: parsed.data.problem_templates as VisionProblemTemplate[],
      error: parsed.data.error,
    },
  };
}
