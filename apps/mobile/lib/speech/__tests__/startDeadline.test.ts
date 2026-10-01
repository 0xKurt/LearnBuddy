// Getting the microphone ready has a deadline (issue #158).
//
// The start path asks for the permission and prepares the recorder, and neither had a time
// limit. A permission sheet left unanswered, or a phone busy with another app, left the
// voice input in `starting` for ever — while the talk screen said "Ich höre zu". She would
// speak and only find out afterwards that nothing had been recorded.
//
// The deadline itself lives in lib/speech/record.ts; what is testable without a recorder
// is the decision it makes, so that decision is its own function here.

import { describe, expect, it } from 'vitest';

import { START_DEADLINE_MS, startTimedOut } from '../startDeadline.js';

describe('the deadline for getting ready', () => {
  it('gives her long enough to answer a permission sheet', () => {
    // Shorter than this and a child reading the OS dialog would lose the recording.
    expect(START_DEADLINE_MS).toBeGreaterThanOrEqual(10_000);
  });

  it('does not let her talk into a microphone that never started', () => {
    expect(START_DEADLINE_MS).toBeLessThanOrEqual(30_000);
  });

  it('fires only while it is still getting ready', () => {
    expect(startTimedOut({ phase: 'starting', mounted: true })).toBe(true);
    expect(startTimedOut({ phase: 'recording', mounted: true })).toBe(false);
    expect(startTimedOut({ phase: 'idle', mounted: true })).toBe(false);
  });

  it('does nothing once the screen is gone', () => {
    // Leaving the screen already stops the attempt; a late timer must not fire a failure
    // into a component that is no longer there.
    expect(startTimedOut({ phase: 'starting', mounted: false })).toBe(false);
  });
});
