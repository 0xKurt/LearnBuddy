// "↓ Neue Antwort": she scrolled up to read and Buddy answered meanwhile. The
// pill shows only then — never while she is at the end (she sees it), never for
// what was there when she scrolled up — and a tap brings her to the end.
// Pure logic (unit tests); the screen tracks `following` (lib/homeLayout.ts followsEnd).

export type ReplySeen = {
  /** Buddy's newest message she has seen at the end of the conversation. */
  seen: string | null;
};

/** Buddy's newest message id in a thread, or null. */
export function newestBuddyId(
  thread: ReadonlyArray<{ id: string; role: 'learner' | 'buddy' }>,
): string | null {
  for (let i = thread.length - 1; i >= 0; i--) {
    const m = thread[i];
    if (m && m.role === 'buddy') return m.id;
  }
  return null;
}

/** What she has seen after this moment: at the end, she sees the newest reply. */
export function seenAfter(prev: ReplySeen, following: boolean, newest: string | null): ReplySeen {
  return following ? { seen: newest } : prev;
}

/** Whether the pill shows: scrolled up, and a reply came (or is being written) since. */
export function showNewReply(
  seen: ReplySeen,
  following: boolean,
  newest: string | null,
  writing: boolean,
): boolean {
  if (following) return false;
  return writing || (newest !== null && newest !== seen.seen);
}
