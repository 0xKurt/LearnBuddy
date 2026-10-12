// One capture page takes each request once, preserving the actual pages' purpose.
// Every entry uses ordinary navigation; system camera/photo/file sources may open immediately.

import { router } from 'expo-router';
import { create } from 'zustand';

import type { DraftLink } from './draft.js';

/** What opens first: the + menu, the camera, the system photo picker, the files. */
export type AttachOpen = 'menu' | 'camera' | 'library' | 'files';

type AttachRequest = {
  /** What the pages are for. */
  link: DraftLink;
  /** What opens first; null: nothing opens (files shared from another app are on their way). */
  open: AttachOpen | null;
  /** Go on with the pages left from before (the draft, lib/capture/draft.ts). */
  resume: boolean;
  /** With `resume`: the photo from a camera session Android cut off (lib/capture/pendingCamera.ts). */
  pending: boolean;
};

/** Pages for the chat: study material, for no step and no sheet. */
export const CHAT_LINK: DraftLink = {
  stepId: null,
  goalId: null,
  purpose: 'study',
  completes: null,
  pages: null,
  add: false,
};

type Store = {
  request: AttachRequest | null;
  ask: (request: AttachRequest) => void;
  /** The Capture page takes the wish: it is answered once. */
  take: () => AttachRequest | null;
};

export const useAttachRequest = create<Store>((set, get) => ({
  request: null,
  ask: (request) => set({ request }),
  take: () => {
    const { request } = get();
    if (request) set({ request: null });
    return request;
  },
}));

type Wish = {
  open: AttachOpen | null;
  link?: Partial<DraftLink>;
  resume?: boolean;
  pending?: boolean;
};

/** Navigate to Capture with the complete source and draft wish. */
export function askAttach({ open, link = {}, resume = false, pending = false }: Wish): void {
  useAttachRequest.getState().ask({ link: { ...CHAT_LINK, ...link }, open, resume, pending });
  router.navigate('/capture');
}

/** Compatibility entry from other screens; the same ordinary Capture navigation. */
export function attachInChat(wish: Wish): void {
  askAttach(wish);
}
