// One bounded response over the configured EU client; no reconnect, tracing or conversation.
import type OpenAI from 'openai';
import { OpenAIRealtimeWebSocket } from 'openai/realtime/websocket';
import type {
  RealtimeResponse,
  RealtimeServerEvent,
  ResponseCreateEvent,
  SessionUpdateEvent,
} from 'openai/resources/realtime/realtime';
import { LlmError } from '../llm/gateway.js';

export async function realtimeResponse(
  client: OpenAI,
  model: string,
  signal: AbortSignal,
  session: SessionUpdateEvent['session'],
  response: ResponseCreateEvent['response'],
  onEvent?: (event: RealtimeServerEvent) => void,
): Promise<RealtimeResponse> {
  signal.throwIfAborted();
  const socket = new OpenAIRealtimeWebSocket({ model }, client);
  return new Promise((resolve, reject) => {
    let settled = false;
    let submitted = false;
    const finish = (result: RealtimeResponse | LlmError) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      socket.socket.removeEventListener('close', closed);
      socket.close();
      if (result instanceof LlmError) reject(result);
      else resolve(result);
    };
    const abort = () => finish(new LlmError('cancelled', 'Audio request stopped'));
    const closed = () => finish(new LlmError('unavailable', 'Audio connection ended early'));
    signal.addEventListener('abort', abort, { once: true });
    socket.socket.addEventListener('close', closed, { once: true });
    socket.on('error', (error) => {
      const code = error.error?.code;
      finish(
        new LlmError(
          code === 'rate_limit_exceeded'
            ? 'rate_limited'
            : code === 'content_filter'
              ? 'blocked'
              : error.error?.type === 'invalid_request_error'
                ? 'refused'
                : 'unavailable',
          'Audio provider rejected the request',
        ),
      );
    });
    socket.on('session.created', () => {
      if (!settled) socket.send({ type: 'session.update', session });
    });
    socket.on('session.updated', () => {
      if (settled || submitted) return;
      submitted = true;
      socket.send({ type: 'response.create', response: { ...response, conversation: 'none' } });
    });
    socket.on('event', (event) => {
      if (settled || signal.aborted) return;
      try {
        onEvent?.(event);
      } catch {
        finish(new LlmError('invalid_output', 'Invalid audio response'));
      }
    });
    socket.on('response.done', (event) => finish(event.response));
    if (signal.aborted) abort();
  });
}
