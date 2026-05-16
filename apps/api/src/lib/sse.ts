// Minimal SSE stream helper. Doc 04 §POST /materials (event: phase / event:
// done / event: error). Wraps Hono's `streamSSE` so the route handlers stay
// declarative.

import { streamSSE, type SSEStreamingApi } from 'hono/streaming';
import type { Context } from 'hono';

export type SsePhase = 'reading_images' | 'generating_items' | 'processing_diagrams';

export type SseEvent =
  | { event: 'phase'; data: { phase: SsePhase } }
  | { event: 'done'; data: unknown }
  | { event: 'error'; data: { code: string; message: string } };

export function streamMaterialEvents(
  c: Context,
  emit: (push: (e: SseEvent) => Promise<void>) => Promise<void>,
): Response {
  return streamSSE(c, async (stream: SSEStreamingApi) => {
    const push = async (e: SseEvent): Promise<void> => {
      await stream.writeSSE({ event: e.event, data: JSON.stringify(e.data) });
    };
    await emit(push);
  });
}
