// What a model call cost, taken from the provider's usageMetadata — never guessed.
// The prefix cache (issue #25) is read here: cachedContentTokenCount is part of the
// prompt tokens, and "not reported" stays 0 instead of becoming a claim (rule 5).

import type { GenerateContentResponse } from '@google/genai';
import { describe, expect, it } from 'vitest';

import { usageOf } from '../vertex.js';

const answer = (usageMetadata: GenerateContentResponse['usageMetadata']): GenerateContentResponse =>
  ({ usageMetadata }) as GenerateContentResponse;

describe('usage from the provider', () => {
  it('carries what the prefix cache served, as part of the prompt tokens', () => {
    const usage = usageOf(
      'gemini-3.6-flash',
      answer({
        promptTokenCount: 15_673,
        candidatesTokenCount: 120,
        thoughtsTokenCount: 64,
        cachedContentTokenCount: 12_176,
      }),
      1234,
    );
    expect(usage.inputTokens).toBe(15_673);
    expect(usage.cachedTokens).toBe(12_176);
    expect(usage.outputTokens).toBe(120);
    expect(usage.thoughtTokens).toBe(64);
    expect(usage.latencyMs).toBe(1234);
    // The discount is the provider's to give: cost stays the full price of the prompt.
    expect(usage.costMicros).toBeGreaterThan(0);
  });

  it('a call the provider reported no cache hit for counts as none, not as unknown', () => {
    const usage = usageOf(
      'gemini-3.6-flash',
      answer({ promptTokenCount: 4_200, candidatesTokenCount: 80 }),
      10,
    );
    expect(usage.cachedTokens).toBe(0);
    expect(usage.inputTokens).toBe(4_200);
  });

  it('no answer at all is all zeroes', () => {
    const usage = usageOf('gemini-3.6-flash', null, 5);
    expect(usage.inputTokens).toBe(0);
    expect(usage.cachedTokens).toBe(0);
    expect(usage.costMicros).toBe(0);
  });
});
