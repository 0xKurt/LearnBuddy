// Voice recording hook for the agent chat composer.
//
// Wraps expo-audio's recorder + provides a single boolean state +
// start/stop/cancel. On stop, returns base64-encoded audio so the
// caller can POST it to the agent route as `audio_base64`.
//
// MVP scope: tap to start, tap to stop. No VAD. No live transcript.
// Mic permission handled lazily (request on first start).

import { useCallback, useRef, useState } from 'react';
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { Platform } from 'react-native';

export type VoiceRecording = {
  base64: string;
  mime: 'audio/m4a' | 'audio/mp4' | 'audio/wav';
  durationMs: number;
};

export function useVoiceRecorder() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const startedAtRef = useRef<number>(0);

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

  return { recording, permissionDenied, start, stop, cancel };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  // RN's btoa polyfill is present via the URL polyfill chain in Expo.
  if (typeof btoa === 'function') return btoa(binary);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf = (globalThis as any).Buffer;
  if (buf?.from) return buf.from(binary, 'binary').toString('base64');
  throw new Error('No base64 encoder available');
}
