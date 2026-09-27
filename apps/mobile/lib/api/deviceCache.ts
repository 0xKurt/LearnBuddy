// What of Buddy's home and her profile is kept on the device for an instant start
// (gaps.md #2): the last conversation shows at once and refreshes in the background.
// Pure (no React Native): lib/api/persist.ts stores it, lib/__tests__/deviceCache.test.ts
// checks it.
//
// CLAUDE.md rule 5 — cached data is never shown as confirmed-new: only what was settled
// when it was stored is kept. Everything that says "now" (the card on top, a notice, a
// pending decision, what Buddy is working on, a message still being answered, what is
// coming up) waits for the server; it comes with the first refresh.

import { BuddyHome, MeResponse } from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

/** Bumped when the stored shape changes: an older copy is simply not used. */
export const CACHE_VERSION = 1;
export const CACHE_PREFIX = 'lb.cache.';

export const cacheKey = (userId: string) => `${CACHE_PREFIX}v${CACHE_VERSION}.${userId}`;

const Stored = z.object({
  v: z.literal(CACHE_VERSION),
  user_id: z.string(),
  saved_at: z.number(),
  me: MeResponse.nullable(),
  home: BuddyHome.nullable(),
});
export type Stored = z.infer<typeof Stored>;

/** The home as it may be kept: the settled conversation only, nothing that claims "now". */
export function settledHome(home: BuddyHome): BuddyHome {
  return {
    ...home,
    now: null,
    notice: null,
    decision: null,
    done: [],
    next: [],
    working: null,
    thread: home.thread.filter((m) => m.status !== 'processing'),
  };
}

export function toStored(
  userId: string,
  savedAt: number,
  me: MeResponse | undefined,
  home: BuddyHome | undefined,
): Stored {
  return {
    v: CACHE_VERSION,
    user_id: userId,
    saved_at: savedAt,
    me: me ?? null,
    home: home ? settledHome(home) : null,
  };
}

/**
 * A stored copy, if it is usable: this version, this person, readable. Anything else
 * (another learner on a shared phone, an app update that changed the shape) is not used.
 */
export function fromStored(raw: string | null, userId: string): Stored | null {
  if (!raw) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = Stored.safeParse(json);
  if (!parsed.success || parsed.data.user_id !== userId) return null;
  return parsed.data;
}
