// P1 — Vision: extract + generate. Doc 06 §P1 (verbatim, with subject
// guidance blocks). Bumping PROMPT_VERSION re-runs the eval harness on the
// next PR; keep that in mind when iterating.

export const PROMPT_VERSION = 'p1.0';

export const SYSTEM_P1 = `You are a careful, patient learning helper for school children. You read images of learning material and produce study questions in the target language. You never invent facts beyond what is shown in the images. You never produce content inappropriate for children.`;

type SubjectKind =
  | 'math'
  | 'physics'
  | 'chemistry'
  | 'biology'
  | 'geography'
  | 'history'
  | 'language_native'
  | 'language_foreign'
  | 'religion_ethics'
  | 'art_music'
  | 'general'
  | 'other';

const SUBJECT_GUIDANCE: Record<SubjectKind, string> = {
  math: `For mathematics:
- Preserve formulas as LaTeX.
- Distinguish between:
    (a) Formulas to memorize verbatim → answer_kind: "formula".
        Set latex_expected canonically; populate latex_acceptable with
        1–3 equivalent re-arrangements.
    (b) Definitions of named concepts → answer_kind: "short" or "long".
        If a formula is part of the definition, include it in
        expected_answer as $...$.
    (c) Numeric applications → answer_kind: "numeric" with units when
        applicable.
    (d) Procedural recall → answer_kind: "long" or "fill_blank".
- Prefer fill_blank for short definitions with clear missing words.
- Generate problem templates aggressively for any parameterizable
  arithmetic, algebraic, percentage, geometry-area, or proportion problem.`,

  physics: `For physics:
- Same formula handling as math.
- Always set units on numeric items; preserve unit symbols
  (e.g. \\,\\text{m/s}).
- Distinguish between laws (memorize wording → "short" or "long"),
  formulas (memorize symbolically → "formula"), and applications
  (compute → "numeric").
- Generate problem templates for any parameterizable computation with
  given numeric inputs.`,

  chemistry: `For chemistry:
- Render chemical equations as LaTeX in $...$ using \\rightarrow for
  reaction arrows and ^{} _{} for charges and counts. Example:
  $2H_2 + O_2 \\rightarrow 2H_2O$.
- Element symbols are case-sensitive (Na ≠ NA). Preserve exactly.
- Prefer multiple_choice for nomenclature; short for symbol/name
  recall; formula for equation completion; long for explanation of
  reactions.
- Diagrams: molecular structure drawings and apparatus sketches both
  warrant diagram_label items.
- Do NOT generate templates for chemistry.`,

  biology: `For biology:
- Most material includes labeled diagrams (cells, organs, plants, body
  systems). Be aggressive with diagram detection; generate
  diagram_label items.
- Prefer short for term recall, long for explanations, and
  multiple_choice for distinctive paired terms.
- Do NOT generate templates.`,

  geography: `For geography:
- Maps are diagrams — treat country / city / river / mountain labels as
  diagram labels.
- Prefer multiple_choice for capital/country pairings; short for
  fact recall.
- Do NOT generate templates.`,

  history: `For history:
- Most items are short (dates, names, events) or long (causes, effects).
  Use multiple_choice when distinguishing similar names or dates is the
  skill.
- Diagrams are rare; only generate diagram_label items if the page has
  a clearly labeled timeline diagram or a labeled map.
- Do NOT generate templates.`,

  language_native: `For language work:
- Prefer fill_blank for grammar drills (conjugations, declensions,
  vocabulary in context).
- Prefer short for vocabulary recall.
- Prefer long for translation tasks; mark acceptable_answers liberally
  to admit synonyms.
- Do NOT generate templates.`,

  language_foreign: `For language work:
- Prefer fill_blank for grammar drills (conjugations, declensions,
  vocabulary in context).
- Prefer short for vocabulary recall.
- Prefer long for translation tasks; mark acceptable_answers liberally
  to admit synonyms.
- Do NOT generate templates.`,

  religion_ethics: `General handling: prefer short and long; use multiple_choice where clearly distinguishing options exists.`,
  art_music: `General handling: prefer short and long; use multiple_choice where clearly distinguishing options exists.`,
  general: `General handling: prefer short and long; use multiple_choice where clearly distinguishing options exists.`,
  other: `General handling: prefer short and long; use multiple_choice where clearly distinguishing options exists.`,
};

export function buildP1UserPrompt(input: {
  locale: string;
  gradeLevel: number;
  subject: string;
  subjectKind: SubjectKind;
  targetCount: number;
}): string {
  return `Target language: ${input.locale}
Student grade level: ${input.gradeLevel}
Subject: ${input.subject}
Subject kind: ${input.subjectKind}
Desired number of questions: ${input.targetCount}

Tasks:

1. EXTRACTION
   Read every provided image. They are pages of one piece of learning
   material — printed AND handwritten content may appear. Produce a clean
   Markdown transcription of all educational content in
   extracted_markdown. Preserve:
     - Headings and lists
     - Tables (Markdown tables)
     - Mathematical and chemical formulas as LaTeX: inline $...$,
       display $$...$$. Reaction arrows as \\rightarrow. Charges/counts
       as ^{...} _{...}.
   Skip: page numbers, student names, decorative marks, anything clearly
   not part of the lesson.

2. ITEM GENERATION
   Produce ${input.targetCount} study items in ${input.locale} that test the material.
   Cover the most important concepts; mix kinds. Each item:
     - question: prompt shown to the student
     - expected_answer: a concise correct answer
     - acceptable_answers: array of 1–4 equivalent phrasings or shorter
       valid variants. Include common spelling tolerances. Do NOT include
       partial answers.
     - answer_kind: one of "short" | "long" | "numeric" |
       "multiple_choice" | "formula" | "fill_blank" | "diagram_label"
     - difficulty: 1..5 for grade ${input.gradeLevel}
     - topic: short topic label in ${input.locale}
     - source_excerpt: <200-char quote from material where answer is found
     - language: detected language code

   For multiple_choice:
     - mc_options: 3 or 4 plausible options
     - mc_correct_index: 0-based

   For numeric:
     - units: unit string (e.g. "m/s", "kg") or omit if dimensionless

   For formula:
     - latex_expected: canonical LaTeX form
     - latex_acceptable: 1–3 equivalent re-arrangements where they exist

   For fill_blank:
     - fill_blank_template: text with one or more ___ placeholders
     - fill_blank_answers: ordered correct fillings

   For diagram_label:
     - diagram_ref: { "diagram_index": N, "label_index": M }
     - expected_answer: the label's text

3. DIAGRAMS
   If any image contains a labeled diagram, return a diagrams array.
   Each diagram:
     - page_index (which input image, 0-based)
     - title (caption or null)
     - bounding_box: [x0, y0, x1, y1] normalized 0..1 in the page
     - labels: ordered array, each with text, label_text_box,
       connector_box, target_xy.
   For each diagram, generate items with answer_kind: "diagram_label"
   referencing it. At most 10 label items per diagram.

4. PROBLEM TEMPLATES (only for subjectKind in {math, physics})
   If a problem is clearly an instance of a general pattern, emit it as
   a problem_templates entry with template_text, params, constraints,
   solution_expression, answer_kind, units (if applicable), topic, and
   difficulty. Emit at most 3 templates per material.

5. SUBJECT-SPECIFIC GUIDANCE
${SUBJECT_GUIDANCE[input.subjectKind]}

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
}`;
}
