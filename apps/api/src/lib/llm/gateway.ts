// LLM Gateway — the single seam between feature code and the LLM provider.
// Doc 02 §llm-gateway, doc 06 entire.
//
// Skeleton: type definitions only. Implementations belong in
// apps/api/src/lib/llm/vertex.ts (Vertex AI Gemini 2.5 Flash-Lite).

import type {
  AnswerKind,
  GeneratedItem,
  Locale,
  ProblemTemplate,
  SubjectKind,
  Verdict,
} from '@learnbuddy/shared-types';

export type VisionResult = {
  extractedMarkdown: string;
  items: GeneratedItem[];
  templates: ProblemTemplate[];
  diagrams: Array<{
    page_index: number;
    bbox: [number, number, number, number];
    labels: Array<{ text: string; bbox: [number, number, number, number]; target_xy: [number, number] }>;
  }>;
  detectedLanguage: Locale;
  creditCost: number;
};

export type RegenerateResult = {
  items: GeneratedItem[];
  creditCost: number;
};

export type EvaluationResult = {
  verdict: Verdict;
  feedback: string;
  nextHint: string | null;
  creditCost: number;
};

export type ExplainResult = {
  text: string;
  creditCost: number;
};

export interface LLMGateway {
  visionExtractAndGenerate(input: {
    images: { mimeType: string; base64: string }[];
    locale: Locale;
    gradeLevel: number;
    subject: string;
    subjectKind: SubjectKind;
    targetCount: number;
  }): Promise<VisionResult>;

  regenerateFromText(input: {
    extractedMarkdown: string;
    locale: Locale;
    gradeLevel: number;
    subject: string;
    subjectKind: SubjectKind;
    targetCount: number;
    style?: 'simpler' | 'harder' | 'more-variety';
    excludeQuestions: string[];
  }): Promise<RegenerateResult>;

  evaluateAnswer(input: {
    question: string;
    expectedAnswer: string;
    acceptableAnswers: string[];
    answerKind: AnswerKind;
    latexExpected?: string;
    latexAcceptable?: string[];
    units?: string;
    kidAnswer: string;
    parsedKidLatex?: string;
    locale: Locale;
    gradeLevel: number;
    priorHints: string[];
  }): Promise<EvaluationResult>;

  explain(input: {
    topic: string;
    context?: string;
    locale: Locale;
    gradeLevel: number;
    style: 'simpler' | 'step-by-step' | 'analogy';
  }): Promise<ExplainResult>;
}
