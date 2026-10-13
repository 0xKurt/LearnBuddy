// What of the parents' area is open right now (docs/privacy.md §PIN gate, lib/parentsGate.ts).
// The settings ask the parents' PIN and then open the page; the page shows only what was
// approved and nothing without it — a link straight to it finds the area closed. Held outside
// the component tree because two routes share it: the settings open it, the page reads it and
// closes it again when the parents leave. Never stored: closing the app closes it.

import { create } from 'zustand';

import type { ParentsView } from '../../lib/parentsGate.js';

type ParentsArea = {
  view: ParentsView | null;
  open: (view: ParentsView) => void;
  close: () => void;
};

export const useParentsArea = create<ParentsArea>((set) => ({
  view: null,
  open: (view) => set({ view }),
  close: () => set({ view: null }),
}));
