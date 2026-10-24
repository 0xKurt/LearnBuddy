import { z } from 'zod';
import type { VoiceName } from '@learnbuddy/shared-types/contracts';

const Voice = z.enum([
  'nova',
  'shimmer',
  'coral',
  'ash',
  'alloy',
  'onyx',
  'echo',
  'fable',
  'marin',
  'cedar',
  'ballad',
  'sage',
  'verse',
]);
export type OpenAIVoices = Record<VoiceName, z.infer<typeof Voice>>;
export const DEFAULT_OPENAI_VOICES: OpenAIVoices = {
  warm: 'nova',
  bright: 'shimmer',
  soft: 'coral',
  friendly: 'ash',
  clear: 'echo',
  deep: 'onyx',
};
const REALTIME_VOICES: OpenAIVoices = {
  warm: 'marin',
  bright: 'shimmer',
  soft: 'coral',
  friendly: 'ash',
  clear: 'cedar',
  deep: 'echo',
};
const Voices = z
  .object({ warm: Voice, bright: Voice, soft: Voice, friendly: Voice, clear: Voice, deep: Voice })
  .partial()
  .strict();
export const openAISpeechFields = {
  OPENAI_MODEL_SPEECH: z.enum(['tts-1', 'gpt-realtime-2.1-mini']).default('tts-1'),
  OPENAI_TTS_VOICES: z
    .string()
    .optional()
    .transform((raw, ctx): Partial<OpenAIVoices> => {
      if (!raw) return {};
      try {
        return Voices.parse(JSON.parse(raw));
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'OPENAI_TTS_VOICES must map app voices to supported speech voices',
        });
        return z.NEVER;
      }
    }),
};
export function speechVoices(model: string, overrides: Partial<OpenAIVoices>): OpenAIVoices {
  return { ...(model === 'tts-1' ? DEFAULT_OPENAI_VOICES : REALTIME_VOICES), ...overrides };
}
export function checkSpeechVoices(model: string, voices: OpenAIVoices, ctx: z.RefinementCtx): void {
  const unsupported =
    model === 'tts-1' ? ['marin', 'cedar', 'ballad', 'sage', 'verse'] : ['nova', 'onyx', 'fable'];
  if (Object.values(voices).some((voice) => unsupported.includes(voice)))
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['OPENAI_TTS_VOICES'],
      message: 'voice is not supported by OPENAI_MODEL_SPEECH',
    });
}
