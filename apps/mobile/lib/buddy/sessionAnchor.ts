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
// What the greeting SAYS knows about the practice she just finished (`sessionGreeting`,
// issue #195) — from the home's own payload, so still no model call and no second request.
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
const GREETING_VARIANTS = 3;

/**
 * Which wording this opening uses. It was fed the day of the month, so everyone who opened
 * the app five times on a Tuesday got the same sentence five times — the owner's "auf Dauer
 * langweilig" (issue #129). It takes the minute of the opening now, which is what the name
 * always promised: different across openings, and still stable while the screen lives,
 * because the caller captures `now` once when the session anchor is decided and never reads
 * the clock during a render.
 *
 * Two openings inside the same minute share a greeting on purpose: opening twice in ten
 * seconds should not look like a slot machine.
 */
export function greetingVariant(minuteOfDay: number): number {
  return ((minuteOfDay % GREETING_VARIANTS) + GREETING_VARIANTS) % GREETING_VARIANTS;
}

/** What the greeting says: a key under the `buddy:session.` tree, with its values. */
export type Greeting = {
  /** The locale key, without the namespace. */
  key: string;
  /** The number the sentence names, where it names one (i18next plural). */
  count?: number;
  /**
   * The finished practice this greeting already tells about, by session id — then nothing
   * else repeats it (`lib/homeLayout.ts`). Null: the greeting is only a hello.
   */
  tells: string | null;
};

/**
 * Which sentence Buddy opens this visit with (issue #195): what a domain has to tell about what she
 * just did (`news`, lib/buddy/useSessionStart.ts `greetingNews` — the learning domain's finished
 * practice, lib/learning/greeting.ts), or the plain hello with its wording for the part of the day.
 */
export function sessionGreeting(part: DayPart, variant: number, news: Greeting | null): Greeting {
  return news ?? { key: `session.${part}.${variant}`, tells: null };
}

/** What a domain tells in the greeting, for the moment the greeting stands after. */
export type GreetingNews = (since: string | null) => Greeting | null;

/** A greeting as this opening holds it, with what it still needs to know. */
export type GreetingState = Greeting & {
  /** Kept so the refinement below reads no clock a second time. */
  part: DayPart;
  variant: number;
  /** When the message it stands under was written (what a domain's news is measured from). */
  since: string | null;
  /**
   * The sentence was composed from the copy of the home kept on the device, which carries no
   * `now` at all (`lib/api/deviceCache.ts` `settledHome`, CLAUDE.md rule 5) — so what she just
   * did was invisible to it and the server's first home can still add it (`refineGreeting`).
   */
  pending: boolean;
};

/**
 * The greeting this opening starts with. `confirmed`: whether this home came from the server
 * rather than from the kept copy — the copy is what makes opening the app instant (and what
 * works offline), and the price is that it says nothing about now.
 */
export function openGreeting(
  part: DayPart,
  variant: number,
  news: GreetingNews,
  confirmed: boolean,
  since: string | null = null,
): GreetingState {
  return {
    ...sessionGreeting(part, variant, news(since)),
    part,
    variant,
    since,
    pending: !confirmed,
  };
}

/**
 * What the greeting becomes when the server's first home arrives — the one refinement it ever
 * gets (issue #195). It takes up the practice that home reports, in the same bubble and the
 * same place, and is then settled for good.
 *
 * Only forwards: a greeting that already named her practice never goes back to a bare hello,
 * and a plain one is only replaced when there is something true to say. And only while nothing
 * has been said since (`stillLast`) — a sentence standing above her own message must not change
 * under her.
 */
export function refineGreeting(
  current: GreetingState,
  news: GreetingNews,
  stillLast: boolean,
): GreetingState {
  if (!current.pending) return current;
  const next = sessionGreeting(current.part, current.variant, news(current.since));
  if (next.tells === null || !stillLast) return { ...current, pending: false };
  return {
    ...next,
    part: current.part,
    variant: current.variant,
    since: current.since,
    pending: false,
  };
}
