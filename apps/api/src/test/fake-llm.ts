// Fake LLM gateway. Replaces the old apps/api/src/lib/placeholders.ts —
// same intent (deterministic 3-item output) but now behind the gateway
// seam, so the production route can call deps.llm.visionExtractAndGenerate
// without branching on env.
//
// Used by:
//   - vitest (createTestDeps())
//   - local dev when no GOOGLE_CLOUD_PROJECT is configured (the factory
//     falls back to this with a console.warn)

import { ApiError } from '../lib/errors.js';
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

  regenerateFromText(_input: RegenerateInput): Promise<RegenerateResult> {
    throw new ApiError('not_implemented', 'regenerateFromText fake lands in Slice D2');
  }

  evaluateAnswer(_input: EvaluateInput): Promise<EvaluateResult> {
    throw new ApiError('not_implemented', 'evaluateAnswer fake lands in Slice D2');
  }

  explain(_input: ExplainInput): Promise<ExplainResult> {
    throw new ApiError('not_implemented', 'explain fake lands in Slice D2');
  }
}
