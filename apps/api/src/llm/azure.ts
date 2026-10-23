// Azure Chat Completions behind the existing gateway. No SDK retries: retry.ts owns the budget.
import OpenAI, { AzureOpenAI, APIError, APIConnectionTimeoutError } from 'openai';
import type {
  ChatCompletionCreateParamsBase,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import type { CompletionUsage } from 'openai/resources/completions';

import type { Config } from '../config.js';
import {
  LlmError,
  TOO_LARGE,
  TRUNCATED,
  type LlmRequest,
  type LlmResult,
  type LlmUsage,
} from './gateway.js';
import { azureSchema, assertAzureSchema, restoreAzureJson, schemaObject } from './azure-schema.js';
import { restoreAzurePartial } from './azure-partial.js';
import { repairJsonStrings } from './latex.js';
import { costMicros } from './pricing.js';
import { inlineBytesOf, unsupportedMedia, type GatewayProfile } from './profile.js';
import { RetryingGateway } from './retry.js';

const AZURE_PROFILE: GatewayProfile = {
  name: 'azure',
  media: new Set(['image']),
  // Conservative application cap on all base64 combined, below Azure's 20 MB per image.
  maxInlineBytes: 20_000_000,
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
    maxSchemaProperties: 100,
  },
};

function messages(req: LlmRequest): ChatCompletionMessageParam[] {
  return [
    { role: 'system', content: req.system },
    ...req.contents.map((message): ChatCompletionMessageParam => {
      if (message.role === 'model') {
        if (message.parts.some((p) => 'inlineData' in p))
          throw new LlmError('refused', 'Azure assistant messages cannot carry images');
        return {
          role: 'assistant',
          content: message.parts.map((p) => ('text' in p ? p.text : '')).join(''),
        };
      }
      return {
        role: 'user',
        content: message.parts.map((p) =>
          'text' in p
            ? { type: 'text', text: p.text }
            : {
                type: 'image_url',
                image_url: {
                  url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`,
                  detail: 'high',
                },
              },
        ),
      };
    }),
  ];
}

/** Azure completion_tokens already includes reasoning; never bill those tokens twice. */
function usageOf(
  config: Config,
  model: string,
  meta: CompletionUsage | null,
  started: number,
): LlmUsage {
  const priceModel = model.replace(/-\d{4}-\d{2}-\d{2}$/, '');
  const inputTokens = meta?.prompt_tokens ?? 0;
  const completionTokens = meta?.completion_tokens ?? 0;
  const thoughtTokens = Math.min(
    completionTokens,
    meta?.completion_tokens_details?.reasoning_tokens ?? 0,
  );
  const outputTokens = completionTokens - thoughtTokens;
  return {
    model,
    inputTokens,
    outputTokens,
    thoughtTokens,
    cachedTokens: meta?.prompt_tokens_details?.cached_tokens ?? 0,
    // Like Vertex, recorded cost is a ceiling: retain reported cache hits but take no discount.
    costMicros: costMicros(config.AZURE_OPENAI_PRICES!, priceModel, {
      inputTokens,
      outputTokens,
      thoughtTokens,
      audioInputTokens: 0,
    }),
    latencyMs: Math.round(performance.now() - started),
  };
}

function filtered(error: unknown): boolean {
  if (!schemaObject(error)) return false;
  return (
    error.code === 'content_filter' ||
    error.code === 'ResponsibleAIPolicyViolation' ||
    filtered(error.innererror) ||
    filtered(error.error)
  );
}

function classify(
  error: unknown,
  signal: AbortSignal,
  req: LlmRequest,
  usage: LlmUsage | null,
): LlmError {
  if (req.signal?.aborted) return new LlmError('cancelled', 'the caller stopped waiting', usage);
  if (signal.aborted || error instanceof APIConnectionTimeoutError)
    return new LlmError('timeout', 'model call timed out', usage);
  if (error instanceof LlmError) return error;
  if (error instanceof APIError) {
    if (filtered(error.error) || error.code === 'content_filter')
      return new LlmError('blocked', 'provider content filter', usage, 'content_filter');
    if (error.status === 429) return new LlmError('rate_limited', 'provider rate limit', usage);
    if (error.status !== undefined && error.status >= 400 && error.status < 500)
      return new LlmError('refused', `provider rejected request (${error.status})`, usage);
  }
  // Provider error text can contain the child's input; never copy it into logs.
  return new LlmError('unavailable', 'model call failed', usage);
}

export class AzureOpenAIGateway extends RetryingGateway {
  readonly available = true;
  readonly profile = AZURE_PROFILE;
  private readonly client: OpenAI;

  constructor(
    private readonly config: Config,
    fetch?: typeof globalThis.fetch,
  ) {
    super();
    const endpoint = config.AZURE_OPENAI_ENDPOINT;
    if (!endpoint || !config.AZURE_OPENAI_KEY || !config.AZURE_OPENAI_PRICES)
      throw new Error('Azure configuration is incomplete');
    // Supply the origin explicitly: OPENAI_BASE_URL must never redirect Azure learner data.
    const baseURL = `${endpoint.replace(/\/$/, '')}/openai`;
    const options = {
      apiKey: config.AZURE_OPENAI_KEY,
      fetch,
      maxRetries: 0,
      organization: null,
      project: null,
    };
    this.client =
      config.AZURE_OPENAI_API_VERSION === 'v1'
        ? new OpenAI({ ...options, baseURL: `${baseURL}/v1`, fetchOptions: { redirect: 'error' } })
        : new AzureOpenAI({ ...options, baseURL, apiVersion: config.AZURE_OPENAI_API_VERSION });
  }

  protected async attempt(req: LlmRequest, timeoutMs: number): Promise<LlmResult> {
    if (unsupportedMedia(this.profile, req).length)
      throw new LlmError('refused', 'Azure gateway accepts text and images only');
    const images = req.contents.flatMap((m) => m.parts).filter((p) => 'inlineData' in p);
    if (inlineBytesOf(req) > this.profile.maxInlineBytes || images.length > 10)
      throw new LlmError('refused', 'Azure image input limit exceeded', null, TOO_LARGE);
    const schema = azureSchema(req.schema);
    assertAzureSchema(schema);
    const model =
      req.tier === 'smart' ? this.config.AZURE_OPENAI_MODEL : this.config.AZURE_OPENAI_MODEL_FAST;
    const deployment =
      req.tier === 'smart'
        ? this.config.AZURE_OPENAI_DEPLOYMENT
        : this.config.AZURE_OPENAI_DEPLOYMENT_FAST;
    const params: ChatCompletionCreateParamsBase = {
      model: deployment!,
      messages: messages(req),
      store: false,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'learnbuddy', strict: true, schema },
      },
      max_completion_tokens: req.maxOutputTokens,
      reasoning_effort:
        req.thinking === 'off' ? 'none' : req.thinking === 'minimal' ? 'low' : req.thinking,
      // GPT-5.4 models do not accept temperature while reasoning. Keep the same request shape
      // at every neutral level; no prompt text, content-filter policy or caching override here.
    };
    const timeout = AbortSignal.timeout(Math.max(0, timeoutMs));
    const signal = req.signal ? AbortSignal.any([timeout, req.signal]) : timeout;
    const options = { signal, timeout: Math.max(1, timeoutMs) };
    const started = performance.now();
    let reportedModel: string = model;
    let meta: CompletionUsage | null = null;
    let text = '';
    let reason: string | null = null;
    let refused = false;
    let candidate = false;
    try {
      if (req.onPartial) {
        const stream = await this.client.chat.completions.create(
          { ...params, stream: true, stream_options: { include_usage: true } },
          options,
        );
        for await (const chunk of stream) {
          meta = chunk.usage ?? meta;
          if (chunk.model) reportedModel = chunk.model;
          const choice = chunk.choices.find((c) => c.index === 0);
          if (!choice) continue; // prompt annotations or the final usage-only chunk
          candidate = true;
          reason = choice.finish_reason ?? reason;
          refused ||= Boolean(choice.delta?.refusal);
          if (!refused && reason !== 'content_filter' && choice.delta?.content) {
            text += choice.delta.content;
            req.onPartial(restoreAzurePartial(req.schema, text));
          }
        }
      } else {
        const result = await this.client.chat.completions.create(
          { ...params, stream: false },
          options,
        );
        meta = result.usage ?? null;
        if (result.model) reportedModel = result.model;
        const choice = result.choices.find((c) => c.index === 0);
        candidate = choice !== undefined;
        reason = choice?.finish_reason ?? null;
        refused = Boolean(choice?.message.refusal);
        text = choice?.message.content ?? '';
      }
    } catch (error) {
      throw classify(
        error,
        signal,
        req,
        meta ? usageOf(this.config, reportedModel, meta, started) : null,
      );
    }
    const usage = usageOf(this.config, reportedModel, meta, started);
    if (signal.aborted) throw classify(null, signal, req, usage);
    if (!candidate || refused || reason === 'content_filter')
      throw new LlmError(
        'blocked',
        'provider held back the answer',
        usage,
        reason === 'content_filter' ? reason : null,
      );
    if (reason === 'length')
      throw new LlmError('invalid_output', 'output truncated at the token limit', usage, TRUNCATED);
    if (reason !== 'stop')
      throw new LlmError('invalid_output', 'answer did not finish normally', usage);
    try {
      return { json: repairJsonStrings(restoreAzureJson(req.schema, JSON.parse(text))), usage };
    } catch {
      throw new LlmError('invalid_output', 'output is not valid JSON', usage);
    }
  }
}
