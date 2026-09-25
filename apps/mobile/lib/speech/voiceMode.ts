// "Sprachmodus": Buddy reads new replies and questions aloud, and the mic is
// the main control. A per-device preference, kept in AsyncStorage (localStorage
// on the web, see voiceModeStorage*.ts); if the storage can't be read or
// written, the switch still works for this visit.
// The microphone is never started by this mode – she always taps.

import { create } from 'zustand';

import { readVoiceMode, writeVoiceMode } from './voiceModeStorage.js';

const KEY = 'lb.voiceMode';

type VoiceModeState = {
  on: boolean;
  setOn: (on: boolean) => void;
};

/** Set once the learner switched it herself: a late read from storage must not undo that. */
let touched = false;

export const useVoiceMode = create<VoiceModeState>((set) => ({
  on: false,
  setOn: (on) => {
    touched = true;
    set({ on });
    try {
      writeVoiceMode(KEY, on ? '1' : '0').catch(() => undefined);
    } catch {
      // No storage: the switch holds for this visit only.
    }
  },
}));

async function restore(): Promise<void> {
  try {
    const stored = await readVoiceMode(KEY);
    if (!touched && stored !== null) useVoiceMode.setState({ on: stored === '1' });
  } catch {
    // No storage (private browser window, broken storage): starts off.
  }
}

void restore();
