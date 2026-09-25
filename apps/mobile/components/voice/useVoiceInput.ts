// Speaking instead of typing (a message to Buddy or an answer): tap to start,
// tap to stop (60 s at most), then the recording goes to POST /voice/transcribe
// and the written text comes back via onText. The recording is not kept on
// the device or the server. Screens only see { state, toggle, … }, so the way
// the speech becomes text can change without touching them.
//
// The microphone is only ever started by a tap (toggle); nothing here starts
// it by itself. Whatever is being read aloud stops when she starts speaking.

import type { TranscribeRequest } from '@learnbuddy/shared-types/contracts';
import { useEffect, useRef, useState } from 'react';

import { transcribe } from '../../lib/api/endpoints.js';
import { messageFor } from '../../lib/errors.js';
import { stop as stopListening } from '../../lib/speech/listen.js';
import { useRecording, type Recording } from '../../lib/speech/record.js';
import { transcriptContext, transcriptLang } from '../../lib/speech/spoken.js';
import { MAX_DICTATION_MS } from '../../lib/speech/voice.js';
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
};

export type VoiceInput = {
  state: VoiceInputState;
  /** Milliseconds recorded so far and the most there can be (for "0:07 / 1:00"). */
  elapsedMs: number;
  maxMs: number;
  hint: VoiceHint | null;
  /** Microphone access was refused; canAskAgain = false means only the settings can change it. */
  denied: { canAskAgain: boolean } | null;
  /** Starts listening when idle, stops (and transcribes) while recording. */
  toggle: () => void;
};

export function useVoiceInput({ purpose, lang, context = null, onText }: Options): VoiceInput {
  const [transcribing, setTranscribing] = useState(false);
  const [hint, setHint] = useState<VoiceHint | null>(null);
  const mounted = useRef(true);
  const latest = useRef({ purpose, lang, context, onText });
  latest.current = { purpose, lang, context, onText };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function send(r: Recording): Promise<void> {
    const opts = latest.current;
    setTranscribing(true);
    try {
      const res = await transcribe({
        mime: r.mime,
        audio_base64: r.base64,
        purpose: opts.purpose,
        lang: transcriptLang(opts.lang),
        context: opts.purpose === 'answer' ? transcriptContext(opts.context) : null,
      });
      if (!mounted.current) return;
      const text = res.text.trim();
      if (text) latest.current.onText(text);
      else setHint('empty');
    } catch (err) {
      if (mounted.current) toast.show(messageFor(err), 'error');
    } finally {
      if (mounted.current) setTranscribing(false);
    }
  }

  const rec = useRecording({
    maxMs: MAX_DICTATION_MS,
    onRecorded: (r) => void send(r),
    onFailed: (why) => {
      if (why !== 'denied') setHint(why);
    },
  });

  const state: VoiceInputState =
    transcribing || rec.phase === 'stopping'
      ? 'transcribing'
      : rec.phase === 'recording'
        ? 'recording'
        : rec.phase === 'starting'
          ? 'starting'
          : 'idle';

  function toggle(): void {
    if (state === 'recording') {
      void rec.stop();
      return;
    }
    if (state !== 'idle') return;
    setHint(null);
    stopListening();
    void rec.start();
  }

  return {
    state,
    elapsedMs: rec.elapsedMs,
    maxMs: rec.maxMs,
    hint,
    denied: rec.denied,
    toggle,
  };
}
