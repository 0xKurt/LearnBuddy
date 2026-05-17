// Voice recognition facade. Doc 05 §session-voice + USER-FLOWS §1.3.
//
// **Status (slice this commit lands in): SCAFFOLD-ONLY.**
//
// The target dependency is `@react-native-voice/voice` (offline iOS / Android
// ASR with start/stop/partial/final callbacks). It has not yet been added to
// the bundle because:
//
//   1. It ships a config-plugin that must run during `expo prebuild` and
//      the current EAS build infra (Slice A2) needs a follow-up to allow it.
//   2. Microphone privacy strings (`NSMicrophoneUsageDescription` +
//      Android RECORD_AUDIO rationale) are not yet in `app.json`; adding
//      them belongs in the same config-plugin slice so the rationale copy
//      ships in all 5 locales atomically.
//
// This file exists so `components/lb/VoiceButton.tsx` imports a clean
// facade today, and the day the native integration lands the swap is
// limited to this single module. The shape mirrors the
// `@react-native-voice/voice` event surface so we don't have to retro-fit
// the component when the real dep lands.

export type VoiceState = 'idle' | 'starting' | 'listening' | 'stopping' | 'error';

export type VoiceEvents = {
  onStart?: () => void;
  onPartial?: (transcript: string) => void;
  onFinal?: (transcript: string) => void;
  onError?: (message: string) => void;
};

/** True when the native ASR module has been installed and is callable.
 *  Today this returns false on every platform so the VoiceButton degrades
 *  to a tone-correct "Voice coming soon" affordance. */
export function isVoiceAvailable(): boolean {
  return false;
}

/** Request mic permission. Returns true if granted (or already granted).
 *  Today this returns false — VoiceButton uses it to decide whether to
 *  even start the listen flow. */
export async function requestMicPermission(): Promise<boolean> {
  return Promise.resolve(false);
}

/** Start a recording session. Caller passes event handlers. The real
 *  integration will wire these to the native module's
 *  `Voice.onSpeechStart` / `Voice.onSpeechPartialResults` etc. */
export async function startListening(_locale: string, _events: VoiceEvents): Promise<void> {
  throw new Error('voice_unavailable');
}

/** Stop the recording session. The final transcript is delivered via the
 *  `onFinal` handler registered in `startListening`. */
export async function stopListening(): Promise<void> {
  /* no-op until native integration lands */
}
