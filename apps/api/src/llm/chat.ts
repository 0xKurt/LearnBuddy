// Shared Chat Completions transport; provider wrappers own credentials, endpoint and prices.
import { APIError, APIConnectionTimeoutError, type OpenAI } from 'openai';
import type {
  ChatCompletionCreateParamsBase,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import type { CompletionUsage } from 'openai/resources/completions';
import {
  LlmError,
  TOO_LARGE,
  TRUNCATED,
  type LlmRequest,
  type LlmResult,
  type LlmUsage,
} from './gateway.js';
import {
  assertStrictSchema,
  strictSchema,
  restoreStrictJson,
  schemaObject,
  matchesSchema,
} from './chat-schema.js';
import { restoreStrictPartial } from './chat-partial.js';
import { TurnFunctions } from './chat-functions.js';
import { repairJsonStrings } from './latex.js';
import { costMicros, type PriceTable } from './pricing.js';
import { inlineBytesOf, unsupportedMedia, type GatewayProfile } from './profile.js';
import { RetryingGateway } from './retry.js';
import { addUsage } from './usage.js';

export const CHAT_PROFILE: GatewayProfile = {
  name: 'chat',
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
          throw new LlmError('refused', 'Chat assistant messages cannot carry images');
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

/** Chat completion_tokens already includes reasoning; never bill those tokens twice. */
function usageOf(
  prices: PriceTable,
  model: string,
  meta: CompletionUsage,
  started: number,
): LlmUsage {
  const priceModel = model.replace(/-\d{4}-\d{2}-\d{2}$/, '');
  const inputTokens = meta.prompt_tokens;
  const completionTokens = meta.completion_tokens;
  const thoughtTokens = Math.min(
    completionTokens,
    meta.completion_tokens_details?.reasoning_tokens ?? 0,
  );
  const outputTokens = completionTokens - thoughtTokens;
  return {
    model,
    inputTokens,
    outputTokens,
    thoughtTokens,
    cachedTokens: meta.prompt_tokens_details?.cached_tokens ?? 0,
    // Like Vertex, recorded cost is a ceiling: retain reported cache hits but take no discount.
    costMicros: costMicros(prices, priceModel, {
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

export type ChatConfig = {
  client: OpenAI;
  profile: GatewayProfile;
  prices: PriceTable;
  model: { smart: string; fast: string };
  deployment: { smart: string; fast: string };
  maxImages: number;
  depth: number;
  /** Deep practice contracts use JSON + their original Zod validators, with one repair. */
  repairDeepJson: boolean;
  /** Explicit in-memory cache for the direct ZDR project. */
  inMemoryCache: boolean;
};

export class ChatGateway extends RetryingGateway {
  readonly available = true;
  readonly profile: GatewayProfile;
  constructor(private readonly config: ChatConfig) {
    super();
    this.profile = config.profile;
  }

  protected async attempt(req: LlmRequest, timeoutMs: number): Promise<LlmResult> {
    if (unsupportedMedia(this.profile, req).length)
      throw new LlmError('refused', 'gateway accepts text and images only');
    const images = req.contents.flatMap((m) => m.parts).filter((p) => 'inlineData' in p);
    if (inlineBytesOf(req) > this.profile.maxInlineBytes || images.length > this.config.maxImages)
      throw new LlmError('refused', 'image input limit exceeded', null, TOO_LARGE);
    const limits = {
      properties: this.profile.structuredOutput.maxSchemaProperties,
      depth: this.config.depth,
    };
    const functions =
      req.purpose === 'buddy_turn' ? new TurnFunctions(req.schema, 6, limits) : null;
    const deep =
      this.config.repairDeepJson && (req.purpose === 'explain' || req.purpose === 'extraction');
    if (deep && !req.validateOutput)
      throw new LlmError('refused', 'JSON mode requires the original output validator');
    const schema = strictSchema(req.schema);
    if (!functions && !deep) assertStrictSchema(schema, limits);
    const model = this.config.model[req.tier];
    const reasoning = model.startsWith('gpt-5.4');
    const params: ChatCompletionCreateParamsBase = {
      model: this.config.deployment[req.tier],
      messages: messages(req),
      store: false,
      ...(this.config.inMemoryCache ? { prompt_cache_retention: 'in_memory' as const } : {}),
      ...(reasoning
        ? {
            reasoning_effort:
              req.thinking === 'off' ? 'none' : req.thinking === 'minimal' ? 'low' : req.thinking,
          }
        : { temperature: req.temperature }),
      ...(functions
        ? { tools: functions.tools, tool_choice: 'required', parallel_tool_calls: false }
        : {
            response_format: deep
              ? { type: 'json_object' }
              : { type: 'json_schema', json_schema: { name: 'learnbuddy', strict: true, schema } },
          }),
    };
    if (functions)
      params.messages.push({
        role: 'system',
        content:
          'Represent this decision through function calls. Stage each act in its intended order, then call respond exactly once with all remaining answer fields. Staging has no side effects and is not execution; the server validates and applies the complete decision atomically. Use only offered functions. Lookups belong in respond and are resolved by the existing lookup loop.',
      });
    if (deep)
      params.messages.push({
        role: 'system',
        content: `Return a JSON object matching this schema exactly. All domain constraints remain binding; do not omit, simplify or replace nested structures.\n${JSON.stringify(req.schema)}`,
      });
    const started = performance.now();
    const timeout = AbortSignal.timeout(Math.max(0, timeoutMs));
    const signal = req.signal ? AbortSignal.any([timeout, req.signal]) : timeout;
    let total: LlmUsage | null = null;
    let calls = 0;
    let remaining = req.maxOutputTokens;
    let repaired = false;
    try {
      for (;;) {
        if (signal.aborted) throw classify(null, signal, req, null);
        if (remaining <= 0)
          throw new LlmError(
            'invalid_output',
            'decision exhausted its output budget',
            null,
            TRUNCATED,
          );
        if (functions?.full)
          params.tool_choice = { type: 'function', function: { name: 'respond' } };
        params.max_completion_tokens = remaining;
        const left = Math.max(1, Math.round(timeoutMs - (performance.now() - started)));
        const roundStart = performance.now();
        const options = { signal, timeout: left };
        let reportedModel = model;
        let meta: CompletionUsage | null = null;
        let text = '';
        let reason: string | null = null;
        let refused = false;
        let candidate = false;
        let tool: { id: string; name: string; arguments: string } | null = null;
        let multiple = false;
        calls++;
        try {
          if (req.onPartial) {
            const stream = await this.config.client.chat.completions.create(
              { ...params, stream: true, stream_options: { include_usage: true } },
              options,
            );
            for await (const chunk of stream) {
              meta = chunk.usage ?? meta;
              if (chunk.model) reportedModel = chunk.model;
              const choice = chunk.choices.find((c) => c.index === 0);
              if (!choice) continue;
              candidate = true;
              reason = choice.finish_reason ?? reason;
              refused ||= Boolean(choice.delta.refusal);
              if (refused || reason === 'content_filter') continue;
              text += choice.delta.content ?? '';
              for (const delta of choice.delta.tool_calls ?? []) {
                if (delta.index !== 0) {
                  multiple = true;
                  continue;
                }
                tool ??= { id: '', name: '', arguments: '' };
                tool.id += delta.id ?? '';
                tool.name += delta.function?.name ?? '';
                tool.arguments += delta.function?.arguments ?? '';
              }
              // JSON repair must not replace questions already handed to a learner. Buffer it
              // until exact validation succeeds. Other paths keep their incremental stream.
              if (!deep && !multiple) {
                const raw = functions ? tool && functions.partial(tool.name, tool.arguments) : text;
                if (raw) req.onPartial(restoreStrictPartial(req.schema, raw));
              }
            }
          } else {
            const result = await this.config.client.chat.completions.create(
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
            const tools = choice?.message.tool_calls ?? [];
            multiple = tools.length > 1;
            const first = tools[0];
            if (first?.type === 'function') tool = { id: first.id, ...first.function };
          }
        } catch (error) {
          throw classify(error, signal, req, null);
        } finally {
          if (meta) {
            total = addUsage(total, usageOf(this.config.prices, reportedModel, meta, roundStart));
            remaining -= meta.completion_tokens;
          }
        }
        if (signal.aborted) throw classify(null, signal, req, null);
        if (!candidate || refused || reason === 'content_filter')
          throw new LlmError(
            'blocked',
            'provider held back the answer',
            null,
            reason === 'content_filter' ? reason : null,
          );
        if (reason === 'length')
          throw new LlmError(
            'invalid_output',
            'output truncated at the token limit',
            null,
            TRUNCATED,
          );
        if (
          multiple ||
          (functions ? reason !== 'tool_calls' || !tool?.id : reason !== 'stop' || tool !== null)
        )
          throw new LlmError('invalid_output', 'answer did not finish with the expected output');
        if (!meta)
          throw new LlmError(
            'invalid_output',
            'provider omitted usage receipt',
            null,
            'missing_usage',
          );
        let json: unknown;
        try {
          if (functions && tool) {
            json = functions.accept(tool.name, tool.arguments);
            if (json === undefined) {
              params.messages.push(
                {
                  role: 'assistant',
                  content: null,
                  tool_calls: [
                    {
                      id: tool.id,
                      type: 'function',
                      function: { name: tool.name, arguments: tool.arguments },
                    },
                  ],
                },
                {
                  role: 'tool',
                  tool_call_id: tool.id,
                  content: '{"status":"staged","applied":false}',
                },
              );
              continue;
            }
          } else json = deep ? JSON.parse(text) : restoreStrictJson(req.schema, JSON.parse(text));
          json = repairJsonStrings(json);
          if (deep && (!matchesSchema(req.schema, json) || !req.validateOutput?.(json)))
            throw new Error('contract');
        } catch {
          if (!deep || repaired)
            throw new LlmError('invalid_output', 'output does not match its contract');
          repaired = true;
          params.messages.push(
            { role: 'assistant', content: text },
            {
              role: 'user',
              content:
                'The previous JSON failed validation. Return the complete corrected JSON object, preserving the requested content and every nested constraint. This is the single repair attempt.',
            },
          );
          continue;
        }
        const usage = total!; // Every successful round above has a provider receipt.
        usage.latencyMs = Math.round(performance.now() - started);
        if (deep) req.onPartial?.(JSON.stringify(json));
        return { json, usage, attempts: calls };
      }
    } catch (error) {
      const classified = classify(error, signal, req, total);
      const result = new LlmError(
        classified.kind,
        classified.message,
        total,
        classified.finishReason,
      );
      result.attempts = calls;
      throw result;
    }
  }
}
