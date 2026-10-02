// requires live verification in Claude Code session
// (echo cancellation and audio focus exist only on a real phone; see docs/architecture.md §Voice)
//
// The phone's ear while Buddy speaks (issue #35): a recorder on Android's VOICE_COMMUNICATION
// source — the one the platform runs its echo canceller on (expo-audio `audioSource`) — read
// only for its LEVEL (metering, ~every 50 ms). What it writes to the cache is deleted the
// moment it stops; it is never read, sent or written down. lib/speech/bargeIn.ts decides what
// the level means.
//
// Android only. On iOS, expo-audio cannot put the session into the voice-processing mode
// (`AVAudioSession.Mode.voiceChat`) that cancels echo, and switching the session to
// recording while Buddy plays may move his voice to the earpiece — so there Buddy is
// interrupted with a tap, as before. The recorder does not ask for audio focus (only
// expo-audio's players do), so it does not pause his voice.

import {
  AudioQuality,
  getRecordingPermissionsAsync,
  IOSOutputFormat,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

const FRAME_MS = 50;

/** The smallest recording that still meters; nothing of it is ever used. */
const MONITOR: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 16_000,
  numberOfChannels: 1,
  bitRate: 24_000,
  isMeteringEnabled: true,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac', audioSource: 'voice_communication' },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MIN,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 24_000 },
};

export type BargeMonitorOptions = {
  /** Open the mic now (Buddy speaks, conversation mode, no screen reader). */
  active: boolean;
  /** One level reading in dBFS, with the time it was taken. */
  onLevel: (db: number, at: number) => void;
};

/** Whether this platform can listen for her while Buddy speaks. */
export const bargeSupported = Platform.OS === 'android';

function discard(uri: string | null): void {
  if (!uri) return;
  try {
    new File(uri).delete();
  } catch {
    // Already gone: the system clears its cache on its own.
  }
}

export type BargeMonitor = {
  /**
   * Frees the microphone now; the promise resolves once it is free — the on-device recogniser
   * must not start while this recorder still holds the mic (two captures race for one
   * device). null: nothing holds it, start at once.
   */
  release: () => Promise<void> | null;
};

export function useBargeMonitor({ active, onLevel }: BargeMonitorOptions): BargeMonitor {
  const recorder = useAudioRecorder(MONITOR);
  const levelRef = useRef(onLevel);
  levelRef.current = onLevel;
  const closeRef = useRef<(() => Promise<void> | null) | null>(null);

  useEffect(() => {
    if (!active || !bargeSupported) return;
    let closed = false;
    let recording = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    void (async () => {
      try {
        // Never asks: conversation mode has the permission once she listened the first time.
        // Without it there is no barge-in, the tap still works.
        const perm = await getRecordingPermissionsAsync();
        if (!perm.granted || closed) return;
        await recorder.prepareToRecordAsync();
        if (closed) {
          await recorder.stop().catch(() => undefined);
          discard(recorder.uri);
          return;
        }
        recorder.record();
        recording = true;
        timer = setInterval(() => {
          const db = recorder.getStatus().metering;
          if (typeof db === 'number') levelRef.current(db, Date.now());
        }, FRAME_MS);
      } catch {
        // Busy or broken mic: no barge-in this time.
      }
    })();
    let stopped: Promise<void> | null = null;
    const close = (): Promise<void> | null => {
      closed = true;
      if (timer) clearInterval(timer);
      if (!recording) return null;
      stopped ??= recorder
        .stop()
        .catch(() => undefined)
        .then(() => discard(recorder.uri));
      return stopped;
    };
    closeRef.current = close;
    return () => {
      if (closeRef.current === close) closeRef.current = null;
      void close();
    };
  }, [active, recorder]);

  return { release: () => closeRef.current?.() ?? null };
}
