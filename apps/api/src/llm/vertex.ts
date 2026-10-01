// Vertex AI (Gemini, EU region) implementation of the model seam.
//
// One call = one structured JSON answer (responseMimeType + responseJsonSchema).
// Bounded by a timeout, an output token cap and an explicit thinking budget
// (thinking tokens count as output and are billed as such). No hidden
// retries here: callers decide whether an error is worth retrying later.

import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ApiError as GenAiApiError,
  FinishReason,
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  type GenerateContentResponse,
  type SafetySetting,
} from '@google/genai';

import type { Config } from '../config.js';
import { outcomeOfStatus } from '../lib/outcome.js';
import {
  LlmError,
  type LlmGateway,
  type LlmRequest,
  type LlmResult,
  type LlmUsage,
  TRUNCATED,
} from './gateway.js';
import { repairJsonStrings } from './latex.js';
import { costMicros } from './pricing.js';
import { retryDelayMs, worthASecondTry } from './retry.js';

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
  return {
    model,
    inputTokens,
    outputTokens,
    thoughtTokens,
    cachedTokens,
    costMicros: costMicros(model, inputTokens, outputTokens, thoughtTokens),
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
export const DEFAULT_ROUTES: Partial<Record<LlmRequest['purpose'], string>> = {
  pronounce: 'eu/gemini-3.1-flash-lite',
};

/** The model spec a request runs on: explicit route → measured default → the tier's model. */
export function modelFor(config: Config, req: Pick<LlmRequest, 'purpose' | 'tier'>): string {
  return (
    config.VERTEX_ROUTES[req.purpose] ??
    DEFAULT_ROUTES[req.purpose] ??
    (req.tier === 'smart' ? config.VERTEX_MODEL_SMART : config.VERTEX_MODEL_FAST)
  );
}

export class VertexGateway implements LlmGateway {
  readonly available = true;
  /** One client per location (the EU multi-region "eu" serves models europe-west4 doesn't). */
  private readonly clients = new Map<string, GoogleGenAI>();

  constructor(private readonly config: Config) {
    ensureCredentialsFile(config);
  }

  private clientFor(location: string): GoogleGenAI {
    let c = this.clients.get(location);
    if (!c) {
      c = new GoogleGenAI({
        vertexai: true,
        project: this.config.GOOGLE_CLOUD_PROJECT,
        location,
      });
      this.clients.set(location, c);
    }
    return c;
  }

  /**
   * One structured answer, with ONE short second chance (issue #167).
   *
   * The second attempt happens only for the two errors that mean "not now" — the provider
   * unreachable or busy — and only when nothing has been handed out yet. A streamed call
   * that already gave `onPartial` some text cannot start over: she would watch a sentence
   * be replaced by another one.
   */
  async generate(req: LlmRequest): Promise<LlmResult> {
    // Per CALL, not per gateway: one instance serves every request at once, so a field
    // here would let one streamed answer suppress every other call's second chance — and
    // never reset.
    let handedOut = false;
    const watched: LlmRequest = req.onPartial
      ? {
          ...req,
          onPartial: (text) => {
            // From here on she has seen words: a second attempt would replace them.
            handedOut = true;
            req.onPartial?.(text);
          },
        }
      : req;
    try {
      return await this.attempt(watched);
    } catch (err) {
      if (!worthASecondTry(err) || handedOut) throw err;
      await new Promise((done) => setTimeout(done, retryDelayMs(Math.random)));
      return this.attempt(watched);
    }
  }

  private async attempt(req: LlmRequest): Promise<LlmResult> {
    const { location, model } = splitModelSpec(
      modelFor(this.config, req),
      this.config.GOOGLE_VERTEX_LOCATION,
    );
    const started = Date.now();
    let response: GenerateContentResponse;
    const params = {
      model,
      contents: req.contents,
      config: {
        systemInstruction: req.system,
        temperature: req.temperature,
        maxOutputTokens: req.maxOutputTokens,
        responseMimeType: 'application/json',
        responseJsonSchema: req.schema,
        safetySettings: SAFETY,
        ...(req.thinkingBudget !== undefined
          ? { thinkingConfig: { thinkingBudget: req.thinkingBudget } }
          : {}),
        abortSignal: AbortSignal.timeout(req.timeoutMs),
      },
    };
    let streamedText: string | null = null;
    try {
      if (req.onPartial) {
        // The same call, streamed: the text so far goes to onPartial; the last chunk
        // carries the finish reason and the usage.
        let last: GenerateContentResponse | null = null;
        let text = '';
        for await (const chunk of await this.clientFor(location).models.generateContentStream(
          params,
        )) {
          last = chunk;
          const piece = chunk.text;
          if (piece) {
            text += piece;
            req.onPartial(text);
          }
        }
        if (!last) throw new LlmError('blocked', 'no candidate returned');
        response = last;
        streamedText = text;
      } else {
        response = await this.clientFor(location).models.generateContent(params);
      }
    } catch (err) {
      if (err instanceof LlmError) throw err;
      throw classify(err);
    }
    const usage = usageOf(model, response, Date.now() - started);

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
      return { json: repairJsonStrings(JSON.parse(text)), usage };
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
