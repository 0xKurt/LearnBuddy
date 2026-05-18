// Fake LLM gateway. Replaces the old apps/api/src/lib/placeholders.ts —
// same intent (deterministic 3-item output) but now behind the gateway
// seam, so the production route can call deps.llm.visionExtractAndGenerate
// without branching on env.
//
// Used by:
//   - vitest (createTestDeps())
//   - local dev when no GOOGLE_CLOUD_PROJECT is configured (the factory
//     falls back to this with a console.warn)

import type {
  EvaluateInput,
  EvaluateResult,
  ExplainInput,
  ExplainResult,
  LLMGateway,
  RegenerateInput,
  RegenerateResult,
  VisionInput,
  VisionResult,
} from '../lib/llm/gateway.js';

export class FakeLlmGateway implements LLMGateway {
  async visionExtractAndGenerate(input: VisionInput): Promise<VisionResult> {
    const lang = input.locale === 'en' ? 'en' : 'de';
    return {
      detected_language: lang as VisionResult['detected_language'],
      extracted_markdown: '# Material (fake)\n\nDieser Inhalt stammt vom FakeLlmGateway.',
      items: [
        {
          question: 'Wir bereiten dein Material vor.',
          expected_answer: 'OK',
          acceptable_answers: [],
          answer_kind: 'short',
          stimulus_kind: 'none',
          stimulus_data: {},
          difficulty: 2,
          language: lang as VisionResult['items'][number]['language'],
        },
        {
          question: 'Echte Fragen erscheinen, sobald die Auswertung läuft.',
          expected_answer: 'OK',
          acceptable_answers: [],
          answer_kind: 'short',
          stimulus_kind: 'none',
          stimulus_data: {},
          difficulty: 2,
          language: lang as VisionResult['items'][number]['language'],
        },
        {
          question: 'Bis dahin sieht dieser Platzhalter aus wie eine echte Aufgabe.',
          expected_answer: 'OK',
          acceptable_answers: [],
          answer_kind: 'short',
          stimulus_kind: 'none',
          stimulus_data: {},
          difficulty: 2,
          language: lang as VisionResult['items'][number]['language'],
        },
      ],
      diagrams: [],
      problem_templates: [],
      error: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cost_usd_micros: 0,
        model: 'fake',
        prompt_version: 'fake',
      },
    };
  }

  async regenerateFromText(input: RegenerateInput): Promise<RegenerateResult> {
    const lang = (input.locale === 'en' ? 'en' : 'de') as 'de' | 'en';
    return {
      items: Array.from({ length: 3 }, (_, i) => ({
        question: `Zusätzliche Frage ${i + 1} (fake).`,
        expected_answer: 'OK',
        acceptable_answers: [],
        answer_kind: 'short' as const,
        stimulus_kind: 'none' as const,
        stimulus_data: {},
        difficulty: 2,
        language: lang,
      })),
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cost_usd_micros: 0,
        model: 'fake',
        prompt_version: 'fake',
      },
    };
  }

  async evaluateAnswer(input: EvaluateInput): Promise<EvaluateResult> {
    // Deterministic: exact match → correct, else incorrect with hint when allowed.
    const exact =
      input.kidAnswer.trim().toLowerCase() === input.expectedAnswer.trim().toLowerCase() ||
      input.acceptableAnswers.some(
        (a) => a.trim().toLowerCase() === input.kidAnswer.trim().toLowerCase(),
      );
    const correct = exact;
    return {
      verdict: correct ? 'correct' : 'incorrect',
      feedback: correct
        ? 'Genau richtig — sauber!'
        : 'Noch nicht ganz. Schau dir die Aufgabe nochmal in Ruhe an.',
      next_hint:
        !correct && input.priorHints.length < 2
          ? 'Versuch, die Frage Schritt für Schritt zu lesen.'
          : null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cost_usd_micros: 0,
        model: 'fake',
        prompt_version: 'fake',
      },
    };
  }

  async explain(input: ExplainInput): Promise<ExplainResult> {
    return {
      text: `Erklärung zu "${input.topic}" (fake, ${input.style}). Echte Erklärungen folgen, sobald Vertex konfiguriert ist.`,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cost_usd_micros: 0,
        model: 'fake',
        prompt_version: 'fake',
      },
    };
  }
}
