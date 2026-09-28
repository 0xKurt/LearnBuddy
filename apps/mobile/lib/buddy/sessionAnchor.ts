// A fresh start when she comes back (issue #34): after a longer break the conversation
// gets a line at its end — a greeting for the time of day — so opening the app feels like
// a new page, with everything earlier still right above it. Nothing is deleted or hidden:
// continuity is Buddy's core, the anchor is only where the eye lands.
//
// Pure (unit-tested); the screen renders what these say.

/** How long a break has to be before the next opening starts a new page. */
export const SESSION_GAP_MS = 4 * 60 * 60 * 1000;

export type DayPart = 'morning' | 'day' | 'evening' | 'night';

/** Whether the conversation gets a fresh-start line at its end. */
export function startsNewSession(
  lastMessageAt: Date | null,
  now: Date,
  gapMs: number = SESSION_GAP_MS,
): boolean {
  // An empty conversation has its own first-visit screen; nothing to anchor.
  if (!lastMessageAt) return false;
  return now.getTime() - lastMessageAt.getTime() >= gapMs;
}

/** The part of her day, from the hour in her zone (the caller passes it). */
export function dayPart(hour: number): DayPart {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'day';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

/** How many wordings each part has (locales must carry exactly these). */
export const GREETING_VARIANTS = 3;

/**
 * Which wording this opening uses: stable while the screen lives, different across
 * openings — from the day and the opening's own number, never from a clock read during
 * render (that would change on every re-render).
 */
export function greetingVariant(openings: number): number {
  return ((openings % GREETING_VARIANTS) + GREETING_VARIANTS) % GREETING_VARIANTS;
}
