import type OpenAI from 'openai';
import { z } from 'zod';
import {
  normalise,
  type EmbeddingGateway,
  type EmbedRequest,
  type EmbedResult,
} from '../llm/embeddings.js';
import { LlmError } from '../llm/gateway.js';
import { classifyOpenAI } from '../llm/openai-error.js';
export const OPENAI_EMBED_DIMENSIONS = 1536;
const OPENAI_EMBED_MODEL = 'text-embedding-3-small';
const Response = z.object({
  data: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      embedding: z.array(z.number().finite()).length(OPENAI_EMBED_DIMENSIONS),
    }),
  ),
  usage: z.object({ prompt_tokens: z.number().int().nonnegative() }),
});
export class OpenAIEmbeddings implements EmbeddingGateway {
  readonly available = true;
  readonly model = OPENAI_EMBED_MODEL;
  readonly dimensions = OPENAI_EMBED_DIMENSIONS;
  readonly microsPerInputToken = 0.02;
  readonly space = 'openai-small-1536' as const;
  constructor(private readonly client: OpenAI) {}
  async embed(req: EmbedRequest): Promise<EmbedResult> {
    const started = Date.now();
    if (req.signal?.aborted) throw new LlmError('cancelled', 'Caller stopped waiting');
    const deadline = AbortSignal.timeout(req.timeoutMs ?? 20_000);
    const signal = req.signal ? AbortSignal.any([req.signal, deadline]) : deadline;
    let inputTokens = 0;
    const vectors: number[][] = [];
    try {
      for (let offset = 0; offset < req.texts.length; offset += 64) {
        const texts = req.texts.slice(offset, offset + 64);
        const raw = await this.client.embeddings.create(
          {
            model: OPENAI_EMBED_MODEL,
            input: texts,
            dimensions: OPENAI_EMBED_DIMENSIONS,
            encoding_format: 'float',
          },
          { signal, timeout: req.timeoutMs ?? 20_000 },
        );
        const parsed = Response.safeParse(raw);
        if (!parsed.success || parsed.data.data.length !== texts.length)
          throw new LlmError('invalid_output', 'Invalid embedding response');
        const ordered = parsed.data.data.sort((a, b) => a.index - b.index);
        for (const [index, item] of ordered.entries()) {
          if (item.index !== index || item.embedding.every((v) => v === 0))
            throw new LlmError('invalid_output', 'Invalid embedding index or zero vector');
          vectors.push(normalise(item.embedding));
        }
        inputTokens += parsed.data.usage.prompt_tokens;
      }
      return {
        vectors,
        usage: {
          model: OPENAI_EMBED_MODEL,
          inputTokens,
          costMicros: Math.ceil(inputTokens * 0.02),
          latencyMs: Date.now() - started,
        },
      };
    } catch (error) {
      throw classifyOpenAI(error, signal, req.signal);
    }
  }
}
