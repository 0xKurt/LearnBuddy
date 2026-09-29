// A fresh start when she comes back (issues #34, #104): a visit that begins a new session
// ends the conversation with a greeting of Buddy's own — his bubble, like everything else he
// says — and the view opens on it, with everything earlier one swipe above. Nothing is
// deleted or hidden: continuity is Buddy's core, the greeting is only where the eye lands.
//
// Two things begin a session, either one on its own:
//   · the app itself started — she closed it and opened it again (lib/buddy/appStart.ts);
//   · a long enough break since the last message, on a screen that stayed open.
// Coming back from the background is neither: the greeting would otherwise come with every
// glance at the phone (issue #104).
//
// Pure (unit-tested); the screen renders what these say.

/** How long a break has to be before the next opening starts a new page. */
export const SESSION_GAP_MS = 4 * 60 * 60 * 1000;

export type DayPart = 'morning' | 'day' | 'evening' | 'night';

/** What one opening of the home knows about itself. */
export type Opening = {
  /** When the conversation's last message was written; null = there is none. */
  lastMessageAt: Date | null;
  /** Now, on the screen's clock. */
  now: Date;
  /**
   * Whether this opening is the app's own start — a fresh process, taken once
   * (`takeColdStart()`). A return from the background is not one.
   */
  coldStart: boolean;
  /** How long a break has to be while the app kept running. */
  gapMs?: number;
};

/** Whether this opening starts a new session, so Buddy greets her at the end of the thread. */
export function startsNewSession({
  lastMessageAt,
  now,
  coldStart,
  gapMs = SESSION_GAP_MS,
}: Opening): boolean {
  // An empty conversation has its own first-visit screen; nothing to greet over.
  if (!lastMessageAt) return false;
  // A fresh process is a fresh session, whatever the clock says (issue #104).
  if (coldStart) return true;
  return now.getTime() - lastMessageAt.getTime() >= gapMs;
}

/**
 * How tall the greeting's block is made so the eye lands on it (issue #104). The thread
 * stands at its end, so the block's bottom sits at the bottom of the view: a block as tall
 * as the view therefore puts the greeting's top at the top of it and leaves the rest free —
 * the empty page she opens on, with everything earlier one swipe above.
 *
 * `tail` is what the list still adds under the block (the thread's bottom padding).
 * 0 while the view has not been measured yet: then the conversation simply ends as usual.
 */
export function greetingRoom(viewHeight: number, tail: number): number {
  if (viewHeight <= 0) return 0;
  return Math.max(0, viewHeight - tail);
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
