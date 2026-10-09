// Speaking instead of typing (a message to Buddy or an answer): tap to start,
// tap to stop, and the written text comes back via onText.
// Two ways, chosen per tap (lib/speech/engine.ts, docs/privacy.md §Processors):
// - device: the phone recognises on-device, the words appear while she speaks
//   (`live`), nothing leaves the phone;
// - server: the recording goes to POST /voice/transcribe (our EU path) and is
//   not kept on the device or the server — in the browser, and wherever the
//   phone could only recognise on Apple's/Google's servers. This path has no
//   time limit (issue #19): a long dictation rolls over into pieces at pauses
//   (lib/speech/record.ts), each piece is written down while she keeps
//   talking (`live` grows), and the stitched text is delivered at her tap on
//   stop. A piece that breaks costs only itself, never the whole take.
// Screens only see { state, toggle, … }, so the way can change without touching them.
//
// The microphone is only ever started by a tap (toggle); nothing here starts
// it by itself. Whatever is being read aloud stops when she starts speaking.

import type { MicState } from '../../lib/speech/talkState.js';
import type { TranscribeRequest } from '@learnbuddy/shared-types/contracts';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { announce } from '../../lib/announce.js';
import { transcribe } from '../../lib/api/endpoints.js';
import { messageFor } from '../../lib/errors.js';
import { prevTail, stitchTranscripts } from '../../lib/speech/dictation.js';
import { stop as stopListening } from '../../lib/speech/listen.js';
import { useRecording, type DictationChunk, type Recording } from '../../lib/speech/record.js';
import { engineFor, useDeviceRecognition } from '../../lib/speech/recognize.js';
import { TurnGuard } from '../../lib/speech/turnGuard.js';
import { transcriptContext, transcriptLang } from '../../lib/speech/spoken.js';
import { DEVICE_DICTATION_MS, MIN_AUDIO_BASE64, voiceLocale } from '../../lib/speech/voice.js';
import { toast } from '../lb/Toast.js';

type VoicePurpose = TranscribeRequest['purpose'];

/** idle → starting (asking for the mic) → recording → transcribing → idle. */
/** One definition, shared with what the conversation screen is allowed to claim (#158). */
type VoiceInputState = MicState;

/**
 * Why no text came out (nothing understood, only a tap, an unreadable or broken
 * recording) — or, part_lost, why a delivered long dictation may have a gap.
 */
type VoiceHint = 'empty' | 'too_short' | 'unsupported' | 'failed' | 'part_lost';

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
  /** Milliseconds recorded so far and the most there can be; null = no limit (issue #19). */
  elapsedMs: number;
  maxMs: number | null;
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

  /**
   * One running dictation on the recording path: the texts of its pieces in
   * spoken order (undefined = still being written down, null = lost), whether
   * a piece was lost, and the chain that transcribes them one after another
   * while she keeps talking.
   */
  const dictation = useRef<{
    token: number;
    parts: (string | null | undefined)[];
    lost: boolean;
    failure: unknown;
    chain: Promise<void>;
  } | null>(null);

  async function transcribePiece(
    d: NonNullable<typeof dictation.current>,
    r: Recording | null,
    chunk: DictationChunk,
  ): Promise<void> {
    const opts = latest.current;
    if (guard.holds(d.token)) {
      if (r === null) {
        // This piece broke on the device; the other pieces still count.
        d.lost = true;
      } else if (chunk.silent || r.base64.length < MIN_AUDIO_BASE64) {
        // The moment of nothing after the last words of a long take: provably
        // silent (record.ts metering, issue #28) or too small to hold a word —
        // not worth a model call, and nothing to wait for at her tap on stop.
        d.parts[chunk.index] = '';
      } else {
        const before = stitchTranscripts(d.parts);
        const body = {
          mime: r.mime,
          audio_base64: r.base64,
          purpose: opts.purpose,
          lang: transcriptLang(opts.lang),
          context: opts.purpose === 'answer' ? transcriptContext(opts.context) : null,
          // The tail of what was already understood, so the model hears a piece
          // that starts mid-sentence as its continuation.
          prev_tail: chunk.index > 0 ? prevTail(before) : null,
        };
        const attempt = async () => {
          const res = await transcribe(body, {
            // The words as they arrive, so the wait is not a blank screen (issue #9);
            // during a long take the earlier pieces stay on screen in front of them.
            onProgress: (event) => {
              if (mounted.current && guard.holds(d.token))
                setHeard([before, event.text].filter(Boolean).join(' '));
            },
          });
          return res.text.trim();
        };
        try {
          d.parts[chunk.index] = await attempt();
        } catch {
          // One more try; then the piece is honestly lost and the rest goes on.
          try {
            d.parts[chunk.index] = await attempt();
          } catch (err) {
            d.lost = true;
            d.failure = err;
          }
        }
        if (mounted.current && guard.holds(d.token)) setHeard(stitchTranscripts(d.parts));
      }
    }
    if (!chunk.last) return;
    // The dictation is complete: hand over what was understood, honestly.
    if (mounted.current) {
      setTranscribing(false);
      setHeard('');
    }
    if (!mounted.current || !guard.holds(d.token)) return;
    const text = stitchTranscripts(d.parts);
    if (text) {
      deliver(text);
      if (d.lost) setHint('part_lost');
    } else if (d.lost) {
      toast.show(messageFor(d.failure), 'error');
    } else {
      setHint('empty');
    }
  }

  /** A finished piece of the recording path; pieces are transcribed one after another. */
  function onPiece(r: Recording | null, chunk: DictationChunk): void {
    if (!guard.current()) return;
    if (chunk.index === 0 || dictation.current === null) {
      dictation.current = {
        token: guard.begin(),
        parts: [],
        lost: false,
        failure: null,
        chain: Promise.resolve(),
      };
      setHeard('');
    }
    const d = dictation.current;
    if (chunk.last) setTranscribing(true);
    d.chain = d.chain.then(() => transcribePiece(d, r, chunk));
  }

  const rec = useRecording({
    onChunk: onPiece,
    onFailed: (why) => {
      if (why !== 'denied') setHint(why);
    },
  });

  const device = useDeviceRecognition({
    maxMs: DEVICE_DICTATION_MS,
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
    // The device recogniser's session has a bound; the recording path has none (issue #19).
    maxMs: onDevice ? DEVICE_DICTATION_MS : rec.maxMs,
    live: onDevice ? device.heard : heard,
    level: onDevice ? device.level : rec.level,
    hint,
    denied: rec.denied,
    toggle,
    cancel,
  };
}
