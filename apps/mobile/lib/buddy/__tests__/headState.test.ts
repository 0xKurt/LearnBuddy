// The orb in the head is a claim about Buddy (issue #179, CLAUDE.md rule 5).

import { describe, expect, it } from 'vitest';

import { headState, type HeadFacts } from '../headState.js';

const quiet: HeadFacts = { sending: false, working: false, streaming: false };

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

  it('never claims to listen: the chat has no open microphone (#386, reading aloud is not listening)', () => {
    const all = [false, true].flatMap((sending) =>
      [false, true].flatMap((working) =>
        [false, true].map((streaming) => headState({ sending, working, streaming })),
      ),
    );
    expect(all).not.toContain('listen');
  });

  it('is idle when nothing is happening', () => {
    expect(headState(quiet)).toBe('idle');
  });
});
