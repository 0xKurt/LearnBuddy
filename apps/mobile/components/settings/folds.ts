// Which settings group is open. Outside the component tree on purpose (issue #84): a
// theme change remounts the whole app by key, and a useState in the screen closed the
// group she had just opened — mid-comparison of palettes, the radios vanished under her
// finger. The store survives the remount; entering the screen fresh still starts with
// every group closed (CLAUDE.md rule 16), told apart from a remount by how quickly the
// screen comes back.

import { create } from 'zustand';

/** A blur-and-back within this window is a remount (theme change), not a new visit. */
const REMOUNT_WINDOW_MS = 1500;

type Folds = {
  open: string | null;
  blurredAt: number;
  toggle: (key: string) => void;
  /** Screen lost focus (left, or remount): remember when. */
  markBlurred: () => void;
  /** Screen gained focus: a fresh visit starts closed, a remount keeps the open group. */
  arrive: () => void;
};

export const useFolds = create<Folds>((set, get) => ({
  open: null,
  blurredAt: 0,
  toggle: (key) => set((s) => ({ open: s.open === key ? null : key })),
  markBlurred: () => set({ blurredAt: Date.now() }),
  arrive: () => {
    if (Date.now() - get().blurredAt > REMOUNT_WINDOW_MS) set({ open: null });
  },
}));
