// What the learning domain keeps around Buddy's whole home screen, from its first frame
// (`LearningHome`, registered as the home's `homeScope`, issue #107):
// - the pages of her sheets the notices and the bar on top show — the app's own copy of what she
//   sent, while it is on the phone (lib/buddy/useHomePhotos.ts `useOnPhone`), never a crop or
//   coordinates from the model — so a card shows its photo as soon as it is drawn; the cards read
//   what was found (`useHomeThumbs`);
// - the practice to go on with, loaded while its card is on screen (gaps.md #2).

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { createContext, useContext, type ReactNode } from 'react';

import { usePrefetchSession } from '../api/sessionQueries.js';
import { useOnPhone } from '../buddy/useHomePhotos.js';
import { drafts } from '../capture/draftStorage.js';

/** One empty list for every "no photos": a fresh array each render would re-run the effect. */
const NO_THUMBS: readonly string[] = [];

/** The page of each notice and of the bar, while it is on the phone. */
function useThumbs(h: BuddyHome | undefined) {
  const missing = h?.notice?.type === 'pages_missing' ? h.notice : null;
  const first = missing?.pages[0];
  const page = useOnPhone(
    missing && first
      ? {
          key: `${missing.material_id}:${first.page}`,
          load: () => drafts.sentPage(missing.material_id, first.page),
        }
      : null,
    null,
  );
  // The page a spot sits on (issue #164): her own photo, whole.
  const spot = h?.notice?.type === 'unclear_spot' ? h.notice : null;
  const unclear = useOnPhone(
    spot
      ? {
          key: `${spot.photo_material_id}:${spot.page}`,
          load: () => drafts.sentPage(spot.photo_material_id, spot.page),
        }
      : null,
    null,
  );
  // The photos of the sheet being read, while they are on the phone (they arrived).
  const readingId = h?.now?.type === 'material_processing' ? h.now.material_id : null;
  const reading = useOnPhone(
    readingId ? { key: readingId, load: () => drafts.sentPages(readingId) } : null,
    NO_THUMBS,
  );
  // A sheet Buddy could not read: its first page, so she sees which one it was about (#57).
  const failedId = h?.now?.type === 'material_failed' ? h.now.material_id : null;
  const failed = useOnPhone(
    failedId ? { key: failedId, load: () => drafts.sentPage(failedId, 1) } : null,
    null,
  );
  return { page, unclear, reading, failed };
}

type HomeThumbs = ReturnType<typeof useThumbs>;

const NONE: HomeThumbs = { page: null, unclear: null, reading: NO_THUMBS, failed: null };
const Thumbs = createContext<HomeThumbs>(NONE);

/** Around the whole home screen, from its first frame. */
export function LearningHome({ h, children }: { h: BuddyHome | undefined; children: ReactNode }) {
  usePrefetchSession(h?.now);
  return <Thumbs.Provider value={useThumbs(h)}>{children}</Thumbs.Provider>;
}

/** What `LearningHome` found for this home's pages. */
export function useHomeThumbs(): HomeThumbs {
  return useContext(Thumbs);
}
