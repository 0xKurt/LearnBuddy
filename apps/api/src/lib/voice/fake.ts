// Deterministic STT + TTS fakes for tests.
//
// FakeSTT returns a predictable echo of the audio length (encoded
// somewhere in the base64 — we just check that audio reached us).
// FakeTTS returns a tiny silent MP3 placeholder.

import type {
  STTGateway,
  STTInput,
  STTResult,
  TTSGateway,
  TTSInput,
  TTSResult,
} from './gateway.js';

// 0.5s of MP3 silence — generated once, embedded as base64. Any client
// that tries to play it just gets a brief silent gap.
const SILENT_MP3_B64 =
  '/+MYxAAAAANIAUAAAASEEB4AAAABBgQI//tAxAAAA/wIAxgAYDh+gAAAxAAAH//7QMRgD/wcA' +
  '8AwAAA/AwAAB/+0DECwA/AKAAAA/A4AAA';

export class FakeSTTGateway implements STTGateway {
  async recognize(input: STTInput): Promise<STTResult> {
    // Deterministic test transcript so route tests can match on it.
    const text = input.audioBase64.length > 100 ? 'test transcript from fake stt' : '';
    return {
      text,
      detectedLocale: input.preferredLocale ?? null,
      confidence: text ? 0.95 : 0,
      usage: {
        durationSeconds: 1,
        costMicros: 0,
        model: 'fake',
        promptVersion: 'fake-stt.v1',
      },
    };
  }
  async warmup(): Promise<void> {
    /* no-op for the fake gateway */
  }
}

export class FakeTTSGateway implements TTSGateway {
  async synthesize(input: TTSInput): Promise<TTSResult> {
    return {
      audioBase64: SILENT_MP3_B64,
      mime: 'audio/mp3',
      durationMs: 500,
      usage: {
        chars: input.text.length,
        costMicros: 0,
        model: 'fake',
        promptVersion: 'fake-tts.v1',
      },
    };
  }
}
