import type OpenAI from 'openai';
import type { VoiceName } from '@learnbuddy/shared-types/contracts';
import { mainSpeechLocale } from './locales.js';
import { classifyOpenAI } from '../llm/openai-error.js';
import { SpeechError, type SpeechGateway, type SpeechInput, type SpeechAudio } from './gateway.js';

const VOICES: Record<VoiceName, 'nova' | 'echo' | 'shimmer' | 'alloy' | 'fable' | 'onyx'> = {
  warm: 'nova',
  friendly: 'echo',
  bright: 'shimmer',
  clear: 'alloy',
  soft: 'fable',
  deep: 'onyx',
};
export class OpenAISpeech implements SpeechGateway {
  readonly available = true;
  /** tts-1 list price: $15 / million characters; no unreported free-tier discount. */
  readonly microsPerCharacter = 15;
  constructor(private readonly client: OpenAI) {}
  localeFor(locale: string): string | null {
    return mainSpeechLocale(locale);
  }
  voiceId(voice: VoiceName, locale: string): string {
    return `openai:tts-1:${locale}:${VOICES[voice]}:v1`;
  }
  async synthesize(input: SpeechInput): Promise<SpeechAudio> {
    if (
      !this.localeFor(input.locale) ||
      !input.text.trim() ||
      input.text.length > 4096 ||
      !Number.isFinite(input.rate)
    )
      throw new SpeechError('refused', 'Unsupported speech input');
    if (input.signal?.aborted) throw new SpeechError('cancelled', 'Caller stopped waiting');
    const deadline = AbortSignal.timeout(input.timeoutMs);
    const signal = input.signal ? AbortSignal.any([input.signal, deadline]) : deadline;
    try {
      const result = await this.client.audio.speech.create(
        {
          model: 'tts-1',
          voice: VOICES[input.voice],
          input: input.text,
          response_format: 'mp3',
          speed: Math.max(0.25, Math.min(4, input.rate)),
        },
        { signal, timeout: input.timeoutMs },
      );
      const audio = Buffer.from(await result.arrayBuffer());
      if (!audio.length || !result.headers.get('content-type')?.startsWith('audio/'))
        throw new SpeechError('refused', 'Provider returned no audio');
      return { mime: 'audio/mpeg', audio };
    } catch (error) {
      if (error instanceof SpeechError) throw error;
      const mapped = classifyOpenAI(error, signal, input.signal);
      throw new SpeechError(
        mapped.kind === 'cancelled'
          ? 'cancelled'
          : mapped.kind === 'timeout'
            ? 'timeout'
            : mapped.kind === 'rate_limited'
              ? 'rate_limited'
              : mapped.kind === 'unavailable'
                ? 'unavailable'
                : 'refused',
        mapped.message,
      );
    }
  }
}
