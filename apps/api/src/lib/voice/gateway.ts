// Voice gateway interfaces — speech-to-text + text-to-speech.
//
// Design mirror of LLMGateway: ONE seam between feature code and
// whichever STT/TTS provider is plugged in. Implementations land in
// sibling files (`vertex-speech.ts`, `vertex-tts.ts` today; later
// could be `whisper-local.ts`, `elevenlabs-tts.ts`, etc).
//
// The agent route only ever calls these interfaces — never a provider
// SDK directly. That's the swap-out promise.

import type { Locale } from '@learnbuddy/shared-types';

// ── STT ────────────────────────────────────────────────────────────────

export type STTInput = {
  /** Base64-encoded audio. The recogniser inspects the mime to pick the
   *  decoder; iOS records m4a/AAC, Android m4a/AAC, web webm/OPUS. */
  audioBase64: string;
  mime: 'audio/m4a' | 'audio/mp4' | 'audio/wav' | 'audio/webm';
  /** Hint for the recogniser. NULL means "auto-detect — multilingual
   *  conversation, learner may switch languages mid-session". When set,
   *  the recogniser is biased toward that BCP-47 code but may still
   *  fall back if the audio is clearly another language. */
  preferredLocale: Locale | null;
};

export type STTResult = {
  /** Recognised text. Empty string when audio was silence / noise /
   *  unintelligible — the route is expected to handle "" gracefully
   *  (don't send a turn, don't penalise the learner). */
  text: string;
  /** Detected BCP-47 code, when the provider returns it. NULL when the
   *  provider didn't classify or returned the preferred locale. */
  detectedLocale: string | null;
  /** Best-effort confidence in 0..1 from the provider. Used downstream
   *  to decide whether to ask the learner to repeat. */
  confidence: number;
  /** Token / minute / character cost — for credit accounting. */
  usage: {
    durationSeconds: number;
    costMicros: number;
    model: string;
    promptVersion: string;
  };
};

export interface STTGateway {
  recognize(input: STTInput): Promise<STTResult>;
}

// ── TTS ────────────────────────────────────────────────────────────────

export type TTSInput = {
  text: string;
  /** Spoken-language code. The provider picks an appropriate voice for
   *  the locale (de-DE → German voice, fr-FR → French voice, etc). */
  locale: Locale;
  /** Optional speaking rate. 1.0 = natural pace. 1.15-1.20 is a touch
   *  brisker — better for school-aged learners who lose attention at
   *  the platform default. */
  rate?: number;
  /** Optional voice id when the caller wants a specific voice (e.g.
   *  "always use a young female voice"). Provider-specific; null lets
   *  the gateway pick a sensible default. */
  voiceId?: string | null;
};

export type TTSResult = {
  /** Audio as base64. MP3 for cross-platform compatibility — both
   *  iOS and Android expo-av can decode without extra config. */
  audioBase64: string;
  mime: 'audio/mp3' | 'audio/wav';
  /** Length of synthesised audio in milliseconds. The client uses this
   *  to know when playback will end (for the conversation auto-loop). */
  durationMs: number;
  usage: {
    chars: number;
    costMicros: number;
    model: string;
    promptVersion: string;
  };
};

export interface TTSGateway {
  synthesize(input: TTSInput): Promise<TTSResult>;
}
