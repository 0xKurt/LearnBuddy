# 06 — AI Pipeline

This document is the canonical spec for all AI behavior. All LLM calls go through the LLM Gateway. All prompts here are the final form — no "extends 05" or "additive." The system uses a single model, Gemini 2.5 Flash-Lite on Vertex AI, region `europe-west3`, paid tier.

Cross-references: doc 03 for output shape persistence, doc 04 for the request entry points, doc 07 for content types referenced in prompts, doc 08 for credit accounting per call.

## Provider configuration

```ts
// apps/api/lib/llm/config.ts
import { VertexAI } from '@google-cloud/vertexai';

export const VERTEX = new VertexAI({
  project: process.env.GCP_PROJECT_ID!,
  location: 'europe-west3',
});

export const MODEL_ID = 'gemini-2.5-flash-lite';

export const SAFETY = [
  { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE'    },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
];

export const GENERATION = {
  temperature: 0.4,
  topP: 0.95,
  maxOutputTokens: 2048,
  responseMimeType: 'application/json',
};

export const PROMPT_VERSION = 'p1.0';
```

Auth: a GCP service-account JSON is provided to the Vercel runtime as `GOOGLE_APPLICATION_CREDENTIALS_JSON` env var. The Vertex SDK reads it on cold start.

## LLM Gateway

The Gateway has four functions, all returning `{ ..., creditCost: number, modelUsage: { input_tokens, output_tokens, cost_usd_micros } }`. The gateway is the only place that translates token counts to credits using the formula in doc 08.

```ts
// apps/api/lib/llm/gateway.ts
export interface LLMGateway {
  visionExtractAndGenerate(input: VisionInput): Promise<VisionResult>;
  regenerateFromText(input: RegenerateInput): Promise<RegenerateResult>;
  evaluateAnswer(input: EvalInput): Promise<EvalResult>;
  explain(input: ExplainInput): Promise<ExplainResult>;
}
```

Each method:
1. Builds the prompt using the templates in §3 below.
2. Calls Vertex AI with `MODEL_ID`, `SAFETY`, `GENERATION`.
3. Parses the JSON response with Zod. On parse failure, retries once with the message "Your previous output was not valid JSON. Return only the JSON object."
4. Reports token usage from the Vertex response.

## Image processing

Located at `apps/api/lib/diagrams/`. Uses `sharp`.

### Inputs

The vision call returns a `diagrams` array (doc 07 §3). For each diagram, we have:
- `page_index` (which input image)
- `bounding_box` normalized 0..1 in the page
- `labels[]` with `text`, `label_text_box`, `connector_box`, `target_xy`

### Algorithm

For each diagram on each page:

1. Load the original image (downloaded server-side from Supabase storage via a service-role signed URL).
2. Extract a crop using `sharp().extract({ left, top, width, height })` from the normalized `bounding_box`.
3. Build a mask SVG covering each `label_text_box` and `connector_box` with white rectangles.
4. Composite the mask over the crop.
5. Build a markers SVG with numbered circles at each `target_xy` (translated into crop coordinates). Markers are 36 px circles, white fill, 3-px dark-blue border, bold dark-blue number centered. Numbering is the 1-based index of the label in the order received.
6. Composite the markers over the masked crop.
7. Encode as PNG.
8. Upload to `study-assets/{kidId}/{assetId}.png` via the Supabase service-role client.
9. Insert a `study_assets` row with `kind='numbered_diagram'`, `metadata.label_positions = [...]`, `metadata.original_label_text = [...]` (for later account-holder review).

### Mask safety

If the sum of `label_text_box` + `connector_box` areas exceeds 8 % of the crop area, or if any `label_text_box` has zero/invalid dimensions, the masking step is **skipped** for that diagram. Numbered markers are still composited. The learner sees both the original labels and the numbers — less clean, but no destroyed content. The `study_assets.metadata.fallback = 'no_masking'` flag is set for account-holder visibility.

If after processing fewer than 2 valid labels remain, no `diagram_label` items are generated for that diagram; existing items reference it as `stimulus_kind='study_asset'` instead.

### Graph crops

Diagrams with `graph_meta` are processed the same way except masking is skipped (axis labels are usually on the figure and should remain visible). The resulting study asset has `kind='cropped_graph'` with `metadata.graph_meta` preserved.

## Prompts

All prompts are exported as string constants from `apps/api/prompts/`, versioned by `PROMPT_VERSION`. They are concatenated from a base + subject branches + output schema at call time.

### P1 — Vision: extract + generate

Inputs: 1..10 images + text context. Single Vertex call producing extracted Markdown, items, optional diagrams, optional problem templates.

```
SYSTEM:
You are a careful, patient learning helper for school children. You read
images of learning material and produce study questions in the target
language. You never invent facts beyond what is shown in the images. You
never produce content inappropriate for children.

USER (text part, before the image parts):
Target language: {locale}
Student grade level: {gradeLevel}        (German Klassenstufe scale)
Subject: {subject}
Subject kind: {subjectKind}              (one of: math, physics, chemistry, biology, geography, history, language_native, language_foreign, religion_ethics, art_music, general, other)
Desired number of questions: {targetCount}

Tasks:

1. EXTRACTION
   Read every provided image. They are pages of one piece of learning
   material — printed AND handwritten content may appear. Produce a clean
   Markdown transcription of all educational content in
   `extracted_markdown`. Preserve:
     - Headings and lists
     - Tables (Markdown tables)
     - Mathematical and chemical formulas as LaTeX: inline `$...$`,
       display `$$...$$`. Reaction arrows as `\rightarrow`. Charges/counts
       as `^{...}` `_{...}`.
   Skip: page numbers, student names, decorative marks, anything clearly
   not part of the lesson.

2. ITEM GENERATION
   Produce {targetCount} study items in {locale} that test the material.
   Cover the most important concepts; mix kinds. Each item:
     - `question`: prompt shown to the student
     - `expected_answer`: a concise correct answer
     - `acceptable_answers`: array of 1–4 equivalent phrasings or shorter
       valid variants. Include common spelling tolerances (with/without
       "ß", with/without articles). Do NOT include partial answers.
     - `answer_kind`: one of "short" | "long" | "numeric" |
       "multiple_choice" | "formula" | "fill_blank" | "diagram_label"
     - `difficulty`: 1..5 for grade {gradeLevel}
     - `topic`: short topic label in {locale}
     - `source_excerpt`: <200-char quote from material where answer is found
     - `language`: detected language code

   For `multiple_choice`:
     - `mc_options`: 3 or 4 plausible options
     - `mc_correct_index`: 0-based

   For `numeric` (especially in physics):
     - `units`: unit string (e.g. "m/s", "kg") or omit if dimensionless

   For `formula`:
     - `latex_expected`: canonical LaTeX form
     - `latex_acceptable`: 1–3 equivalent re-arrangements where they exist

   For `fill_blank`:
     - `fill_blank_template`: text with one or more `___` placeholders
     - `fill_blank_answers`: ordered correct fillings

   For `diagram_label`:
     - `diagram_ref`: `{ "diagram_index": N, "label_index": M }`
     - `expected_answer`: the label's text

   For items that reference a graph or geometric figure that should appear
   above the question:
     - `stimulus_kind`: "function_plot" | "svg" | "study_asset"
     - `stimulus_data`: appropriate JSON (see below)

3. DIAGRAMS
   If any image contains a labeled diagram (drawing or photo with arrows
   or lines pointing from text labels to parts of the image), additionally
   return a `diagrams` array. Each diagram:
     - `page_index` (which input image, 0-based)
     - `title` (caption or null)
     - `bounding_box`: [x0, y0, x1, y1] normalized 0..1 in the page
     - `labels`: ordered array. Each label:
         * `text`: the label text
         * `label_text_box`: [x0, y0, x1, y1] normalized
         * `connector_box`: bounding box of the arrow or line itself,
           normalized
         * `target_xy`: [x, y] normalized — where the arrow tip points
   If a diagram is a graph (coordinate system, chart), also include
   `graph_meta`:
     - `kind`: "function" | "scatter" | "bar" | "pie" | "other"
     - `x_axis` / `y_axis`: { label, min, max, tick_step }
     - `series`: array describing what is plotted; for line graphs an
       `expression` if you can read it confidently

   For each diagram, generate items with `answer_kind: "diagram_label"`
   referencing it. Generate at most 10 label items per diagram; pick the
   pedagogically most important labels and skip purely decorative ones.

   For each graph, you may additionally generate one or more items whose
   `stimulus_kind` is `"function_plot"` with a `stimulus_data` you
   reconstruct, so the student can practice with a freshly-rendered version.

4. PROBLEM TEMPLATES (only for subjectKind in {math, physics})
   If a problem in the material is clearly an instance of a general pattern
   (linear equation, percentage calculation, area of a rectangle,
   projectile motion with given values), additionally emit it as a
   `problem_templates` entry. Each template:
     - `template_text`: string with `{param}` placeholders
     - `params`: array of `{ name, type: "int"|"real", min, max, exclude? }`
     - `constraints`: array of boolean MathLite expressions that the
       sampled values must satisfy (e.g. "(c - b) mod a == 0")
     - `solution_expression`: MathLite expression returning the answer
     - `answer_kind`: "numeric" | "formula" | "short"
     - `units`: if applicable
     - `topic`: short label
     - `difficulty`: 1..5
     - `stimulus_template` (optional): for templates whose variants need a
       generated graph or figure. Same shape as a stimulus, with parameter
       placeholders in any string value (e.g. `"{a}*x + {b}"`).
   Rules:
     - Choose param ranges so a randomly-sampled instance is appropriate
       for grade {gradeLevel}.
     - Constraints must guarantee integer / clean-decimal solutions where
       pedagogy benefits.
     - Do not emit a template for one-off questions that don't generalize.
     - Emit at most 3 templates per material.
     - Each emitted template must also have at least one concrete item in
       `items` as the seed example, with `problem_template_ref` set to the
       template's index in this array.

5. SUBJECT-SPECIFIC GUIDANCE
   {SUBJECT_GUIDANCE for subjectKind}

6. SAFETY GUARD
   If the images do not look like educational material (chat screenshots,
   photos of people unrelated to a textbook, advertisements, personal
   documents), return:
   {
     "detected_language": null,
     "extracted_markdown": "",
     "items": [],
     "diagrams": [],
     "problem_templates": [],
     "error": "not_educational"
   }

OUTPUT FORMAT
Return strictly valid JSON, no Markdown fences, no commentary, matching:

{
  "detected_language": "de"|"en"|"fr"|"es"|"it"|null,
  "extracted_markdown": "string",
  "items": [ /* see item shape above */ ],
  "diagrams": [ /* see diagram shape above */ ],
  "problem_templates": [ /* see template shape above */ ],
  "error": null | "not_educational" | "unreadable"
}
```

### Subject guidance blocks

Appended to the user prompt as section 5.

**math:**
```
For mathematics:
- Preserve formulas as LaTeX.
- Distinguish between:
    (a) Formulas to memorize verbatim → `answer_kind: "formula"`.
        Set `latex_expected` canonically; populate `latex_acceptable` with
        1–3 equivalent re-arrangements.
    (b) Definitions of named concepts → `answer_kind: "short"` or "long".
        If a formula is part of the definition, include it in
        `expected_answer` as `$...$`.
    (c) Numeric applications → `answer_kind: "numeric"` with `units` when
        applicable.
    (d) Procedural recall → `answer_kind: "long"` or "fill_blank".
- Prefer fill_blank for short definitions with clear missing words.
- Generate problem templates aggressively for any parameterizable
  arithmetic, algebraic, percentage, geometry-area, or
  proportion problem.
```

**physics:**
```
For physics:
- Same formula handling as math.
- Always set `units` on numeric items; preserve unit symbols
  (e.g. `\,\text{m/s}`).
- Distinguish between laws (memorize wording → "short" or "long"),
  formulas (memorize symbolically → "formula"), and applications
  (compute → "numeric").
- Generate problem templates for any parameterizable computation with
  given numeric inputs.
```

**chemistry:**
```
For chemistry:
- Render chemical equations as LaTeX in `$...$` using `\rightarrow` for
  reaction arrows and `^{}` `_{}` for charges and counts. Example:
  $2H_2 + O_2 \rightarrow 2H_2O$.
- Element symbols are case-sensitive (Na ≠ NA). Preserve exactly.
- Prefer `multiple_choice` for nomenclature; `short` for symbol/name
  recall; `formula` for equation completion; `long` for explanation of
  reactions.
- Diagrams: molecular structure drawings and apparatus sketches both
  warrant `diagram_label` items.
- Do NOT generate templates for chemistry — chemistry problems vary by
  reaction type rather than parameter.
```

**biology:**
```
For biology:
- Most material includes labeled diagrams (cells, organs, plants, body
  systems). Be aggressive with diagram detection; generate
  `diagram_label` items.
- Prefer `short` for term recall, `long` for explanations, and
  `multiple_choice` for distinctive paired terms.
- Do NOT generate templates.
```

**geography:**
```
For geography:
- Maps are diagrams — treat country / city / river / mountain labels as
  diagram labels.
- Prefer `multiple_choice` for capital/country pairings; `short` for
  fact recall.
- Do NOT generate templates.
```

**history:**
```
For history:
- Most items are `short` (dates, names, events) or `long` (causes,
  effects). Use `multiple_choice` when distinguishing similar names or
  dates is the skill.
- Diagrams are rare; only generate `diagram_label` items if the page has
  a clearly labeled timeline diagram or a labeled map.
- Do NOT generate templates.
```

**language_native, language_foreign:**
```
For language work:
- Prefer `fill_blank` for grammar drills (conjugations, declensions,
  vocabulary in context).
- Prefer `short` for vocabulary recall.
- Prefer `long` for translation tasks; mark acceptable_answers liberally
  to admit synonyms.
- Do NOT generate templates.
```

**religion_ethics, art_music, general, other:**
```
General handling: prefer `short` and `long`; use `multiple_choice` where
clearly distinguishing options exists.
```

### P2 — Regeneration from cached text

Used by `POST /materials/:id/regenerate-items`. No images. Reuses `extracted_markdown`. Same output shape minus `extracted_markdown` and `diagrams`. Templates only if not already present.

```
SYSTEM: <same as P1 SYSTEM>

USER:
Target language: {locale}
Student grade level: {gradeLevel}
Subject: {subject}
Subject kind: {subjectKind}
Desired number of additional questions: {targetCount}
Style: {style}    ("simpler" | "harder" | "more-variety" | null)

You are given previously extracted learning material text and the list
of already-existing question stems. Generate {targetCount} ADDITIONAL
items that do not duplicate the existing ones.

{styleHint}

EXTRACTED MATERIAL:
{extractedMarkdown}

EXISTING QUESTIONS (do not duplicate):
{existingQuestionStems}

Apply all rules from the regular item-generation task, including the
subject-specific guidance for "{subjectKind}". If the existing items
already cover a topic well, focus on other topics in the material.

OUTPUT FORMAT
Return strictly valid JSON:
{
  "items": [ /* item objects */ ],
  "problem_templates": [ /* new templates only — must not duplicate existing */ ]
}
```

`styleHint`:

- `simpler`: "Keep wording short. Prefer factual recall over application. Adjust to a student one grade below {gradeLevel}."
- `harder`: "Include 2–3 transfer or application questions. Use precise terminology where the source allows."
- `more-variety`: "Mix answer kinds: include at least one `multiple_choice`, one `numeric` (if applicable), and one `long` explanation."

### P3 — Answer evaluation

Used by `POST /attempts` when the local evaluator returns `unknown`. Streams the response.

```
SYSTEM:
You are a patient learning helper for school children. You evaluate one
student answer at a time. You are encouraging, never harsh. You give
hints, not full answers, unless explicitly asked.

USER:
Target language for feedback: {locale}
Student grade level: {gradeLevel}
Question: {question}
Expected answer: {expectedAnswer}
Acceptable variants: {acceptableAnswers}
Answer kind: {answerKind}
{kindSpecificContext}
Student's answer (raw text): {kidAnswer}
{parsedLatexContext}
Hints already given in this attempt: {priorHints}

Decide:
- `verdict`: "correct" | "partially_correct" | "incorrect"
  * "correct" if essentially right, even if phrased differently or
    partial as long as the key concept is present.
  * "partially_correct" if the answer captures part of the idea but
    misses important elements.
  * "incorrect" if wrong, off-topic, or empty.

Write `feedback` (1–2 short sentences) in {locale}, age-appropriate for
grade {gradeLevel}. For correct: brief acknowledgment, optionally one
extra fact. For partial: name what is right, then what is missing
without stating the missing piece. For incorrect: a gentle nudge.

If verdict is "partially_correct" or "incorrect" AND priorHints contains
fewer than 2 entries, write `next_hint`: ONE concrete hint pointing
toward the missing piece, without containing the expected answer
verbatim. If 2 hints have already been given, set `next_hint` to null
and have `feedback` reveal the answer kindly.

OUTPUT FORMAT — strictly valid JSON:
{
  "verdict": "correct" | "partially_correct" | "incorrect",
  "feedback": "string",
  "next_hint": "string" | null
}
```

`kindSpecificContext` injected per answer kind:

- **numeric**: `Expected as a number. Units (if any): {units}. Tolerate ±1% relative error or ±0.01 absolute when |expected| < 1. Tolerate unit aliases (e.g. km/h ↔ Kilometer pro Stunde).`
- **formula**: `Expected as a mathematical formula in LaTeX: {latexExpected}. Acceptable variants: {latexAcceptable}. The student's answer may be plain text, spoken natural language, or LaTeX. Treat mathematically equivalent forms as correct (e.g. y = mx + b and y = b + mx).`
- **multiple_choice**: `Options were: {mcOptions}. Correct index: {mcCorrectIndex}. The student's answer is the option index they selected.`
- **fill_blank**: `Template was: {fillBlankTemplate}. Expected blanks in order: {fillBlankAnswers}. The student's answer is the joined attempts in order, separated by " | ". Grade each blank independently and combine.`
- **diagram_label**: `The student was asked what number {diagramLabelIndex} on a diagram refers to. Expected: {expectedAnswer}.`
- **short**, **long**: empty.

`parsedLatexContext`: if `parsedKidLatex` is provided, append `Student answer parsed to LaTeX (by client): {parsedKidLatex}.`. Otherwise empty.

### P4 — Explain

Used by `POST /explain`. Streams plain text.

```
SYSTEM:
You are a patient tutor for school children. You explain concepts in
plain language appropriate to the student's grade level. You never make
things up. If the topic is outside school content for that grade, say
so kindly. You stay close to the student's actual material.

USER:
Target language: {locale}
Student grade level: {gradeLevel}
Style: {style}    ("simpler" | "step-by-step" | "analogy")
{context}
Topic or question: {topic}

Write an explanation of 4–8 short sentences. Use concrete examples.
Avoid jargon. Adapt to the requested style:
  - "simpler": use the simplest possible language; prefer one short
    everyday example.
  - "step-by-step": use numbered steps. Each step is one sentence.
  - "analogy": build the explanation around one clear everyday analogy.

Output plain text only — no JSON, no Markdown headings.
```

Hard cap: 400 output tokens.

## Vision result post-processing

Server code in `apps/api/lib/llm/postProcess.ts`:

1. Parse the JSON response with the `VisionResult` Zod schema from `packages/shared-types`.
2. For each item: reject if `question.length < 5` or `expected_answer.length < 1`.
3. For each diagram: dispatch the image processor (`apps/api/lib/diagrams/process.ts`).
4. For each problem template:
   - Parse `template_text`, all `params[].min/max/exclude`, all `constraints` and `solution_expression` with the shared MathLite parser.
   - Sample 5 random parameter combinations. Evaluate constraints; count how many pass. If `passes/5 < 0.6`, drop the template (log as `template_validation_dropped`).
   - For each surviving template, also evaluate the `solution_expression` with one passing sample to confirm it returns a finite, well-typed value.
5. For items with `problem_template_ref`, replace the index reference with the validated template's database id after insert (insert templates first, then items).
6. Diagrams whose image processing fails (any sharp exception) are downgraded: items that referenced them as `stimulus_kind='study_asset'` retain that pointer; items whose `diagram_label_index` exceeds the number of successfully placed markers are dropped.

## Eval harness

Located at `apps/api/evals/`. Runnable with `pnpm eval`.

### Fixture format

`apps/api/evals/fixtures/{name}/`:
- `images/0.jpg`, `images/1.jpg`, ...
- `meta.json`:
  ```json
  {
    "locale": "de",
    "grade_level": 7,
    "subject": "Mathematik",
    "subject_kind": "math",
    "target_item_count": 10
  }
  ```
- `expected.json`:
  ```json
  {
    "min_items": 6,
    "must_topics": ["Lineare Funktion", "Steigung"],
    "must_answer_kinds": ["formula", "numeric"],
    "must_template_count": 1,
    "max_cost_usd": 0.002
  }
  ```

### Runner

`apps/api/evals/run.ts`:

1. For each fixture, calls `visionExtractAndGenerate` with the fixture's images and meta.
2. Asserts `items.length >= min_items`.
3. Asserts every topic in `must_topics` appears in some item's `topic`.
4. Asserts every answer kind in `must_answer_kinds` appears in at least one item.
5. Asserts `problem_templates.length >= must_template_count`.
6. Asserts `cost_usd <= max_cost_usd`.
7. For diagrams: asserts every label's `target_xy` lies within `bounding_box`; asserts at least one `diagram_label` item per diagram in fixtures with `must_diagrams: true`.

### Fixture inventory (minimum set at launch)

- `de-grade7-math-linear-functions` — one worksheet with multiple linear equations and a graph.
- `de-grade7-math-percentages` — word problems with parameterizable variants.
- `de-grade7-physics-mechanics` — speed/distance/time formulas, numeric problems.
- `de-grade7-chemistry-reactions` — simple chemical equations.
- `de-grade7-biology-cell` — labeled cell diagram.
- `de-grade7-geography-europe` — labeled map of Europe.
- `de-grade7-history-french-revolution` — text-heavy page with dates and names.
- `de-grade7-language-german-grammar` — fill-blank-friendly grammar exercises.
- `de-grade7-language-english-vocab` — vocabulary list.
- `de-grade7-handwritten-notes` — a handwritten notebook page (mathematics).
- `en-grade5-math-fractions` — for the English locale.
- `de-grade4-math-arithmetic` — younger grade.
- `de-grade10-physics-projectile` — older grade.

Each fixture is real material (use stock or own learner's material with permission); the eval harness re-runs on every PR that touches prompts and on every prompt-version bump. CI fails on regression.

## Caching and cost levers

- **Prompt prefix caching** on the SYSTEM portion of each prompt. Configured per call via Vertex's context caching API. The SYSTEM strings are stable across invocations within a `PROMPT_VERSION`.
- **No retries on success**. Retries only on transient network errors and on `responseMimeType` mismatches.
- **No model escalation**. One model.
- **Hard cap** on `targetCount` of 25 in the gateway, regardless of caller request.
- **Hard cap** on output tokens of 2048 at the SDK level.

## Failure modes and refunds

| Condition | Action | Credits |
|---|---|---|
| Vertex returns valid JSON, items pass post-processing | Persist, settle to actual cost | charged actual |
| Vertex returns invalid JSON twice | `extraction_failed`, refund estimate | refunded |
| Vertex safety blocks all candidates | `extraction_failed`, refund estimate | refunded |
| Vertex network/5xx after 2 retries with 1s/3s backoff | `extraction_failed`, refund estimate | refunded |
| Vertex returns `error: "not_educational"` | `not_educational`, refund estimate | refunded |
| Some items rejected by post-processing but ≥ 3 valid items remain | Persist valid items only | settle to actual cost |
| Fewer than 3 valid items after post-processing | `extraction_failed`, refund estimate | refunded |

## Logging

Every gateway call writes a `credit_events` row with:
- `model = 'gemini-2.5-flash-lite'`
- `prompt_version = PROMPT_VERSION`
- `input_tokens`, `output_tokens` from the Vertex response
- `cost_usd_micros` computed from token counts × pricing
- `reason` matching the function ("vision" / "regenerate" / "evaluation" / "explain")
- `reference_id` = material_id / attempt_id / explain has none

The credit ledger is the source of truth for spend monitoring (doc 08).
