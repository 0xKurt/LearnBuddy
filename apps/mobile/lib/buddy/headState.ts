// What the orb in the head shows (issue #179). Pure, so the claim is checkable.
//
// It is the one place she always sees, so what it says about Buddy has to follow what is
// happening on the screen (owner rule 1, #599). In #174 it was wired to `pending !== null` alone
// — the message being sent. The moment the answer starts arriving, `pending` is null again, so
// the orb went back to idle **while Buddy was writing**: the busiest moment of the whole app,
// shown as nothing happening.
//
// The choreography is the design's (ui_kits/app/App.jsx, HANDOFF §6): she writes → listening ·
// sent → thinking · the answer arrives → speaking · an open task → waiting · right → happy ·
// otherwise idle. Only existing poses (`MoonState`), nothing new.

import { moonForReply, type MoonState } from './moon.js';

export type HeadFacts = {
  /** A message of hers is on its way to the server. */
  sending: boolean;
  /** The server is working on a message of hers (status 'processing'). */
  working: boolean;
  /** An answer is arriving word by word. */
  streaming: boolean;
  /** She is writing or dictating a message right now. */
  typing?: boolean;
  /** Buddy is reading a sheet she sent (ui_kits/app/Flows.jsx `ChatState` "reading"). */
  reading?: boolean;
};

/**
 * The order is the statement: what Buddy is doing now beats what he was doing.
 * Writing wins over thinking, because the words on screen are the newer truth.
 */
export function headState(f: HeadFacts): MoonState {
  if (f.streaming) return 'speak';
  if (f.sending || f.working) return 'think';
  // 'listen' is the orb's pose while she is the one talking — the moon leans in — not a claim
  // that a microphone is open (decision on #599: the design and owner rule 1 over the earlier
  // reading of CLAUDE.md rule 5 here). The conversation screen's microphone is app/talk.tsx's.
  if (f.typing) return 'listen';
  if (f.reading) return 'think';
  return 'idle';
}

export type PracticeFacts = {
  /** She is saying her answer and it is being recorded. */
  listening?: boolean;
  /** Her answer (or her question about the task) is with the server. */
  checking: boolean;
  /** The task on screen still waits for her answer. */
  open: boolean;
  /** Buddy's newest reply arrived while she was looking, not with the screen. */
  fresh: boolean;
  /** …and it answers a try of hers that was right. Never true where verdicts are hidden. */
  afterCorrect: boolean;
};

/**
 * The head of a task (implementation/MIGRATION.md §6): waiting while it is open, thinking while
 * her answer is checked, and after the feedback what `moonForReply` says — a right answer that
 * just came back celebrates, anything else rests. The celebration ends by itself (moon.ts).
 */
export function practiceHeadState(f: PracticeFacts): MoonState {
  if (f.listening) return 'listen';
  if (f.checking) return 'think';
  const reply = moonForReply({ fresh: f.fresh, afterCorrect: f.afterCorrect });
  if (reply !== 'idle') return reply;
  return f.open ? 'wait' : 'idle';
}
