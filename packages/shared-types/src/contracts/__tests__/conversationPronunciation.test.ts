import { describe, expect, it } from 'vitest';
import { SendMessageRequest } from '../buddy.js';
import {
  conversationPronunciationPlan,
  conversationPronunciationWords,
} from '../conversationPronunciation.js';

const evidence = {
  source: 'vosk' as const,
  heard: 'three trees',
  elapsed_ms: 10,
  words: [
    { heard: 'three', confidence: 1 },
    { heard: 'trees', confidence: 0.5 },
  ],
  unavailable: [],
};
const plan = {
  version: 1 as const,
  language: 'en',
  words: [
    { expected: 'Three', confusions: ['free'] },
    { expected: 'trees', confusions: [] },
  ],
};
describe('conversation pronunciation contract', () => {
  it('uses precisely the transcript words, reusing only matching prepared competitors', () => {
    expect(conversationPronunciationPlan('Trees, three trees!', 'en', plan)?.words).toEqual([
      { expected: 'Trees', confusions: [] },
      { expected: 'three', confusions: ['free'] },
      { expected: 'trees', confusions: [] },
    ]);
    expect(conversationPronunciationPlan('Three', 'fr', plan)?.words[0]?.confusions).toEqual([]);
    expect(conversationPronunciationPlan('word '.repeat(41), 'en')).toBeNull();
  });
  it('passes evidence alongside unchanged text and rejects mismatched targets or audio', () => {
    const request = {
      client_message_id: '00000000-0000-4000-8000-000000000001',
      text: 'Three trees.',
      pronunciation: { plan, evidence },
    };
    expect(SendMessageRequest.parse(request).pronunciation).toEqual({ plan, evidence });
    expect(SendMessageRequest.safeParse({ ...request, text: 'Help me' }).success).toBe(false);
    expect(
      SendMessageRequest.safeParse({
        ...request,
        pronunciation: { plan, evidence, audio_base64: 'private' },
      }).success,
    ).toBe(false);
  });
  it('grades centrally and omits uncertain words, never trusting supplied verdicts', () => {
    expect(conversationPronunciationWords({ plan, evidence })).toEqual([
      { expected: 'Three', heard: 'three', confidence: 1, verdict: 'passt' },
    ]);
    expect(
      conversationPronunciationWords({ plan, evidence: { ...evidence, unavailable: ['free'] } }),
    ).toEqual([]);
  });
});
