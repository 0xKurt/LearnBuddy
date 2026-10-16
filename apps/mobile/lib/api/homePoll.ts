// The home's poll (#686): pure, so it is tested without the app around it.

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';

/**
 * How often the home asks while she sees it. A sheet being read asks every 1.5 s like a practice
 * being prepared (#686, KI-Audit D-F13): at 3 s "read" showed up to 3 s late; Buddy at work or a
 * turn in flight every 3 s; otherwise once a minute.
 */
export function homePollMs(h: BuddyHome | undefined): number | false {
  if (!h) return false;
  if (h.now?.type === 'material_processing') return 1500;
  const busy = h.working !== null || h.thread.some((m) => m.status === 'processing');
  return busy ? 3000 : 60_000;
}
