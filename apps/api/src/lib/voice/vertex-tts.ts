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

/** Locale → BCP-47 language code used to build a Chirp HD voice name.
 *  Chirp3-HD voices follow the pattern `<lang>-Chirp3-HD-<character>`,
 *  so e.g. "Aoede" + de → "de-DE-Chirp3-HD-Aoede". */
const LANGUAGE_CODE_BY_LOCALE: Record<string, string> = {
  de: 'de-DE',
  en: 'en-US',
  fr: 'fr-FR',
  es: 'es-ES',
  it: 'it-IT',
};

/** Default voice character when the caller doesn't pick one. Aoede is
 *  Google's calm-warm-female interpretation — kids found "Achernar"
 *  (our previous default) cold/robotic. */
const DEFAULT_VOICE_CHARACTER = 'Aoede';

export class VertexTTSGateway implements TTSGateway {
  private readonly client: TextToSpeechClient;

  constructor(_env: Env) {
    // Auth via Application Default Credentials — same env as the
    // Gemini gateway. Marker arg keeps TypeScript happy without
    // touching anything env-shape-wise.
    this.client = new TextToSpeechClient();
  }

  async synthesize(input: TTSInput): Promise<TTSResult> {
    // Resolve `<lang>-Chirp3-HD-<character>` from the learner's locale
    // and (optionally) preferred voice character. Falls back to en-US
    // and Aoede when something's missing.
    const languageCode = LANGUAGE_CODE_BY_LOCALE[input.locale] ?? 'en-US';
    const character = input.voiceId?.trim() || DEFAULT_VOICE_CHARACTER;
    const voice = {
      languageCode,
      name: `${languageCode}-Chirp3-HD-${character}`,
    };

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
