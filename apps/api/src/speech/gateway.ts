// The seam to text to speech: Buddy's natural voice (ADR 0008, docs/architecture.md §Voice).
//
// One call = one short text (a sentence) → audio. Only the text leaves, in the learner's
// language, with the provider voice and rate chosen by code. Implementations:
// GoogleSpeech (Cloud Text-to-Speech, EU endpoint), DisabledSpeech (not configured — the
// app then reads with the phone's own voice, as before), FakeSpeech (tests only).

import type { VoiceName } from '@learnbuddy/shared-types/contracts';

import type { Outcome } from '../lib/outcome.js';

export type SpeechInput = {
  text: string;
  /** A locale the gateway supports (from `localeFor`). */
  locale: string;
  voice: VoiceName;
  /** Speaking rate, 1 = normal. */
  rate: number;
  timeoutMs: number;
};

export type SpeechAudio = { mime: 'audio/mpeg' | 'audio/wav'; audio: Buffer };

export type SpeechErrorKind = 'unavailable' | 'timeout' | 'rate_limited' | 'refused';

export class SpeechError extends Error {
  readonly kind: SpeechErrorKind;
  constructor(kind: SpeechErrorKind, message: string) {
    super(message);
    this.name = 'SpeechError';
    this.kind = kind;
  }
  /** The shared classification of external results (lib/outcome.ts). */
  get outcome(): Exclude<Outcome, 'ok'> {
    switch (this.kind) {
      case 'unavailable':
      case 'rate_limited':
        return 'transient';
      case 'timeout':
        return 'unknown';
      case 'refused':
        return 'refused';
    }
  }
}

export interface SpeechGateway {
  readonly available: boolean;
  /**
   * The provider voice a request runs on, for the cache key: a change of the mapping never
   * serves audio of the old voice.
   */
  voiceId(voice: VoiceName, locale: string): string;
  /** The locale this provider reads `locale` in ("de-AT" → "de-DE"); null when it cannot. */
  localeFor(locale: string): string | null;
  synthesize(input: SpeechInput): Promise<SpeechAudio>;
}

export class DisabledSpeech implements SpeechGateway {
  readonly available = false;
  voiceId(): string {
    return 'disabled';
  }
  localeFor(): string | null {
    return null;
  }
  async synthesize(): Promise<SpeechAudio> {
    throw new SpeechError(
      'unavailable',
      'No speech provider is configured (SPEECH_BACKEND=disabled)',
    );
  }
}

/** Speaking rate for her speed step (-2 … +2), and slower still for "langsam". */
export function rateFor(speed: number, slow: boolean): number {
  const step = Math.max(-2, Math.min(2, Math.round(speed)));
  const base = [0.75, 0.88, 1, 1.12, 1.25][step + 2]!;
  return Math.round((slow ? base * 0.8 : base) * 100) / 100;
}
