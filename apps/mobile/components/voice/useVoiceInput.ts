// Speaking instead of typing (a message to Buddy or an answer): tap to start,
// tap to stop (60 s at most), and the written text comes back via onText.
// Two ways, chosen per tap (lib/speech/engine.ts, docs/privacy.md §Processors):
// - device: the phone recognises on-device, the words appear while she speaks
//   (`live`), nothing leaves the phone;
// - server: a recording goes once to POST /voice/transcribe (our EU path) and is
//   not kept on the device or the server — in the browser, and wherever the
//   phone could only recognise on Apple's/Google's servers.
// Screens only see { state, toggle, … }, so the way can change without touching them.
//
// The microphone is only ever started by a tap (toggle); nothing here starts
// it by itself. Whatever is being read aloud stops when she starts speaking.

import type { TranscribeRequest } from '@learnbuddy/shared-types/contracts';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { announce } from '../../lib/announce.js';
import { transcribe } from '../../lib/api/endpoints.js';
import { messageFor } from '../../lib/errors.js';
import { stop as stopListening } from '../../lib/speech/listen.js';
import { useRecording, type Recording } from '../../lib/speech/record.js';
import { engineFor, useDeviceRecognition } from '../../lib/speech/recognize.js';
import { TurnGuard } from '../../lib/speech/turnGuard.js';
import { transcriptContext, transcriptLang } from '../../lib/speech/spoken.js';
import { MAX_DICTATION_MS, voiceLocale } from '../../lib/speech/voice.js';
import { toast } from '../lb/Toast.js';

export type VoicePurpose = TranscribeRequest['purpose'];

/** idle → starting (asking for the mic) → recording → transcribing → idle. */
export type VoiceInputState = 'idle' | 'starting' | 'recording' | 'transcribing';

/** Why no text came out: nothing understood, only a tap, an unreadable or broken recording. */
export type VoiceHint = 'empty' | 'too_short' | 'unsupported' | 'failed';

type Options = {
  purpose: VoicePurpose;
  /** The language she is expected to speak (ISO 639-1, e.g. "fr"); null = the app language. */
  lang: string | null;
  /** answer: the question being answered, so a short answer is heard in context. */
  context?: string | null;
  /** The understood text (never empty). */
  onText: (text: string) => void;
  /**
   * Conversation: on the device, listening ends by itself when she pauses. (A
   * recording for our EU path has no pause detection: she taps to finish.)
   */
  untilPause?: boolean;
};

export type VoiceInput = {
  state: VoiceInputState;
  /** Listening on the device (ends by itself with untilPause) rather than recording. */
  onDevice: boolean;
  /** Milliseconds recorded so far and the most there can be (for "0:07 / 1:00"). */
  elapsedMs: number;
  maxMs: number;
  /** How loud she is right now (0…1), for the listening moon's glow. */
  level: number;
  /** What she has said so far: the phone's recognition, or the words the model is
   * writing down while it listens (issue #9); '' before the first ones. */
  live: string;
  hint: VoiceHint | null;
  /** Microphone access was refused; canAskAgain = false means only the settings can change it. */
  denied: { canAskAgain: boolean } | null;
  /** Starts listening when idle, stops (and transcribes) while recording. */
  toggle: () => void;
  /**
   * Ends listening and throws away what it would have written (she answered another way,
   * the question changed, Buddy started speaking). A transcript already on its way is dropped.
   */
  cancel: () => void;
};

export function useVoiceInput({
  purpose,
  lang,
  context = null,
  onText,
  untilPause = false,
}: Options): VoiceInput {
  const { i18n } = useTranslation();
  const [transcribing, setTranscribing] = useState(false);
  /** What the model has written down so far while it is still listening (issue #9). */
  const [heard, setHeard] = useState('');
  const [choosing, setChoosing] = useState(false);
  const [hint, setHint] = useState<VoiceHint | null>(null);
  const mounted = useRef(true);
  /** cancel() drops text from a listening that began before it (lib/speech/turnGuard.ts). */
  const guard = useRef(new TurnGuard()).current;
  const latest = useRef({ purpose, lang, context, onText });
  latest.current = { purpose, lang, context, onText };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** The understood text goes to the screen, and a screen reader hears it (audit M-80). */
  function deliver(text: string): void {
    announce(text);
    latest.current.onText(text);
  }

  async function send(r: Recording): Promise<void> {
    if (!guard.current()) return;
    const token = guard.begin();
    const opts = latest.current;
    setTranscribing(true);
    setHeard('');
    try {
      const res = await transcribe(
        {
          mime: r.mime,
          audio_base64: r.base64,
          purpose: opts.purpose,
          lang: transcriptLang(opts.lang),
          context: opts.purpose === 'answer' ? transcriptContext(opts.context) : null,
        },
        {
          // The words as they arrive, so the wait is not a blank screen (issue #9).
          onProgress: (event) => {
            if (mounted.current && guard.holds(token)) setHeard(event.text);
          },
        },
      );
      if (!mounted.current || !guard.holds(token)) return;
      const text = res.text.trim();
      if (text) deliver(text);
      else setHint('empty');
    } catch (err) {
      if (mounted.current) toast.show(messageFor(err), 'error');
    } finally {
      if (mounted.current) {
        setTranscribing(false);
        setHeard('');
      }
    }
  }

  const rec = useRecording({
    maxMs: MAX_DICTATION_MS,
    onRecorded: (r) => void send(r),
    onFailed: (why) => {
      if (why !== 'denied') setHint(why);
    },
  });

  const device = useDeviceRecognition({
    maxMs: MAX_DICTATION_MS,
    onText: (text) => {
      if (guard.current()) deliver(text);
    },
    // The phone can't do this language after all: the same tap goes on as a recording.
    onFallback: () => void rec.start(),
    onFailed: setHint,
  });
  const onDevice = device.phase !== 'idle';

  const state: VoiceInputState = onDevice
    ? device.phase === 'listening'
      ? 'recording'
      : device.phase === 'stopping'
        ? 'transcribing'
        : 'starting'
    : transcribing || rec.phase === 'stopping'
      ? 'transcribing'
      : rec.phase === 'recording'
        ? 'recording'
        : rec.phase === 'starting' || choosing
          ? 'starting'
          : 'idle';

  // Hands-free on the recording path too: the on-device recogniser ends by itself
  // on a pause, but where it is unavailable the recorder ran until she tapped
  // "stop" after every turn (user feedback 2026-09-28). Once she has clearly
  // spoken, a sustained pause ends the recording; the tap keeps working, and a
  // room too loud to ever fall quiet simply behaves as before.
  const heardMs = useRef(0);
  const quietSince = useRef<number | null>(null);
  const lastPoll = useRef(0);
  useEffect(() => {
    const active = untilPause && !onDevice && state === 'recording';
    if (!active) {
      heardMs.current = 0;
      quietSince.current = null;
      lastPoll.current = 0;
      return;
    }
    const now = Date.now();
    const dt = lastPoll.current ? Math.min(400, now - lastPoll.current) : 0;
    lastPoll.current = now;
    // levelFromDb: ~0.28 is clear speech, ~0.12 is room tone (lib/speech/level.ts).
    if (rec.level >= 0.28) {
      heardMs.current += dt;
      quietSince.current = null;
      return;
    }
    if (rec.level > 0.12) {
      quietSince.current = null;
      return;
    }
    if (heardMs.current < 500) return;
    quietSince.current ??= now;
    if (now - quietSince.current >= 1600) void rec.stop();
  }, [untilPause, onDevice, state, rec.level, rec.elapsedMs, rec]);

  async function begin(): Promise<void> {
    guard.begin();
    const locale = voiceLocale(latest.current.lang ?? i18n.language);
    setChoosing(true);
    const engine = await engineFor(locale);
    if (!mounted.current) return;
    if (!guard.current()) {
      setChoosing(false);
      return;
    }
    setChoosing(false);
    if (engine === 'device') await device.start(locale, { untilPause });
    else await rec.start();
  }

  function toggle(): void {
    if (state === 'recording') {
      if (onDevice) device.stop();
      else void rec.stop();
      return;
    }
    // A second tap while the mic is still being prepared means "never mind": nothing is
    // recorded (tap-during-starting-uncancellable).
    if (state === 'starting') {
      cancel();
      return;
    }
    if (state !== 'idle') return;
    setHint(null);
    stopListening();
    void begin();
  }

  function cancel(): void {
    guard.cancel();
    setChoosing(false);
    setHeard('');
    if (onDevice) device.stop();
    else void rec.cancel();
  }

  return {
    state,
    onDevice,
    elapsedMs: onDevice ? device.elapsedMs : rec.elapsedMs,
    maxMs: onDevice ? MAX_DICTATION_MS : rec.maxMs,
    live: onDevice ? device.heard : heard,
    level: onDevice ? device.level : rec.level,
    hint,
    denied: rec.denied,
    toggle,
    cancel,
  };
}
