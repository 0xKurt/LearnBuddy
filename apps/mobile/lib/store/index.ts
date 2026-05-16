// Lightweight UI state. Anything that lives across screens but doesn't
// belong on disk goes here. TanStack Query owns server cache; this store
// owns transient UI bits.

import { create } from 'zustand';

type AppState = {
  active_learner_id: string | null;
  set_active_learner: (id: string | null) => void;
  /** Transient: true after a successful biometric/PIN unlock; reset on
   *  every (admin)/unlock mount so re-entry forces re-auth. */
  admin_unlocked: boolean;
  set_admin_unlocked: (v: boolean) => void;
};

export const useAppStore = create<AppState>((set) => ({
  active_learner_id: null,
  set_active_learner: (id) => set({ active_learner_id: id }),
  admin_unlocked: false,
  set_admin_unlocked: (v) => set({ admin_unlocked: v }),
}));
