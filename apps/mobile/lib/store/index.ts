// Lightweight UI state. Anything that lives across screens but doesn't
// belong on disk goes here. TanStack Query owns server cache; this store
// owns transient UI bits.

import { create } from 'zustand';

import type { LearnerCreate } from '@learnbuddy/shared-types';

/** Volatile draft handed from (onboarding)/add-profile to
 *  (onboarding)/profile-minor-consent. Cleared after the POST. */
export type ProfileDraft = Omit<LearnerCreate, 'minor_consent_version'>;

// Mid-session resume now lives in `lib/session/pending.ts` (expo-secure-store)
// so it survives a full app restart and resumes deterministically from the
// server snapshot — the old in-memory pointer below was lost on restart and
// re-picked a different item set.

type AppState = {
  /** Transient: true after a successful biometric/PIN unlock; reset on
   *  every (admin)/unlock mount so re-entry forces re-auth. */
  admin_unlocked: boolean;
  set_admin_unlocked: (v: boolean) => void;
  /** Hand-off for minor-profile creation. */
  pending_profile_draft: ProfileDraft | null;
  set_pending_profile_draft: (d: ProfileDraft | null) => void;
  /** Birth year collected in welcome.tsx signup form; pre-populates add-profile. */
  pending_birth_year: number | null;
  set_pending_birth_year: (y: number | null) => void;
};

export const useAppStore = create<AppState>((set) => ({
  admin_unlocked: false,
  set_admin_unlocked: (v) => set({ admin_unlocked: v }),
  pending_profile_draft: null,
  set_pending_profile_draft: (d) => set({ pending_profile_draft: d }),
  pending_birth_year: null,
  set_pending_birth_year: (y) => set({ pending_birth_year: y }),
}));
