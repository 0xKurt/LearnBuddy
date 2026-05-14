// Lightweight UI state. Anything that lives across screens but doesn't
// belong on disk goes here. TanStack Query owns server cache; this store
// owns transient UI bits.

import { create } from 'zustand';

type AppState = {
  active_learner_id: string | null;
  set_active_learner: (id: string | null) => void;
};

export const useAppStore = create<AppState>((set) => ({
  active_learner_id: null,
  set_active_learner: (id) => set({ active_learner_id: id }),
}));
