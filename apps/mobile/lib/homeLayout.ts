// What goes where on Buddy's home (docs/architecture.md §Home, user feedback #6,
// CLAUDE.md rule 16, docs/UX-PRINCIPLES.md §31–32). Pure, so the rules are tested:
// - at most one card on top — the thing that matters now; with it, the open question
//   (messages to the phone, how the test went) is asked at the end of the conversation;
// - one violet button: the card on top has it, everything in the conversation is quieter;
// - "Buddy is working" is said once: inside the card when the card says the same thing,
//   otherwise as a line at the end of the conversation.
// The row of ways to start stays (a paused homework card can be there for days; starting
// something else must not depend on it).
// And where the conversation stands: like any chat, at its newest message (bottom); a new
// message scrolls to it — unless she scrolled up to read, then she stays where she is until
// she scrolls back down or sends something (followsEnd). Her message is not hidden by the
// card on top because the card takes its own room above the conversation.

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';

export type HomeLayout = {
  /** The one card on top: the "now" card, else the open decision, else none. */
  top: 'now' | 'decision' | null;
  /** The open decision is asked in the conversation (another card is on top). */
  decisionInline: boolean;
  /** Where "Buddy is working" is said: in the card on top, in the conversation, or nowhere. */
  working: 'card' | 'thread' | null;
};

export function homeLayout(h: Pick<BuddyHome, 'now' | 'decision' | 'working'>): HomeLayout {
  const top = h.now ? 'now' : h.decision ? 'decision' : null;
  // "Ich lese dein Blatt …" already says Buddy is on the photos (one card, not two).
  const inCard = h.working === 'material' && h.now?.type === 'material_processing';
  return {
    top,
    decisionInline: h.now !== null && h.decision !== null,
    working: h.working === null ? null : inCard ? 'card' : 'thread',
  };
}

/**
 * Whether the conversation keeps following its newest message after a scroll to `y`:
 * yes when it is (about) at the end; no once she scrolled up away from it; otherwise as
 * before (a programmatic scroll towards the end, or content growing under a followed
 * thread, never stops following).
 */
export function followsEnd(
  wasFollowing: boolean,
  prevY: number,
  y: number,
  viewHeight: number,
  contentHeight: number,
  slack = 24,
): boolean {
  if (contentHeight - viewHeight - y <= slack) return true;
  if (y < prevY) return false;
  return wasFollowing;
}
