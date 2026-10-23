// requires live verification in Claude Code session
import { LlmError } from '../llm/gateway.js';
/** Scripted slow answers obey the same deadline and cancellation contract as real adapters. */
export function fakeDeadline<T>(
  answer: Promise<T>,
  timeoutMs: number,
  caller?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (caller?.aborted) return reject(new LlmError('cancelled', 'Caller stopped waiting'));
    const cleanup = () => {
      clearTimeout(timer);
      caller?.removeEventListener('abort', cancel);
    };
    const cancel = () => {
      cleanup();
      reject(new LlmError('cancelled', 'Caller stopped waiting'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new LlmError('timeout', 'Deadline exceeded'));
    }, timeoutMs);
    caller?.addEventListener('abort', cancel, { once: true });
    answer.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}
