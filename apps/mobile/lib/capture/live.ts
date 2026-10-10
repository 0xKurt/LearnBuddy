// Pages attached in the chat right now (issue #82). They are written to the same draft
// as ever — that is what makes them survive the app being killed — but
// while they stand above the field they are *live*, not left behind: the home must not
// say "Deine Fotos sind noch nicht gesendet" about pages she can see, and a capture
// screen opened meanwhile must not offer them as a leftover.

import { create } from 'zustand';

type LiveAttachments = {
  /** How many pages the chat composer is holding right now. */
  count: number;
  set: (count: number) => void;
};

export const useLiveAttachments = create<LiveAttachments>((set) => ({
  count: 0,
  set: (count) => set({ count }),
}));

/** True while the chat composer holds pages; readable outside React. */
export function attachedInChat(): boolean {
  return useLiveAttachments.getState().count > 0;
}
