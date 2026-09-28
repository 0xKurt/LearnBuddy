// Google Cloud Text-to-Speech, Chirp 3: HD voices, through the EU endpoint (ADR 0008).
//
// REST `text:synthesize` on eu-texttospeech.googleapis.com with the project's existing
// service account (the same credentials as Vertex, docs/SETUP-VERTEX.md). One call per
// sentence, MP3 back. No hidden retries: the app reads the sentence with the phone's own
// voice when this fails.
//
// Not yet verified live: no call to Google was made while building this (no credentials) — endpoint, voice names, speaking rate and the IAM
// permission are taken from Google's documentation (ADR 0008 §Live verification).

import type { VoiceName } from '@learnbuddy/shared-types/contracts';
import { GoogleAuth } from 'google-auth-library';

import type { Config } from '../config.js';
import { outcomeOfStatus } from '../lib/outcome.js';
import { ensureCredentialsFile } from '../llm/vertex.js';
import { SpeechError, type SpeechAudio, type SpeechGateway, type SpeechInput } from './gateway.js';

/** Chirp 3: HD voice per curated name: two female, two male, all calm and clear. */
export const CHIRP3_VOICES: Record<VoiceName, string> = {
  warm: 'Sulafat',
  friendly: 'Achird',
  bright: 'Zephyr',
  clear: 'Iapetus',
  soft: 'Aoede',
  deep: 'Charon',
};

/** Locales Chirp 3: HD reads that matter here (school languages first). */
const LOCALES = new Set([
  'de-DE',
  'en-GB',
  'en-US',
  'en-AU',
  'en-IN',
  'fr-FR',
  'fr-CA',
  'es-ES',
  'es-US',
  'it-IT',
  'ru-RU',
  'nl-NL',
  'pl-PL',
  'pt-BR',
  'tr-TR',
  'uk-UA',
]);

/** A region the provider does not have is read in the language's main one ("de-AT" → "de-DE"). */
const BY_LANGUAGE: Record<string, string> = {
  de: 'de-DE',
  en: 'en-GB',
  fr: 'fr-FR',
  es: 'es-ES',
  it: 'it-IT',
  ru: 'ru-RU',
  nl: 'nl-NL',
  pl: 'pl-PL',
  pt: 'pt-BR',
  tr: 'tr-TR',
  uk: 'uk-UA',
};

export function chirp3Locale(locale: string): string | null {
  if (LOCALES.has(locale)) return locale;
  return BY_LANGUAGE[locale.split('-')[0] ?? ''] ?? null;
}

type TokenSource = { getAccessToken(): Promise<string | null | undefined> };

export class GoogleSpeech implements SpeechGateway {
  readonly available = true;
  private readonly auth: TokenSource;

  constructor(
    private readonly config: Config,
    /** Unit tests pass their own; production uses the service account (ADC). */
    auth?: TokenSource,
  ) {
    if (auth) {
      this.auth = auth;
    } else {
      ensureCredentialsFile(config);
      this.auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    }
  }

  voiceId(voice: VoiceName, locale: string): string {
    return `${locale}-Chirp3-HD-${CHIRP3_VOICES[voice]}`;
  }

  localeFor(locale: string): string | null {
    return chirp3Locale(locale);
  }

  async synthesize(input: SpeechInput): Promise<SpeechAudio> {
    let token: string | null | undefined;
    try {
      token = await this.auth.getAccessToken();
    } catch {
      throw new SpeechError('unavailable', 'no access token for the speech provider');
    }
    if (!token) throw new SpeechError('unavailable', 'no access token for the speech provider');
    let res: Response;
    try {
      res = await fetch(`https://${this.config.SPEECH_ENDPOINT}/v1/text:synthesize`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          // Bills and checks quota on the project, not the service account's home project.
          ...(this.config.GOOGLE_CLOUD_PROJECT
            ? { 'x-goog-user-project': this.config.GOOGLE_CLOUD_PROJECT }
            : {}),
        },
        body: JSON.stringify({
          input: { text: input.text },
          voice: { languageCode: input.locale, name: this.voiceId(input.voice, input.locale) },
          audioConfig: { audioEncoding: 'MP3', speakingRate: input.rate },
        }),
        signal: AbortSignal.timeout(input.timeoutMs),
      });
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      if (name === 'AbortError' || name === 'TimeoutError')
        throw new SpeechError('timeout', 'speech call timed out');
      throw new SpeechError('unavailable', 'speech call failed');
    }
    if (!res.ok) {
      // The provider's message is kept short for the logs; it never holds her text.
      if (res.status === 429) throw new SpeechError('rate_limited', 'provider rate limit');
      throw new SpeechError(
        outcomeOfStatus(res.status) === 'transient' ? 'unavailable' : 'refused',
        `provider answered ${res.status}`,
      );
    }
    const body = (await res.json().catch(() => null)) as { audioContent?: unknown } | null;
    const b64 = body?.audioContent;
    if (typeof b64 !== 'string' || b64.length === 0)
      throw new SpeechError('refused', 'provider returned no audio');
    return { mime: 'audio/mpeg', audio: Buffer.from(b64, 'base64') };
  }
}
