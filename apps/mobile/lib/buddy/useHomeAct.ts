// A tap on Buddy's home is a direct API call, no model (docs/architecture.md §Home). This runs
// one: busy while it is in flight, a returned home replaces the cached one, and a failure is said
// softly — a stale or vanished target also reloads the home, so the screen shows where it stands.

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { useState } from 'react';

import { toast } from '../../components/lb/Toast.js';
import { ApiError } from '../api/client.js';
import { keys, queryClient, setHome } from '../api/queries.js';
import { messageFor } from '../errors.js';
import { haptic } from '../haptics.js';

/** Loads the home again. */
export function refreshHome(): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: keys.home });
}

/** Runs a tap; a returned home replaces the cached one. */
export type HomeAct = (fn: () => Promise<BuddyHome | void>) => Promise<void>;

export function useHomeAct(): { busy: boolean; act: HomeAct } {
  const [busy, setBusy] = useState(false);
  async function act(fn: () => Promise<BuddyHome | void>): Promise<void> {
    setBusy(true);
    try {
      const next = await fn();
      if (next) setHome(next);
    } catch (err) {
      haptic.soft();
      toast.show(messageFor(err), 'error');
      if (
        err instanceof ApiError &&
        (err.code === 'conflict' || err.code === 'stale' || err.code === 'not_found')
      ) {
        await refreshHome();
      }
    } finally {
      setBusy(false);
    }
  }
  return { busy, act };
}
