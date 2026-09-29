// Reading aloud — Buddy's replies, questions, explanations, feedback, a vocabulary word.
//
// Buddy's natural voice first (ADR 0008): the text is read sentence by sentence, each
// sentence fetched from POST /voice/speech (her voice and speed are on the server) and played
// with expo-audio while the next one is fetched. Whenever that is not possible — offline, the
// server says no (not configured, a language it lacks, the budget), an error, a player that
// does not start — the phone's own voice (expo-speech) reads the sentence instead, as before.
// She never waits in silence.
//
// This file is the wiring: the network, the file cache, the player and the phone's voice. What
// happens in which order is lib/speech/pipeline.ts (pure, unit-tested) — including reading a
// reply while it is still being written, in one utterance, so the next sentence is fetched
// while the current one plays (issue #24).
//
// Only one text plays at a time; starting another ends the first (its onEnd fires 'stopped').
// What is being read is published in voiceStore (lib/speech/voiceState.ts) for talk mode's
// state and read-along highlighting (useBuddyVoice).

import type { VoiceName } from '@learnbuddy/shared-types/contracts';
import { AppState } from 'react-native';
import * as Speech from 'expo-speech';

import { ApiError } from '../api/client.js';
import { synthesizeSpeech } from '../api/endpoints.js';
import { audioUri, releaseAudio } from './naturalAudio.js';
import { playAudio } from './naturalPlayer.js';
import {
  readText,
  type Clip,
  type ListenEnd,
  type Reading,
  type ReadingEffects,
} from './pipeline.js';
import { deviceRate, NaturalGate, type SpeechFailure } from './readAloud.js';
import { pickVoice, SPEECH_RATE, voiceLocale } from './voice.js';
import { voiceStore } from './voiceState.js';

export type { ListenEnd } from './pipeline.js';

const startListeners = new Set<() => void>();

/**
 * Called whenever something starts being read aloud. The hands-free mic uses it to drop a
 * recording that would otherwise hear Buddy's own voice (audit M-78).
 */
export function onSpeakStart(listener: () => void): () => void {
  startListeners.add(listener);
  return () => startListeners.delete(listener);
}

// ─────────────── the phone's own voice ───────────────

const voiceCache = new Map<string, string | null>();

async function deviceVoiceFor(locale: string): Promise<string | null> {
  if (voiceCache.has(locale)) return voiceCache.get(locale) ?? null;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    // Browsers load their voices late: an empty list is not cached.
    if (voices.length === 0) return null;
    const id = pickVoice(voices, locale);
    voiceCache.set(locale, id);
    return id;
  } catch {
    return null;
  }
}

// ─────────────── Buddy's natural voice ───────────────

const gate = new NaturalGate();
/** A sentence fetched while another one plays may take this long before the phone reads it. */
const FETCH_TIMEOUT_MS = 7000;
/**
 * A piece she is waiting for in silence — the first one, or one written late — is given only
 * this long (issue #41): after it the phone's voice reads that piece instead. It does not put
 * the natural voice to rest; the sentences fetched ahead usually arrive in time. Measured
 * 29.09. (apps/api/evals/tts): synthesising a sentence takes 0.74–1.6 s.
 */
const FIRST_PIECE_TIMEOUT_MS = 2500;

let current: Reading | null = null;

function failureOf(err: unknown): SpeechFailure {
  if (err instanceof ApiError) {
    const retry = err.details?.retry_after_s;
    return {
      status: err.status,
      code: err.code,
      reason: err.reason,
      retryAfterS: typeof retry === 'number' ? retry : null,
    };
  }
  return { status: 0, code: 'timeout', reason: null, retryAfterS: null };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error('failed'));
      },
    );
  });
}

export type SpeakOptions = {
  slow?: boolean;
  /** Read in this voice instead of hers, without changing it (the voice picker's preview). */
  voice?: VoiceName;
  onEnd?: (why: ListenEnd) => void;
  /** What each sentence says (math in words, lib/speech/spoken.ts). */
  transform?: (sentence: string) => string;
};

/** Ends whatever is being read and starts a new reading of `lang`. */
function begin(lang: string, growing: boolean, opts: SpeakOptions): Reading {
  for (const listener of [...startListeners]) listener();
  const previous = current;
  if (previous) {
    previous.stop('stopped');
    Speech.stop().catch(() => undefined);
  }
  const locale = voiceLocale(lang);
  const slow = opts.slow ?? false;
  const self: { reading: Reading | null } = { reading: null };
  const effects: ReadingEffects = {
    async fetch(spoken, ahead): Promise<Clip> {
      if (!/^[a-z]{2}-[A-Z]{2}$/.test(locale) || !gate.allows(locale)) return null;
      try {
        const res = await withTimeout(
          synthesizeSpeech({
            text: spoken,
            locale,
            ...(slow ? { slow: true } : {}),
            ...(opts.voice ? { voice: opts.voice } : {}),
          }),
          ahead ? FETCH_TIMEOUT_MS : FIRST_PIECE_TIMEOUT_MS,
        );
        gate.speed = res.speed;
        return { uri: audioUri(res.audio_base64, res.mime) };
      } catch (err) {
        const failure = failureOf(err);
        // Giving up on a piece she waits for in silence is impatience, not a broken voice:
        // the phone reads this one, the natural voice stays on for the rest of the reply.
        const impatient = !ahead && failure.code === 'timeout';
        if (!impatient) gate.failed(locale, failure);
        return null;
      }
    },
    release: releaseAudio,
    play: (uri, on) =>
      playAudio(uri, {
        onStart: on.start,
        onProgress: on.progress,
        onEnd: (why) => {
          // The player failed: the phone reads this sentence, and the next ones for a minute.
          if (why === 'error')
            gate.failed(locale, { status: 0, code: 'playback', reason: null, retryAfterS: null });
          on.end(why);
        },
      }),
    device: (spoken, on) => {
      void deviceVoiceFor(locale).then((voice) => {
        if (current !== self.reading) return; // Replaced or stopped while looking for a voice.
        try {
          Speech.speak(spoken, {
            language: locale,
            ...(voice ? { voice } : {}),
            rate: deviceRate(slow ? SPEECH_RATE.slow : SPEECH_RATE.normal, gate.speed),
            onDone: on.done,
            onStopped: on.stopped,
            onError: on.error,
          });
        } catch {
          on.error();
        }
      });
    },
  };
  const reading = readText({
    effects,
    store: voiceStore,
    transform: opts.transform ?? ((s: string) => s),
    growing,
    onEnd: (why) => {
      if (current === self.reading) current = null;
      opts.onEnd?.(why);
    },
  });
  self.reading = reading;
  current = reading;
  return reading;
}

/**
 * Reads `text` aloud in `lang` (ISO 639-1 like "fr", or a locale like "fr-CA").
 * `transform` turns each sentence into what is said (math in words, lib/speech/spoken.ts);
 * the text itself stays what is shown, so read-along can highlight its sentences.
 */
export async function speak(text: string, lang: string, opts: SpeakOptions = {}): Promise<void> {
  begin(lang, false, opts).feed(text, true);
}

/** A text read aloud while it is still being written (lib/speech/streamSpeaker.ts). */
export type SpeechStream = {
  /** The text as far as it is written; `done` once it is complete. */
  feed: (text: string, done: boolean) => void;
  /** Stops it; `onEnd` fires with 'stopped'. */
  cancel: () => void;
};

/**
 * Reads a text that is still being written: every finished sentence is said in turn, all in
 * one utterance — so the audio of the next sentence is fetched while the current one plays
 * instead of after it (issue #24). Running out of sentences waits; `feed(…, true)` ends it.
 */
export function speakStream(lang: string, opts: SpeakOptions = {}): SpeechStream {
  const reading = begin(lang, true, opts);
  return {
    feed: (text, done) => reading.feed(text, done),
    cancel: () => {
      if (current !== reading) return;
      reading.stop('stopped');
      Speech.stop().catch(() => undefined);
    },
  };
}

/** Stops whatever is being read aloud. */
export function stop(): void {
  current?.stop('stopped');
  Speech.stop().catch(() => undefined);
}

// Home button or an incoming call: Buddy must not keep reading the learner's
// content aloud over the lock screen ('inactive' counts too — recognize.ts does
// the same for listening).
AppState.addEventListener('change', (state) => {
  if (state !== 'active') stop();
});

export type SpokenPart = { text: string; lang: string };

/**
 * Reads several parts one after another, each in its own language (an
 * instruction in the app language, then the sentence in French). Stopping,
 * or reading something else, ends the whole sequence; onEnd says how it ended.
 */
export function speakInOrder(parts: readonly SpokenPart[], onEnd?: (why: ListenEnd) => void): void {
  const rest = parts.filter((p) => p.text.trim().length > 0);
  const first = rest[0];
  if (!first) {
    onEnd?.('done');
    return;
  }
  void speak(first.text, first.lang, {
    onEnd: (why) => {
      if (why === 'done') speakInOrder(rest.slice(1), onEnd);
      else onEnd?.(why);
    },
  });
}
