// Writing a fresh home (returned by a tap or a turn) into the cache.

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
 * A home poll already on its way was asked before this change and would put the old
 * state back for up to a minute (audit home-setqueries-race-with-poll): it is cancelled
 * first. What Buddy knows may have changed with the same step (a turn, an undo), so the
 * memory list is fetched fresh the next time it is shown (p2-J-memory-F5); the settings
 * may have changed too (refreshSettings).
 */
export function writeHome(client: QueryClient, home: BuddyHome): void {
  void client.cancelQueries({ queryKey: keys.home });
  client.setQueryData(keys.home, home);
  void client.invalidateQueries({ queryKey: keys.memory, refetchType: 'none' });
  refreshSettings(client);
}
