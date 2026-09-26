// Hands-free practice (voice mode, docs/architecture.md §Voice): once she has
// tapped a mic on the practice screen herself, the loop goes on by itself —
// the question is read, the mic listens, her answer is checked, Buddy's
// feedback is read, the mic listens again (or the next question comes). The
// microphone never starts before her first tap; leaving the screen, switching
// voice mode off or typing ends it.

import { create } from 'zustand';

type HandsFree = {
  /** She started a mic herself on this screen: the loop may listen on its own. */
  armed: boolean;
  /** Bumped when the loop wants the mic now (the mic on screen starts if it is idle). */
  ask: number;
  arm: () => void;
  disarm: () => void;
  listenNow: () => void;
};

export const useHandsFree = create<HandsFree>((set) => ({
  armed: false,
  ask: 0,
  arm: () => set({ armed: true }),
  disarm: () => set({ armed: false }),
  listenNow: () => set((s) => (s.armed ? { ask: s.ask + 1 } : s)),
}));

/**
 * After Buddy's feedback was read to the end: listen for another try while the
 * question is open, go on to the next open question once it is closed, or stay
 * (nothing left: the result comes; or the loop is not on).
 */
export function afterFeedback(
  items: readonly { item: { id: string }; status: string }[],
  itemId: string,
  armed: boolean,
): 'listen' | 'next' | 'stay' {
  if (!armed) return 'stay';
  if (items.find((i) => i.item.id === itemId)?.status === 'open') return 'listen';
  return items.some((i) => i.status === 'open') ? 'next' : 'stay';
}
