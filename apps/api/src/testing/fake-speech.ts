// requires live verification in Claude Code session
import type { VoiceName } from '@learnbuddy/shared-types/contracts';
import {
  SpeechError,
  type SpeechAudio,
  type SpeechGateway,
  type SpeechInput,
} from '../speech/gateway.js';
import { LlmError } from '../llm/gateway.js';
import { fakeDeadline } from './fake-deadline.js';
/**
 * Text to speech in tests and the dev stack: a WAV of silence as long as the text would take
 * to say (so playback, progress and read-along can be exercised without Google). Records every
 * call; `failNext` makes the provider fail the way the real one can.
 */
/** The main region of each language the fake reads, as `chirp3Locale` has it. */
const MAIN_LOCALE: Record<string, string> = {
  de: 'de-DE',
  en: 'en-GB',
  fr: 'fr-FR',
  es: 'es-ES',
  it: 'it-IT',
};

export class FakeSpeech implements SpeechGateway {
  readonly available = true;
  /** Hold the scripted provider until its caller cancels or its deadline expires. */
  waitForAbort = false;
  /** Chirp 3: HD's list price, so a test reads the cost a real sentence records (#682). */
  readonly microsPerCharacter = 30;
  readonly calls: SpeechInput[] = [];
  private failures: SpeechError[] = [];
  /** Languages this provider does not read (`lacks`), like a real one missing a voice. */
  private readonly missing = new Set<string>();

  voiceId(voice: VoiceName, locale: string): string {
    return `fake-${locale}-${voice}`;
  }

  /** From now on the provider has no voice for these languages ("it", …). */
  lacks(...languages: string[]): this {
    for (const l of languages) this.missing.add(l);
    return this;
  }

  localeFor(locale: string): string | null {
    if (this.missing.has(locale.slice(0, 2))) return null;
    if (/^(de|en|fr|es|it)-[A-Z]{2}$/.test(locale)) return locale;
    // A bare language code, like the real gateway maps it ("en" → "en-GB", `chirp3Locale`):
    // that is what a listening text carries (issue #210), and a fake that answered null to it
    // would make the exercise look impossible in tests and possible in production.
    return MAIN_LOCALE[locale] ?? null;
  }

  failNext(...errors: SpeechError[]): this {
    this.failures.push(...errors);
    return this;
  }

  async synthesize(input: SpeechInput): Promise<SpeechAudio> {
    try {
      await fakeDeadline(
        this.waitForAbort ? new Promise<void>(() => {}) : Promise.resolve(),
        input.timeoutMs,
        input.signal,
      );
    } catch (error) {
      throw new SpeechError(
        error instanceof LlmError && error.kind === 'cancelled' ? 'cancelled' : 'timeout',
        'Scripted call stopped',
      );
    }
    this.calls.push(input);
    const failure = this.failures.shift();
    if (failure) throw failure;
    const ms = Math.min(8000, Math.max(300, (input.text.length * 60) / input.rate));
    return { mime: 'audio/wav', audio: silentWav(ms) };
  }
}

/** 8 kHz, 8-bit mono PCM silence. */
function silentWav(ms: number): Buffer {
  const rate = 8000;
  const samples = Math.round((rate * ms) / 1000);
  const b = Buffer.alloc(44 + samples, 0x80);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(36 + samples, 4);
  b.write('WAVE', 8, 'ascii');
  b.write('fmt ', 12, 'ascii');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate, 28); // byte rate
  b.writeUInt16LE(1, 32); // block align
  b.writeUInt16LE(8, 34); // bits per sample
  b.write('data', 36, 'ascii');
  b.writeUInt32LE(samples, 40);
  return b;
}
