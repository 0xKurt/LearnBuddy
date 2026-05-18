// Voice recognition facade. Doc 05 §session-voice + USER-FLOWS §1.3.
//
// Wraps @react-native-voice/voice with a clean start/stop/event surface so
// VoiceButton never imports the native module directly. The facade also
// handles the "module not available at runtime" case gracefully — if the
// native module isn't linked (e.g. Expo Go / web) `isVoiceAvailable()` returns
// false and VoiceButton degrades to a tone-correct disabled affordance.
//
// All exported functions are safe to call even when the native module is
// absent; they either return false/void or throw 'voice_unavailable'.

let Voice: typeof import('@react-native-voice/voice').default | null = null;
try {
  // Dynamic require so the Metro bundler resolves the module but a missing
  // native binding at runtime (Expo Go) doesn't crash the JS bundle.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Voice = (require('@react-native-voice/voice') as { default: typeof Voice }).default;
} catch {
  Voice = null;
}

export type VoiceState = 'idle' | 'starting' | 'listening' | 'stopping' | 'error';

export type VoiceEvents = {
  onStart?: () => void;
  onPartial?: (transcript: string) => void;
  onFinal?: (transcript: string) => void;
  onError?: (message: string) => void;
};

/** True when @react-native-voice/voice has a working native binding. */
export function isVoiceAvailable(): boolean {
  return Voice !== null;
}

/** Request microphone permission. Returns true if granted (or already granted).
 *  On platforms without the native module returns false. */
export async function requestMicPermission(): Promise<boolean> {
  if (!Voice) return false;
  try {
    const granted = await Voice.isAvailable();
    return granted === 1;
  } catch {
    return false;
  }
}

/** Start a recognizer session. Caller passes event handlers.
 *  The locale code must be BCP-47 (e.g. 'de-DE', 'en-US'). */
export async function startListening(locale: string, events: VoiceEvents): Promise<void> {
  if (!Voice) throw new Error('voice_unavailable');

  // Detach any leftover handlers from a previous session first.
  Voice.removeAllListeners();

  Voice.onSpeechStart = () => events.onStart?.();

  Voice.onSpeechPartialResults = (e) => {
    const text = e.value?.[0];
    if (text) events.onPartial?.(text);
  };

  Voice.onSpeechResults = (e) => {
    const text = e.value?.[0];
    if (text) events.onFinal?.(text);
  };

  Voice.onSpeechError = (e) => {
    const msg = e.error?.message ?? String(e.error ?? 'voice_error');
    events.onError?.(msg);
  };

  await Voice.start(locale);
}

/** Stop the current recording session. The final result arrives via `onFinal`. */
export async function stopListening(): Promise<void> {
  if (!Voice) return;
  try {
    await Voice.stop();
  } catch {
    // Best-effort; if stop fails the session was likely already idle.
  }
}
