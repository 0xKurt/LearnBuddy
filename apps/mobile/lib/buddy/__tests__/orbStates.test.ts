import { describe, expect, it } from 'vitest';

import { orbForReply, orbForTalk, talkMode } from '../orbStates.js';

describe("app states → Buddy's states", () => {
  it('talk mode', () => {
    expect(orbForTalk('idle')).toBe('idle');
    expect(orbForTalk('listening')).toBe('listen');
    expect(orbForTalk('thinking')).toBe('think');
    expect(orbForTalk('waiting')).toBe('wait');
    expect(orbForTalk('speaking')).toBe('speak');
  });

  const base = {
    phase: 'paused' as const,
    hearing: false,
    transcribing: false,
    voiceLoading: false,
    trouble: false,
  };
  it('talk phases', () => {
    expect(talkMode({ ...base, phase: 'thinking' })).toBe('thinking');
    expect(talkMode({ ...base, phase: 'listening', transcribing: true })).toBe('thinking');
    // Buddy's voice for the sentence is still on its way: he is still thinking.
    expect(talkMode({ ...base, phase: 'speaking', voiceLoading: true })).toBe('thinking');
    expect(talkMode({ ...base, phase: 'speaking' })).toBe('speaking');
    expect(talkMode({ ...base, phase: 'listening', hearing: true })).toBe('listening');
    // Her turn: Buddy waits for her.
    expect(talkMode(base)).toBe('waiting');
    // Something went wrong: Buddy just rests (no "your turn" ping over an error).
    expect(talkMode({ ...base, trouble: true })).toBe('idle');
    expect(talkMode({ ...base, phase: 'listening' })).toBe('idle');
  });

  it('a reply celebrates only a right answer that arrives now', () => {
    expect(orbForReply({ fresh: true, afterCorrect: true })).toBe('happy');
    expect(orbForReply({ fresh: false, afterCorrect: true })).toBe('idle');
    expect(orbForReply({ fresh: true, afterCorrect: false })).toBe('idle');
  });
});
