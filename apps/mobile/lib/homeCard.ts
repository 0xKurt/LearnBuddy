// The card on top of Buddy's home that she closed on this phone (lib/homeLayout.ts topKey).
// Only this phone forgets it, and only until the card says something else — nothing is
// answered on the server ("Heute nicht" stays the card's own button). If the storage can't
// be read or written, closing still holds for this visit.

import { create } from 'zustand';

import { readItem, writeItem } from './api/outboxStorage.js';

const KEY = 'lb.closedCard';

type ClosedCardState = {
  /** The topKey she closed, or null. */
  closed: string | null;
  close: (key: string) => void;
};

let touched = false;

export const useClosedCard = create<ClosedCardState>((set) => ({
  closed: null,
  close: (key) => {
    touched = true;
    set({ closed: key });
    // Without storage it is closed for this visit only.
    void writeItem(KEY, key);
  },
}));

async function restore(): Promise<void> {
  // Without storage nothing was closed (null).
  const stored = await readItem(KEY);
  if (!touched && stored !== null) useClosedCard.setState({ closed: stored });
}

void restore();
