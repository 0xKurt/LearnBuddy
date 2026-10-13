// Writing a fresh home (returned by a tap or a turn) into the cache — behind the context fence:
// a home older than the one held is never written, whoever brings it.

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import type { QueryClient } from '@tanstack/react-query';

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
  if (!newerHome(home, client.getQueryData<BuddyHome>(keys.home))) return false;
  void client.cancelQueries({ queryKey: keys.home });
  client.setQueryData(keys.home, home);
  void client.invalidateQueries({ queryKey: keys.memory, refetchType: 'none' });
  refreshSettings(client);
  return true;
}
