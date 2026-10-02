// What a failed model call is worth trying again, and how that stays inside the caller's
// own timeout (issues #167, #206).
//
// The provider itself is a fake here: a real 429 from Vertex cannot be produced on demand,
// so what is proven below is the schedule, the attempt count and the budget arithmetic —
// not that Vertex answers the way the fake does. The classification of a real 429 is proven
// separately in classify.test.ts against the provider's own error class.

import { describe, expect, it } from 'vitest';

import { LlmError, type LlmRequest, type LlmResult } from '../gateway.js';
import {
  attemptsFor,
  generateWithRetries,
  MIN_ATTEMPT_MS,
  retryPauseMs,
  RETRY_JITTER_RATIO,
  RETRY_PAUSE_FACTOR,
  RETRY_PAUSE_MS,
  type RetryWaits,
} from '../retry.js';

function request(over: Partial<LlmRequest> = {}): LlmRequest {
  return {
    purpose: 'buddy_turn',
    tier: 'smart',
    promptVersion: 'test.v1',
    system: 'system',
    contents: [{ role: 'user', parts: [{ text: 'hallo' }] }],
    schema: { type: 'object' },
    maxOutputTokens: 256,
    temperature: 0.3,
    timeoutMs: 30_000,
    ...over,
  };
}

const answer: LlmResult = {
  json: { ok: true },
  usage: {
    model: 'test',
    inputTokens: 1,
    outputTokens: 1,
    thoughtTokens: 0,
    cachedTokens: 0,
    costMicros: 0,
    latencyMs: 1,
  },
};

/**
 * A clock that only moves when the code under test waits or when an attempt says how long
 * it took, and a sleep that records instead of sleeping — so a test of a 1.5 s backoff
 * costs no time at all.
 */
function fakeWaits(opts: { random?: number } = {}) {
  let elapsed = 0;
  const slept: number[] = [];
  const waits: RetryWaits = {
    elapsedMs: () => elapsed,
    sleep: async (ms) => {
      slept.push(ms);
      elapsed += ms;
    },
    random: () => opts.random ?? 0,
  };
  return {
    waits,
    slept,
    /** An attempt that burns `ms` of the budget and then fails with `err`. */
    takes: (ms: number) => {
      elapsed += ms;
    },
    get elapsed() {
      return elapsed;
    },
  };
}

describe('how many attempts a failure is worth', () => {
  it('gives an unreachable provider one more try (#167)', () => {
    expect(attemptsFor(new LlmError('unavailable', 'provider error 503'))).toBe(2);
  });

  it('gives a throttle two more tries (#206)', () => {
    // Measured 01.10.: every Vertex model in the project answered 429 RESOURCE_EXHAUSTED.
    // Dynamic shared quota is borrowed per moment, so the next second can be free.
    expect(attemptsFor(new LlmError('rate_limited', 'provider rate limit'))).toBe(3);
  });

  it('gives none to an answer that would come back the same', () => {
    expect(attemptsFor(new LlmError('refused', 'provider rejected the request'))).toBe(1);
    expect(attemptsFor(new LlmError('blocked', 'finish reason SAFETY'))).toBe(1);
    expect(attemptsFor(new LlmError('invalid_output', 'not JSON'))).toBe(1);
  });

  it('gives none after a timeout: the call already spent its whole budget', () => {
    expect(attemptsFor(new LlmError('timeout', 'model call timed out'))).toBe(1);
  });

  it('gives none to anything that is not a model error at all', () => {
    expect(attemptsFor(new Error('something else'))).toBe(1);
    expect(attemptsFor(null)).toBe(1);
  });
});

describe('the pause between attempts', () => {
  it('grows with every attempt', () => {
    expect(retryPauseMs(1, () => 0)).toBe(RETRY_PAUSE_MS);
    expect(retryPauseMs(2, () => 0)).toBe(RETRY_PAUSE_MS * RETRY_PAUSE_FACTOR);
  });

  it('spreads, so a fleet coming back does not arrive in step', () => {
    const spread = new Set([0.1, 0.4, 0.9].map((r) => retryPauseMs(1, () => r)));
    expect(spread.size).toBe(3);
    expect(retryPauseMs(1, () => 0.999)).toBeLessThanOrEqual(
      RETRY_PAUSE_MS * (1 + RETRY_JITTER_RATIO),
    );
  });

  it('adds at most about two seconds of waiting over three attempts (#59)', () => {
    const worst = retryPauseMs(1, () => 1) + retryPauseMs(2, () => 1);
    expect(worst).toBeLessThanOrEqual(2_200);
  });
});

describe('a throttled call inside the caller’s budget', () => {
  it('tries three times and succeeds on the third', async () => {
    const f = fakeWaits();
    const seen: number[] = [];
    let calls = 0;
    const result = await generateWithRetries(
      request(),
      async (_req, timeoutMs) => {
        seen.push(timeoutMs);
        calls++;
        f.takes(100);
        if (calls < 3) throw new LlmError('rate_limited', 'provider rate limit');
        return answer;
      },
      f.waits,
    );
    expect(result).toBe(answer);
    expect(calls).toBe(3);
    // The first attempt may use the whole budget; each later one gets only what is left.
    expect(seen[0]).toBe(30_000);
    expect(seen[1]).toBe(30_000 - 100 - RETRY_PAUSE_MS);
    expect(seen[2]).toBe(30_000 - 200 - RETRY_PAUSE_MS - RETRY_PAUSE_MS * RETRY_PAUSE_FACTOR);
    expect(f.slept).toEqual([RETRY_PAUSE_MS, RETRY_PAUSE_MS * RETRY_PAUSE_FACTOR]);
  });

  it('never spends more than the timeout the caller asked for', async () => {
    const f = fakeWaits({ random: 1 });
    let calls = 0;
    await expect(
      generateWithRetries(
        request({ timeoutMs: 30_000 }),
        async (_req, timeoutMs) => {
          calls++;
          // Every attempt uses the whole slice it was given and then reports a throttle.
          f.takes(timeoutMs);
          throw new LlmError('rate_limited', 'provider rate limit');
        },
        f.waits,
      ),
    ).rejects.toThrow(LlmError);
    // The first attempt ate the budget, so there was no room for a second one at all.
    expect(calls).toBe(1);
    expect(f.elapsed).toBeLessThanOrEqual(30_000);
  });

  it('stops retrying when too little of the budget is left to finish an attempt', async () => {
    const f = fakeWaits();
    let calls = 0;
    await expect(
      generateWithRetries(
        // Just enough for one attempt plus the first pause, not enough for a second attempt
        // to have MIN_ATTEMPT_MS left.
        request({ timeoutMs: 1_000 + RETRY_PAUSE_MS + MIN_ATTEMPT_MS - 1 }),
        async () => {
          calls++;
          f.takes(1_000);
          throw new LlmError('rate_limited', 'provider rate limit');
        },
        f.waits,
      ),
    ).rejects.toThrow('provider rate limit');
    expect(calls).toBe(1);
    expect(f.slept).toEqual([]);
  });

  it('keeps the one extra attempt an unreachable provider used to get', async () => {
    const f = fakeWaits();
    let calls = 0;
    await expect(
      generateWithRetries(
        request(),
        async () => {
          calls++;
          f.takes(50);
          throw new LlmError('unavailable', 'provider error 503');
        },
        f.waits,
      ),
    ).rejects.toThrow('provider error 503');
    expect(calls).toBe(2);
  });

  it('does not retry a refusal, a block or unusable output', async () => {
    for (const err of [
      new LlmError('refused', 'provider rejected the request'),
      new LlmError('blocked', 'finish reason SAFETY'),
      new LlmError('invalid_output', 'not JSON'),
      new LlmError('timeout', 'model call timed out'),
    ]) {
      const f = fakeWaits();
      let calls = 0;
      await expect(
        generateWithRetries(
          request(),
          async () => {
            calls++;
            throw err;
          },
          f.waits,
        ),
      ).rejects.toThrow(err.message);
      expect(calls).toBe(1);
    }
  });

  it('never restarts a streamed answer she has already begun to read', async () => {
    const f = fakeWaits();
    const shown: string[] = [];
    let calls = 0;
    await expect(
      generateWithRetries(
        request({ onPartial: (text) => shown.push(text) }),
        async (req) => {
          calls++;
          req.onPartial?.('Fast ');
          throw new LlmError('rate_limited', 'provider rate limit');
        },
        f.waits,
      ),
    ).rejects.toThrow('provider rate limit');
    expect(calls).toBe(1);
    expect(shown).toEqual(['Fast ']);
  });

  it('still retries a streamed call that had not produced a word yet', async () => {
    const f = fakeWaits();
    let calls = 0;
    const result = await generateWithRetries(
      request({ onPartial: () => undefined }),
      async (req) => {
        calls++;
        if (calls === 1) throw new LlmError('rate_limited', 'provider rate limit');
        req.onPartial?.('{"ok":true}');
        return answer;
      },
      f.waits,
    );
    expect(result).toBe(answer);
    expect(calls).toBe(2);
  });

  it('keeps each call’s own streaming state: one streamed answer does not block another', async () => {
    const f = fakeWaits();
    // A streamed call that hands out text cannot be retried; a plain call running at the
    // same moment still must be (the flag is per call, never per gateway).
    const streamed = generateWithRetries(
      request({ onPartial: () => undefined }),
      async (req) => {
        req.onPartial?.('Hallo');
        throw new LlmError('rate_limited', 'throttled while streaming');
      },
      f.waits,
    );
    await expect(streamed).rejects.toThrow('throttled while streaming');
    let calls = 0;
    const plain = await generateWithRetries(
      request(),
      async () => {
        calls++;
        if (calls === 1) throw new LlmError('rate_limited', 'provider rate limit');
        return answer;
      },
      f.waits,
    );
    expect(plain).toBe(answer);
    expect(calls).toBe(2);
  });
});
