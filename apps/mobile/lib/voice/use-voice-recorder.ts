// Voice recording hook for the agent chat composer.
//
// Wraps expo-audio's recorder + exposes:
//   - boolean `recording` state
//   - live `level` in 0..1 (smoothed amplitude for the UI waveform)
//   - VAD: when configured with onSilence(), auto-fires the callback
//     after `silenceMs` of below-threshold audio (after a minimum
//     speech time so the mic doesn't auto-stop the instant you tap it).
//
// On stop(): returns base64-encoded audio + mime so the caller can
// post it to the agent route as `audio_base64`.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { Platform } from 'react-native';

export type VoiceRecording = {
  base64: string;
  mime: 'audio/m4a' | 'audio/mp4' | 'audio/wav';
  durationMs: number;
};

export type UseVoiceRecorderOptions = {
  /** Fire when VAD detects sustained silence. The caller is responsible
   *  for invoking `stop()` and posting the audio — the hook does NOT
   *  auto-stop, because we want the parent to coordinate the UI
   *  transition (e.g. show "Submitting…" before the recording dies). */
  onSilence?: () => void;
  /** Milliseconds of sustained below-threshold audio that triggers
   *  onSilence. Default 1800ms (≈ ChatGPT Voice mode). */
  silenceMs?: number;
  /** Minimum speech time before VAD can fire — prevents auto-stop the
   *  instant the user taps the mic. Default 800ms. */
  minSpeechMs?: number;
  /** dBFS threshold under which audio counts as silence. expo-audio
   *  reports a roughly -160…0 range. -42 is a reasonable speech
   *  threshold for handheld mics. */
  silenceThresholdDb?: number;
};

export function useVoiceRecorder(options: UseVoiceRecorderOptions = {}) {
  const { onSilence, silenceMs = 1800, minSpeechMs = 800, silenceThresholdDb = -42 } = options;

  // HIGH_QUALITY preset doesn't enable metering by default. Spread it
  // and turn the flag on — without it `state.metering` stays undefined.
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  // Poll the recorder ~10×/s for metering + isRecording. expo-audio
  // emits the metering value in dBFS (negative; 0 is loudest).
  const state = useAudioRecorderState(recorder, 100);

  const [recording, setRecording] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [level, setLevel] = useState(0);

  const startedAtRef = useRef<number>(0);
  // Tracks when the last loud sample arrived. We measure the gap
  // between now and lastLoudRef to detect sustained silence.
  const lastLoudRef = useRef<number>(0);
  const firedOnSilenceRef = useRef<boolean>(false);

  // Translate dBFS to a smoothed 0..1 amplitude for the UI bars.
  // ‑60 dBFS ≈ ambient room, 0 dBFS = peak. Map [-60, 0] → [0, 1].
  useEffect(() => {
    if (!recording) {
      setLevel(0);
      return;
    }
    const meter = state.metering;
    if (typeof meter !== 'number') return;
    const norm = Math.max(0, Math.min(1, (meter + 60) / 60));
    // Light low-pass so the bars don't strobe.
    setLevel((prev) => prev * 0.6 + norm * 0.4);

    const now = Date.now();
    if (meter > silenceThresholdDb) lastLoudRef.current = now;

    // VAD check.
    if (!onSilence || firedOnSilenceRef.current) return;
    if (now - startedAtRef.current < minSpeechMs) return;
    if (now - lastLoudRef.current >= silenceMs) {
      firedOnSilenceRef.current = true;
      onSilence();
    }
  }, [state.metering, recording, onSilence, silenceMs, minSpeechMs, silenceThresholdDb]);

  const start = useCallback(async (): Promise<boolean> => {
    const perm = await requestRecordingPermissionsAsync();
    if (perm.status !== 'granted') {
      setPermissionDenied(true);
      return false;
    }
    setPermissionDenied(false);
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });
    await recorder.prepareToRecordAsync();
    startedAtRef.current = Date.now();
    lastLoudRef.current = startedAtRef.current;
    firedOnSilenceRef.current = false;
    recorder.record();
    setRecording(true);
    return true;
  }, [recorder]);

  const stop = useCallback(async (): Promise<VoiceRecording | null> => {
    if (!recording) return null;
    setRecording(false);
    await recorder.stop();
    const uri = recorder.uri;
    if (!uri) return null;
    try {
      const res = await fetch(uri);
      const ab = await res.arrayBuffer();
      const b64 = arrayBufferToBase64(ab);
      const mime: VoiceRecording['mime'] =
        Platform.OS === 'ios' || uri.endsWith('.m4a') ? 'audio/m4a' : 'audio/mp4';
      return {
        base64: b64,
        mime,
        durationMs: Date.now() - startedAtRef.current,
      };
    } catch {
      return null;
    }
  }, [recorder, recording]);

  const cancel = useCallback(async () => {
    if (!recording) return;
    setRecording(false);
    try {
      await recorder.stop();
    } catch {
      /* ignore */
    }
  }, [recorder, recording]);

  return { recording, permissionDenied, level, start, stop, cancel };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  if (typeof btoa === 'function') return btoa(binary);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf = (globalThis as any).Buffer;
  if (buf?.from) return buf.from(binary, 'binary').toString('base64');
  throw new Error('No base64 encoder available');
}
