// How a status change reaches a screen reader (audit M-80): Android reads live regions
// (accessibilityLiveRegion) by itself, iOS has none — VoiceOver only hears what is announced
// explicitly, queued so it does not cut off what it is reading. On the web the live region
// becomes aria-live. Pure, so the routing is unit-tested (lib/announce.ts does the call).

export type AnnouncePlatform = 'ios' | 'android' | 'web' | 'other';

export type AnnouncePlan = 'queued' | 'plain' | 'none';

/**
 * `liveRegion`: the text is also shown in an element with accessibilityLiveRegion, which
 * Android and the web read on their own (announcing it too would read it twice).
 */
export function announcePlan(
  text: string,
  platform: AnnouncePlatform,
  liveRegion: boolean,
): AnnouncePlan {
  if (text.trim().length === 0) return 'none';
  if (platform === 'ios') return 'queued';
  if (platform === 'android') return liveRegion ? 'none' : 'plain';
  return 'none';
}
