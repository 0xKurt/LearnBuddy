// First-time coach-mark state. USER-FLOWS-DEEP §10.
//
// Each power feature gets a one-shot coaching moment, gated on a per-learner
// boolean stored in expo-secure-store. The hook returns `{ shown, dismiss }`:
//
//   const { shown, dismiss } = useFirstTime('math_keyboard');
//
// `shown` flips to `true` on the first mount when the SecureStore key is
// missing; `dismiss()` persists the "seen" mark and flips `shown` to `false`
// so the next render hides the coach mark.
//
// We deliberately keep the key set small and explicit (COACH_KEYS) so the
// caller can't accidentally typo a key and re-show the mark forever.

import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

export const COACH_KEYS = ['math_keyboard', 'voice', 'camera', 'diagram', 'streak'] as const;

export type CoachKey = (typeof COACH_KEYS)[number];

const PREFIX = 'lb.coach.';

/** True if the named coach mark has already been dismissed. */
export async function hasSeenCoachMark(key: CoachKey): Promise<boolean> {
  const v = await SecureStore.getItemAsync(PREFIX + key);
  return v === '1';
}

/** Persist the "seen" flag. Idempotent. */
export async function markCoachSeen(key: CoachKey): Promise<void> {
  await SecureStore.setItemAsync(PREFIX + key, '1');
}

/** DEV-only — reset all coach-mark state. Not exposed in any UI; useful for
 *  manual testing in a debug build. */
export async function resetAllCoachMarks(): Promise<void> {
  await Promise.all(COACH_KEYS.map((k) => SecureStore.deleteItemAsync(PREFIX + k)));
}

type UseFirstTime = {
  /** True when this is the first time the hook has been mounted for `key`
   *  (and `enabled` is not false). Flips to false after `dismiss()`. */
  shown: boolean;
  /** Mark the coach mark as seen and hide it. */
  dismiss: () => void;
};

type UseFirstTimeOptions = {
  /** Skip the SecureStore read until this becomes true. Lets the caller defer
   *  the coach mark until a trigger condition is met (e.g. streak > 0). */
  enabled?: boolean;
};

/** First-time gate for power-feature coach marks. */
export function useFirstTime(key: CoachKey, opts: UseFirstTimeOptions = {}): UseFirstTime {
  const enabled = opts.enabled !== false;
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const seen = await hasSeenCoachMark(key);
      if (!cancelled && !seen) setShown(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, key]);

  return {
    shown,
    dismiss: () => {
      setShown(false);
      void markCoachSeen(key);
    },
  };
}
