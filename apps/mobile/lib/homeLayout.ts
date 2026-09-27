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
// she scrolls back down or sends something (followsEnd).
// The card on top floats over the greeting and the row of ways to start (it never pushes
// them, the menu or the conversation down: the layout does not jump when a card comes or
// goes). She can close it on this phone; it stays closed until what it says changes
// (topKey). A closed decision is then asked at the end of the conversation.

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';

export type HomeLayout = {
  /** The one card on top: the "now" card, else the open decision, else none. */
  top: 'now' | 'decision' | null;
  /** The open decision is asked in the conversation (another card is on top). */
  decisionInline: boolean;
  /** Where "Buddy is working" is said: in the card on top, in the conversation, or nowhere. */
  working: 'card' | 'thread' | null;
};

type TopParts = Pick<BuddyHome, 'now' | 'decision'> & {
  system?: Pick<BuddyHome['system'], 'model' | 'scheduler'>;
};

/**
 * What the card on top says, as one string (with the system notes above it), or null when
 * nothing is on top. Closing the card on this phone remembers this; a different card, or the
 * same card saying something new, is shown again.
 */
export function topKey(h: TopParts): string | null {
  const card = h.now ? { now: h.now } : h.decision ? { decision: h.decision } : null;
  const notes = [
    h.system && !h.system.model ? 'model' : null,
    h.system?.scheduler === 'stale' ? 'scheduler' : null,
  ].filter((n) => n !== null);
  if (!card && notes.length === 0) return null;
  return JSON.stringify({ card, notes });
}

export function homeLayout(
  h: Pick<BuddyHome, 'now' | 'decision' | 'working'> & TopParts,
  /** The topKey she closed on this phone, if any. */
  closed: string | null = null,
): HomeLayout {
  const key = topKey(h);
  const hidden = key !== null && key === closed;
  const top = hidden ? null : h.now ? 'now' : h.decision ? 'decision' : null;
  // "Ich lese dein Blatt …" already says Buddy is on the photos (one card, not two).
  const inCard = top === 'now' && h.working === 'material' && h.now?.type === 'material_processing';
  return {
    top,
    // Asked in the conversation while another card is on top, or when she closed it.
    decisionInline: h.decision !== null && top !== 'decision',
    working: h.working === null ? null : inCard ? 'card' : 'thread',
  };
}

/**
 * Whether the conversation keeps following its newest message after a scroll to `y`:
 * yes when it is (about) at the end; no once she scrolled up away from it; otherwise as
 * before (a programmatic scroll towards the end, or content growing under a followed
 * thread, never stops following). `reshaped`: the content or the view changed size since
 * the last scroll (the room kept free under the card on top, a smaller window) — a jump
 * of the offset then is the browser's, not her scrolling up.
 */
export function followsEnd(
  wasFollowing: boolean,
  prevY: number,
  y: number,
  viewHeight: number,
  contentHeight: number,
  slack = 24,
  reshaped = false,
): boolean {
  if (contentHeight - viewHeight - y <= slack) return true;
  if (reshaped) return wasFollowing;
  if (y < prevY) return false;
  return wasFollowing;
}
