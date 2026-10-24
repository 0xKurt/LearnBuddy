import type OpenAI from 'openai';
import { realtimeSpeech } from './realtime-speech.js';
import type { VoiceName } from '@learnbuddy/shared-types/contracts';
import { mainSpeechLocale } from './locales.js';
import { classifyOpenAI } from '../llm/openai-error.js';
import { SpeechError, type SpeechGateway, type SpeechInput, type SpeechAudio } from './gateway.js';

import { DEFAULT_OPENAI_VOICES, type OpenAIVoices } from './openai-config.js';

export class OpenAISpeech implements SpeechGateway {
  readonly available = true;
  /** tts-1 list price: $15 / million characters; no unreported free-tier discount. */
  get microsPerCharacter(): number {
    return this.model === 'tts-1' ? 15 : 0;
  }
  constructor(
    private readonly client: OpenAI,
    private readonly voices: OpenAIVoices = DEFAULT_OPENAI_VOICES,
    private readonly model: 'tts-1' | 'gpt-realtime-2.1-mini' = 'tts-1',
  ) {}
  localeFor(locale: string): string | null {
    return mainSpeechLocale(locale);
  }
  voiceId(voice: VoiceName, locale: string): string {
    return `openai:${this.model}:${locale}:${this.voices[voice]}:v2`;
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
      if (this.model !== 'tts-1')
        return await realtimeSpeech(
          this.client,
          this.model,
          this.voices[input.voice],
          input,
          signal,
        );
      const result = await this.client.audio.speech.create(
        {
          model: 'tts-1',
          voice: this.voices[input.voice],
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
