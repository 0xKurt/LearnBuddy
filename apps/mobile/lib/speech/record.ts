// Recording one spoken sentence (expo-audio): the microphone is asked for
// only when the learner taps record, and the recording is handed over as
// base64 for SpeakRequest / TranscribeRequest. Pronunciation stops by itself
// after maxMs; a dictation (onChunk) has no time limit — a long recording
// rolls over into pieces at pauses (lib/speech/dictation.ts, issue #19), the
// recorder restarting inside the silence so she never notices. Every file is
// deleted from the device right after reading it; nothing is kept.

import type { AudioMime } from '@learnbuddy/shared-types/contracts';
import {
  AudioQuality,
  getRecordingPermissionsAsync,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { ChunkCutter, SpeechMark } from './dictation.js';
import {
  MAX_AUDIO_BASE64,
  MAX_RECORDING_MS,
  MIN_AUDIO_BASE64,
  MIN_RECORDING_MS,
  speakMime,
  speakMimeForFile,
} from './voice.js';
import { useMounted } from '../useMounted.js';
import { levelFromDb } from './level.js';
import { START_DEADLINE_MS, startTimedOut } from './startDeadline.js';

/** Speech, not music: mono, 22.05 kHz AAC in an .m4a on phones; the browser's own format on the web. */
const SPEECH_RECORDING: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 22_050,
  numberOfChannels: 1,
  bitRate: 48_000,
  // The level drives the listening moon's glow in conversation mode.
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

/**
 * A rehearsal talk or a read-aloud (issue #264): up to ten minutes in one piece, so half the rate —
 * speech stays clear at 24 kbit/s mono, and ten minutes stay inside what the API takes in one
 * request (`REHEARSAL_MAX_BASE64`).
 */
const LONG_RECORDING: RecordingOptions = {
  ...SPEECH_RECORDING,
  sampleRate: 16_000,
  bitRate: 24_000,
  web: { mimeType: 'audio/webm', bitsPerSecond: 24_000 },
};

/**
 * Whether the recorder reports her level. expo-audio meters on phones; its web recorder
 * reports none (expo-audio 1.1 `AudioModule.web`), so there the level stays 0 and no
 * pause can end a recording (issue #523).
 */
export const recorderMeters = Platform.OS !== 'web';

export type Recording = { uri: string; mime: AudioMime; durationMs: number; base64: string };

/** Why no recording came out: no microphone access, only a tap, an unknown format, or it broke. */
export type RecordFailure = 'denied' | 'too_short' | 'unsupported' | 'failed';

export type RecordPhase = 'idle' | 'starting' | 'recording' | 'stopping';

/**
 * Which piece of a dictation this is (0-based) and whether it ended the
 * recording. `silent` = the piece provably held no speech (issue #28: the
 * metering measured it, an earlier piece of the take heard her) — usually the
 * pause between the last cut and her tap on stop; it needs no transcription.
 */
export type DictationChunk = { index: number; last: boolean; silent?: boolean };

type Handlers = {
  /** The whole recording in one piece; not called when `onChunk` is given. */
  onRecorded?: (recording: Recording) => void;
  onFailed: (why: RecordFailure) => void;
  /**
   * Dictation without a time limit (issue #19): a long recording rolls over
   * into pieces at pauses (lib/speech/dictation.ts) and every piece — the last
   * one included — arrives here; null is a piece that broke on the device (the
   * other pieces still count). With `onChunk`, nothing but her tap ends the
   * recording and `maxMs` is ignored.
   */
  onChunk?: (recording: Recording | null, chunk: DictationChunk) => void;
};

type Options = Handlers & {
  /** The recording stops by itself after this long (default 15 s, SpeakRequest's limit). */
  maxMs?: number;
  /**
   * A long recording in one piece (issue #264: a rehearsal talk, reading a text aloud): the lower
   * rate above, and this many base64 characters at most instead of `MAX_AUDIO_BASE64`.
   */
  long?: { maxBase64: number };
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
async function readRecording(uri: string): Promise<{ base64: string; mime: AudioMime | null }> {
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

/** Removes a recording that is not needed (thrown away, or left behind by a failed stop). */
function discardFile(uri: string | null): void {
  if (!uri) return;
  if (Platform.OS === 'web') {
    URL.revokeObjectURL(uri);
    return;
  }
  try {
    new File(uri).delete();
  } catch {
    // Already gone.
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

export function useRecording({
  onRecorded,
  onFailed,
  onChunk,
  maxMs = MAX_RECORDING_MS,
  long,
}: Options) {
  const recorder = useAudioRecorder(long ? LONG_RECORDING : SPEECH_RECORDING);
  /** The most a recording may be as base64: a long one takes the API's larger request. */
  const maxBase64 = useRef(MAX_AUDIO_BASE64);
  maxBase64.current = long?.maxBase64 ?? MAX_AUDIO_BASE64;
  const [phase, setPhaseState] = useState<RecordPhase>('idle');
  /** Microphone access was refused; canAskAgain = false means only the settings can change it. */
  const [denied, setDenied] = useState<{ canAskAgain: boolean } | null>(null);
  const phaseRef = useRef<RecordPhase>('idle');
  const startedAt = useRef(0);
  /** The file being recorded, known from the start: removed even when stopping fails. */
  const fileUri = useRef<string | null>(null);
  /** Cancelled while still asking for the mic / preparing: it must not start recording. */
  const cancelled = useRef(false);
  const limit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useMounted();
  const handlers = useRef<Handlers>({ onRecorded, onFailed, onChunk });
  handlers.current = { onRecorded, onFailed, onChunk };
  const maxRef = useRef(maxMs);
  maxRef.current = maxMs;
  /** Which piece of a dictation is being recorded, and how long the finished ones were. */
  const chunkIndex = useRef(0);
  const chunkBaseMs = useRef(0);
  const cutter = useRef(new ChunkCutter());
  /** Whether the running piece provably holds no speech (issue #28). */
  const mark = useRef(new SpeechMark());
  /** A rollover already on its way (the poll must not start a second one). */
  const rolling = useRef(false);
  /**
   * Recorder operations run strictly one after another: a rollover mid-flight
   * and the tap on stop must not interleave on the same recorder.
   */
  const ops = useRef<Promise<void>>(Promise.resolve());
  const enqueue = useCallback((op: () => Promise<void>): Promise<void> => {
    const run = ops.current.then(op);
    ops.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }, []);

  const setPhase = useCallback((p: RecordPhase) => {
    phaseRef.current = p;
    if (mounted.current) setPhaseState(p);
  }, []);

  const clearLimit = () => {
    if (limit.current) clearTimeout(limit.current);
    limit.current = null;
  };

  /** Reads a finished dictation piece and hands it out; a broken one is honest (null). */
  const deliverPiece = useCallback(
    async (
      uri: string | null,
      index: number,
      pieceMs: number,
      last: boolean,
      silent: boolean,
    ): Promise<void> => {
      const give = handlers.current.onChunk;
      if (!give || !mounted.current) {
        discardFile(uri);
        return;
      }
      if (!uri) {
        give(null, { index, last });
        return;
      }
      try {
        const read = await readRecording(uri);
        if (!mounted.current) return;
        if (read.mime === null || read.base64.length > maxBase64.current)
          give(null, { index, last });
        else
          give(
            { uri, mime: read.mime, durationMs: pieceMs, base64: read.base64 },
            { index, last, silent },
          );
      } catch {
        if (mounted.current) give(null, { index, last });
      }
    },
    [],
  );

  /**
   * Cuts the running dictation inside a pause: the recorder stops, starts
   * again right away, and the finished piece is read and handed out while she
   * keeps talking. When the recorder cannot start again, the dictation ends
   * with this piece as the last — with everything said so far intact.
   */
  const rollover = useCallback((): void => {
    if (rolling.current) return;
    rolling.current = true;
    void enqueue(async () => {
      try {
        if (phaseRef.current !== 'recording' || !handlers.current.onChunk) return;
        const index = chunkIndex.current;
        let uri: string | null = null;
        let pieceMs = 0;
        try {
          pieceMs = recorder.getStatus().durationMillis;
          await recorder.stop();
          uri = recorder.uri;
        } catch {
          uri = null;
        }
        chunkIndex.current = index + 1;
        chunkBaseMs.current += pieceMs;
        cutter.current.reset();
        const silent = mark.current.endPiece();
        let restarted = false;
        try {
          await recorder.prepareToRecordAsync();
          if (phaseRef.current === 'recording') {
            recorder.record();
            fileUri.current = recorder.uri;
            restarted = true;
          }
        } catch {
          restarted = false;
        }
        if (!restarted) {
          fileUri.current = null;
          await allowRecording(false);
          setPhase('idle');
        }
        // Reading the piece runs beside the next one being recorded.
        void deliverPiece(uri, index, pieceMs, !restarted, silent);
      } finally {
        rolling.current = false;
      }
    });
  }, [deliverPiece, enqueue, recorder, setPhase]);

  // Timer and sound level, asked from the recorder only while it records — an idle mic on
  // screen polls nothing (p2-idle-recorders-polled-every-120ms). The same poll
  // watches a dictation for the pause at which the next piece begins.
  const [state, setState] = useState<{ durationMillis: number; metering?: number }>({
    durationMillis: 0,
  });
  useEffect(() => {
    if (phase !== 'recording') return;
    const poll = setInterval(() => {
      try {
        const s = recorder.getStatus();
        setState({ durationMillis: s.durationMillis, metering: s.metering });
        mark.current.observe(s.metering);
        if (
          handlers.current.onChunk &&
          !rolling.current &&
          cutter.current.shouldCut(s.durationMillis, levelFromDb(s.metering), Date.now())
        )
          rollover();
      } catch {
        // Released meanwhile: the phase follows.
      }
    }, 120);
    return () => clearInterval(poll);
  }, [phase, recorder, rollover]);

  /** Ends the recording; deliver = false throws it away (leaving the screen, the app going away). */
  const finish = useCallback(
    (deliver: boolean): Promise<void> =>
      enqueue(async () => {
        if (phaseRef.current !== 'recording') return;
        clearLimit();
        setPhase('stopping');
        let uri: string | null = null;
        let durationMs = Date.now() - startedAt.current;
        let pieceMs = 0;
        try {
          const status = recorder.getStatus();
          pieceMs = status.durationMillis;
          if (status.durationMillis > 0) durationMs = status.durationMillis;
          await recorder.stop();
          uri = recorder.uri;
        } catch {
          uri = null;
        }
        await allowRecording(false);
        const known = fileUri.current;
        fileUri.current = null;
        try {
          if (!deliver) {
            // Thrown away (left the screen, answered another way): delete it, unread. A
            // recorder already released on unmount has no uri any more — the one noted at the
            // start is used (p2-recording-file-left-on-unmount).
            discardFile(uri ?? known);
            return;
          }
          const give = handlers.current.onChunk;
          if (give) {
            // The end of a dictation: this piece is the last. Only a dictation
            // that never rolled over can be a tap by mistake; with earlier
            // pieces, whatever was said is delivered.
            const index = chunkIndex.current;
            const silent = mark.current.endPiece();
            if (!uri) {
              discardFile(known);
              if (index === 0) handlers.current.onFailed('failed');
              else give(null, { index, last: true });
              return;
            }
            const totalMs = chunkBaseMs.current + (pieceMs > 0 ? pieceMs : durationMs);
            const read = await readRecording(uri);
            if (!mounted.current) return;
            if (
              index === 0 &&
              (totalMs < MIN_RECORDING_MS || read.base64.length < MIN_AUDIO_BASE64)
            ) {
              handlers.current.onFailed('too_short');
            } else if (index === 0 && read.mime === null) {
              handlers.current.onFailed('unsupported');
            } else if (read.mime === null || read.base64.length > maxBase64.current) {
              // Only this piece is unreadable; the earlier ones still count.
              give(null, { index, last: true });
            } else {
              give(
                { uri, mime: read.mime, durationMs: pieceMs, base64: read.base64 },
                { index, last: true, silent },
              );
            }
            return;
          }
          if (!uri) {
            discardFile(known);
            handlers.current.onFailed('failed');
            return;
          }
          const tooShort = durationMs < MIN_RECORDING_MS;
          const read = await readRecording(uri);
          if (!mounted.current) return;
          if (tooShort || read.base64.length < MIN_AUDIO_BASE64) {
            handlers.current.onFailed('too_short');
          } else if (read.mime === null || read.base64.length > maxBase64.current) {
            handlers.current.onFailed('unsupported');
          } else {
            handlers.current.onRecorded?.({
              uri,
              mime: read.mime,
              durationMs: Math.min(durationMs, maxRef.current),
              base64: read.base64,
            });
          }
        } catch {
          if (deliver) {
            const give = handlers.current.onChunk;
            if (give && chunkIndex.current > 0)
              give(null, { index: chunkIndex.current, last: true });
            else handlers.current.onFailed('failed');
          }
        } finally {
          setPhase('idle');
        }
      }),
    [enqueue, recorder, setPhase],
  );

  const start = useCallback(async (): Promise<void> => {
    if (phaseRef.current !== 'idle') return;
    cancelled.current = false;
    setPhase('starting');
    // Getting ready has its own deadline (issue #158). Asking for the permission and
    // preparing the recorder can hang — a denied-then-reopened Settings sheet, a phone
    // busy with another app — and nothing here used to time out. She would see "Ich höre
    // zu", speak, and find out later that nothing was recorded.
    const tooSlow = setTimeout(() => {
      if (!startTimedOut({ phase: phaseRef.current, mounted: mounted.current })) return;
      cancelled.current = true;
      handlers.current.onFailed('failed');
      setPhase('idle');
      void allowRecording(false);
    }, START_DEADLINE_MS);
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
      // Left the screen, or a second tap while the mic was being prepared: no recording
      // starts (tap-during-starting-uncancellable).
      if (!mounted.current || cancelled.current) {
        await allowRecording(false);
        setPhase('idle');
        return;
      }
      recorder.record();
      fileUri.current = recorder.uri;
      startedAt.current = Date.now();
      chunkIndex.current = 0;
      chunkBaseMs.current = 0;
      cutter.current.reset();
      mark.current.reset();
      setPhase('recording');
      // A dictation (onChunk) has no time limit: only her tap ends it.
      if (!handlers.current.onChunk)
        limit.current = setTimeout(() => void finish(true), maxRef.current);
    } catch {
      await allowRecording(false);
      handlers.current.onFailed('failed');
      setPhase('idle');
    } finally {
      clearTimeout(tooSlow);
    }
  }, [finish, recorder, setPhase]);

  const stop = useCallback(() => finish(true), [finish]);
  /** Ends the recording and throws it away (she answered another way). */
  const cancel = useCallback(() => {
    if (phaseRef.current === 'starting') cancelled.current = true;
    return finish(false);
  }, [finish]);

  // Leaving the foreground ends a recording without sending it — also 'inactive'
  // (an incoming call interrupts the audio session without ever reaching
  // 'background'; recognize.ts treats it the same way).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') void finish(false);
    });
    return () => sub.remove();
  }, [finish]);

  useEffect(
    () => () => {
      cancelled.current = true;
      void finish(false);
    },
    [finish],
  );

  return {
    phase,
    /** Milliseconds recorded so far (for the timer); a dictation counts across its pieces. */
    elapsedMs:
      phase === 'recording'
        ? onChunk
          ? chunkBaseMs.current + state.durationMillis
          : Math.min(state.durationMillis, maxMs)
        : 0,
    /** The longest this recording can get (for "0:07 / 1:00"); a dictation has no bound. */
    maxMs: onChunk ? null : maxMs,
    /** How loud she is right now (0…1; 0 when not recording or not measured). */
    level: phase === 'recording' ? levelFromDb(state.metering) : 0,
    denied,
    start,
    stop,
    cancel,
  };
}
