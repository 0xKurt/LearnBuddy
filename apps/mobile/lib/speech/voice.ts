// Pure helpers for listening and speaking (no React Native imports, so they
// run under the Node test runner): which voice locale a language gets, which
// installed voice fits it best, and which upload type a recording has.

import type { SpeakRequest } from '@learnbuddy/shared-types/contracts';

export type SpeakMime = SpeakRequest['mime'];

/** The regional voice each school language is read in. */
const VOICE_LOCALE: Record<string, string> = {
  de: 'de-DE',
  en: 'en-GB',
  fr: 'fr-FR',
  es: 'es-ES',
  it: 'it-IT',
  ru: 'ru-RU',
};

/** "fr", "FR", "fr-CA", "fr_FR" → "fr"; null for nothing usable. */
export function baseLanguage(lang: string | null | undefined): string | null {
  const primary = (lang ?? '').trim().split(/[-_]/)[0]?.toLowerCase() ?? '';
  return /^[a-z]{2,3}$/.test(primary) ? primary : null;
}

/** The BCP 47 locale a text in `lang` is read in ("fr" → "fr-FR"); unknown languages pass through. */
export function voiceLocale(lang: string): string {
  const base = baseLanguage(lang);
  if (base === null) return lang;
  // A regional code the item already carries ("fr-CA") is kept.
  if (/[-_]/.test(lang.trim())) return lang.trim().replace('_', '-');
  return VOICE_LOCALE[base] ?? base;
}

export type VoiceInfo = { identifier: string; language: string; quality: string };

const normalise = (l: string) => l.replace('_', '-').toLowerCase();

/**
 * The best installed voice for a locale: the exact region first, then any voice
 * of the language; an enhanced voice beats a default one. null when none fits
 * (the system then picks one from the language alone).
 */
export function pickVoice(voices: readonly VoiceInfo[], locale: string): string | null {
  const want = normalise(locale);
  const base = baseLanguage(locale);
  const score = (v: VoiceInfo): number => {
    const l = normalise(v.language);
    const lang = l === want ? 2 : base !== null && baseLanguage(l) === base ? 1 : 0;
    if (lang === 0) return 0;
    return lang * 10 + (v.quality === 'Enhanced' ? 1 : 0);
  };
  let best: VoiceInfo | null = null;
  let bestScore = 0;
  for (const v of voices) {
    const s = score(v);
    if (s > bestScore) {
      best = v;
      bestScore = s;
    }
  }
  return best?.identifier ?? null;
}

/** The two speeds of "Anhören": normal and "langsam". */
export const SPEECH_RATE = { normal: 1, slow: 0.75 } as const;

/**
 * The upload type for a recorded blob/file type ("audio/webm;codecs=opus" →
 * "audio/webm"); null when the server does not take it.
 */
export function speakMime(type: string | null | undefined): SpeakMime | null {
  const t = (type ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  switch (t) {
    case 'audio/mp4':
    case 'audio/x-m4a':
    case 'audio/m4a':
      return 'audio/mp4';
    case 'audio/aac':
      return 'audio/aac';
    case 'audio/webm':
    case 'video/webm': // Some browsers label an audio-only webm as video.
      return 'audio/webm';
    case 'audio/wav':
    case 'audio/x-wav':
    case 'audio/wave':
      return 'audio/wav';
    case 'audio/mpeg':
      return 'audio/mpeg';
    default:
      return null;
  }
}

/** The upload type from a native file's extension (the recorder writes .m4a). */
export function speakMimeForFile(uri: string): SpeakMime | null {
  const ext = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(uri)?.[1]?.toLowerCase();
  switch (ext) {
    case 'm4a':
    case 'mp4':
      return 'audio/mp4';
    case 'aac':
      return 'audio/aac';
    case 'webm':
      return 'audio/webm';
    case 'wav':
      return 'audio/wav';
    case 'mp3':
      return 'audio/mpeg';
    default:
      return null;
  }
}

/** Longest pronunciation recording (SpeakRequest: ≤ 15 s). */
export const MAX_RECORDING_MS = 15_000;
/** Longest spoken message or answer (TranscribeRequest: ≤ ~60 s). */
export const MAX_DICTATION_MS = 60_000;
/** Shorter than this is a tap, not a sentence. */
export const MIN_RECORDING_MS = 600;
/** SpeakRequest/TranscribeRequest.audio_base64 limits (60 s at 48 kbit/s is ~480 000). */
export const MAX_AUDIO_BASE64 = 1_400_000;
export const MIN_AUDIO_BASE64 = 100;

/** "0:07" for the recording timer. */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
