import { pcmWav } from './pcm.js';
import type OpenAI from 'openai';
import { RealtimeSpeechSessions } from './realtime-sessions.js';
import type { VoiceName } from '@learnbuddy/shared-types/contracts';
import { mainSpeechLocale } from './locales.js';
import { classifyOpenAI } from '../llm/openai-error.js';
import {
  SpeechError,
  type SpeechGateway,
  type SpeechInput,
  type SpeechAudio,
  type SpeechSessionInput,
} from './gateway.js';

import { DEFAULT_OPENAI_VOICES, type OpenAIVoices } from './openai-config.js';

export class OpenAISpeech implements SpeechGateway {
  readonly available = true;
  private readonly sessions: RealtimeSpeechSessions;
  /** tts-1 list price: $15 / million characters; no unreported free-tier discount. */
  get microsPerCharacter(): number {
    return this.model === 'tts-1' ? 15 : 0;
  }
  constructor(
    private readonly client: OpenAI,
    private readonly voices: OpenAIVoices = DEFAULT_OPENAI_VOICES,
    private readonly model: 'tts-1' | 'gpt-realtime-2.1-mini' | 'gpt-realtime-1.5' = 'tts-1',
  ) {
    this.sessions = new RealtimeSpeechSessions(client, model);
  }
  async prepare(input: SpeechSessionInput): Promise<void> {
    if (this.model === 'tts-1' || !this.localeFor(input.locale)) return;
    const deadline = AbortSignal.timeout(input.timeoutMs);
    const signal = input.signal ? AbortSignal.any([input.signal, deadline]) : deadline;
    await this.sessions.prepare(input, this.voices[input.voice], signal);
  }
  close(): void {
    this.sessions.close();
  }
  localeFor(locale: string): string | null {
    return mainSpeechLocale(locale);
  }
  voiceId(voice: VoiceName, locale: string): string {
    return `openai:${this.model}:${locale}:${this.voices[voice]}:v3`;
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
        return await this.sessions.synthesize(input, this.voices[input.voice], signal);
      const result = await this.client.audio.speech.create(
        {
          model: 'tts-1',
          voice: this.voices[input.voice],
          input: input.text,
          response_format: input.pcm ? 'pcm' : 'mp3',
          stream_format: 'audio',
          speed: Math.max(0.25, Math.min(4, input.rate)),
        },
        { signal, timeout: input.timeoutMs },
      );
      if (!result.body || !result.headers.get('content-type')?.startsWith('audio/'))
        throw new SpeechError('refused', 'Provider returned no audio');
      const chunks: Buffer[] = [];
      const reader = result.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value.length) continue;
          const chunk = Buffer.from(value);
          chunks.push(chunk);
          await input.onAudio?.({ mime: input.pcm ? 'audio/pcm' : 'audio/mpeg', audio: chunk });
        }
      } finally {
        reader.releaseLock();
      }
      const audio = Buffer.concat(chunks);
      if (!audio.length) throw new SpeechError('refused', 'Provider returned no audio');
      return input.pcm
        ? { mime: 'audio/wav', audio: await pcmWav(audio) }
        : { mime: 'audio/mpeg', audio };
    } catch (error) {
      if (error instanceof SpeechError) {
        if (error.kind === 'cancelled' && signal.aborted && !input.signal?.aborted)
          throw new SpeechError('timeout', 'Speech deadline expired', error.costMicros);
        throw error;
      }
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
