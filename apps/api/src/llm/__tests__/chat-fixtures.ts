// requires live verification in Claude Code session (HTTP stand-ins only).
import { vi } from 'vitest';
import { z } from 'zod';
import type { LlmRequest } from '../gateway.js';
import { toJsonSchema } from '../json-schema.js';
export const request = (overrides: Partial<LlmRequest> = {}): LlmRequest => ({
  purpose: 'tutor',
  tier: 'smart',
  promptVersion: 'test',
  system: 'SYSTEM',
  contents: [{ role: 'user', parts: [{ text: 'Hallo' }] }],
  schema: toJsonSchema(z.object({ reply: z.string() })),
  maxOutputTokens: 100,
  temperature: 0.3,
  timeoutMs: 200,
  thinking: 'off',
  ...overrides,
});
export const usage = {
  prompt_tokens: 1000,
  completion_tokens: 100,
  total_tokens: 1100,
  prompt_tokens_details: { cached_tokens: 600 },
  completion_tokens_details: { reasoning_tokens: 30 },
};
export const completion = (
  reason = 'stop',
  content = '{"reply":"Hallo"}',
  refusal: string | null = null,
) => ({
  id: 'test',
  object: 'chat.completion',
  created: 0,
  model: 'gpt-5.4-2026-03-05',
  usage,
  choices: [{ index: 0, finish_reason: reason, message: { role: 'assistant', content, refusal } }],
});
export function http(body: unknown = completion(), status = 200) {
  return vi.fn<typeof fetch>(async () => Response.json(body, { status }));
}
export function sse(events: unknown[], done = true): Response {
  const body =
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') +
    (done ? 'data: [DONE]\n\n' : '');
  // Deliberately split inside SSE lines and UTF-8 characters: the SDK must assemble them.
  const bytes = new TextEncoder().encode(body);
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
        controller.close();
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}
export const chunk = (content: string, finish_reason: string | null = null) => ({
  id: 'test',
  object: 'chat.completion.chunk',
  created: 0,
  model: 'gpt-5.4-2026-03-05',
  choices: [{ index: 0, delta: { content }, finish_reason }],
});
