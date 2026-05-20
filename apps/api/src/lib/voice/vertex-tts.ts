// TTSGateway implementation backed by Google Cloud Text-to-Speech.
//
// Uses Chirp HD voices where available, falls back to Neural2 for
// locales without HD coverage. Chirp HD sounds noticeably more human
// than the older Standard/Wavenet voices — closer to ElevenLabs than
// to System-TTS.

import { TextToSpeechClient } from '@google-cloud/text-to-speech';

import type { Env } from '../env.js';
import { ApiError } from '../errors.js';
import type { TTSGateway, TTSInput, TTSResult } from './gateway.js';

const PROMPT_VERSION = 'gcp-tts.chirp-hd.v1';

// Pricing per https://cloud.google.com/text-to-speech/pricing —
// Chirp HD = $16 per 1 million chars = 16 micros per char.
const PRICE_MICROS_PER_CHAR = 16;

/** Locale → Chirp HD voice name. The list comes from Google's voice
 *  catalogue; "Chirp3-HD" voices are the latest generation as of 2025.
 *  Falls back to Neural2 when a locale isn't covered (rare for our 5). */
const VOICE_BY_LOCALE: Record<string, { name: string; languageCode: string }> = {
  de: { name: 'de-DE-Chirp3-HD-Achernar', languageCode: 'de-DE' },
  en: { name: 'en-US-Chirp3-HD-Achernar', languageCode: 'en-US' },
  fr: { name: 'fr-FR-Chirp3-HD-Achernar', languageCode: 'fr-FR' },
  es: { name: 'es-ES-Chirp3-HD-Achernar', languageCode: 'es-ES' },
  it: { name: 'it-IT-Chirp3-HD-Achernar', languageCode: 'it-IT' },
};

export class VertexTTSGateway implements TTSGateway {
  private readonly client: TextToSpeechClient;

  constructor(_env: Env) {
    // Auth via Application Default Credentials — same env as the
    // Gemini gateway. Marker arg keeps TypeScript happy without
    // touching anything env-shape-wise.
    this.client = new TextToSpeechClient();
  }

  async synthesize(input: TTSInput): Promise<TTSResult> {
    // VOICE_BY_LOCALE always has 'en' so the fallback is non-null. Cast
    // captures the intent for TS — the keys are 'de'/'en'/'fr'/'es'/'it'
    // and one of them always matches.
    const voiceLookup =
      VOICE_BY_LOCALE[input.voiceId ?? input.locale] ??
      VOICE_BY_LOCALE[input.locale] ??
      VOICE_BY_LOCALE['en']!;
    const voice = voiceLookup;

    const rate = input.rate ?? 1.0;

    let response: { audioContent?: Uint8Array | string | null };
    try {
      const result = await this.client.synthesizeSpeech({
        input: { text: input.text },
        voice: {
          languageCode: voice.languageCode,
          name: voice.name,
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: rate,
          // Slightly elevated pitch reads as warmer/younger — better
          // for a kid-facing tutor. Subjective, easy to A/B later.
          pitch: 0,
        },
      });
      response = result[0];
    } catch (err) {
      throw new ApiError(
        'evaluation_failed',
        `GCP TTS synthesize failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const audio = response.audioContent;
    if (!audio) {
      throw new ApiError('evaluation_failed', 'GCP TTS returned empty audio');
    }

    // audioContent is Buffer when used from Node; Uint8Array possible too.
    const audioBytes = Buffer.isBuffer(audio) ? audio : Buffer.from(audio);
    const audioBase64 = audioBytes.toString('base64');

    // Rough duration estimate from byte size — MP3 at 32 kbps mono is
    // ~4kB/sec. Good enough for the client to know when playback ends
    // without parsing the MP3 header.
    const durationMs = Math.round((audioBytes.length / 4000) * 1000);

    return {
      audioBase64,
      mime: 'audio/mp3',
      durationMs,
      usage: {
        chars: input.text.length,
        costMicros: input.text.length * PRICE_MICROS_PER_CHAR,
        model: voice.name,
        promptVersion: PROMPT_VERSION,
      },
    };
  }
}
