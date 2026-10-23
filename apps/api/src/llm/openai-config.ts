// An EU hostname is necessary, but does not establish the project's residency/ZDR approval.
import { z } from 'zod';
import type { PriceTable } from './pricing.js';

export const OPENAI_MODELS = [
  'gpt-5.4-mini',
  'gpt-5.4-nano',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
] as const;
const Model = z.enum(OPENAI_MODELS);
export const OpenAIBaseUrl = z.enum([
  'https://eu.api.openai.com/v1',
  'https://eu.api.openai.com/v1/',
]);
export const openaiConfigFields = {
  OPENAI_API_KEY: z.string().trim().min(1).optional(),
  // Fail closed: no global host, proxy, credentials, query, fragment or SDK environment fallback.
  OPENAI_BASE_URL: OpenAIBaseUrl.default('https://eu.api.openai.com/v1'),
  OPENAI_MODEL_SMART: Model.default('gpt-5.4-mini'),
  OPENAI_MODEL_FAST: Model.default('gpt-5.4-nano'),
  OPENAI_MODEL_PRONOUNCE: z.enum(['gpt-audio-1.5', 'gpt-audio']).default('gpt-audio-1.5'),
  OPENAI_MODEL_TRANSCRIBE: z
    .enum(['gpt-4o-transcribe', 'gpt-4o-mini-transcribe'])
    .default('gpt-4o-transcribe'),
};
export function requireOpenAIConfig(
  config: {
    LLM_BACKEND: string;
    SPEECH_BACKEND: string;
    AUDIO_BACKEND: string;
    EMBEDDING_BACKEND: string;
    OPENAI_API_KEY?: string;
  },
  ctx: z.RefinementCtx,
): void {
  if (
    [
      config.LLM_BACKEND,
      config.SPEECH_BACKEND,
      config.AUDIO_BACKEND,
      config.EMBEDDING_BACKEND,
    ].includes('openai') &&
    !config.OPENAI_API_KEY
  )
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['OPENAI_API_KEY'],
      message: 'required for an openai backend',
    });
}

/** Standard USD/1M; 10% residency uplift only for models released since 2026-03-05.
 * Model pages give base prices; https://developers.openai.com/api/docs/guides/your-data gives uplift.
 * Cache discounts are recorded as tokens, never deducted from the application's cost ceiling.
 */
export const OPENAI_EU_PRICES: PriceTable = {
  source: 'https://developers.openai.com/api/docs/pricing',
  readOn: '2026-10-23',
  models: {
    'gpt-5.4-mini': { inputPerM: 0.825, cachedInputPerM: 0.0825, outputPerM: 4.95 },
    'gpt-5.4-nano': { inputPerM: 0.22, cachedInputPerM: 0.022, outputPerM: 1.375 },
    'gpt-4.1-mini': { inputPerM: 0.4, cachedInputPerM: 0.1, outputPerM: 1.6 },
    'gpt-4.1-nano': { inputPerM: 0.1, cachedInputPerM: 0.025, outputPerM: 0.4 },
  },
};
