// STTGateway implementation backed by Google Cloud Speech-to-Text v2.
//
// Why v2 (vs v1): v2 exposes the `chirp_2` foundation model which
// supports MULTI-LINGUAL auto-detection. A learner can answer in
// German on an English vocab item ("wie heißt apple?") and the
// recogniser still figures it out. That's the killer use-case for a
// language-learning tutor.
//
// Auth: same Google Application Default Credentials as the existing
// Vertex Gemini calls — env.GOOGLE_APPLICATION_CREDENTIALS or
// env.GOOGLE_APPLICATION_CREDENTIALS_JSON.

import { v2 } from '@google-cloud/speech';

import type { Env } from '../env.js';
import { ApiError } from '../errors.js';
import type { STTGateway, STTInput, STTResult } from './gateway.js';

const MODEL = 'chirp_2';
const PROMPT_VERSION = 'gcp-stt.chirp_2.v1';

// Pricing per https://cloud.google.com/speech-to-text/v2/pricing —
// chirp_2 = $0.024 / minute = 400 micros / second.
const PRICE_MICROS_PER_SECOND = 400;

export class VertexSpeechGateway implements STTGateway {
  private readonly client: v2.SpeechClient;
  private readonly recognizerPath: string;

  constructor(private readonly env: Env) {
    if (!env.GOOGLE_CLOUD_PROJECT) {
      throw new Error('VertexSpeechGateway requires GOOGLE_CLOUD_PROJECT in env');
    }
    // Speech-to-Text v2 needs a recogniser resource. We use the default
    // recogniser ("_") which doesn't need to be created up-front — the
    // API auto-provisions one. For per-project tuning later we'd create
    // a named recogniser via gcloud.
    //
    // Region: `europe-west4`. chirp_2 has a LIMITED regional rollout —
    // it doesn't exist in `global` or the `eu` multi-region; only in
    // specific single-region locations. europe-west4 carries chirp_2
    // AND is on the same continent as our DE/EU user base, saving the
    // transatlantic round-trip vs `us-central1`. Verified via
    // scripts/probe-stt.ts.
    this.client = new v2.SpeechClient({ apiEndpoint: 'europe-west4-speech.googleapis.com' });
    this.recognizerPath = `projects/${env.GOOGLE_CLOUD_PROJECT}/locations/europe-west4/recognizers/_`;
  }

  // Triggered by POST /agent/transcribe/warm right when the user taps
  // the mic. Opens the gRPC channel so the first recognize() doesn't
  // pay the cold handshake. Best-effort: any failure is swallowed —
  // worst case the user just pays the cold path on the real call.
  async warmup(): Promise<void> {
    try {
      await this.client.initialize();
    } catch {
      /* ignore */
    }
  }

  async recognize(input: STTInput): Promise<STTResult> {
    // Map our mime → encoding hint. chirp_2 auto-detects most formats
    // but giving it a hint reduces decode errors.
    const encoding: 'MP3' | 'OGG_OPUS' | 'LINEAR16' | 'AUTO' =
      input.mime === 'audio/webm' ? 'OGG_OPUS' : 'AUTO';

    // chirp_2 in europe-west4 takes language codes in BCP-47 (`de-DE`),
    // not the 2-letter ISO-639 (`de`) we carry in `preferredLocale`.
    // Mixing them in the array (`['de', 'auto']`) triggers
    // INVALID_ARGUMENT: "The language 'de' is not supported by the
    // model 'chirp_2'". We just always pass `['auto']`: full multilingual
    // auto-detect is what the product wants anyway (kid might be
    // learning Chinese, code-switching mid-sentence, etc.).
    const language_codes = ['auto'];

    type RecognizeResp = {
      results?: Array<{
        alternatives?: Array<{ transcript?: string | null; confidence?: number | null }>;
        languageCode?: string | null;
        resultEndOffset?: { seconds?: number | string | null; nanos?: number | null } | null;
      }>;
    };
    let response: RecognizeResp;
    try {
      const result = await this.client.recognize({
        recognizer: this.recognizerPath,
        config: {
          autoDecodingConfig: encoding === 'AUTO' ? {} : undefined,
          explicitDecodingConfig:
            encoding === 'AUTO'
              ? undefined
              : {
                  encoding,
                  sampleRateHertz: 16000,
                  audioChannelCount: 1,
                },
          languageCodes: language_codes,
          model: MODEL,
          // No `features` block — automatic punctuation costs ~50-100ms
          // per call and provides little value for short kid utterances.
        },
        content: input.audioBase64,
      });
      response = result[0] as RecognizeResp;
    } catch (err) {
      throw new ApiError(
        'evaluation_failed',
        `GCP Speech recognize failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const results = response.results ?? [];
    // Walk the alternatives and pick the highest-confidence transcript.
    let bestText = '';
    let bestConf = 0;
    let detectedLocale: string | null = null;
    let totalSeconds = 0;
    for (const r of results) {
      const alt = r.alternatives?.[0];
      if (!alt?.transcript) continue;
      const conf = alt.confidence ?? 0;
      if (conf >= bestConf) {
        bestConf = conf;
        bestText = (bestText ? bestText + ' ' : '') + alt.transcript.trim();
      }
      if (r.languageCode && !detectedLocale) detectedLocale = r.languageCode;
      if (r.resultEndOffset?.seconds) {
        totalSeconds = Math.max(
          totalSeconds,
          Number(r.resultEndOffset.seconds) + Number(r.resultEndOffset.nanos ?? 0) / 1e9,
        );
      }
    }

    // Defensive: if the model returned no usable transcript, treat as
    // silence/noise. The route handles empty text gracefully (no charge,
    // ask the learner to try again).
    const text = filterHallucinations(bestText.trim());

    return {
      text,
      detectedLocale,
      confidence: bestConf,
      usage: {
        durationSeconds: totalSeconds,
        costMicros: Math.ceil(totalSeconds * PRICE_MICROS_PER_SECOND),
        model: MODEL,
        promptVersion: PROMPT_VERSION,
      },
    };
  }
}

// ── Hallucination filter ──────────────────────────────────────────────
//
// Even chirp_2 sometimes invents a transcript when the audio is pure
// silence or background music. The classic offenders we've seen in
// production with Vertex Gemini transcribe also show up here in
// muted form: "I think it's a good idea", "thank you", "subscribe".
// When we see one of these EXACTLY (no surrounding learner text), we
// treat it as silence.

const HALLUCINATION_EXACT = new Set([
  "i think it's a good idea",
  "i think it's a good idea.",
  'thank you',
  'thank you.',
  'thanks for watching',
  'thanks for watching.',
  'subscribe',
  'subscribe to the channel',
  'please subscribe',
  'bye',
  'bye-bye',
  'hello',
  'hi',
  'you',
  '.',
  '...',
]);

function filterHallucinations(text: string): string {
  const trimmed = text.toLowerCase().trim();
  if (HALLUCINATION_EXACT.has(trimmed)) return '';
  // Very short fragments (< 3 chars) are usually noise artefacts.
  if (trimmed.length < 3) return '';
  return text;
}
