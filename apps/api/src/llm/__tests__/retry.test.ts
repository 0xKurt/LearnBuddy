// What is worth trying again at once, and what is not (issue #167).

import { describe, expect, it } from 'vitest';

import { LlmError } from '../gateway.js';
import { RETRY_AFTER_MS, RETRY_JITTER_MS, retryDelayMs, worthASecondTry } from '../retry.js';

describe('a second attempt', () => {
  it('is worth it when the provider was unreachable', () => {
    expect(worthASecondTry(new LlmError('unavailable', 'provider error 503'))).toBe(true);
  });

  it('is not worth it on a rate limit: a pause of 350 ms does not buy quota', () => {
    // Measured 01.10. (issue #167): 3.8 in eu answered 429 RESOURCE_EXHAUSTED, and Google's
    // own client backs off inside the call — one probe came back after 229 seconds. Another
    // attempt here would stack a second long wait on the first. The 30 s timeout is what
    // protects the child.
    expect(worthASecondTry(new LlmError('rate_limited', 'provider rate limit'))).toBe(false);
  });

  it('is not worth it when the answer would be the same', () => {
    // A refusal, a safety block and unusable output are decisions, not weather.
    expect(worthASecondTry(new LlmError('refused', 'provider rejected the request'))).toBe(false);
    expect(worthASecondTry(new LlmError('blocked', 'finish reason SAFETY'))).toBe(false);
    expect(worthASecondTry(new LlmError('invalid_output', 'not JSON'))).toBe(false);
  });

  it('is not worth it after a timeout: the call already spent its whole budget', () => {
    expect(worthASecondTry(new LlmError('timeout', 'model call timed out'))).toBe(false);
  });

  it('says no to anything that is not a model error at all', () => {
    expect(worthASecondTry(new Error('something else'))).toBe(false);
    expect(worthASecondTry(null)).toBe(false);
  });

  it('waits long enough to be a different moment, short enough for a waiting child', () => {
    expect(retryDelayMs(() => 0)).toBe(RETRY_AFTER_MS);
    expect(retryDelayMs(() => 0.999)).toBeLessThan(RETRY_AFTER_MS + RETRY_JITTER_MS);
    // Half a second at most: anything longer is felt, and #59 is already open.
    expect(RETRY_AFTER_MS + RETRY_JITTER_MS).toBeLessThanOrEqual(600);
  });

  it('spreads, so a fleet coming back does not arrive in step', () => {
    const spread = new Set([0.1, 0.4, 0.9].map((r) => retryDelayMs(() => r)));
    expect(spread.size).toBe(3);
  });
});
