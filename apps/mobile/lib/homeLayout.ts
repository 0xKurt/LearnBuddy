// What goes where on Buddy's home (docs/architecture.md §Home, user feedback #6,
// CLAUDE.md rule 16, docs/UX-PRINCIPLES.md §31–32, issue #17). Pure, so the rules are tested:
// - on top at most one slim bar (SlimBar.tsx, hard size contract: ≤ ~64 pt collapsed) —
//   the thing to act on now: a practice to go on with, one that is ready, the photo Buddy
//   waits for, the sheet being read — or, after a result, the practice prepared next;
// - everything that is told rather than acted on stands at the end of the conversation:
//   the sheet that could not be read, the finished practice (its full view one tap away),
//   the open decision (messages to the phone, how the test went), "Buddy is working";
// - and it is told ONCE: a finished practice Buddy's own greeting already names gets no card
//   under it (issue #195 — „Hi, Lienne!" followed by „Done! You answered 6 questions.");
// - one violet button: the bar on top has it, everything in the conversation is quieter;
// - "Buddy is working" is said once: inside the reading bar when it says the same thing,
//   otherwise as a line at the end of the conversation;
// - the photo Buddy waits for is asked once (issue #94): the capture bar on top carries
//   ask and way out, and only with the bar closed or gone does the receipt in the
//   conversation carry them instead.
// The row of ways to start stays (a paused homework bar can be there for days; starting
// something else must not depend on it).
// And where the conversation stands: like any chat, at its newest message (bottom); a new
// message scrolls to it — unless she scrolled up to read, then she stays where she is until
// she scrolls back down or sends something (followsEnd).
// The bar floats over the greeting and the row of ways to start (it never pushes them, the
// menu or the conversation down: the layout does not jump when it comes or goes). She can
// close it on this phone; it stays closed until what it says changes (topKey).

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';

export type HomeLayout = {
  /**
   * The slim bar on top, or none. 'next': the practice prepared after a result
   * (the result itself stands in the conversation — never both as cards).
   */
  bar: 'resume' | 'ready' | 'capture' | 'reading' | 'next' | null;
  /** A sheet could not be read: told at the end of the conversation, never on top. */
  failed: boolean;
  /**
   * A practice just finished and nothing has said so yet: its result stands at the end of the
   * conversation. False once Buddy's own greeting already tells about this session (issue
   * #195) — "Hi, Lienne!" with a flat „Done! You answered 6 questions." under it was two
   * voices saying one thing.
   */
  result: boolean;
  /** The open decision is asked at the end of the conversation (never a card on top). */
  decisionInline: boolean;
  /** Where "Buddy is working" is said: in the bar on top, in the conversation, or nowhere. */
  working: 'bar' | 'thread' | null;
  /**
   * Where the photo Buddy waits for is asked — once, not three times on one screen
   * (issue #94): while the capture bar stands on top it carries the ask (and "Kein Foto
   * nötig" as its quiet way out; the word-for-word receipt leaves the conversation);
   * closed or absent, the receipt in the conversation stays the place for ask and undo.
   */
  photoAsk: 'bar' | 'thread';
};

type TopParts = Pick<BuddyHome, 'now'> & {
  system?: Pick<BuddyHome['system'], 'model' | 'scheduler'>;
};

/**
 * What the layer on top says, as one string (the bar, with the system notes), or null when
 * nothing is on top. Closing it on this phone remembers this; a different bar, or the same
 * bar saying something new, is shown again. Decisions and thread notices are conversation,
 * not part of this key.
 */
export function topKey(h: TopParts): string | null {
  const now = h.now;
  const bar =
    now === null || now.type === 'material_failed'
      ? null
      : now.type === 'practice_result'
        ? now.next
          ? { next: now.next }
          : null
        : { now };
  const notes = [
    h.system && !h.system.model ? 'model' : null,
    h.system?.scheduler === 'stale' ? 'scheduler' : null,
  ].filter((n) => n !== null);
  if (!bar && notes.length === 0) return null;
  return JSON.stringify({ bar, notes });
}

export function homeLayout(
  h: Pick<BuddyHome, 'now' | 'decision' | 'working'> & TopParts,
  /** The topKey she closed on this phone, if any. */
  closed: string | null = null,
  /**
   * The finished practice Buddy's greeting already tells about, by session id
   * (`lib/buddy/sessionAnchor.ts` `sessionGreeting`, issue #195), while that greeting is on
   * screen. Its result then gets no card of its own: the greeting carries the sentence and
   * the way into the full view. Null (the default) = the greeting says nothing about it.
   */
  greetingTells: string | null = null,
): HomeLayout {
  const key = topKey(h);
  const hidden = key !== null && key === closed;
  const now = h.now;
  const bar =
    hidden || now === null
      ? null
      : now.type === 'resume_practice'
        ? 'resume'
        : now.type === 'practice_ready'
          ? 'ready'
          : now.type === 'capture_needed'
            ? 'capture'
            : now.type === 'material_processing'
              ? 'reading'
              : now.type === 'practice_result' && now.next
                ? 'next'
                : null;
  // "Ich lese dein Blatt …" already says Buddy is on the photos (one bar, not two notes).
  const inBar = bar === 'reading' && h.working === 'material';
  return {
    bar,
    failed: now?.type === 'material_failed',
    // Keyed on the session, not on "a greeting exists": a practice she finished AFTER the
    // greeting was written still gets its own card.
    result: now?.type === 'practice_result' && now.session_id !== greetingTells,
    decisionInline: h.decision !== null,
    working: h.working === null ? null : inBar ? 'bar' : 'thread',
    photoAsk: bar === 'capture' ? 'bar' : 'thread',
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
