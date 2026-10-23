// Shared Chat Completions transport; provider wrappers own credentials, endpoint and prices.
import type { OpenAI } from 'openai';
import { classifyOpenAI } from './openai-error.js';
import type {
  ChatCompletionCreateParamsBase,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import type { CompletionUsage } from 'openai/resources/completions';
import { LlmError, TRUNCATED, type LlmRequest, type LlmResult, type LlmUsage } from './gateway.js';
import {
  assertStrictSchema,
  strictSchema,
  restoreStrictJson,
  matchesSchema,
} from './chat-schema.js';
import { restoreStrictPartial } from './chat-partial.js';
import { repairJsonStrings } from './latex.js';
import { costMicros, priceModel, type PriceTable } from './pricing.js';
import { assertMedia, type GatewayProfile } from './profile.js';
import { RetryingGateway } from './retry.js';

function messages(req: LlmRequest): ChatCompletionMessageParam[] {
  return [
    { role: 'system', content: req.system },
    ...req.contents.map((message): ChatCompletionMessageParam => {
      if (message.role === 'model') {
        if (message.parts.some((p) => 'inlineData' in p))
          throw new LlmError('refused', 'Chat assistant messages cannot carry media');
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
            : p.inlineData.mimeType === 'application/pdf'
              ? {
                  type: 'file',
                  file: {
                    filename: 'material.pdf',
                    file_data: `data:application/pdf;base64,${p.inlineData.data}`,
                  },
                }
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
    costMicros: costMicros(prices, priceModel(model), {
      inputTokens,
      outputTokens,
      thoughtTokens,
      audioInputTokens: 0,
    }),
    latencyMs: Math.round(performance.now() - started),
  };
}

export type ChatConfig = {
  client: OpenAI;
  profile: GatewayProfile;
  model: { smart: string; fast: string };
};

export class ChatGateway extends RetryingGateway {
  readonly available = true;
  readonly profile: GatewayProfile;
  constructor(private readonly config: ChatConfig) {
    super();
    this.profile = config.profile;
  }

  protected async attempt(req: LlmRequest, timeoutMs: number): Promise<LlmResult> {
    assertMedia(this.profile, req);
    const limits = this.profile.structuredOutput;
    const schema = strictSchema(req.schema);
    assertStrictSchema(schema, limits);
    const model = this.config.model[req.tier];
    const reasoning = model.startsWith('gpt-5.4');
    const params: ChatCompletionCreateParamsBase = {
      model,
      messages: messages(req),
      store: false,
      ...(this.profile.cache === 'in_memory'
        ? { prompt_cache_retention: 'in_memory' as const }
        : {}),
      ...(reasoning
        ? {
            reasoning_effort:
              req.thinking === 'off' ? 'none' : req.thinking === 'minimal' ? 'low' : req.thinking,
          }
        : { temperature: req.temperature }),
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'learnbuddy', strict: true, schema },
      },
      max_completion_tokens: req.maxOutputTokens,
    };
    const started = performance.now();
    const timeout = AbortSignal.timeout(Math.max(0, timeoutMs));
    const signal = req.signal ? AbortSignal.any([timeout, req.signal]) : timeout;
    let total: LlmUsage | null = null;
    try {
      if (signal.aborted) throw classifyOpenAI(null, signal, req.signal, null);
      const left = Math.max(1, Math.round(timeoutMs - (performance.now() - started)));
      const roundStart = performance.now();
      const options = { signal, timeout: left };
      let reportedModel = model;
      let meta: CompletionUsage | null = null;
      let text = '';
      let reason: string | null = null;
      let refused = false;
      let candidate = false;

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
            if (text) req.onPartial(restoreStrictPartial(req.schema, text));
            if (signal.aborted) throw classifyOpenAI(null, signal, req.signal, null);
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
        }
      } catch (error) {
        throw classifyOpenAI(error, signal, req.signal, null);
      } finally {
        if (meta) {
          total = usageOf(this.profile.prices, reportedModel, meta, roundStart);
        }
      }
      if (signal.aborted) throw classifyOpenAI(null, signal, req.signal, null);
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
      if (reason !== 'stop')
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
        json = restoreStrictJson(req.schema, JSON.parse(text));
        if (this.profile.repairJsonStrings) json = repairJsonStrings(json);
        if (!matchesSchema(req.schema, json) || (req.validateOutput && !req.validateOutput(json)))
          throw new Error('contract');
      } catch {
        throw new LlmError('invalid_output', 'output does not match its contract');
      }
      const usage = total!; // Every successful round above has a provider receipt.
      usage.latencyMs = Math.round(performance.now() - started);
      return { json, usage, attempts: 1 };
    } catch (error) {
      const classified = classifyOpenAI(error, signal, req.signal, total);
      const result = new LlmError(
        classified.kind,
        classified.message,
        total,
        classified.finishReason,
      );
      result.attempts = 1;
      throw result;
    }
  }
}
