// The instant start (gaps.md #2): Buddy's home and her profile are kept on the device and
// shown at once on the next start, then refreshed in the background (they are stored as
// already stale). Only settled data is kept (lib/api/deviceCache.ts, CLAUDE.md rule 5).
// Signing out — on purpose or because the session ended — removes every kept copy
// (docs/privacy.md §On the device), together with the in-memory cache.

import type { BuddyHome, MeResponse } from '@learnbuddy/shared-types/contracts';

import { currentSession } from '../auth/session.js';
import { readCache, removeAllCaches, writeCache } from './cacheStorage.js';
import { cacheKey, fromStored, toStored } from './deviceCache.js';
import { keys } from './keys.js';
import { queryClient } from './queries.js';

/** A burst of updates (polling while Buddy works) is written once. */
const WRITE_AFTER_MS = 1500;

/** Shows what was kept for this person, as data that must be refreshed. */
export async function restoreCache(userId: string): Promise<void> {
  const stored = fromStored(await readCache(cacheKey(userId)).catch(() => null), userId);
  if (!stored || currentSession()?.user_id !== userId) return;
  // Stored as old as it is: every screen that shows it refetches at once.
  const updatedAt = Math.min(stored.saved_at, Date.now() - 60_000);
  if (stored.me && queryClient.getQueryData(keys.me) === undefined)
    queryClient.setQueryData(keys.me, stored.me, { updatedAt });
  if (stored.home && queryClient.getQueryData(keys.home) === undefined)
    queryClient.setQueryData(keys.home, stored.home, { updatedAt });
}

/** Keeps the latest confirmed home and profile on the device; returns the unsubscribe. */
export function keepCache(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const write = () => {
    timer = null;
    const userId = currentSession()?.user_id;
    if (!userId) return;
    const me = queryClient.getQueryData<MeResponse>(keys.me);
    const home = queryClient.getQueryData<BuddyHome>(keys.home);
    if (!me && !home) return;
    const value = JSON.stringify(toStored(userId, Date.now(), me, home));
    void writeCache(cacheKey(userId), value).catch(() => undefined);
  };
  const off = queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success') return;
    const key = JSON.stringify(event.query.queryKey);
    if (key !== JSON.stringify(keys.me) && key !== JSON.stringify(keys.home)) return;
    if (timer === null) timer = setTimeout(write, WRITE_AFTER_MS);
  });
  return () => {
    off();
    if (timer !== null) clearTimeout(timer);
  };
}

/** Nothing of anyone stays on the device (signing out, a session that ended). */
export function forgetCache(): Promise<void> {
  return removeAllCaches().catch(() => undefined);
}
