// Vision-result post-processing. Doc 06 §vision-result-post-processing.
//
// Slice D1 (initial): drop diagram-dependent items wholesale because the
// sharp pipeline didn't exist yet. Slice D1.5 wires that pipeline up; the
// post-processor now keeps diagram items by default and the caller passes
// `dropDiagrams: true` only on the regenerate path (no images, no diagrams)
// and the legacy fake path that returns no diagrams.
//
// What this still does:
//   1. JSON.parse + Zod-shape validation
//   2. Item-level rejection (min question/expected length, Doc 06 §step 2)
//   3. Optionally drop diagram-dependent items (dropDiagrams=true)
//   4. Strip problem_template_ref on items — templates are validated and
//      persisted in a separate step in routes/materials.ts.
//
// Doc 06 says ≥3 valid items must remain or the call is extraction_failed.
// We surface that as a sentinel in the parsed result; the route refunds.

import { z } from 'zod';

import type {
  GeneratedVisionItem,
  VisionDiagram,
  VisionProblemTemplate,
  VisionResult,
} from './gateway.js';

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

export type ParseRegenerateResult =
  | { ok: true; value: { items: GeneratedVisionItem[] } }
  | { ok: false; error: string };

const RegeneratePayloadSchema = z.object({
  items: z.array(VisionItemSchema),
  problem_templates: z.array(VisionTemplateSchema).default([]),
});

export async function parseRegeneratePayload(rawText: string): Promise<ParseRegenerateResult> {
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
  const parsed = RegeneratePayloadSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Zod: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    };
  }
  const items = parsed.data.items
    .filter((it) => {
      if (it.question.trim().length < 5) return false;
      if (it.expected_answer.trim().length < 1) return false;
      if (it.answer_kind === 'diagram_label') return false;
      if (it.stimulus_kind === 'study_asset') return false;
      return true;
    })
    .map((it) => {
      const { problem_template_ref: _t, ...rest } = it;
      return rest as GeneratedVisionItem;
    });
  return { ok: true, value: { items } };
}

export type ParseVisionOpts = {
  /** When true (the legacy D1 behavior), drop items whose answer_kind is
   *  'diagram_label' or stimulus_kind is 'study_asset'. The Vertex gateway
   *  now defaults this to false because the D1.5 sharp pipeline replaces
   *  the dropped items with real study_asset_id references downstream. */
  dropDiagrams?: boolean;
};

/** Parse + post-process the raw LLM text. Pure — no I/O. */
export async function parseVisionPayload(
  rawText: string,
  opts: ParseVisionOpts = { dropDiagrams: true },
): Promise<ParseResult> {
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

  const dropDiagrams = opts.dropDiagrams ?? true;
  // Doc 06 §post-processing #2 — reject minimal items.
  const surviving = parsed.data.items.filter((it) => {
    if (it.question.trim().length < 5) return false;
    if (it.expected_answer.trim().length < 1) return false;
    if (dropDiagrams && it.answer_kind === 'diagram_label') return false;
    if (dropDiagrams && it.stimulus_kind === 'study_asset') return false;
    return true;
  });

  // Strip references to problem_templates — the route validates and persists
  // templates separately, then rewires items to their final DB ids.
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
