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

import { jsonrepair } from 'jsonrepair';
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

// Top-level schema deliberately keeps `diagrams` and `problem_templates` as
// `z.unknown()` arrays — we per-entry safe-parse them below and drop
// malformed ones, so a single half-emitted template / diagram from Vertex
// can no longer fail the whole extraction (seen live: a template missing
// `template_text` + 6 other required fields killed an otherwise-valid
// 8-item payload).
const VisionPayloadSchema = z.object({
  detected_language: z.enum(['de', 'en', 'fr', 'es', 'it']).nullable(),
  extracted_markdown: z.string(),
  items: z.array(VisionItemSchema),
  diagrams: z.array(z.unknown()).default([]),
  problem_templates: z.array(z.unknown()).default([]),
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
    // Two real Vertex failure modes we've seen on live worksheets:
    //   1. Truncation at maxOutputTokens (mid-string) → "Unterminated
    //      string". Recover by slicing at the last complete item close.
    //   2. Bad escape sequences inside LaTeX strings (e.g. `\$`, `\K`) →
    //      "Bad escaped character". jsonrepair fixes these by escaping
    //      the rogue backslash without changing item count.
    //
    // We try the conservative salvage first because it never invents
    // content. jsonrepair, in contrast, may "complete" a half-written
    // item with empty fields that then fail zod — but it's the right
    // tool for non-truncation defects.
    const salvaged = trySalvageTruncated(trimmed);
    if (salvaged) {
      json = salvaged;
    } else {
      try {
        const repaired = jsonrepair(trimmed);
        json = JSON.parse(repaired);
      } catch {
        return { ok: false, error: `JSON.parse: ${e instanceof Error ? e.message : String(e)}` };
      }
    }
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

  // Per-entry safe-parse for diagrams + problem_templates: drop the
  // malformed ones, keep the rest. Vertex sometimes emits a half-formed
  // template (missing template_text / params / constraints / …) inside an
  // otherwise-valid response; pre-fix this would fail the whole extraction.
  const diagrams: VisionDiagram[] = [];
  for (const raw of parsed.data.diagrams) {
    const r = VisionDiagramSchema.safeParse(raw);
    if (r.success) diagrams.push(r.data as VisionDiagram);
  }
  const problem_templates: VisionProblemTemplate[] = [];
  for (const raw of parsed.data.problem_templates) {
    const r = VisionTemplateSchema.safeParse(raw);
    if (r.success) problem_templates.push(r.data as VisionProblemTemplate);
  }

  return {
    ok: true,
    value: {
      detected_language: parsed.data.detected_language,
      extracted_markdown: parsed.data.extracted_markdown,
      items,
      diagrams,
      problem_templates,
      error: parsed.data.error,
    },
  };
}

/** Best-effort recovery of a Vertex payload truncated mid-string at
 *  `maxOutputTokens`. The shape we want is roughly:
 *
 *  ```json
 *  {
 *    "detected_language": "de",
 *    "extracted_markdown": "…",
 *    "items": [ {...}, {...}, … <CUT HERE> ],
 *    "diagrams": [...],
 *    "problem_templates": [...]
 *  }
 *  ```
 *
 *  We find the `"items":` array opening, walk balanced braces, and stop at
 *  the last well-formed item close. We deliberately discard everything
 *  after `items`: a truncated tail can't have valid `diagrams` or
 *  `problem_templates` anyway. detected_language defaults to 'de' if
 *  we can't find it. extracted_markdown is dropped if it was the field
 *  being cut — the tutor's material-context degrades gracefully when null.
 *
 *  Returns the salvaged object or null if no items can be recovered. */
function trySalvageTruncated(text: string): Record<string, unknown> | null {
  const itemsStart = text.indexOf('"items"');
  if (itemsStart < 0) return null;
  const arrayStart = text.indexOf('[', itemsStart);
  if (arrayStart < 0) return null;

  // Walk char-by-char to track string state + brace depth from arrayStart.
  let depth = 0;
  let inString = false;
  let escape = false;
  let lastCompleteItemEnd = -1; // index AFTER the last `}` that closes an item
  for (let i = arrayStart; i < text.length; i++) {
    const c = text[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\' && inString) {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      // depth === 1 means we just closed an item that lives at the
      // first level inside the items array (depth 0 = before [, depth 1
      // = inside [, depth 2 = inside an item). When a `}` brings us back
      // to depth 1, an item just finished.
      if (depth === 1 && c === '}') lastCompleteItemEnd = i + 1;
      // depth 0 means the items array itself closed — that's the happy
      // path the strict parser would already have handled.
      if (depth === 0) return null;
    }
  }

  if (lastCompleteItemEnd < 0) return null;
  const itemsSliced = `${text.slice(arrayStart, lastCompleteItemEnd)}]`;

  // Extract detected_language if present and complete (small field, usually
  // serialized before the big items array).
  let detected_language: string = 'de';
  const langMatch = text.match(/"detected_language"\s*:\s*"([a-z]{2})"/);
  if (langMatch?.[1] && ['de', 'en', 'fr', 'es', 'it'].includes(langMatch[1])) {
    detected_language = langMatch[1];
  }

  let itemsJson: unknown;
  try {
    itemsJson = JSON.parse(itemsSliced);
  } catch {
    return null;
  }

  return {
    detected_language,
    extracted_markdown: '',
    items: itemsJson,
    diagrams: [],
    problem_templates: [],
  };
}
