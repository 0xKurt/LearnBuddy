// LLM Gateway interface. Doc 02 §llm-gateway, Doc 06 entire.
//
// One seam between feature code and the LLM provider. Implementations:
//   - apps/api/src/lib/llm/vertex.ts        (Slice D1 — vision only)
//   - apps/api/src/test/fake-llm.ts         (deterministic placeholder)
// Slices D2/D3 add regenerateFromText / evaluateAnswer / explain / templates.
//
// The shape of vision items mirrors Doc 06 §P1 OUTPUT FORMAT (snake_case so
// the DB row in `items` can be inserted with minimal mapping). The shared
// shape in `@learnbuddy/shared-types` GeneratedItem is the camelCase legacy
// definition — kept around in case mobile-side consumers exist; the gateway
// itself emits the snake_case form.

import type { Locale } from '@learnbuddy/shared-types';

export type VisionInput = {
  /** 1..10 photos as base64 strings (no data: prefix). */
  images: Array<{ mimeType: 'image/jpeg' | 'image/png'; data: string }>;
  locale: Locale;
  gradeLevel: number;
  subject: string;
  subjectKind:
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
  targetCount: number;
};

/** Item emitted by the vision call, before persistence. Mirrors Doc 06 §P1 OUTPUT. */
export type GeneratedVisionItem = {
  question: string;
  expected_answer: string;
  acceptable_answers: string[];
  answer_kind:
    | 'short'
    | 'long'
    | 'numeric'
    | 'multiple_choice'
    | 'formula'
    | 'fill_blank'
    | 'diagram_label';
  mc_options?: string[];
  mc_correct_index?: number;
  units?: string;
  latex_expected?: string;
  latex_acceptable?: string[];
  fill_blank_template?: string;
  fill_blank_answers?: string[];
  diagram_ref?: { diagram_index: number; label_index: number };
  stimulus_kind?: 'none' | 'study_asset' | 'function_plot' | 'svg' | 'coord_grid';
  stimulus_data?: Record<string, unknown>;
  difficulty: number;
  topic?: string;
  language: Locale;
  source_excerpt?: string;
  problem_template_ref?: number;
};

export type VisionDiagram = {
  page_index: number;
  title: string | null;
  bounding_box: [number, number, number, number];
  labels: Array<{
    text: string;
    label_text_box: [number, number, number, number];
    connector_box: [number, number, number, number];
    target_xy: [number, number];
  }>;
  graph_meta?: Record<string, unknown>;
};

export type VisionProblemTemplate = {
  template_text: string;
  params: Array<{
    name: string;
    type: 'int' | 'real';
    min: number;
    max: number;
    exclude?: number[];
  }>;
  constraints: string[];
  solution_expression: string;
  answer_kind: 'numeric' | 'formula' | 'short';
  units?: string;
  topic: string;
  difficulty: number;
  stimulus_template?: Record<string, unknown>;
};

export type VisionResult = {
  detected_language: Locale | null;
  extracted_markdown: string;
  items: GeneratedVisionItem[];
  diagrams: VisionDiagram[];
  problem_templates: VisionProblemTemplate[];
  error: null | 'not_educational' | 'unreadable';
  /** Token + cost metadata for credit settlement (Doc 08 §atomic-debit step 3). */
  usage: {
    input_tokens: number;
    output_tokens: number;
    cost_usd_micros: number;
    model: string;
    prompt_version: string;
  };
};

export type RegenerateInput = {
  extractedMarkdown: string;
  locale: Locale;
  gradeLevel: number;
  subject: string;
  subjectKind: VisionInput['subjectKind'];
  targetCount: number;
  style?: 'simpler' | 'harder' | 'more-variety';
  excludeQuestions: string[];
};

export type RegenerateResult = {
  items: GeneratedVisionItem[];
  usage: VisionResult['usage'];
};

export type EvaluateInput = {
  question: string;
  expectedAnswer: string;
  acceptableAnswers: string[];
  answerKind: GeneratedVisionItem['answer_kind'];
  kidAnswer: string;
  parsedLearnerLatex?: string;
  locale: Locale;
  gradeLevel: number;
  priorHints: string[];
};

export type EvaluateResult = {
  verdict: 'correct' | 'partially_correct' | 'incorrect';
  feedback: string;
  next_hint: string | null;
  usage: VisionResult['usage'];
};

export type ExplainInput = {
  topic: string;
  context?: string;
  locale: Locale;
  gradeLevel: number;
  style: 'simpler' | 'step-by-step' | 'analogy';
};

export type ExplainResult = {
  text: string;
  usage: VisionResult['usage'];
};

export interface LLMGateway {
  visionExtractAndGenerate(input: VisionInput): Promise<VisionResult>;
  regenerateFromText(input: RegenerateInput): Promise<RegenerateResult>;
  evaluateAnswer(input: EvaluateInput): Promise<EvaluateResult>;
  explain(input: ExplainInput): Promise<ExplainResult>;
}
