// Vertex AI (Gemini, EU region) implementation of the model seam.
//
// One call = one structured JSON answer (responseMimeType + responseJsonSchema).
// Bounded by a timeout, an output token cap and an explicit thinking budget
// (thinking tokens count as output and are billed as such). A short outage or a
// throttle is retried INSIDE that timeout (retry.ts, issues #167 and #206) —
// never beyond it; anything else is handed to the caller as it came.

import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ApiError as GenAiApiError,
  FinishReason,
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  MediaModality,
  ThinkingLevel,
  type GenerateContentResponse,
  type SafetySetting,
} from '@google/genai';

import type { Config } from '../config.js';
import { outcomeOfStatus } from '../lib/outcome.js';
import { LlmError, type LlmRequest, type LlmResult, type LlmUsage, TRUNCATED } from './gateway.js';
import { repairJsonStrings } from './latex.js';
import { costMicros, VERTEX_EU_PRICES } from './pricing.js';
import { assertMedia, type GatewayProfile, type Thinking } from './profile.js';
import { RetryingGateway } from './retry.js';
import { MAX_SCHEMA_PROPERTIES } from './schemaBudget.js';

/**
 * What Gemini on Vertex accepts (#646): every media kind in the same call as structured output,
 * every keyword our schemas use (`$ref` would be expanded before billing, so we send none),
 * properties written in declared order, JSON streamed while it is written, and the property bound
 * measured on `eu/gemini-3.6-flash` (#627, `schemaBudget.ts`).
 */
export const VERTEX_PROFILE: GatewayProfile = {
  name: 'vertex',
  media: new Set(['image', 'pdf', 'audio']),
  // "The total request size limit is 20 MB" for inline data, sent base64 (Vertex AI Gemini input
  // file requirements, read 16.10.2026, #688).
  maxInlineBytes: 20_000_000,
  acceptedMimeTypes: new Set([
    'image/jpeg',
    'image/png',
    'application/pdf',
    'audio/mp4',
    'audio/m4a',
    'audio/mpeg',
    'audio/wav',
    'audio/webm',
    'audio/aac',
  ]),
  // Application limit: one material has at most 20 pages.
  maxImages: 20,
  cache: 'implicit',
  repairJsonStrings: true,
  prices: VERTEX_EU_PRICES,
  structuredOutput: {
    keywords: new Set([
      'type',
      'description',
      'enum',
      'items',
      'anyOf',
      'properties',
      'additionalProperties',
      'required',
    ]),
    keepsPropertyOrder: true,
    streamsPartialJson: true,
    maxSchemaProperties: MAX_SCHEMA_PROPERTIES,
    maxSchemaDepth: Number.POSITIVE_INFINITY,
    maxEnumValues: Number.POSITIVE_INFINITY,
    maxSchemaStringChars: Number.POSITIVE_INFINITY,
    largeEnumThreshold: Number.POSITIVE_INFINITY,
    maxLargeEnumChars: Number.POSITIVE_INFINITY,
  },
};

// Children use the app: strict on sexual content, medium elsewhere.
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

/** The service account (inline JSON on Vercel) as a file for Google's client libraries; shared with speech/google.ts. */
export function ensureCredentialsFile(config: Config): void {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS || !config.GOOGLE_APPLICATION_CREDENTIALS_JSON)
    return;
  const path = join(tmpdir(), 'learnbuddy-vertex-sa.json');
  writeFileSync(path, config.GOOGLE_APPLICATION_CREDENTIALS_JSON, { mode: 0o600 });
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path;
}

/** What one call cost, read from the provider's own numbers. Exported for unit tests. */
export function usageOf(
  model: string,
  response: GenerateContentResponse | null,
  latencyMs: number,
): LlmUsage {
  const meta = response?.usageMetadata;
  const inputTokens = meta?.promptTokenCount ?? 0;
  const outputTokens = meta?.candidatesTokenCount ?? 0;
  const thoughtTokens = meta?.thoughtsTokenCount ?? 0;
  // Implicit caching: how much of the prompt Gemini recognised from an earlier request
  // (issue #25). Part of promptTokenCount, and only reported when it happened — so
  // cost_micros stays the full price and this is the number that shows the saving, not
  // a discount we assume (rule 5, docs/architecture.md §Speed).
  const cachedTokens = meta?.cachedContentTokenCount ?? 0;
  // Audio input is billed apart on some models (3.1 Flash-Lite: twice the text price, #648):
  // the provider's modality split of the prompt says how much of it was audio.
  const audioInputTokens = (meta?.promptTokensDetails ?? [])
    .filter((d) => d.modality === MediaModality.AUDIO)
    .reduce((n, d) => n + (d.tokenCount ?? 0), 0);
  return {
    model,
    inputTokens,
    outputTokens,
    thoughtTokens,
    cachedTokens,
    costMicros: costMicros(VERTEX_EU_PRICES, model, {
      inputTokens,
      audioInputTokens,
      outputTokens,
      thoughtTokens,
    }),
    latencyMs,
  };
}

/** "eu/gemini-3.1-flash-lite" → location eu; a bare model id uses the default location. */
export function splitModelSpec(spec: string, defaultLocation: string) {
  const i = spec.indexOf('/');
  return i < 0
    ? { location: defaultLocation, model: spec }
    : { location: spec.slice(0, i), model: spec.slice(i + 1) };
}

/**
 * Measured defaults per task, where a task does better on another model than its tier's
 * (docs/architecture.md §Model calls). VERTEX_ROUTES overrides them.
 * - pronounce: 3.1 Flash-Lite judged as strictly as 3.6 Flash (German accent and a wrong
 *   word "retry" 3/3) at ~0.09 instead of ~0.2 cents per sentence (evals/speak, 2026-09-26).
 */
const DEFAULT_ROUTES: Partial<Record<LlmRequest['purpose'], string>> = {
  pronounce: 'eu/gemini-3.1-flash-lite',
};

/** The model spec a request runs on: explicit route → measured default → the tier's model. */
export function modelFor(config: Config, req: Pick<LlmRequest, 'purpose' | 'tier'>): string {
  // The canary (#650) runs where Buddy's turn runs: the call every learner makes first.
  const purpose = req.purpose === 'canary' ? 'buddy_turn' : req.purpose;
  return (
    config.VERTEX_ROUTES[purpose] ??
    DEFAULT_ROUTES[purpose] ??
    (req.tier === 'smart' ? config.VERTEX_MODEL_SMART : config.VERTEX_MODEL_FAST)
  );
}

/**
 * Models that take only a thinking level, never a budget (#647, Vertex docs read 14.10.2026, KI-Audit
 * F §2): from Gemini 3.8 Flash and Gemini 4 a budget can be refused with 400 INVALID_ARGUMENT, and
 * 3.8 has no MINIMAL ("will return an API validation error") and no way to switch thinking off —
 * LOW is its least. Every level goes out as LOW (measured #647, `docs/decisions/provider-2026-10.md`):
 * at the old budget's levels, MEDIUM/HIGH, a sheet reading took 68-86 s and ~10k thought tokens
 * instead of 16-19 s, and the practice run timed out; LOW kept the content judge's findings level.
 */
const levelsOnly = (model: string): boolean => /^gemini-(3\.8|[4-9])/.test(model);

/**
 * A neutral thinking level as Vertex takes it (#646). `minimal` is Gemini 3's own level: a budget
 * is only a hint there, and Buddy's turn at 512 was measured thinking up to 885 tokens, the first
 * byte waiting for every one of them (#626). The others are the budgets the call sites sent before
 * the contract was neutral, so the wire stays as it was: off 0, low 512, medium 1024, high 2048.
 */
function thinkingConfigOf(thinking: Thinking, model: string) {
  if (levelsOnly(model)) return { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } };
  switch (thinking) {
    case 'minimal':
      return { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } };
    case 'off':
      return { thinkingConfig: { thinkingBudget: 0 } };
    case 'low':
      return { thinkingConfig: { thinkingBudget: 512 } };
    case 'medium':
      return { thinkingConfig: { thinkingBudget: 1024 } };
    case 'high':
      return { thinkingConfig: { thinkingBudget: 2048 } };
  }
}

/**
 * The one request the provider SDK is handed for a call (exported for the wire test,
 * `__tests__/vertex-request.test.ts`). Structured output goes out as `responseMimeType` +
 * `responseJsonSchema`: the Vertex discovery document marks both as deprecated in favour of
 * `response_format`, but no `@google/genai` release up to 2.27.0 has that field on
 * `GenerateContentConfig`, and its Vertex converter drops it without a word — so it cannot be
 * sent from here yet (issue #283, docs/architecture.md §Model calls).
 */
export function paramsFor(req: LlmRequest, model: string, timeoutMs: number) {
  return {
    model,
    contents: req.contents,
    config: {
      systemInstruction: req.system,
      temperature: req.temperature,
      maxOutputTokens: req.maxOutputTokens,
      responseMimeType: 'application/json',
      responseJsonSchema: req.schema,
      safetySettings: SAFETY,
      ...thinkingConfigOf(req.thinking, model),
      // Not req.timeoutMs: that is the budget for the whole call including retries, and
      // this attempt only gets what is left of it (retry.ts). The caller's own signal (#684)
      // ends it too.
      abortSignal: req.signal
        ? AbortSignal.any([AbortSignal.timeout(timeoutMs), req.signal])
        : AbortSignal.timeout(timeoutMs),
    },
  };
}

export class VertexGateway extends RetryingGateway {
  readonly available = true;
  readonly profile = VERTEX_PROFILE;
  /** One client per location (the EU multi-region "eu" serves models europe-west4 doesn't). */
  private readonly clients = new Map<string, GoogleGenAI>();

  constructor(
    private readonly config: Config,
    private readonly createClient?: (location: string) => GoogleGenAI,
  ) {
    super();
    ensureCredentialsFile(config);
  }

  private clientFor(location: string): GoogleGenAI {
    let c = this.clients.get(location);
    if (!c) {
      c =
        this.createClient?.(location) ??
        new GoogleGenAI({
          vertexai: true,
          project: this.config.GOOGLE_CLOUD_PROJECT,
          location,
        });
      this.clients.set(location, c);
    }
    return c;
  }

  /** One single call to the provider, bounded by the slice of the budget it was given. */
  protected async attempt(req: LlmRequest, timeoutMs: number): Promise<LlmResult> {
    assertMedia(this.profile, req);
    const { location, model } = splitModelSpec(
      modelFor(this.config, req),
      this.config.GOOGLE_VERTEX_LOCATION,
    );
    const started = Date.now();
    let response: GenerateContentResponse;
    const params = paramsFor(req, model, timeoutMs);
    let streamedText: string | null = null;
    let receipt: GenerateContentResponse | null = null;
    const abort = () => {
      if (params.config.abortSignal.aborted)
        throw new LlmError(
          req.signal?.aborted ? 'cancelled' : 'timeout',
          'model call stopped',
          receipt ? usageOf(model, receipt, Date.now() - started) : null,
        );
    };
    try {
      if (req.onPartial) {
        // The same call, streamed: the text so far goes to onPartial; the last chunk
        // carries the finish reason and the usage.
        let last: GenerateContentResponse | null = null;
        let text = '';
        for await (const chunk of await this.clientFor(location).models.generateContentStream(
          params,
        )) {
          if (chunk.usageMetadata) receipt = chunk;
          abort();
          // A trailing usage-only chunk must not erase the final candidate/finish reason.
          if (chunk.candidates?.length) last = chunk;
          const blocked = chunk.candidates?.[0]?.finishReason;
          if (blocked && blocked !== FinishReason.STOP && blocked !== FinishReason.MAX_TOKENS)
            continue;
          const piece = chunk.text;
          if (piece) {
            text += piece;
            req.onPartial(text);
            abort();
          }
        }
        if (!last) throw new LlmError('blocked', 'no candidate returned');
        response = last;
        streamedText = text;
        if (!last.candidates?.[0]?.finishReason)
          throw new LlmError(
            'invalid_output',
            'stream ended without a finish reason',
            receipt ? usageOf(model, receipt, Date.now() - started) : null,
          );
      } else {
        response = await this.clientFor(location).models.generateContent(params);
        receipt = response;
      }
      abort();
    } catch (err) {
      abort();
      const failure = err instanceof LlmError ? err : classify(err);
      throw new LlmError(
        failure.kind,
        failure.message,
        receipt ? usageOf(model, receipt, Date.now() - started) : failure.usage,
        failure.finishReason,
      );
    }
    const usage = usageOf(model, receipt, Date.now() - started);

    const candidate = response.candidates?.[0];
    if (!candidate) throw new LlmError('blocked', 'no candidate returned', usage);
    const reason = candidate.finishReason;
    if (reason === FinishReason.MAX_TOKENS) {
      throw new LlmError('invalid_output', 'output truncated at the token limit', usage, TRUNCATED);
    }
    if (reason && reason !== FinishReason.STOP) {
      throw new LlmError('blocked', `finish reason ${reason}`, usage, String(reason));
    }
    const text = streamedText ?? response.text;
    if (typeof text !== 'string' || text.trim() === '') {
      throw new LlmError('invalid_output', 'empty output', usage);
    }
    try {
      return {
        json: this.profile.repairJsonStrings
          ? repairJsonStrings(JSON.parse(text))
          : JSON.parse(text),
        usage,
      };
    } catch {
      throw new LlmError('invalid_output', 'output is not valid JSON', usage);
    }
  }
}

/** Provider errors → the shared outcome classes (lib/outcome.ts). Exported for unit tests. */
export function classify(err: unknown): LlmError {
  if (err instanceof GenAiApiError) {
    if (err.status === 429) return new LlmError('rate_limited', 'provider rate limit');
    if (outcomeOfStatus(err.status) === 'transient')
      return new LlmError('unavailable', `provider error ${err.status}`);
    // A definitive "no" to the request itself (bad schema, bad argument, no permission):
    // the same request fails the same way, so it is not retried. The provider's reason is
    // kept for the logs, cut short.
    return new LlmError(
      'refused',
      `provider rejected the request (${err.status}): ${err.message.slice(0, 500)}`,
    );
  }
  const name = (err as { name?: string } | null)?.name;
  if (name === 'AbortError' || name === 'TimeoutError')
    return new LlmError('timeout', 'model call timed out');
  return new LlmError('unavailable', 'model call failed');
}
