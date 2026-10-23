// Azure resource hostnames do not encode residency. These are operator declarations, checked
// against the actual deployment in the activation runbook (docs/decisions/provider-2026-10.md).
import { z } from 'zod';

const Endpoint = z
  .string()
  .url()
  .refine((raw) => {
    const url = new URL(raw);
    return (
      url.protocol === 'https:' &&
      /^[a-z0-9-]+\.openai\.azure\.com$/.test(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash &&
      url.pathname === '/'
    );
  }, 'expected an HTTPS Azure resource origin without path, credentials or query');
const Deployment = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/);
const Model = z.enum(['gpt-5.4', 'gpt-5.4-mini']);
const Price = z
  .object({ inputPerM: z.number().finite().positive(), outputPerM: z.number().finite().positive() })
  .strict();
const Prices = z
  .object({
    source: z.string().url(),
    readOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    models: z.object({ 'gpt-5.4': Price, 'gpt-5.4-mini': Price }).strict(),
  })
  .strict();

export const azureConfigFields = {
  AZURE_OPENAI_ENDPOINT: Endpoint.optional(),
  AZURE_OPENAI_KEY: z.string().min(1).optional(),
  AZURE_OPENAI_DEPLOYMENT: Deployment.optional(),
  AZURE_OPENAI_DEPLOYMENT_FAST: Deployment.optional(),
  AZURE_OPENAI_MODEL: Model.default('gpt-5.4'),
  AZURE_OPENAI_MODEL_FAST: Model.default('gpt-5.4-mini'),
  AZURE_OPENAI_API_VERSION: z.enum(['v1', '2024-10-21', '2025-04-01-preview']).default('v1'),
  AZURE_OPENAI_REGION: z.enum(['swedencentral', 'germanywestcentral']).optional(),
  AZURE_OPENAI_DEPLOYMENT_TYPE: z.literal('DataZoneStandard').optional(),
  // No invented price defaults: Learn documents billing but not a verified EU rate card.
  // Require the owner's dated, Azure-specific USD/1M table before enabling this backend.
  AZURE_OPENAI_PRICES: z
    .string()
    .optional()
    .transform((raw, ctx) => {
      if (!raw) return undefined;
      try {
        return Prices.parse(JSON.parse(raw));
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'expected a dated Azure USD/1M price table (source, readOn, models)',
        });
        return z.NEVER;
      }
    }),
};

export function requireAzureConfig(
  config: { LLM_BACKEND: string } & z.infer<z.ZodObject<typeof azureConfigFields>>,
  ctx: z.RefinementCtx,
): void {
  if (config.LLM_BACKEND !== 'azure') return;
  for (const key of [
    'AZURE_OPENAI_ENDPOINT',
    'AZURE_OPENAI_KEY',
    'AZURE_OPENAI_DEPLOYMENT',
    'AZURE_OPENAI_DEPLOYMENT_FAST',
    'AZURE_OPENAI_REGION',
    'AZURE_OPENAI_DEPLOYMENT_TYPE',
    'AZURE_OPENAI_PRICES',
  ] as const) {
    if (config[key] === undefined)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: 'required when LLM_BACKEND=azure',
      });
  }
}
