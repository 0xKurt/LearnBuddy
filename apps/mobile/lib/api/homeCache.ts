// Writing a fresh home (returned by a tap or a turn) into the cache.

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import type { QueryClient } from '@tanstack/react-query';

import { keys } from './keys.js';

/**
 * A home poll already on its way was asked before this change and would put the old
 * state back for up to a minute (audit home-setqueries-race-with-poll): it is cancelled
 * first. What Buddy knows may have changed with the same step (a turn, an undo), so the
 * memory list is fetched fresh the next time it is shown (p2-J-memory-F5).
 */
export function writeHome(client: QueryClient, home: BuddyHome): void {
  void client.cancelQueries({ queryKey: keys.home });
  client.setQueryData(keys.home, home);
  void client.invalidateQueries({ queryKey: keys.memory, refetchType: 'none' });
}
