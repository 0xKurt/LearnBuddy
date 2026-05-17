// App-level user preferences. USER-FLOWS-DEEP §9.
//
// Backed by expo-secure-store (so settings survive reinstalls less but stay
// out of normal app sandbox state). One bag of JSON under a single key keeps
// reads cheap and avoids drift between writes.
//
// Consumers use the `usePref(key)` hook which:
//   - reads on mount (returns the default until SecureStore hydrates)
//   - returns `[value, setValue]`
//   - persists immediately on setValue
//
// Doc references:
//   - haptics:          §9.2
//   - session_length:   §9.3
//   - photo_retention:  §9.6 (DSGVO §photo-retention caps at 7d)
//   - data_saver:       §9.9
//   - dyslexia_font:    §5 (a11y) + §9 (settings — needs design)

import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

const KEY = 'lb_prefs_v1';

export type SessionLength = 5 | 10 | 20 | 30;
export type PhotoRetentionDays = 1 | 3 | 7;

export type AppPrefs = {
  haptics: boolean;
  session_length: SessionLength;
  /** Days the raw photo is kept in `materials-raw` storage before the photo-
   *  wipe Edge Function deletes it. Doc 09 §photo-retention hard-caps at 7d;
   *  the only meaningful in-app choice is to ask for an earlier wipe. */
  photo_retention_days: PhotoRetentionDays;
  /** When on, skip image downloads in the study session preview surface. */
  data_saver: boolean;
  /** When on, switch to the OpenDyslexic font. Font load itself is TODO —
   *  this only persists the toggle for now. */
  dyslexia_font: boolean;
};

export const DEFAULT_PREFS: AppPrefs = {
  haptics: true,
  session_length: 10,
  photo_retention_days: 7,
  data_saver: false,
  dyslexia_font: false,
};

export const SESSION_LENGTH_CHOICES: readonly SessionLength[] = [5, 10, 20, 30];
export const PHOTO_RETENTION_CHOICES: readonly PhotoRetentionDays[] = [1, 3, 7];

export async function loadPrefs(): Promise<AppPrefs> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return DEFAULT_PREFS;
  try {
    const parsed = JSON.parse(raw) as Partial<AppPrefs>;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function savePrefs(prefs: AppPrefs): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(prefs));
}

/** Hook to read + mutate a single preference. */
export function usePref<K extends keyof AppPrefs>(
  key: K,
): [AppPrefs[K], (next: AppPrefs[K]) => Promise<void>] {
  const [value, setValue] = useState<AppPrefs[K]>(DEFAULT_PREFS[key]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const all = await loadPrefs();
      if (!cancelled) setValue(all[key]);
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  const setter = async (next: AppPrefs[K]): Promise<void> => {
    setValue(next);
    const all = await loadPrefs();
    await savePrefs({ ...all, [key]: next });
  };

  return [value, setter];
}
