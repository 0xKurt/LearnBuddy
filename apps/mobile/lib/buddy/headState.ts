// What the orb in the head shows (issue #179). Pure, so the claim is checkable.
//
// It is the one place she always sees, so what it says about Buddy has to be true
// (CLAUDE.md rule 5). In #174 it was wired to `pending !== null` alone — the message being
// sent. The moment the answer starts arriving, `pending` is null again, so the orb went
// back to idle **while Buddy was writing**: the busiest moment of the whole app, shown as
// nothing happening.
//
// The thread already knows better; this gives the head the same facts.

import type { MoonState } from './moon.js';

export type HeadFacts = {
  /** A message of hers is on its way to the server. */
  sending: boolean;
  /** The server is working on a message of hers (status 'processing'). */
  working: boolean;
  /** An answer is arriving word by word. */
  streaming: boolean;
};

/**
 * The order is the statement: what Buddy is doing now beats what he was doing.
 * Writing wins over thinking, because the words on screen are the newer truth.
 */
export function headState(f: HeadFacts): MoonState {
  if (f.streaming) return 'speak';
  if (f.sending || f.working) return 'think';
  // Never 'listen' here: the chat's head has no open microphone to claim. Reading aloud is not
  // listening (issue #386 split the two); listening is the conversation screen's (app/talk.tsx).
  return 'idle';
}
