// The orb in the head is a claim about Buddy (issue #179, CLAUDE.md rule 5).

import { describe, expect, it } from 'vitest';

import { headState, type HeadFacts } from '../headState.js';

const quiet: HeadFacts = { sending: false, working: false, streaming: false, voiceMode: false };

describe('what the head says Buddy is doing', () => {
  it('never shows idle while an answer is being written', () => {
    // The fault this fixes: `pending` is null again the moment streaming starts, so the
    // orb went back to idle at the busiest moment of the app.
    expect(headState({ ...quiet, streaming: true })).toBe('speak');
    expect(headState({ ...quiet, streaming: true, sending: false })).toBe('speak');
  });

  it('thinks from the sent message until the first word comes back', () => {
    expect(headState({ ...quiet, sending: true })).toBe('think');
    expect(headState({ ...quiet, working: true })).toBe('think');
  });

  it('puts what he does now over what he did a moment ago', () => {
    expect(headState({ ...quiet, working: true, streaming: true })).toBe('speak');
  });

  it('listens in voice mode while nothing is in flight', () => {
    expect(headState({ ...quiet, voiceMode: true })).toBe('listen');
    // …but not while he is busy: that would claim a microphone is open.
    expect(headState({ ...quiet, voiceMode: true, working: true })).toBe('think');
  });

  it('is idle when nothing is happening', () => {
    expect(headState(quiet)).toBe('idle');
  });
});
