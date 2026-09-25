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
import {
  LlmError,
  type LlmGateway,
  type LlmRequest,
  type LlmResult,
  type LlmUsage,
} from './gateway.js';
import { costMicros } from './pricing.js';

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

function ensureCredentialsFile(config: Config): void {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS || !config.GOOGLE_APPLICATION_CREDENTIALS_JSON)
    return;
  const path = join(tmpdir(), 'learnbuddy-vertex-sa.json');
  writeFileSync(path, config.GOOGLE_APPLICATION_CREDENTIALS_JSON, { mode: 0o600 });
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path;
}

function usageOf(
  model: string,
  response: GenerateContentResponse | null,
  latencyMs: number,
): LlmUsage {
  const meta = response?.usageMetadata;
  const inputTokens = meta?.promptTokenCount ?? 0;
  const outputTokens = meta?.candidatesTokenCount ?? 0;
  const thoughtTokens = meta?.thoughtsTokenCount ?? 0;
  return {
    model,
    inputTokens,
    outputTokens,
    thoughtTokens,
    costMicros: costMicros(model, inputTokens, outputTokens, thoughtTokens),
    latencyMs,
  };
}

export class VertexGateway implements LlmGateway {
  readonly available = true;
  private readonly client: GoogleGenAI;

  constructor(private readonly config: Config) {
    ensureCredentialsFile(config);
    this.client = new GoogleGenAI({
      vertexai: true,
      project: config.GOOGLE_CLOUD_PROJECT,
      location: config.GOOGLE_VERTEX_LOCATION,
    });
  }

  async generate(req: LlmRequest): Promise<LlmResult> {
    const model =
      req.tier === 'smart' ? this.config.VERTEX_MODEL_SMART : this.config.VERTEX_MODEL_FAST;
    const started = Date.now();
    let response: GenerateContentResponse;
    try {
      response = await this.client.models.generateContent({
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
      });
    } catch (err) {
      throw classify(err);
    }
    const usage = usageOf(model, response, Date.now() - started);

    const candidate = response.candidates?.[0];
    if (!candidate) throw new LlmError('blocked', 'no candidate returned', usage);
    const reason = candidate.finishReason;
    if (reason === FinishReason.MAX_TOKENS) {
      throw new LlmError('invalid_output', 'output truncated at the token limit', usage);
    }
    if (reason && reason !== FinishReason.STOP) {
      throw new LlmError('blocked', `finish reason ${reason}`, usage);
    }
    const text = response.text;
    if (typeof text !== 'string' || text.trim() === '') {
      throw new LlmError('invalid_output', 'empty output', usage);
    }
    try {
      return { json: JSON.parse(text), usage };
    } catch {
      throw new LlmError('invalid_output', 'output is not valid JSON', usage);
    }
  }
}

function classify(err: unknown): LlmError {
  if (err instanceof GenAiApiError) {
    if (err.status === 429) return new LlmError('rate_limited', 'provider rate limit');
    if (err.status >= 500) return new LlmError('unavailable', `provider error ${err.status}`);
    return new LlmError('unavailable', `provider rejected the request (${err.status})`);
  }
  const name = (err as { name?: string } | null)?.name;
  if (name === 'AbortError' || name === 'TimeoutError')
    return new LlmError('timeout', 'model call timed out');
  return new LlmError('unavailable', 'model call failed');
}
