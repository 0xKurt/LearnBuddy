// Typed configuration. Fails fast at boot on anything missing or malformed;
// there is no silent fallback to fake services in any environment.

import { z } from 'zod';

const ModelSpec = z
  .string()
  .regex(/^([a-z0-9-]+\/)?gemini-[a-z0-9.-]+$/, 'expected [location/]gemini-…');
const VertexRoutes = z
  .object({
    buddy_turn: ModelSpec,
    buddy_check: ModelSpec,
    tutor: ModelSpec,
    explain: ModelSpec,
    extraction: ModelSpec,
    pronounce: ModelSpec,
    transcribe: ModelSpec,
  })
  .partial()
  .strict();

const Config = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /** Postgres connection (Supabase transaction pooler in production). */
    DATABASE_URL: z.string().min(1),
    SUPABASE_URL: z.string().url(),
    /** Used only to verify user tokens and to sign storage URLs. */
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
    /** Shared secret for POST /internal/tick (pg_cron or external cron). */
    TICK_SECRET: z.string().min(24).optional(),
    /** HMAC key for short-lived admin sessions (PIN-gated, minors). */
    ADMIN_TOKEN_SECRET: z.string().min(32),
    /** Version of the privacy text the app shows; consent must match it. */
    CONSENT_VERSION: z.string().min(1).default('2026-09-25'),
    /** Comma-separated browser origins (Expo web in development). Native apps need none. */
    CORS_ORIGINS: z.string().optional(),
    /** Node server only: run the scheduler in-process every N seconds (0 = off; pg_cron in production). */
    TICK_INTERVAL_SECONDS: z.coerce.number().int().min(0).max(3600).optional(),
    /** 'disabled' runs the app without a model: Buddy says so honestly. */
    LLM_BACKEND: z.enum(['vertex', 'disabled']).default('vertex'),
    GOOGLE_CLOUD_PROJECT: z.string().optional(),
    GOOGLE_VERTEX_LOCATION: z.string().default('europe-west4'),
    /** Service-account JSON inline (Vercel); written to a temp file at boot. */
    GOOGLE_APPLICATION_CREDENTIALS_JSON: z.string().optional(),
    /** Conversation, planning, tutoring and reading worksheets. */
    VERTEX_MODEL_SMART: z.string().default('gemini-2.5-flash'),
    /** Cheaper model for short low-stakes tasks (no feature uses it yet). */
    VERTEX_MODEL_FAST: z.string().default('gemini-2.5-flash-lite'),
    /**
     * Per-task models, overriding the tier: JSON like {"tutor":"eu/gemini-3.1-flash-lite"}.
     * A model may carry its location ("eu/…"; default GOOGLE_VERTEX_LOCATION). Chosen per
     * task by measurement (docs/architecture.md §Model calls); unknown keys are rejected.
     */
    VERTEX_ROUTES: z
      .string()
      .optional()
      .transform((raw, ctx) => {
        if (!raw) return {};
        try {
          return VertexRoutes.parse(JSON.parse(raw));
        } catch (err) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `VERTEX_ROUTES: ${String(err)}` });
          return z.NEVER;
        }
      }),
    /** Push via Expo is off until legal review (ADR 0004 §4). */
    PUSH_BACKEND: z.enum(['expo', 'disabled']).default('disabled'),
    EXPO_ACCESS_TOKEN: z.string().optional(),
  })
  .superRefine((c, ctx) => {
    if (c.LLM_BACKEND === 'vertex' && !c.GOOGLE_CLOUD_PROJECT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GOOGLE_CLOUD_PROJECT'],
        message:
          'required when LLM_BACKEND=vertex (set LLM_BACKEND=disabled to run without a model)',
      });
    }
    if (c.NODE_ENV === 'production' && !c.TICK_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TICK_SECRET'],
        message: 'required in production: without it background work never runs',
      });
    }
  });

export type Config = z.infer<typeof Config>;

export function loadConfig(source: Record<string, string | undefined> = process.env): Config {
  const parsed = Config.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${issues}`);
  }
  return parsed.data;
}

/** Per-learner daily limits for model calls (cost and abuse bound). */
export const DAILY_LIMITS = {
  buddy_turn: 80,
  buddy_check: 8,
  tutor: 300,
  explain: 60,
  extraction: 12,
  pronounce: 200,
  transcribe: 400,
} as const;
