// What of the learning domain's part of the home is not kept on the phone for an instant start
// (lib/api/deviceCache.ts `unsettled`, CLAUDE.md rule 5): the card on top, the notice and what
// Buddy is working on all claim "now", and a kept copy is never shown as confirmed-new.

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';

export function unsettledHome(home: BuddyHome): BuddyHome {
  return { ...home, now: null, notice: null, working: null };
}
