// Recording one spoken sentence (expo-audio): the microphone is asked for
// only when the learner taps record, the recording stops by itself after
// maxMs (15 s for pronunciation, 60 s for a spoken message or answer), and it
// is handed over as base64 for SpeakRequest / TranscribeRequest. The file itself is
// deleted from the device right after reading it; nothing is kept.

import {
  AudioQuality,
  getRecordingPermissionsAsync,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import {
  MAX_AUDIO_BASE64,
  MAX_RECORDING_MS,
  MIN_AUDIO_BASE64,
  MIN_RECORDING_MS,
  speakMime,
  speakMimeForFile,
  type SpeakMime,
} from './voice.js';
import { levelFromDb } from './level.js';

/** Speech, not music: mono, 22.05 kHz AAC in an .m4a on phones; the browser's own format on the web. */
const SPEECH_RECORDING: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 22_050,
  numberOfChannels: 1,
  bitRate: 48_000,
  // The level drives the orb's sound bars in conversation mode.
  isMeteringEnabled: true,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MEDIUM,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 48_000 },
};

export type Recording = { uri: string; mime: SpeakMime; durationMs: number; base64: string };

/** Why no recording came out: no microphone access, only a tap, an unknown format, or it broke. */
export type RecordFailure = 'denied' | 'too_short' | 'unsupported' | 'failed';

export type RecordPhase = 'idle' | 'starting' | 'recording' | 'stopping';

type Handlers = {
  onRecorded: (recording: Recording) => void;
  onFailed: (why: RecordFailure) => void;
};

type Options = Handlers & {
  /** The recording stops by itself after this long (default 15 s, SpeakRequest's limit). */
  maxMs?: number;
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : '';
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/** Reads the finished recording and removes it from the device. */
async function readRecording(uri: string): Promise<{ base64: string; mime: SpeakMime | null }> {
  if (Platform.OS === 'web') {
    try {
      const blob = await (await fetch(uri)).blob();
      return { base64: await blobToBase64(blob), mime: speakMime(blob.type) };
    } finally {
      URL.revokeObjectURL(uri);
    }
  }
  const file = new File(uri);
  try {
    return { base64: await file.base64(), mime: speakMimeForFile(uri) };
  } finally {
    try {
      file.delete();
    } catch {
      // Already gone: the system cleans its cache on its own.
    }
  }
}

async function allowRecording(allowed: boolean): Promise<void> {
  try {
    // While recording, iOS needs the recording session; afterwards playback goes back to the speaker.
    await setAudioModeAsync({ allowsRecording: allowed, playsInSilentMode: true });
  } catch {
    // Not fatal: recording or playback reports its own failure.
  }
}

export function useRecording({ onRecorded, onFailed, maxMs = MAX_RECORDING_MS }: Options) {
  const recorder = useAudioRecorder(SPEECH_RECORDING);
  const state = useAudioRecorderState(recorder, 120);
  const [phase, setPhaseState] = useState<RecordPhase>('idle');
  /** Microphone access was refused; canAskAgain = false means only the settings can change it. */
  const [denied, setDenied] = useState<{ canAskAgain: boolean } | null>(null);
  const phaseRef = useRef<RecordPhase>('idle');
  const startedAt = useRef(0);
  const limit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const handlers = useRef<Handlers>({ onRecorded, onFailed });
  handlers.current = { onRecorded, onFailed };
  const maxRef = useRef(maxMs);
  maxRef.current = maxMs;

  const setPhase = useCallback((p: RecordPhase) => {
    phaseRef.current = p;
    if (mounted.current) setPhaseState(p);
  }, []);

  const clearLimit = () => {
    if (limit.current) clearTimeout(limit.current);
    limit.current = null;
  };

  /** Ends the recording; deliver = false throws it away (leaving the screen, the app going away). */
  const finish = useCallback(
    async (deliver: boolean): Promise<void> => {
      if (phaseRef.current !== 'recording') return;
      clearLimit();
      setPhase('stopping');
      let uri: string | null = null;
      let durationMs = Date.now() - startedAt.current;
      try {
        const status = recorder.getStatus();
        if (status.durationMillis > 0) durationMs = status.durationMillis;
        await recorder.stop();
        uri = recorder.uri;
      } catch {
        uri = null;
      }
      await allowRecording(false);
      try {
        if (!uri) {
          if (deliver) handlers.current.onFailed('failed');
          return;
        }
        const tooShort = durationMs < MIN_RECORDING_MS;
        const read = await readRecording(uri);
        if (!deliver || !mounted.current) return;
        if (tooShort || read.base64.length < MIN_AUDIO_BASE64) {
          handlers.current.onFailed('too_short');
        } else if (read.mime === null || read.base64.length > MAX_AUDIO_BASE64) {
          handlers.current.onFailed('unsupported');
        } else {
          handlers.current.onRecorded({
            uri,
            mime: read.mime,
            durationMs: Math.min(durationMs, maxRef.current),
            base64: read.base64,
          });
        }
      } catch {
        if (deliver) handlers.current.onFailed('failed');
      } finally {
        setPhase('idle');
      }
    },
    [recorder, setPhase],
  );

  const start = useCallback(async (): Promise<void> => {
    if (phaseRef.current !== 'idle') return;
    setPhase('starting');
    try {
      let perm = await getRecordingPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        if (mounted.current) setDenied({ canAskAgain: perm.canAskAgain });
        handlers.current.onFailed('denied');
        setPhase('idle');
        return;
      }
      if (mounted.current) setDenied(null);
      await allowRecording(true);
      await recorder.prepareToRecordAsync();
      if (!mounted.current) {
        await allowRecording(false);
        return;
      }
      recorder.record();
      startedAt.current = Date.now();
      setPhase('recording');
      limit.current = setTimeout(() => void finish(true), maxRef.current);
    } catch {
      await allowRecording(false);
      handlers.current.onFailed('failed');
      setPhase('idle');
    }
  }, [finish, recorder, setPhase]);

  const stop = useCallback(() => finish(true), [finish]);

  // Going to the background ends a recording without sending it.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') void finish(false);
    });
    return () => sub.remove();
  }, [finish]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void finish(false);
    };
  }, [finish]);

  return {
    phase,
    /** Milliseconds recorded so far (for the timer). */
    elapsedMs: phase === 'recording' ? Math.min(state.durationMillis, maxMs) : 0,
    /** The longest this recording can get (for "0:07 / 1:00"). */
    maxMs,
    /** How loud she is right now (0…1; 0 when not recording or not measured). */
    level: phase === 'recording' ? levelFromDb(state.metering) : 0,
    denied,
    start,
    stop,
  };
}
