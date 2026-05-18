// Vertex AI Gemini implementation of LLMGateway. Doc 06 §provider-configuration.
//
// Slice D1 shipped the first wired-up call (vision). D1.5 wires the diagram
// pipeline so vision items with `stimulus_kind='study_asset'` and
// `answer_kind='diagram_label'` are kept and resolved to real study_asset
// ids in routes/materials.ts (this file leaves the placeholder pointer in
// stimulus_data.study_asset_id and trusts the route to rewrite it).
//
// SDK migration (Slice D2 follow-up #50): we use @google/genai with the
// Vertex backend (vertexai: true, project, location). The old
// @google-cloud/vertexai package is sunset on 2026-06-24 and not used here.
//
// Auth: relies on Google Application Default Credentials (ADC). Either
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json (local dev) or
//   GOOGLE_APPLICATION_CREDENTIALS_JSON='{...}' (Vercel, bootstrapped to a
//   tempfile in lib/llm/factory.ts).
//
// JSON output: Gemini 2.5 supports responseMimeType="application/json". We
// still parse defensively (Doc 06 §3 says "retry once on parse failure with
// the message: Your previous output was not valid JSON"). When we do retry,
// the retry call's tokens are summed into the returned `usage` so the credit
// ledger doesn't under-count (fixes follow-up #50).

import {
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  type GenerateContentParameters,
  type GenerateContentResponse,
  type GenerateContentResponseUsageMetadata,
  type Part,
  type SafetySetting,
} from '@google/genai';

import type { Env } from '../env.js';
import { ApiError } from '../errors.js';
import { PROMPT_VERSION, SYSTEM_P1, buildP1UserPrompt } from '../../prompts/p1.js';
import { PROMPT_VERSION_P2, SYSTEM_P2, buildP2UserPrompt } from '../../prompts/p2.js';
import { PROMPT_VERSION_P3, SYSTEM_P3, buildP3UserPrompt } from '../../prompts/p3.js';
import { PROMPT_VERSION_P4, SYSTEM_P4, buildP4UserPrompt } from '../../prompts/p4.js';
import { parseRegeneratePayload, parseVisionPayload } from './postProcess.js';
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
const SAFETY: SafetySetting[] = [
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

type UsageTotals = {
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
};

function emptyUsage(): UsageTotals {
  return { inputTokens: 0, outputTokens: 0, costMicros: 0 };
}

function addUsage(totals: UsageTotals, meta?: GenerateContentResponseUsageMetadata): UsageTotals {
  const inputTokens = meta?.promptTokenCount ?? 0;
  const outputTokens = meta?.candidatesTokenCount ?? 0;
  const costMicros =
    Math.round((inputTokens * PRICE_INPUT_MICROS_PER_M) / 1_000_000) +
    Math.round((outputTokens * PRICE_OUTPUT_MICROS_PER_M) / 1_000_000);
  return {
    inputTokens: totals.inputTokens + inputTokens,
    outputTokens: totals.outputTokens + outputTokens,
    costMicros: totals.costMicros + costMicros,
  };
}

function responseText(response: GenerateContentResponse): string {
  const t = response.text;
  if (typeof t === 'string') return t.trim();
  // Defensive fallback: walk candidates → parts → text.
  const candidates = response.candidates ?? [];
  const text = candidates[0]?.content?.parts
    ?.map((p) => (typeof p?.text === 'string' ? p.text : ''))
    .join('')
    .trim();
  return text ?? '';
}

export class VertexLlmGateway implements LLMGateway {
  private readonly client: GoogleGenAI;
  private readonly modelId: string;

  constructor(private readonly env: Env) {
    if (!env.GOOGLE_CLOUD_PROJECT) {
      throw new Error(
        'VertexLlmGateway requires GOOGLE_CLOUD_PROJECT — did you forget to set it in .env.local?',
      );
    }
    this.client = new GoogleGenAI({
      vertexai: true,
      project: env.GOOGLE_CLOUD_PROJECT,
      location: env.GOOGLE_VERTEX_LOCATION,
    });
    this.modelId = env.VERTEX_MODEL_ID;
  }

  async visionExtractAndGenerate(input: VisionInput): Promise<VisionResult> {
    if (input.images.length < 1 || input.images.length > 10) {
      throw new ApiError('validation_failed', 'images must be 1..10');
    }
    const userText = buildP1UserPrompt({
      locale: input.locale,
      gradeLevel: input.gradeLevel,
      subject: input.subject,
      subjectKind: input.subjectKind,
    });

    const userParts: Part[] = [
      { text: userText },
      ...input.images.map<Part>((img) => ({
        inlineData: { mimeType: img.mimeType, data: img.data },
      })),
    ];

    const params: GenerateContentParameters = {
      model: this.modelId,
      contents: [{ role: 'user', parts: userParts }],
      config: {
        systemInstruction: SYSTEM_P1,
        safetySettings: SAFETY,
        temperature: 0.4,
        topP: 0.95,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    };

    let totals = emptyUsage();
    let response: GenerateContentResponse;
    try {
      response = await this.client.models.generateContent(params);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ApiError('extraction_failed', `Vertex call failed: ${msg}`);
    }
    totals = addUsage(totals, response.usageMetadata);

    // Safety blocked all candidates → no text. Doc 06 §failure-modes-and-refunds.
    const candidates = response.candidates ?? [];
    if (candidates.length === 0) {
      const reason = response.promptFeedback?.blockReason ?? 'no_candidates';
      throw new ApiError('extraction_failed', `Vertex returned no candidates: ${reason}`);
    }
    const text = responseText(response);
    if (!text) {
      throw new ApiError('extraction_failed', 'Vertex returned empty text');
    }

    // Doc 06 §LLM-gateway step 3: parse, retry once on JSON failure.
    // D1.5: keep diagram items — the route will resolve study_asset ids.
    let parsed = await parseVisionPayload(text, { dropDiagrams: false });
    if (!parsed.ok) {
      const retryParts: Part[] = [
        ...userParts,
        {
          text: 'Your previous output was not valid JSON. Return only the JSON object matching the OUTPUT FORMAT, no Markdown fences, no commentary.',
        },
      ];
      try {
        const retry = await this.client.models.generateContent({
          ...params,
          contents: [{ role: 'user', parts: retryParts }],
        });
        // Follow-up #50: bill the retry's tokens too.
        totals = addUsage(totals, retry.usageMetadata);
        const retryText = responseText(retry);
        if (retryText) parsed = await parseVisionPayload(retryText, { dropDiagrams: false });
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
        input_tokens: totals.inputTokens,
        output_tokens: totals.outputTokens,
        cost_usd_micros: totals.costMicros,
        model: this.modelId,
        prompt_version: PROMPT_VERSION,
      },
    };
  }

  async regenerateFromText(input: RegenerateInput): Promise<RegenerateResult> {
    const userText = buildP2UserPrompt({
      locale: input.locale,
      gradeLevel: input.gradeLevel,
      subject: input.subject,
      subjectKind: input.subjectKind,
      style: input.style ?? null,
      extractedMarkdown: input.extractedMarkdown,
      existingQuestionStems: input.excludeQuestions,
    });
    let response: GenerateContentResponse;
    try {
      response = await this.client.models.generateContent({
        model: this.modelId,
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        config: {
          systemInstruction: SYSTEM_P2,
          safetySettings: SAFETY,
          temperature: 0.5,
          topP: 0.95,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      });
    } catch (err) {
      throw new ApiError(
        'extraction_failed',
        `Vertex regenerate failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const totals = addUsage(emptyUsage(), response.usageMetadata);
    const text = responseText(response);
    if (!text) throw new ApiError('extraction_failed', 'Vertex regenerate returned empty');
    const parsed = await parseRegeneratePayload(text);
    if (!parsed.ok) {
      throw new ApiError('extraction_failed', `Regenerate JSON invalid: ${parsed.error}`);
    }
    return {
      items: parsed.value.items,
      usage: {
        input_tokens: totals.inputTokens,
        output_tokens: totals.outputTokens,
        cost_usd_micros: totals.costMicros,
        model: this.modelId,
        prompt_version: PROMPT_VERSION_P2,
      },
    };
  }

  async evaluateAnswer(input: EvaluateInput): Promise<EvaluateResult> {
    const userText = buildP3UserPrompt({
      locale: input.locale,
      gradeLevel: input.gradeLevel,
      question: input.question,
      expectedAnswer: input.expectedAnswer,
      acceptableAnswers: input.acceptableAnswers,
      answerKind: input.answerKind,
      kidAnswer: input.kidAnswer,
      parsedKidLatex: input.parsedLearnerLatex,
      priorHints: input.priorHints,
    });
    let response: GenerateContentResponse;
    try {
      response = await this.client.models.generateContent({
        model: this.modelId,
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        config: {
          systemInstruction: SYSTEM_P3,
          safetySettings: SAFETY,
          temperature: 0.2,
          topP: 0.9,
          maxOutputTokens: 512,
          responseMimeType: 'application/json',
        },
      });
    } catch (err) {
      throw new ApiError(
        'evaluation_failed',
        `Vertex evaluate failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const totals = addUsage(emptyUsage(), response.usageMetadata);
    const text = responseText(response);
    if (!text) throw new ApiError('evaluation_failed', 'Vertex evaluate returned empty');
    let body: { verdict: string; feedback: string; next_hint: string | null };
    try {
      body = JSON.parse(text.replace(/^```(?:json)?\s*/u, '').replace(/```\s*$/u, ''));
    } catch (err) {
      throw new ApiError(
        'evaluation_failed',
        `Evaluate JSON parse: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!['correct', 'partially_correct', 'incorrect'].includes(body.verdict)) {
      throw new ApiError('evaluation_failed', `Invalid verdict: ${body.verdict}`);
    }
    return {
      verdict: body.verdict as 'correct' | 'partially_correct' | 'incorrect',
      feedback: body.feedback,
      next_hint: body.next_hint ?? null,
      usage: {
        input_tokens: totals.inputTokens,
        output_tokens: totals.outputTokens,
        cost_usd_micros: totals.costMicros,
        model: this.modelId,
        prompt_version: PROMPT_VERSION_P3,
      },
    };
  }

  async explain(input: ExplainInput): Promise<ExplainResult> {
    const userText = buildP4UserPrompt({
      locale: input.locale,
      gradeLevel: input.gradeLevel,
      style: input.style,
      context: input.context,
      topic: input.topic,
    });
    let response: GenerateContentResponse;
    try {
      response = await this.client.models.generateContent({
        model: this.modelId,
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        config: {
          systemInstruction: SYSTEM_P4,
          safetySettings: SAFETY,
          temperature: 0.5,
          topP: 0.95,
          maxOutputTokens: 400,
        },
      });
    } catch (err) {
      throw new ApiError(
        'evaluation_failed',
        `Vertex explain failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const totals = addUsage(emptyUsage(), response.usageMetadata);
    const text = responseText(response);
    if (!text) throw new ApiError('evaluation_failed', 'Vertex explain returned empty');
    return {
      text,
      usage: {
        input_tokens: totals.inputTokens,
        output_tokens: totals.outputTokens,
        cost_usd_micros: totals.costMicros,
        model: this.modelId,
        prompt_version: PROMPT_VERSION_P4,
      },
    };
  }
}
