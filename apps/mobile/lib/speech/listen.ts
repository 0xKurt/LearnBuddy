// Reading aloud — Buddy's replies, questions, explanations, feedback, a vocabulary word.
//
// Buddy's natural voice first (ADR 0008): the text is read sentence by sentence, each
// sentence fetched from POST /voice/speech (her voice and speed are on the server) and played
// with expo-audio while the next one is fetched. Whenever that is not possible — offline, the
// server says no (not configured, a language it lacks, the budget), an error, a player that
// does not start — the phone's own voice (expo-speech) reads the sentence instead, as before.
// She never waits in silence.
//
// Only one text plays at a time; starting another ends the first (its onEnd fires 'stopped').
// What is being read is published in voiceStore (lib/speech/voiceState.ts) for talk mode's
// state and read-along highlighting (useBuddyVoice).

import * as Speech from 'expo-speech';

import { ApiError } from '../api/client.js';
import { synthesizeSpeech } from '../api/endpoints.js';
import { audioUri, releaseAudio } from './naturalAudio.js';
import { playAudio, type PlayHandle } from './naturalPlayer.js';
import {
  deviceRate,
  NaturalGate,
  readingParts,
  sentencesOf,
  type SpeechFailure,
} from './readAloud.js';
import { pickVoice, SPEECH_RATE, voiceLocale } from './voice.js';
import { voiceStore } from './voiceState.js';

export type ListenEnd = 'done' | 'stopped' | 'error';

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
/** A sentence that takes longer than this to arrive is read by the phone instead. */
const FETCH_TIMEOUT_MS = 7000;

type Clip = { uri: string } | null;

type Utterance = {
  text: string;
  locale: string;
  slow: boolean;
  /** What is spoken, in order; `at` is the sentence it belongs to (highlighting). */
  pieces: Array<{ at: number; spoken: string }>;
  onEnd: (why: ListenEnd) => void;
  fetches: Map<number, Promise<Clip>>;
  ready: Set<number>;
  playing: PlayHandle | null;
};

let current: Utterance | null = null;

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

/** The audio of piece i (fetched once per utterance); null = the phone reads it. */
function fetchClip(u: Utterance, i: number): Promise<Clip> {
  const known = u.fetches.get(i);
  if (known) return known;
  const piece = u.pieces[i];
  const p: Promise<Clip> =
    !piece || !/^[a-z]{2}-[A-Z]{2}$/.test(u.locale) || !gate.allows(u.locale)
      ? Promise.resolve(null)
      : (async () => {
          try {
            const res = await withTimeout(
              synthesizeSpeech({
                text: piece.spoken,
                locale: u.locale,
                ...(u.slow ? { slow: true } : {}),
              }),
              FETCH_TIMEOUT_MS,
            );
            gate.speed = res.speed;
            return { uri: audioUri(res.audio_base64, res.mime) };
          } catch (err) {
            gate.failed(u.locale, failureOf(err));
            return null;
          }
        })();
  const tracked = p.then((clip) => {
    u.ready.add(i);
    return clip;
  });
  u.fetches.set(i, tracked);
  return tracked;
}

function end(u: Utterance, why: ListenEnd): void {
  if (current !== u) return;
  current = null;
  const playing = u.playing;
  u.playing = null;
  playing?.stop();
  // Audio fetched ahead and never played is thrown away.
  for (const f of u.fetches.values()) void f.then((clip) => clip && releaseAudio(clip.uri));
  voiceStore.reset();
  u.onEnd(why);
}

function playNext(u: Utterance, i: number): void {
  if (current !== u) return;
  const piece = u.pieces[i];
  if (!piece) {
    end(u, 'done');
    return;
  }
  // "Loading" only while the audio is really still on its way.
  if (!u.ready.has(i)) voiceStore.set({ phase: 'loading', index: piece.at, progress: null });
  void fetchClip(u, i).then((clip) => {
    if (current !== u) return;
    void fetchClip(u, i + 1); // The next sentence arrives while this one plays.
    if (!clip) {
      playOnDevice(u, i);
      return;
    }
    voiceStore.set({ index: piece.at, progress: null });
    u.playing = playAudio(clip.uri, {
      onStart: () => {
        if (current === u) voiceStore.set({ phase: 'speaking', source: 'natural', progress: 0 });
      },
      onProgress: (progress) => {
        if (current === u) voiceStore.set({ progress });
      },
      onEnd: (why) => {
        releaseAudio(clip.uri);
        if (current !== u || why === 'stopped') return;
        u.playing = null;
        if (why === 'done') {
          playNext(u, i + 1);
          return;
        }
        // The player failed: the phone reads this sentence, and the next ones for a minute.
        gate.failed(u.locale, { status: 0, code: 'playback', reason: null, retryAfterS: null });
        playOnDevice(u, i);
      },
    });
  });
}

function playOnDevice(u: Utterance, i: number): void {
  const piece = u.pieces[i];
  if (!piece) return;
  voiceStore.set({ phase: 'speaking', source: 'device', index: piece.at, progress: null });
  void deviceVoiceFor(u.locale).then((voice) => {
    if (current !== u) return; // Replaced or stopped while looking for a voice.
    try {
      Speech.speak(piece.spoken, {
        language: u.locale,
        ...(voice ? { voice } : {}),
        rate: deviceRate(u.slow ? SPEECH_RATE.slow : SPEECH_RATE.normal, gate.speed),
        onDone: () => playNext(u, i + 1),
        onStopped: () => end(u, 'stopped'),
        onError: () => end(u, 'error'),
      });
    } catch {
      end(u, 'error');
    }
  });
}

/**
 * Reads `text` aloud in `lang` (ISO 639-1 like "fr", or a locale like "fr-CA").
 * `transform` turns each sentence into what is said (math in words, lib/speech/spoken.ts);
 * the text itself stays what is shown, so read-along can highlight its sentences.
 */
export async function speak(
  text: string,
  lang: string,
  opts: {
    slow?: boolean;
    onEnd?: (why: ListenEnd) => void;
    transform?: (sentence: string) => string;
  } = {},
): Promise<void> {
  for (const listener of [...startListeners]) listener();
  const previous = current;
  if (previous) {
    end(previous, 'stopped');
    Speech.stop().catch(() => undefined);
  }
  const transform = opts.transform ?? ((s: string) => s);
  const u: Utterance = {
    text,
    locale: voiceLocale(lang),
    slow: opts.slow ?? false,
    pieces: readingParts(text, transform).flatMap((p) =>
      p.spoken.map((spoken) => ({ at: p.at, spoken })),
    ),
    onEnd: opts.onEnd ?? (() => undefined),
    fetches: new Map(),
    ready: new Set(),
    playing: null,
  };
  current = u;
  if (u.pieces.length === 0) {
    end(u, 'done');
    return;
  }
  voiceStore.set({
    phase: 'loading',
    text,
    sentences: sentencesOf(text),
    index: u.pieces[0]!.at,
    progress: null,
    source: null,
  });
  playNext(u, 0);
}

/** Stops whatever is being read aloud. */
export function stop(): void {
  if (current) end(current, 'stopped');
  Speech.stop().catch(() => undefined);
}

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
