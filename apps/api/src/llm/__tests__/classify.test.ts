// One error classification at the model seam (audit S-7, provider-4xx-classified-retryable).

import { ApiError } from '@google/genai';
import { describe, expect, it } from 'vitest';

import { outcomeOfStatus } from '../../lib/outcome.js';
import { LlmError } from '../gateway.js';
import { classify } from '../vertex.js';

describe('provider errors → outcome', () => {
  it.each([
    [400, 'refused', 'refused', false],
    [403, 'refused', 'refused', false],
    [404, 'refused', 'refused', false],
    [429, 'rate_limited', 'transient', true],
    [500, 'unavailable', 'transient', true],
    [503, 'unavailable', 'transient', true],
  ] as const)('%i → %s (%s)', (status, kind, outcome, retryable) => {
    const err = classify(new ApiError({ message: 'x', status }));
    expect(err.kind).toBe(kind);
    expect(err.outcome).toBe(outcome);
    expect(err.retryable).toBe(retryable);
  });

  it('a timeout is unknown but may be retried (a model call changes nothing outside)', () => {
    const abort = Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    const err = classify(abort);
    expect(err.kind).toBe('timeout');
    expect(err.outcome).toBe('unknown');
    expect(err.retryable).toBe(true);
  });

  it('a safety block is a refusal, never retried, and keeps its finish reason', () => {
    const err = new LlmError('blocked', 'finish reason SAFETY', null, 'SAFETY');
    expect(err.outcome).toBe('refused');
    expect(err.retryable).toBe(false);
    expect(err.finishReason).toBe('SAFETY');
  });

  it('HTTP status classes', () => {
    expect(outcomeOfStatus(200)).toBe('ok');
    expect(outcomeOfStatus(401)).toBe('refused');
    expect(outcomeOfStatus(408)).toBe('transient');
    expect(outcomeOfStatus(502)).toBe('transient');
  });
});

describe('push errors → outcome', () => {
  it('an unanswered push is unknown (never repeated), a busy one transient, a refusal refused', async () => {
    const { PushRejectedError, PushUncertainError } = await import('../../push/transport.js');
    expect(new PushUncertainError('x').outcome).toBe('unknown');
    expect(new PushRejectedError('busy', 60).outcome).toBe('transient');
    expect(new PushRejectedError('no', null).outcome).toBe('refused');
  });
});
