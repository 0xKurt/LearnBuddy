// requires live verification in Claude Code session
import { describe, expect, it, vi } from 'vitest';
import { openAIClient } from '../../llm/openai-client.js';
import { OpenAIEmbeddings, OPENAI_EMBED_DIMENSIONS } from '../openai.js';
const config = { OPENAI_API_KEY: 'test', OPENAI_BASE_URL: 'https://eu.api.openai.com/v1' };
const vector = (index: number) =>
  Array.from({ length: OPENAI_EMBED_DIMENSIONS }, (_, i) => (i === index ? 1 : 0));
describe('EU material embeddings', () => {
  it('orders vectors by provider index, validates dimensions and records usage', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json({
        data: [
          { index: 1, embedding: vector(1) },
          { index: 0, embedding: vector(0) },
        ],
        usage: { prompt_tokens: 23, total_tokens: 23 },
      }),
    );
    const gateway = new OpenAIEmbeddings(openAIClient(config, fetch));
    const result = await gateway.embed({ task: 'RETRIEVAL_DOCUMENT', texts: ['eins', 'zwei'] });
    expect(result.vectors).toEqual([vector(0), vector(1)]);
    expect(result.usage.inputTokens).toBe(23);
    expect(result.usage.costMicros).toBeGreaterThan(0);
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe('https://eu.api.openai.com/v1/embeddings');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      dimensions: 1536,
      encoding_format: 'float',
      input: ['eins', 'zwei'],
    });
  });
  it.each([
    [{ index: 0, embedding: [1] }],
    [
      { index: 0, embedding: vector(0) },
      { index: 0, embedding: vector(0) },
    ],
    [{ index: 0, embedding: Array(1536).fill(0) }],
    [{ index: 0, embedding: [null, ...vector(0).slice(1)] }],
  ])('rejects malformed results before anything is indexed', async (...data) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({ data, usage: { prompt_tokens: 1 } }));
    await expect(
      new OpenAIEmbeddings(openAIClient(config, fetch)).embed({
        task: 'RETRIEVAL_QUERY',
        texts: ['eins'],
      }),
    ).rejects.toMatchObject({ kind: 'invalid_output' });
  });
  it('maps throttling and never retries hidden paid calls', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response('{}', { status: 429 }));
    await expect(
      new OpenAIEmbeddings(openAIClient(config, fetch)).embed({
        task: 'RETRIEVAL_QUERY',
        texts: ['eins'],
      }),
    ).rejects.toMatchObject({ kind: 'rate_limited' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
