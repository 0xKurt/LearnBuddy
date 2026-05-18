// Lightweight UI state. Anything that lives across screens but doesn't
// belong on disk goes here. TanStack Query owns server cache; this store
// owns transient UI bits.

import { create } from 'zustand';

import type { LearnerCreate } from '@learnbuddy/shared-types';

/** Volatile draft handed from (onboarding)/add-profile to
 *  (onboarding)/profile-minor-consent. Cleared after the POST. */
export type ProfileDraft = Omit<LearnerCreate, 'minor_consent_version'>;

/** Persists mid-session progress so the home screen can offer a resume banner.
 *  Lives in-memory only — survives backgrounding but not a full app restart. */
export type PendingSession = {
  session_id: string;
  client_id: string;
  learner_id: string;
  idx: number;
  subject_id: string | null;
  folder_id: string | null;
  material_id: string | null;
  test_mode: boolean;
};

type AppState = {
  active_learner_id: string | null;
  set_active_learner: (id: string | null) => void;
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
  /** Set when the user navigates away mid-session; cleared on completion or dismiss. */
  pending_session: PendingSession | null;
  set_pending_session: (s: PendingSession | null) => void;
};

export const useAppStore = create<AppState>((set) => ({
  active_learner_id: null,
  set_active_learner: (id) => set({ active_learner_id: id }),
  admin_unlocked: false,
  set_admin_unlocked: (v) => set({ admin_unlocked: v }),
  pending_profile_draft: null,
  set_pending_profile_draft: (d) => set({ pending_profile_draft: d }),
  pending_birth_year: null,
  set_pending_birth_year: (y) => set({ pending_birth_year: y }),
  pending_session: null,
  set_pending_session: (s) => set({ pending_session: s }),
}));
