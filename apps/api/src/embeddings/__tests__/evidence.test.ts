import { describe, expect, it } from 'vitest';
import { clearVectorDistances } from '../evidence.js';
describe('provider-specific retrieval evidence', () => {
  it('accepts the measured weaker similarity only for a separated nearest match', () => {
    expect(clearVectorDistances('openai-small-1536', [0.642, 0.726])).toEqual(new Set([0.642]));
    expect(clearVectorDistances('openai-small-1536', [0.461, 0.504])).toEqual(new Set([0.461]));
    expect(clearVectorDistances('openai-small-1536', [0.6, 0.61])).toEqual(new Set());
    expect(clearVectorDistances('openai-small-1536', [0.718, 0.8])).toEqual(new Set());
    expect(clearVectorDistances('openai-small-1536', [0.6, 0.6])).toEqual(new Set());
  });
  it('retains the existing provider threshold', () => {
    expect(clearVectorDistances(undefined, [0.2, 0.34, 0.36])).toEqual(new Set([0.2, 0.34]));
  });
});
