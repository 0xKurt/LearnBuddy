// GCP Text-to-Speech connectivity probe. Synthesises one short phrase
// per supported locale via the Chirp HD voice catalogue and reports per-
// locale success/failure. Lets you pin a TTS hang to:
//   - API not enabled    → "Cloud Text-to-Speech API has not been used"
//   - IAM missing        → "PERMISSION_DENIED"
//   - Voice unavailable  → "INVALID_ARGUMENT: voice ... not found"
//   - Quota exhausted    → "RESOURCE_EXHAUSTED"
//   - Network/auth       → grpc 14 UNAVAILABLE / no creds
//
// Run: pnpm -F @learnbuddy/api probe:tts
//
// Reads env from .env.local — uses GOOGLE_APPLICATION_CREDENTIALS for ADC.

import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: '.env.local' });

import { TextToSpeechClient } from '@google-cloud/text-to-speech';

type GrpcError = Error & {
  code?: number | string;
  details?: string;
};

function formatError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const e = err as GrpcError;
  const parts = [
    `  name:    ${e.name}`,
    `  code:    ${e.code ?? '(none)'}`,
    `  message: ${e.message}`,
  ];
  if (e.details) parts.push(`  details: ${e.details}`);
  return parts.join('\n');
}

// Same map as apps/api/src/lib/voice/vertex-tts.ts so a green probe
// means the real production path will work too.
const VOICE_BY_LOCALE: Record<string, { name: string; languageCode: string; phrase: string }> = {
  de: {
    name: 'de-DE-Chirp3-HD-Aoede',
    languageCode: 'de-DE',
    phrase: 'Hallo, sollen wir loslegen?',
  },
  en: { name: 'en-US-Chirp3-HD-Aoede', languageCode: 'en-US', phrase: 'Hello, shall we begin?' },
  fr: { name: 'fr-FR-Chirp3-HD-Aoede', languageCode: 'fr-FR', phrase: 'Bonjour, on commence?' },
  es: { name: 'es-ES-Chirp3-HD-Aoede', languageCode: 'es-ES', phrase: 'Hola, ¿empezamos?' },
  it: { name: 'it-IT-Chirp3-HD-Aoede', languageCode: 'it-IT', phrase: 'Ciao, iniziamo?' },
};

async function probeOne(client: TextToSpeechClient, locale: string): Promise<boolean> {
  const v = VOICE_BY_LOCALE[locale]!;
  console.log(`\n→ synthesize(${locale}, voice=${v.name})`);
  try {
    const [response] = await client.synthesizeSpeech({
      input: { text: v.phrase },
      voice: { languageCode: v.languageCode, name: v.name },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 1.18, pitch: 0 },
    });
    const audio = response.audioContent;
    if (!audio) {
      console.log('  ✗ FAILED — empty audioContent in response');
      return false;
    }
    const bytes = Buffer.isBuffer(audio) ? audio.length : Buffer.from(audio).length;
    console.log(`  ✓ ok — ${Math.round(bytes / 1024)} kB MP3 returned`);
    return true;
  } catch (err) {
    console.log('  ✗ FAILED');
    console.log(formatError(err));
    return false;
  }
}

async function main() {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) {
    console.error('GOOGLE_CLOUD_PROJECT missing — set it in apps/api/.env.local');
    process.exit(2);
  }
  console.log(`Project: ${project}`);
  console.log(
    `Credentials: ${process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '(ADC / GOOGLE_APPLICATION_CREDENTIALS_JSON)'}`,
  );

  const client = new TextToSpeechClient();
  let okCount = 0;
  const total = Object.keys(VOICE_BY_LOCALE).length;
  for (const locale of Object.keys(VOICE_BY_LOCALE)) {
    if (await probeOne(client, locale)) okCount += 1;
  }
  await client.close();

  console.log(`\n══════════════════════════════════════════`);
  console.log(`Result: ${okCount}/${total} locales ok.`);
  if (okCount === 0) {
    console.log(
      '\nLikely fixes (in order of probability):\n' +
        '  1. Enable the "Cloud Text-to-Speech API" in the GCP console for this project.\n' +
        '  2. Grant the service account "roles/texttospeech.user" (or "Cloud Text-to-Speech User").\n' +
        '  3. Wait 1–2 min for IAM propagation, then re-run.\n' +
        '  4. Confirm GOOGLE_APPLICATION_CREDENTIALS points at the same SA used for STT.',
    );
  } else if (okCount < total) {
    console.log(
      '\nSome locales failed — usually a missing voice in that locale. The vertex-tts.ts\n' +
        'gateway falls back to en-US Chirp HD when a locale voice is missing.',
    );
  } else {
    console.log('\nAll good — TTS auth + voice catalogue ok.');
  }
}

main().catch((err) => {
  console.error('Unhandled probe error:', err);
  process.exit(1);
});
