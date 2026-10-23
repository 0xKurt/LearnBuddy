import type { PronunciationPlan } from '@learnbuddy/shared-types/contracts';
import { create } from 'zustand';

/** Developer instrumentation borrows the current exercise; no fixture sentences in app code. */
export const usePronunciationLab = create<{ open: boolean; plan: PronunciationPlan | null }>(
  () => ({ open: false, plan: null }),
);
