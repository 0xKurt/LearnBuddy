// Vertex AI Gemini implementation of LLMGateway. Doc 06 §provider-configuration.
//
// Slice D1 implements `visionExtractAndGenerate`. The other three methods
// throw with a clear "lands in D2/D3" marker — they're declared on the
// interface so callers can type-check today and switch to the real path
// in the next slices without a route refactor.
//
// Auth: relies on Google Application Default Credentials (ADC). Either
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json (local dev) or
//   GOOGLE_APPLICATION_CREDENTIALS_JSON='{...}' (Vercel, bootstrapped to a
//   tempfile in lib/llm/factory.ts).
//
// JSON output: Gemini 2.5 supports responseMimeType="application/json". We
// still parse defensively (Doc 06 §3 says "retry once on parse failure with
// the message: Your previous output was not valid JSON").

import {
  HarmBlockThreshold,
  HarmCategory,
  VertexAI,
  type GenerateContentResponse,
} from '@google-cloud/vertexai';

import type { Env } from '../env.js';
import { ApiError } from '../errors.js';
import { PROMPT_VERSION, SYSTEM_P1, buildP1UserPrompt } from '../../prompts/p1.js';
import { parseVisionPayload } from './postProcess.js';
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
} from './gateway.js';

// Doc 06 §provider-configuration — verbatim.
const SAFETY = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];

// Pricing per Doc 08 / Gemini 2.5 Flash-Lite list price (USD/M tokens).
// Stored as micro-dollars (1e-6 USD) per million tokens so the math is in ints.
const PRICE_INPUT_MICROS_PER_M = 100_000; // $0.10/M
const PRICE_OUTPUT_MICROS_PER_M = 400_000; // $0.40/M

export class VertexLlmGateway implements LLMGateway {
  private readonly vertex: VertexAI;
  private readonly modelId: string;

  constructor(private readonly env: Env) {
    if (!env.GOOGLE_CLOUD_PROJECT) {
      throw new Error(
        'VertexLlmGateway requires GOOGLE_CLOUD_PROJECT — did you forget to set it in .env.local?',
      );
    }
    this.vertex = new VertexAI({
      project: env.GOOGLE_CLOUD_PROJECT,
      location: env.GOOGLE_VERTEX_LOCATION,
    });
    this.modelId = env.VERTEX_MODEL_ID;
  }

  async visionExtractAndGenerate(input: VisionInput): Promise<VisionResult> {
    if (input.images.length < 1 || input.images.length > 10) {
      throw new ApiError('validation_failed', 'images must be 1..10');
    }
    const targetCount = Math.min(25, Math.max(1, input.targetCount));

    const model = this.vertex.getGenerativeModel({
      model: this.modelId,
      systemInstruction: {
        role: 'system',
        parts: [{ text: SYSTEM_P1 }],
      },
      safetySettings: SAFETY,
      generationConfig: {
        temperature: 0.4,
        topP: 0.95,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    });

    const userText = buildP1UserPrompt({
      locale: input.locale,
      gradeLevel: input.gradeLevel,
      subject: input.subject,
      subjectKind: input.subjectKind,
      targetCount,
    });

    const userParts = [
      { text: userText },
      ...input.images.map((img) => ({
        inlineData: { mimeType: img.mimeType, data: img.data },
      })),
    ];

    let response: GenerateContentResponse;
    try {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: userParts }],
      });
      response = result.response;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ApiError('extraction_failed', `Vertex call failed: ${msg}`);
    }

    const usage = response.usageMetadata ?? {};
    const inputTokens = usage.promptTokenCount ?? 0;
    const outputTokens = usage.candidatesTokenCount ?? 0;
    const costMicros =
      Math.round((inputTokens * PRICE_INPUT_MICROS_PER_M) / 1_000_000) +
      Math.round((outputTokens * PRICE_OUTPUT_MICROS_PER_M) / 1_000_000);

    // Safety blocked all candidates → no text. Doc 06 §failure-modes-and-refunds.
    const candidates = response.candidates ?? [];
    if (candidates.length === 0) {
      const reason = response.promptFeedback?.blockReason ?? 'no_candidates';
      throw new ApiError('extraction_failed', `Vertex returned no candidates: ${reason}`);
    }
    const text = candidates[0]?.content?.parts
      ?.map((p) => ('text' in p ? p.text : ''))
      .join('')
      .trim();
    if (!text) {
      throw new ApiError('extraction_failed', 'Vertex returned empty text');
    }

    // Doc 06 §LLM-gateway step 3: parse, retry once on JSON failure.
    let parsed = await parseVisionPayload(text);
    if (!parsed.ok) {
      const retryParts = [
        ...userParts,
        {
          text: 'Your previous output was not valid JSON. Return only the JSON object matching the OUTPUT FORMAT, no Markdown fences, no commentary.',
        },
      ];
      try {
        const retry = await model.generateContent({
          contents: [{ role: 'user', parts: retryParts }],
        });
        const retryText = retry.response.candidates?.[0]?.content?.parts
          ?.map((p) => ('text' in p ? p.text : ''))
          .join('')
          .trim();
        if (retryText) parsed = await parseVisionPayload(retryText);
      } catch {
        // fall through with parsed.ok still false
      }
    }
    if (!parsed.ok) {
      throw new ApiError(
        'extraction_failed',
        `Vertex output failed JSON validation: ${parsed.error}`,
      );
    }

    return {
      ...parsed.value,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd_micros: costMicros,
        model: this.modelId,
        prompt_version: PROMPT_VERSION,
      },
    };
  }

  regenerateFromText(_input: RegenerateInput): Promise<RegenerateResult> {
    throw new ApiError('not_implemented', 'regenerateFromText lands in Slice D2');
  }

  evaluateAnswer(_input: EvaluateInput): Promise<EvaluateResult> {
    throw new ApiError('not_implemented', 'evaluateAnswer lands in Slice D2');
  }

  explain(_input: ExplainInput): Promise<ExplainResult> {
    throw new ApiError('not_implemented', 'explain lands in Slice D2');
  }
}
