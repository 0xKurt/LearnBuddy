import { z } from 'zod';
import type { LlmUsage } from '../llm/gateway.js';
const Count = z.number().int().nonnegative();
const Usage = z.object({
  prompt_tokens: Count.optional(),
  completion_tokens: Count.optional(),
  input_tokens: Count.optional(),
  output_tokens: Count.optional(),
  prompt_tokens_details: z.object({ audio_tokens: Count.optional() }).optional(),
  input_token_details: z.object({ audio_tokens: Count.optional() }).optional(),
  output_token_details: z.object({ audio_tokens: Count.optional() }).optional(),
  seconds: z.number().nonnegative().optional(),
});
/** List-price ceiling. Cached tokens are never guessed or subtracted. Pricing read 2026-10-23. */
export function audioUsage(
  model: string,
  raw: unknown,
  elapsed: number,
  fallbackTokens: number,
): LlmUsage {
  const parsed = Usage.safeParse(raw);
  const u = parsed.success ? parsed.data : undefined;
  const inputTokens = u?.prompt_tokens ?? u?.input_tokens ?? fallbackTokens;
  const outputTokens = u?.completion_tokens ?? u?.output_tokens ?? 0;
  const audio = Math.min(
    inputTokens,
    u?.prompt_tokens_details?.audio_tokens ?? u?.input_token_details?.audio_tokens ?? inputTokens,
  );
  const audioOut = Math.min(outputTokens, u?.output_token_details?.audio_tokens ?? 0);
  const textOut = outputTokens - audioOut;
  const cost =
    model === 'gpt-realtime-2.1-mini'
      ? (audio * 10 + (inputTokens - audio) * 0.6 + textOut * 2.4 + audioOut * 20) * 1.1
      : model === 'gpt-realtime-2.1' || model === 'gpt-realtime-1.5'
        ? (audio * 32 +
            (inputTokens - audio) * 4 +
            textOut * (model === 'gpt-realtime-1.5' ? 16 : 24) +
            audioOut * 64) *
          1.1
        : model === 'gpt-audio-1.5' || model === 'gpt-audio'
          ? audio * 32 + (inputTokens - audio) * 2.5 + outputTokens * 10
          : model === 'gpt-4o-mini-transcribe'
            ? audio * 3 + (inputTokens - audio) * 1.25 + outputTokens * 5
            : audio * 6 + (inputTokens - audio) * 2.5 + outputTokens * 10;
  return {
    model,
    inputTokens,
    outputTokens,
    thoughtTokens: 0,
    cachedTokens: 0,
    latencyMs: elapsed,
    costMicros: Math.ceil(
      u?.seconds !== undefined
        ? u.seconds *
            (model === 'gpt-transcribe' ? 82.5 : model === 'gpt-4o-mini-transcribe' ? 50 : 100)
        : cost,
    ),
  };
}
export function withAudioUsage(audio: LlmUsage, other: LlmUsage | null, elapsed: number): LlmUsage {
  if (!other) return { ...audio, latencyMs: elapsed };
  return {
    model: `${audio.model}+${other.model}`,
    inputTokens: audio.inputTokens + other.inputTokens,
    outputTokens: audio.outputTokens + other.outputTokens,
    thoughtTokens: other.thoughtTokens,
    cachedTokens: other.cachedTokens,
    costMicros: audio.costMicros + other.costMicros,
    latencyMs: elapsed,
  };
}
