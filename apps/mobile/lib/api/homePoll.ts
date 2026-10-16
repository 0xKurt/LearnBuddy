// The home's poll (#686, #671): pure, so it is tested without the app around it.

import { pollAfterMs, type BuddyHome } from '@learnbuddy/shared-types/contracts';

/** Nothing in progress: the home asks once a minute. */
const IDLE_MS = 60_000;

/** Every phone waits a little more or less, so a hundred of them never ask in the same second. */
const STAGGER = 0.15;

/** No poll comes sooner than this, whatever it was told (#818 review). */
const MIN_POLL_MS = 1000;

/**
 * How often the home asks while she sees it: the pace the server sent (`poll_after_ms`, #671),
 * or — from an API that does not send it yet — the same rule here (`pollAfterMs`: a sheet being
 * read every 1.5 s, Buddy at work every 3 s). Spread by ±15 % so polls of many phones, and the
 * home's and a session's of one phone, do not fall into step.
 */
export function homePollMs(
  h: BuddyHome | undefined,
  random: () => number = Math.random,
): number | false {
  if (!h) return false;
  const ms = (h.poll_after_ms !== undefined ? h.poll_after_ms : pollAfterMs(h)) ?? IDLE_MS;
  return staggered(ms, random);
}

/** `ms` spread by ±15 %: the same for every poll the app runs (home, session, library). */
export function staggered(ms: number, random: () => number = Math.random): number {
  return Math.max(MIN_POLL_MS, Math.round(ms * (1 - STAGGER + random() * 2 * STAGGER)));
}
