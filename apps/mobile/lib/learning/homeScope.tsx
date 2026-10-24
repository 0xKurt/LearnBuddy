// What the learning domain keeps around Buddy's whole home screen, from its first frame
// (`LearningHome`, registered as the home's `homeScope`, issue #107):
// - the pages of her sheets the notices and the bar on top show — the app's own copy of what she
//   sent, while it is on the phone (lib/buddy/useHomePhotos.ts `useOnPhone`), never a crop or
//   coordinates from the model — so a card shows its photo as soon as it is drawn; the cards read
//   what was found (`useHomeThumbs`);
// - the practice to go on with, loaded while its card is on screen (gaps.md #2).

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import type { HomeLayout } from '../homeLayout.js';

import { usePrefetchSession } from '../api/sessionQueries.js';
import { useOnPhone } from '../buddy/useHomePhotos.js';
import { drafts } from '../capture/draftStorage.js';
import { useLearningPacks } from '../speech/useLearningPacks.js';

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

/**
 * The practice the bar on top starts or continues right now, while it is shown (issue #846): its
 * prepared step, or its open run. A card in the thread for the same practice then leaves that one
 * control to the bar — "Jetzt üben" above and "Los geht's" below were two for one thing (rule 19).
 */
export type BarPractice = { step: string | null; session: string | null };
const NOTHING_ON_BAR: BarPractice = { step: null, session: null };
const OnBar = createContext<BarPractice>(NOTHING_ON_BAR);
/** The result already told by this home's result card or its greeting. History has none. */
const CurrentResult = createContext<string | null>(null);

export function barPractice(h: BuddyHome | undefined, layout: HomeLayout | undefined): BarPractice {
  const now = h?.now;
  if (!now || !layout) return NOTHING_ON_BAR;
  if (layout.bar === 'ready' && now.type === 'practice_ready')
    return { step: now.step_id, session: null };
  if (layout.bar === 'next' && now.type === 'practice_result' && now.next)
    return { step: now.next.step_id, session: null };
  if (layout.bar === 'resume' && now.type === 'resume_practice')
    return { step: null, session: now.session_id };
  return NOTHING_ON_BAR;
}

/** Around the whole home screen, from its first frame. */
export function LearningHome({
  h,
  layout,
  children,
}: {
  h: BuddyHome | undefined;
  layout?: HomeLayout;
  children: ReactNode;
}) {
  useLearningPacks({
    languages: [...(h?.learning_languages ?? []), ...(h?.roleplay ? [h.roleplay.language] : [])],
  });
  usePrefetchSession(h?.now);
  const onBar = barPractice(h, layout);
  const value = useMemo(
    () => ({ step: onBar.step, session: onBar.session }),
    [onBar.step, onBar.session],
  );
  return (
    <Thumbs.Provider value={useThumbs(h)}>
      <OnBar.Provider value={value}>
        <CurrentResult.Provider
          value={h?.now?.type === 'practice_result' ? h.now.session_id : null}
        >
          {children}
        </CurrentResult.Provider>
      </OnBar.Provider>
    </Thumbs.Provider>
  );
}

/** What the bar on top starts or continues now (`BarPractice`). */
export function useBarPractice(): BarPractice {
  return useContext(OnBar);
}

export function useCurrentResult(): string | null {
  return useContext(CurrentResult);
}

/** What `LearningHome` found for this home's pages. */
export function useHomeThumbs(): HomeThumbs {
  return useContext(Thumbs);
}

/** A running offer is continued once, either on the home bar or on its card. */
export function useOfferRun(offer: { running_session_id?: string | null }) {
  const bar = useBarPractice();
  const resumes = offer.running_session_id ?? null;
  return { resumes, onTop: resumes !== null && bar.session === resumes };
}
