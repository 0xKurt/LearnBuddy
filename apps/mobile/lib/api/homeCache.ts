// Writing a fresh home (returned by a tap or a turn) into the cache — behind the context fence:
// a home older than the one held is never written, whoever brings it.

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import type { QueryClient } from '@tanstack/react-query';

import { mergeThread } from '../threadMerge.js';
import { keys } from './keys.js';

/**
 * A step on the server may have changed her settings without answering with them: the
 * contact opt-in in the chat, Buddy reducing contact or changing its voice in a turn, an
 * undo that restores them, "seltener" pressed on a notification (issue #398). A settings view
 * already in the cache is fetched again right away — not only marked stale — so the settings
 * screen does not show the old state for the 15 s it would otherwise count as fresh (rule 5).
 * Never loaded, nothing is fetched: the screen loads it when it opens.
 */
export function refreshSettings(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: keys.settings, refetchType: 'all' });
}

/** Buddy's level changes the home shows, with where each stands (`set_level` and its undo). */
function levelSteps(home: BuddyHome): string {
  return home.thread
    .flatMap((m) => m.actions)
    .filter((a) => a.summary.tool === 'set_level')
    .map((a) => `${a.id}:${a.status}`)
    .sort()
    .join(',');
}

/**
 * Her profile is kept fresh for five minutes (`useMe`, #671), but Buddy changes her level and
 * grade on the server in a turn (`set_level`), and taking that back changes them again. A home
 * that shows such a change she has not seen yet fetches `/me` again at once, so the settings
 * never show the old grade and a save never sends the old version (rule 5). Any other home
 * leaves it alone; the first home there is to compare with changes nothing.
 */
export function refreshProfileIfChanged(
  client: QueryClient,
  incoming: BuddyHome,
  held: BuddyHome | undefined,
): void {
  if (held === undefined || levelSteps(incoming) === levelSteps(held)) return;
  void client.invalidateQueries({ queryKey: keys.me, refetchType: 'all' });
}

/**
 * Whether a home that a request brought back may be written over the one the app holds. Two
 * requests can be on their way at once — a turn and a tap on a card, her spoken turn and
 * "Gespräch beenden" — and the answer built first can arrive last. Every change a decision
 * depends on raises `context_version` (CLAUDE.md rule 4), so the older home is the one with the
 * lower version; the same version is the same state, with at most more of the conversation.
 */
export function newerHome(
  incoming: { context_version: number },
  held: { context_version: number } | undefined,
): boolean {
  return held === undefined || incoming.context_version >= held.context_version;
}

/**
 * A home poll already on its way was asked before this change and would put the old
 * state back for up to a minute (audit home-setqueries-race-with-poll): it is cancelled
 * first. What Buddy knows may have changed with the same step (a turn, an undo), so the
 * memory list is fetched fresh the next time it is shown (p2-J-memory-F5); the settings
 * may have changed too (refreshSettings).
 *
 * A home older than the one held (`newerHome`) is dropped, and nothing else is touched: the
 * newer one was written by a later step, which did all of this already. Returns whether it was
 * written. Nothing in the app writes an older home on purpose: a step's answer never lowers the
 * version, and signing out clears the cache (app/_layout.tsx), so another learner's first home
 * meets none.
 */
export function writeHome(client: QueryClient, home: BuddyHome): boolean {
  const held = client.getQueryData<BuddyHome>(keys.home);
  if (!newerHome(home, held)) return false;
  const next = retainConversation(home, held);
  refreshProfileIfChanged(client, next, held);
  void client.cancelQueries({ queryKey: keys.home });
  client.setQueryData(keys.home, next);
  void client.invalidateQueries({ queryKey: keys.memory, refetchType: 'none' });
  refreshSettings(client);
  return true;
}

/** Latest server window is authoritative; earlier visited messages survive spoken turns/polls. */
export function retainConversation(incoming: BuddyHome, held: BuddyHome | undefined): BuddyHome {
  if (!newerHome(incoming, held)) return held!;
  if (!held || !incoming.thread_has_more || !incoming.thread.length) return incoming;
  const first = incoming.thread[0]!;
  const at = held.thread.findIndex((m) => m.id === first.id);
  // Only join overlapping windows: otherwise the server pagination must fill the gap.
  if (at < 0) return incoming;
  return {
    ...incoming,
    thread: mergeThread(held.thread.slice(0, at), incoming.thread),
    thread_has_more: held.thread_has_more,
  };
}
