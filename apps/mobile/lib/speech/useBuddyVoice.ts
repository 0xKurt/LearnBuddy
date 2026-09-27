// What Buddy's voice is doing right now (ADR 0008): idle | loading | speaking, the sentences
// of the text being read, the one being read and the real progress within it. For talk mode's
// state, the orb and read-along highlighting; stop it with stop() from lib/speech/listen.ts.

import { useSyncExternalStore } from 'react';

import { voiceStore, type VoiceSnapshot } from './voiceState.js';

export function useBuddyVoice(): VoiceSnapshot {
  return useSyncExternalStore(voiceStore.subscribe, voiceStore.get, voiceStore.get);
}
