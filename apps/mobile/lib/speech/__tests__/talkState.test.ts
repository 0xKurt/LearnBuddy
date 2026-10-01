// "Ich höre zu." is a claim about a running microphone (issue #158, CLAUDE.md rule 5).

import { describe, expect, it } from 'vitest';

import { talkHeadline, type MicState, type TalkPhase } from '../talkState.js';

const MICS: MicState[] = ['idle', 'starting', 'recording', 'transcribing'];
const PHASES: TalkPhase[] = ['listening', 'thinking', 'speaking', 'paused'];

describe('what the conversation screen says', () => {
  it('never says "listening" while the recorder is still starting', () => {
    for (const phase of PHASES) {
      expect(talkHeadline(phase, 'starting')).not.toBe('buddy:talk.listening');
    }
    expect(talkHeadline('listening', 'starting')).toBe('buddy:talk.getting_ready');
  });

  it('says "listening" only once the recorder really runs', () => {
    expect(talkHeadline('listening', 'recording')).toBe('buddy:talk.listening');
    // Idle with the screen in its listening phase is the moment right before the start —
    // the app is between turns and the microphone is not holding anything yet.
    expect(talkHeadline('listening', 'idle')).toBe('buddy:talk.listening');
  });

  it('puts what Buddy is doing before what the microphone is doing', () => {
    expect(talkHeadline('thinking', 'starting')).toBe('buddy:talk.thinking');
    expect(talkHeadline('speaking', 'starting')).toBe('buddy:talk.speaking');
    // Her words are being turned into text: that is thinking, whatever the screen's phase.
    for (const phase of PHASES) {
      expect(talkHeadline(phase, 'transcribing')).toBe('buddy:talk.thinking');
    }
  });

  it('falls back to her turn', () => {
    for (const mic of MICS) {
      if (mic === 'starting' || mic === 'transcribing') continue;
      expect(talkHeadline('paused', mic)).toBe('buddy:talk.paused');
    }
  });
});
