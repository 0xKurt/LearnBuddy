// The photos Buddy's home shows from the phone itself (lib/capture/draftStorage.ts): pages left
// from before and not sent yet (issue #82), and the app's own copy of a page a notice or the bar
// is about — never a crop or coordinates from the model. Nothing is held for them: they are shown
// while they are on the phone anyway.

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { CaptureDraft } from '../capture/draft.js';
import { drafts } from '../capture/draftStorage.js';
import { attachedInChat, useLiveAttachments } from '../capture/live.js';

/** One empty list for every "no photos": a fresh array each render would re-run the effect. */
const NO_THUMBS: readonly string[] = [];

/** Where a photo is looked up: `key` names the page, `load` finds it. */
type Lookup<T> = { key: string; load: () => Promise<T> };

/** What the lookup finds on the phone — `none` while there is nothing to look up. */
function useOnPhone<T>(lookup: Lookup<T> | null, none: T): T {
  const [value, setValue] = useState<T>(none);
  const key = lookup?.key ?? null;
  useEffect(() => {
    if (lookup === null) {
      setValue(none);
      return;
    }
    let alive = true;
    void lookup.load().then((found) => {
      if (alive) setValue(found);
    });
    return () => {
      alive = false;
    };
    // Only when the page in question changes.
  }, [key]);
  return value;
}

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

export type HomeThumbs = ReturnType<typeof useThumbs>;

/** Photos left from before, not sent yet (lib/capture/draft.ts), and one just let go. */
function useLeftBehind() {
  const [draft, setDraft] = useState<CaptureDraft | null>(null);
  /** Pages attached in the composer right now: they are not "left behind". */
  const attachedCount = useLiveAttachments((st) => st.count);
  const [letGo, setLetGo] = useState<CaptureDraft | null>(null);
  const letGoRef = useRef<CaptureDraft | null>(null);
  letGoRef.current = letGo;
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      // Pages she has attached in the chat are on screen, not left behind (issue #82).
      void drafts.leftBehind().then((d) => {
        if (alive) setDraft(attachedInChat() ? null : d);
      });
      void drafts.prune();
      return () => {
        alive = false;
        // Let go and not brought back: now the photos are deleted.
        const gone = letGoRef.current;
        if (gone) void drafts.drop(gone.photos.map((p) => p.uri));
        setLetGo(null);
      };
    }, []),
  );
  // Once the chat holds pages, the draft is the bar's (`useAttachments`): taken with "Weiter", or
  // replaced by new pages. Removed there, they are not left behind — no screen stands in between
  // any more whose return would read the draft again (issue #519).
  useEffect(() => {
    if (attachedCount > 0) setDraft(null);
  }, [attachedCount]);
  return {
    draft,
    /**
     * What the notice is about: pages she is holding in the composer are on screen, and the
     * notice would say the opposite of what she sees (issue #82).
     */
    shown: attachedCount > 0 ? null : (draft ?? letGo),
    /** Kept until she leaves home: "Rückgängig" brings them back. */
    letGo: () => {
      if (!draft) return;
      void drafts.save({ requestId: null, photos: [], link: draft.link });
      setLetGo(draft);
      setDraft(null);
    },
    bringBack: () => {
      const d = letGo;
      if (!d) return;
      void drafts.save({ requestId: d.requestId, photos: d.photos, link: d.link });
      setDraft(d);
      setLetGo(null);
    },
  };
}

export type LeftBehind = ReturnType<typeof useLeftBehind>;

export function useHomePhotos(h: BuddyHome | undefined): {
  left: LeftBehind;
  thumbs: HomeThumbs;
} {
  return { left: useLeftBehind(), thumbs: useThumbs(h) };
}
