// Shared classification for all endpoints; never log provider bodies or learner input.
import { APIError, APIConnectionTimeoutError, APIUserAbortError } from 'openai';
import { LlmError, type LlmUsage } from './gateway.js';
import { schemaObject } from './chat-schema.js';

function filtered(error: unknown): boolean {
  if (!schemaObject(error)) return false;
  return (
    error.code === 'content_filter' ||
    error.code === 'ResponsibleAIPolicyViolation' ||
    filtered(error.innererror) ||
    filtered(error.error)
  );
}

export function classifyOpenAI(
  error: unknown,
  signal?: AbortSignal,
  callerSignal?: AbortSignal,
  usage: LlmUsage | null = null,
): LlmError {
  if (callerSignal?.aborted) return new LlmError('cancelled', 'the caller stopped waiting', usage);
  if (
    signal?.aborted ||
    error instanceof APIConnectionTimeoutError ||
    error instanceof APIUserAbortError ||
    (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))
  )
    return new LlmError('timeout', 'model call timed out', usage);
  if (error instanceof LlmError) return error;
  if (error instanceof APIError) {
    if (filtered(error.error) || error.code === 'content_filter')
      return new LlmError('blocked', 'provider content filter', usage, 'content_filter');
    if (error.status === 429) return new LlmError('rate_limited', 'provider rate limit', usage);
    if (error.status !== undefined && error.status >= 400 && error.status < 500)
      return new LlmError(
        'refused',
        `provider rejected request (${error.status})`,
        usage,
        `HTTP_${error.status}`,
      );
  }
  // Provider error text can contain the child's input; never copy it into logs.
  return new LlmError('unavailable', 'model call failed', usage);
}
