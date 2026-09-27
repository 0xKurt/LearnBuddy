// Says a status change to the screen reader on every platform (lib/announcePlan.ts).
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

import { announcePlan, type AnnouncePlatform } from './announcePlan.js';

const platform = (): AnnouncePlatform =>
  Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web'
    ? Platform.OS
    : 'other';

export function announce(text: string, opts: { liveRegion?: boolean } = {}): void {
  const plan = announcePlan(text, platform(), opts.liveRegion ?? false);
  if (plan === 'queued')
    AccessibilityInfo.announceForAccessibilityWithOptions(text, { queue: true });
  else if (plan === 'plain') AccessibilityInfo.announceForAccessibility(text);
}

/**
 * Announces `text` whenever it changes to a new non-empty value (a status line, an error).
 * `key` re-announces the same text (the same PIN error after another wrong attempt).
 */
export function useAnnounce(
  text: string | null | undefined,
  opts: { liveRegion?: boolean; key?: string | number } = {},
): void {
  const last = useRef<string | null>(null);
  const { liveRegion = true, key } = opts;
  useEffect(() => {
    const id = text ? `${key ?? ''}|${text}` : null;
    if (!text || id === last.current) {
      last.current = id;
      return;
    }
    last.current = id;
    announce(text, { liveRegion });
  }, [text, key, liveRegion]);
}
