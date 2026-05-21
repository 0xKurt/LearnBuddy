// Voice recording hook for the agent chat composer.
//
// What this exposes:
//   - boolean `recording` state
//   - live `level` in 0..1 (smoothed amplitude for the UI waveform)
//   - VAD: when configured with onSilence(), fires the callback after
//     `silenceMs` of below-threshold audio (gated by `minSpeechMs` so
//     a quick double-tap can't auto-stop the instant you tap it)
//   - `stop()` resolves with base64-encoded audio, mime, duration
//
// Tuned for speech-to-text, not music. The recording config is custom:
//   * 16 kHz mono — Vertex/Gemini STT models are trained on this band;
//     anything higher just inflates the upload with no accuracy gain.
//   * 24 kbps AAC — perfectly intelligible voice at ~3 kB/s. A typical
//     5-second clip is ~15 kB instead of ~80 kB at HIGH_QUALITY.
//   * Metering enabled so we have amplitude for VAD + the waveform UI.
//
// Known limitation: amplitude-based VAD can't distinguish speech from
// continuous background noise (TV, music). For the TV-noise fix, we
// need native OS speech detection via expo-speech-recognition — which
// requires a dev client (won't work in Expo Go). Tracked but not active.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

export type VoiceRecording = {
  base64: string;
  mime: 'audio/m4a' | 'audio/mp4' | 'audio/wav' | 'audio/webm';
  durationMs: number;
};

export type UseVoiceRecorderOptions = {
  onSilence?: () => void;
  silenceMs?: number;
  minSpeechMs?: number;
  silenceThresholdDb?: number;
};

const SPEECH_RECORDING_CONFIG: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 24000,
  isMeteringEnabled: true,
  android: {
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
  },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MEDIUM,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 24000,
  },
};

export function useVoiceRecorder(options: UseVoiceRecorderOptions = {}) {
  // Threshold tuning (2026-05-21, post bedroom-rustling complaint):
  //   * silenceThresholdDb = -30: speech sits around -25 to -10 dB, soft
  //     background noise (rustling sheets, fan hum) around -45 to -38.
  //     -30 splits cleanly between the two. -42 (the old value) treated
  //     duvet rustling as "still talking" and never auto-stopped.
  //   * silenceMs = 900: snappier auto-stop on real silence; was 1200.
  //   * minSpeechMs = 500: prevents accidental double-tap stop; was 600.
  const { onSilence, silenceMs = 900, minSpeechMs = 500, silenceThresholdDb = -30 } = options;

  const recorder = useAudioRecorder(SPEECH_RECORDING_CONFIG);
  const state = useAudioRecorderState(recorder, 100);

  const [recording, setRecording] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [level, setLevel] = useState(0);

  const startedAtRef = useRef<number>(0);
  const lastLoudRef = useRef<number>(0);
  const firedOnSilenceRef = useRef<boolean>(false);
  // Sticky flag: true the moment any frame crosses silenceThresholdDb.
  // Gates auto-silence so a dead-quiet room can't false-trigger uploads.
  const hadSpeechRef = useRef<boolean>(false);

  useEffect(() => {
    if (!recording) {
      setLevel(0);
      return;
    }
    const meter = state.metering;
    if (typeof meter !== 'number') return;
    const norm = Math.max(0, Math.min(1, (meter + 60) / 60));
    setLevel((prev) => prev * 0.6 + norm * 0.4);

    const now = Date.now();
    const isLoud = meter > silenceThresholdDb;
    if (isLoud) {
      lastLoudRef.current = now;
      hadSpeechRef.current = true;
    }

    if (!onSilence || firedOnSilenceRef.current) return;
    if (now - startedAtRef.current < minSpeechMs) return;
    // CRITICAL: don't fire onSilence until at least one loud sample was
    // observed. Otherwise a dead-quiet room (below threshold) trips the
    // silence detector after `silenceMs` and the conv-mode loop spins
    // forever: open mic → 900ms silence → upload empty audio → STT
    // returns 'silent' → composer re-opens mic → repeat. The mic
    // simply waits, indefinitely, until the user actually speaks.
    // X-button (cancel) is still the user's way out.
    if (!hadSpeechRef.current) return;
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
    hadSpeechRef.current = false;
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
      const file = new File(uri);
      const b64 = await file.base64();
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
