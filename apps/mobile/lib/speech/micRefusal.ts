// A refused microphone is said once (#599 correction). Every place that records has its own
// recorder (lib/speech/record.ts) and remembered its own refusal: the note of a refused dictation
// stayed above the Composer, and a later refusal on a rehearsal card put the same sentence on the
// screen a second time. The note belongs to the place she tapped last: the newest refusal owns
// it, and every earlier one falls silent.

import { create } from 'zustand';

const useNewest = create<{ owner: object | null }>(() => ({ owner: null }));

export const micRefusal = {
  /** `who` was just refused: its note is the one that stands. */
  claim(who: object): void {
    useNewest.setState({ owner: who });
  },
  /** Whether `who` holds the newest refusal. */
  owns(who: object): boolean {
    return useNewest.getState().owner === who;
  },
};

/** `micRefusal.owns`, followed while a screen shows it. */
export function useOwnsRefusal(who: object): boolean {
  return useNewest((s) => s.owner === who);
}
