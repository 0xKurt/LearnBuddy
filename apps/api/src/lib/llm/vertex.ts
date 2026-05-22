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
import { jsonrepair } from 'jsonrepair';

import type { Env } from '../env.js';
import { ApiError } from '../errors.js';
import { PROMPT_VERSION, SYSTEM_P1, buildP1UserPrompt } from '../../prompts/p1.js';
import { PROMPT_VERSION_P2, SYSTEM_P2, buildP2UserPrompt } from '../../prompts/p2.js';
import { PROMPT_VERSION_P4, SYSTEM_P4, buildP4UserPrompt } from '../../prompts/p4.js';
import {
  PROMPT_VERSION_REFLECT,
  SYSTEM_REFLECT,
  buildReflectUserPrompt,
} from '../../prompts/reflect.js';
import { ensureAgentCache } from './agent-cache.js';
import { parseRegeneratePayload, parseVisionPayload } from './postProcess.js';
import { isOpenAICompatModel, vertexOpenAIChat } from './vertex-openai.js';
import type {
  AgentGatewayInput,
  AgentGatewayResult,
  ExplainInput,
  ExplainResult,
  LLMGateway,
  ReflectSessionInput,
  ReflectSessionResult,
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

// Cached input tokens are billed at 25 % of the normal input rate per
// Google's context-caching pricing. promptTokenCount is the TOTAL
// input (cached + uncached); cachedContentTokenCount tells us how
// many of those were served from cache.
const CACHED_INPUT_DISCOUNT = 0.25;

let LOGGED_CACHE_USAGE_SHAPE = false;

type UsageTotals = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  costMicros: number;
};

function emptyUsage(): UsageTotals {
  return { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, costMicros: 0 };
}

function addUsage(totals: UsageTotals, meta?: GenerateContentResponseUsageMetadata): UsageTotals {
  const inputTokens = meta?.promptTokenCount ?? 0;
  const outputTokens = meta?.candidatesTokenCount ?? 0;
  const cachedTokens = meta?.cachedContentTokenCount ?? 0;
  const uncachedTokens = Math.max(0, inputTokens - cachedTokens);
  const costMicros =
    Math.round((uncachedTokens * PRICE_INPUT_MICROS_PER_M) / 1_000_000) +
    Math.round((cachedTokens * PRICE_INPUT_MICROS_PER_M * CACHED_INPUT_DISCOUNT) / 1_000_000) +
    Math.round((outputTokens * PRICE_OUTPUT_MICROS_PER_M) / 1_000_000);
  return {
    inputTokens: totals.inputTokens + inputTokens,
    outputTokens: totals.outputTokens + outputTokens,
    cachedInputTokens: totals.cachedInputTokens + cachedTokens,
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
  /** Used for non-vision text generation (regenerate / reflect). May be
   *  a partner MaaS id like `deepseek-ai/deepseek-v3.2-maas`. */
  private readonly modelId: string;
  /** Vision-only pin. Always a multimodal Gemini id — partner MaaS
   *  models have no vision endpoint. */
  private readonly visionModelId: string;
  /** Stronger tier for learner-facing tutoring/explain (ADR 0002).
   *  May be a partner MaaS id. */
  private readonly tutorModelId: string;

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
    this.visionModelId = env.VISION_MODEL_ID;
    this.tutorModelId = env.VERTEX_TUTOR_MODEL_ID;
  }

  async visionExtractAndGenerate(input: VisionInput): Promise<VisionResult> {
    if (input.images.length < 1 || input.images.length > 20) {
      throw new ApiError('validation_failed', 'images must be 1..20');
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
      model: this.visionModelId,
      contents: [{ role: 'user', parts: userParts }],
      config: {
        systemInstruction: SYSTEM_P1,
        safetySettings: SAFETY,
        // Quality-card extraction wants deterministic output. The prompt
        // is very rule-heavy and we want Gemini to follow the rules the
        // same way every time, not riff. 0.1 + 0.7 keeps generation
        // tight without choking on ties in token probability.
        temperature: 0.1,
        topP: 0.7,
        // 4096 tokens was clipping the response mid-string on real worksheets
        // (extracted_markdown + 5–10 items + diagrams + templates routinely
        // run 6–10k tokens). The clip surfaced to the user as "Verbindung
        // unterbrochen" because the JSON.parse failed and the worker bailed.
        // 8192 is Flash-Lite's output ceiling.
        maxOutputTokens: 8192,
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
        model: this.visionModelId,
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

    // Partner MaaS path (DeepSeek, Llama, …) — OpenAI-compatible
    // Chat Completions endpoint. P2 is text-only, so we can route it.
    if (isOpenAICompatModel(this.modelId)) {
      return this.regenerateOpenAICompat(userText);
    }

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

  /** Regenerate via Vertex OpenAI-compatible endpoint (DeepSeek et al).
   *  Same input contract, but no Gemini SDK features (no safetySettings,
   *  no systemInstruction kwarg — system goes in the messages array). */
  private async regenerateOpenAICompat(userText: string): Promise<RegenerateResult> {
    const project = this.env.GOOGLE_CLOUD_PROJECT!;
    const location = this.env.PARTNER_MODEL_LOCATION;
    const completion = await vertexOpenAIChat({
      project,
      location,
      body: {
        model: this.modelId,
        messages: [
          { role: 'system', content: SYSTEM_P2 },
          { role: 'user', content: userText },
        ],
        temperature: 0.5,
        top_p: 0.95,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      },
    });
    const text = completion.choices[0]?.message.content ?? '';
    if (!text) {
      throw new ApiError('extraction_failed', `Partner LLM (${this.modelId}) returned empty`);
    }
    const parsed = await parseRegeneratePayload(text);
    if (!parsed.ok) {
      throw new ApiError('extraction_failed', `Regenerate JSON invalid: ${parsed.error}`);
    }
    const u = completion.usage ?? {};
    const inputTokens = u.prompt_tokens ?? 0;
    const cachedTokens = u.prompt_cache_hit_tokens ?? 0;
    const outputTokens = u.completion_tokens ?? 0;
    // Cost is unknown without provider-specific pricing — leave at 0
    // and trust the per-model dashboard for the actual bill. We could
    // hardcode DeepSeek's $0.56/$1.68 here but ledger consumers
    // (admin spend page) treat 0 as "n/a" rather than misleading data.
    return {
      items: parsed.value.items,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cached_input_tokens: cachedTokens,
        cost_usd_micros: 0,
        model: this.modelId,
        prompt_version: PROMPT_VERSION_P2,
      },
    };
  }

  async explain(input: ExplainInput): Promise<ExplainResult> {
    const userText = buildP4UserPrompt({
      locale: input.locale,
      gradeLevel: input.gradeLevel,
      style: input.style,
      context: input.context,
      materialContext: input.materialContext,
      topic: input.topic,
    });
    let response: GenerateContentResponse;
    try {
      response = await this.client.models.generateContent({
        model: this.tutorModelId,
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
        model: this.tutorModelId,
        prompt_version: PROMPT_VERSION_P4,
      },
    };
  }

  /** Post-session reflective summary. Cheap JSON-mode call.
   *  Fails open: on any error, return a minimal episode so the next
   *  session at least gets the duration / concepts and the opener
   *  template can still pick a variant. */
  async reflectSession(input: ReflectSessionInput): Promise<ReflectSessionResult> {
    const userText = buildReflectUserPrompt(input);
    let response: GenerateContentResponse;
    try {
      response = await this.client.models.generateContent({
        model: this.modelId,
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        config: {
          systemInstruction: SYSTEM_REFLECT,
          safetySettings: SAFETY,
          temperature: 0.3,
          topP: 0.9,
          maxOutputTokens: 800,
          responseMimeType: 'application/json',
        },
      });
    } catch (err) {
      return reflectFallback(
        `Vertex reflect failed: ${err instanceof Error ? err.message : String(err)}`,
        input,
        this.modelId,
      );
    }
    const totals = addUsage(emptyUsage(), response.usageMetadata);
    const text = responseText(response).trim();
    if (!text) return reflectFallback('empty reflect response', input, this.modelId);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      // jsonrepair would be defensive here but reflect output is small;
      // a malformed payload is unusual. Fall back to a minimal episode
      // rather than block the session-finish path.
      return reflectFallback(
        `reflect JSON.parse failed: ${text.slice(0, 80)}`,
        input,
        this.modelId,
      );
    }
    const v = parsed;
    return {
      one_sentence_arc: asString(v.one_sentence_arc, 'Session abgeschlossen.'),
      concepts_touched: asStringArray(v.concepts_touched),
      high_points: asStringArray(v.high_points),
      low_points: asStringArray(v.low_points),
      hypothesized_misconceptions: asMisconceptions(v.hypothesized_misconceptions),
      open_questions: asStringArray(v.open_questions),
      usage: {
        input_tokens: totals.inputTokens,
        output_tokens: totals.outputTokens,
        cost_usd_micros: totals.costMicros,
        model: this.modelId,
        prompt_version: PROMPT_VERSION_REFLECT,
      },
    };
  }

  async ensureAgentHeaderCache(header: string, model: string): Promise<string | null> {
    // Vertex context caching is Gemini-only — partner MaaS models
    // (DeepSeek, Llama, …) don't have a cachedContents endpoint at
    // all. Return null so the agent route falls through to the
    // non-cached path; the partner's own prompt-prefix caching (e.g.
    // DeepSeek's automatic 64-token-aligned cache) kicks in for free.
    if (isOpenAICompatModel(model)) return null;
    return ensureAgentCache(this.client, header, model);
  }

  /** Agent v2/v3 — one JSON reply per learner message. */
  async agentTurn(
    input: AgentGatewayInput,
    onToken?: (delta: string) => void,
  ): Promise<AgentGatewayResult> {
    // Pick the model — caller may override (e.g. flash-lite for
    // trivial advance turns). Default is the tutor tier.
    const modelToUse = input.modelOverride ?? this.tutorModelId;

    // Partner MaaS path (DeepSeek, Llama, …) — OpenAI-compatible
    // Chat Completions. No Gemini-specific features (no cachedContent,
    // no safetySettings, system goes in messages array).
    if (isOpenAICompatModel(modelToUse)) {
      return this.agentTurnOpenAICompat(input, modelToUse, onToken);
    }

    const contents = [
      ...input.history.map((m) => ({
        role: m.role === 'learner' ? ('user' as const) : ('model' as const),
        parts: [{ text: m.content }],
      })),
      { role: 'user' as const, parts: [{ text: input.learnerMessage }] },
    ];

    // When the static header is served via a Vertex cached-content
    // ref, we MUST omit the systemInstruction field — Vertex rejects
    // a request that has both. The cache already carries the
    // system instruction, and the dynamic per-turn context goes in
    // as the first user-role content turn so the model has it.
    const useCache = !!input.headerCacheName;
    const contentsWithDynamic = useCache
      ? [
          {
            role: 'user' as const,
            parts: [{ text: `[per-turn context]\n${input.systemInstruction}` }],
          },
          ...contents,
        ]
      : contents;

    let response: GenerateContentResponse;
    try {
      response = await this.client.models.generateContent({
        model: modelToUse,
        contents: contentsWithDynamic,
        config: {
          ...(useCache
            ? { cachedContent: input.headerCacheName! }
            : { systemInstruction: input.systemInstruction }),
          safetySettings: SAFETY,
          temperature: 0.4,
          topP: 0.9,
          maxOutputTokens: 800,
          responseMimeType: 'application/json',
        },
      });
    } catch (err) {
      throw new ApiError(
        'evaluation_failed',
        `Vertex agentTurn failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // One-time peek at the usage shape when caching is active —
    // helps spot whether Vertex actually attributes cached tokens
    // on every call vs only on first reference. Only logs once per
    // process, via the module-level flag.
    if (useCache && !LOGGED_CACHE_USAGE_SHAPE) {
      LOGGED_CACHE_USAGE_SHAPE = true;
      console.warn(`[agent] usageMetadata sample: ${JSON.stringify(response.usageMetadata)}`);
    }

    const totals = addUsage(emptyUsage(), response.usageMetadata);
    const text = responseText(response);
    if (!text) {
      throw new ApiError('evaluation_failed', 'Vertex agentTurn returned empty text');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      // Common Vertex failure mode on conversational replies: the model
      // gets cut off mid-string (token limit, mid-stream hiccup, safety
      // truncation) so the JSON ends with an open string and no closing
      // brace. jsonrepair closes the dangling string and adds the missing
      // structural chars — the downstream parser (parseAgentJson) already
      // tolerates missing fields with a safe fallback, so a partial reply
      // is still way better than a hard fail.
      try {
        const repaired = jsonrepair(text);
        parsed = JSON.parse(repaired);
      } catch {
        throw new ApiError(
          'evaluation_failed',
          `Vertex agentTurn JSON parse failed: ${err instanceof Error ? err.message : String(err)}; raw="${text.slice(0, 200)}"`,
        );
      }
    }

    const reply =
      parsed &&
      typeof parsed === 'object' &&
      'reply' in parsed &&
      typeof (parsed as { reply: unknown }).reply === 'string'
        ? (parsed as { reply: string }).reply.trim()
        : '';
    if (reply && onToken) onToken(reply);

    return {
      json: parsed,
      reply,
      usage: {
        input_tokens: totals.inputTokens,
        output_tokens: totals.outputTokens,
        cached_input_tokens: totals.cachedInputTokens,
        cost_usd_micros: totals.costMicros,
        model: modelToUse,
        prompt_version: 'agent.v2.0',
      },
    };
  }

  /** Agent turn via Vertex OpenAI-compatible endpoint (DeepSeek et al).
   *  Cannot use Vertex context caching (Gemini-only feature) — the
   *  cached header is sent as a regular system message and the
   *  partner provider's native prompt caching (DeepSeek caches
   *  long static prefixes automatically) kicks in instead. */
  private async agentTurnOpenAICompat(
    input: AgentGatewayInput,
    modelToUse: string,
    onToken?: (delta: string) => void,
  ): Promise<AgentGatewayResult> {
    const project = this.env.GOOGLE_CLOUD_PROJECT!;
    const location = this.env.PARTNER_MODEL_LOCATION;

    // OpenAI shape: system → user → assistant → user → … We fold the
    // full system instruction into a single system message. When the
    // caller passed `headerCacheName` they ALSO sent the dynamic
    // portion as `systemInstruction` (see agent.ts route) — for the
    // partner path we just concatenate them since there's no cache
    // reference to honour.
    const systemContent = input.systemInstruction;
    const messages = [
      { role: 'system' as const, content: systemContent },
      ...input.history.map((m) => ({
        role: m.role === 'learner' ? ('user' as const) : ('assistant' as const),
        content: m.content,
      })),
      { role: 'user' as const, content: input.learnerMessage },
    ];

    const completion = await vertexOpenAIChat({
      project,
      location,
      body: {
        model: modelToUse,
        messages,
        temperature: 0.4,
        top_p: 0.9,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      },
    });

    const text = completion.choices[0]?.message.content ?? '';
    if (!text) {
      throw new ApiError(
        'evaluation_failed',
        `Partner LLM (${modelToUse}) agentTurn returned empty text`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      try {
        parsed = JSON.parse(jsonrepair(text));
      } catch {
        throw new ApiError(
          'evaluation_failed',
          `Partner agentTurn JSON parse failed: ${
            err instanceof Error ? err.message : String(err)
          }; raw="${text.slice(0, 200)}"`,
        );
      }
    }

    const reply =
      parsed &&
      typeof parsed === 'object' &&
      'reply' in parsed &&
      typeof (parsed as { reply: unknown }).reply === 'string'
        ? (parsed as { reply: string }).reply.trim()
        : '';
    if (reply && onToken) onToken(reply);

    const u = completion.usage ?? {};
    const inputTokens = u.prompt_tokens ?? 0;
    const cachedInputTokens = u.prompt_cache_hit_tokens ?? 0;
    const outputTokens = u.completion_tokens ?? 0;
    return {
      json: parsed,
      reply,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cached_input_tokens: cachedInputTokens,
        // See regenerateOpenAICompat — partner cost left at 0; the
        // GCP billing dashboard is the source of truth here.
        cost_usd_micros: 0,
        model: modelToUse,
        prompt_version: 'agent.v2.0',
      },
    };
  }
}

// ── reflect helpers ────────────────────────────────────────────────

function reflectFallback(
  reason: string,
  input: ReflectSessionInput,
  modelId: string,
): ReflectSessionResult {
  console.warn(`[reflect] falling back: ${reason}`);
  // Best-effort minimal episode so the next session at least has
  // duration + a generic arc. Topics are inferred from the
  // transcript's item_topic values.
  const topics = Array.from(
    new Set(input.transcript.map((t) => t.item_topic).filter((x): x is string => !!x)),
  );
  return {
    one_sentence_arc: `Session über ${input.durationMinutes} Min. mit ${topics.length || 'einigen'} Themen.`,
    concepts_touched: topics,
    high_points: [],
    low_points: [],
    hypothesized_misconceptions: [],
    open_questions: [],
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cost_usd_micros: 0,
      model: modelId,
      prompt_version: PROMPT_VERSION_REFLECT,
    },
  };
}

function asString(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : fallback;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim());
}

function asMisconceptions(v: unknown): ReflectSessionResult['hypothesized_misconceptions'] {
  if (!Array.isArray(v)) return [];
  const out: ReflectSessionResult['hypothesized_misconceptions'] = [];
  for (const x of v) {
    if (typeof x !== 'object' || x === null) continue;
    const r = x as Record<string, unknown>;
    const tag = typeof r.concept_tag === 'string' ? r.concept_tag.trim() : '';
    const desc = typeof r.description === 'string' ? r.description.trim() : '';
    const conf =
      typeof r.confidence === 'number' && r.confidence >= 0 && r.confidence <= 1 ? r.confidence : 0;
    // Drop low-confidence + empty entries — the prompt forbids them
    // but the model can disregard, so we enforce.
    if (!tag || !desc || conf < 0.6) continue;
    out.push({ concept_tag: tag, description: desc, confidence: conf });
  }
  return out;
}
