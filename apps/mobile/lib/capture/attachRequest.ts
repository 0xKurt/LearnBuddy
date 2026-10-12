// The one way to a photo (issue #519, owner 09./10.10.): every place that asks for a page — the
// card "Foto machen", the ⋯ menu's homework and vocabulary, a notice in the chat, the library, a
// sheet's "Seite hinzufügen", the conversation's camera, a share from another app — hands its
// wish to the chat's input bar instead of opening a screen of its own. The bar opens the small
// menu (Kamera · Fotos · Dateien) or the camera or picker straight away; the pages land above
// her text, and she sends them like a message. Before #519 each of them pushed `/capture`, a
// page that asked again where the photo should come from and then wanted "Senden".
//
// A wish is what the pages are for (`DraftLink`: the step, the goal, homework, the sheet whose
// pages they complete) and what opens first. The chat's composer takes it once (`take`).

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
  /** The composer takes the wish: it is answered once. */
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

/** On the chat's own screen: its input bar opens what was asked for. */
export function askAttach({ open, link = {}, resume = false, pending = false }: Wish): void {
  useAttachRequest.getState().ask({ link: { ...CHAT_LINK, ...link }, open, resume, pending });
}

/** From any other screen: back to the chat, whose input bar opens what was asked for. */
export function attachInChat(wish: Wish): void {
  askAttach(wish);
  router.dismissTo('/buddy');
}
