// Typed configuration. Fails fast at boot on anything missing or malformed;
// there is no silent fallback to fake services in any environment.

import { z } from 'zod';

import { isLocalDatabaseHost } from './lib/db.js';

/**
 * Children's data is processed in the EU only (docs/privacy.md): the EU multi-region "eu" or a
 * europe-* region. "global" and other regions are refused at startup, never silently used.
 */
const EuLocation = z
  .string()
  .regex(/^(eu|europe-[a-z]+[0-9]+)$/, 'only the EU: "eu" or a europe-* region');
const ModelSpec = z
  .string()
  .regex(/^([a-z0-9-]+\/)?gemini-[a-z0-9.-]+$/, 'expected [location/]gemini-…')
  .refine(
    (spec) => !spec.includes('/') || EuLocation.safeParse(spec.split('/')[0]).success,
    'only the EU: "eu/…" or "europe-*/…"',
  );
const VertexRoutes = z
  .object({
    buddy_turn: ModelSpec,
    buddy_check: ModelSpec,
    tutor: ModelSpec,
    explain: ModelSpec,
    extraction: ModelSpec,
    pronounce: ModelSpec,
    transcribe: ModelSpec,
    hints: ModelSpec,
  })
  .partial()
  .strict();

const Config = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /** Postgres connection (Supabase transaction pooler in production). */
    DATABASE_URL: z.string().min(1),
    /**
     * Root certificate (PEM) of the database server, for TLS verification of non-local hosts
     * (lib/db.ts connectionOptions). Supabase: Dashboard → Database → SSL configuration.
     */
    DATABASE_CA_CERT: z.string().optional(),
    SUPABASE_URL: z.string().url(),
    /** Used only to verify user tokens and to sign storage URLs. */
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
    /** Shared secret for POST /internal/tick (pg_cron or external cron). */
    TICK_SECRET: z.string().min(24).optional(),
    /** HMAC key for short-lived admin sessions (PIN-gated, minors). */
    ADMIN_TOKEN_SECRET: z.string().min(32),
    /** Version of the privacy text the app shows; consent must match it. */
    CONSENT_VERSION: z.string().min(1).default('2026-09-27'),
    /**
     * Oldest app build the API still serves (x-app-version, e.g. "1.4.0"); older builds get
     * 426 update_required and ask to update (audit M-69). Unset: every build is served.
     */
    MIN_APP_VERSION: z
      .string()
      .regex(/^\d+(\.\d+){0,2}$/)
      .optional(),
    /** Comma-separated browser origins (Expo web in development). Native apps need none. */
    CORS_ORIGINS: z.string().optional(),
    /** Node server only: run the scheduler in-process every N seconds (0 = off; pg_cron in production). */
    TICK_INTERVAL_SECONDS: z.coerce.number().int().min(0).max(3600).optional(),
    /** 'disabled' runs the app without a model: Buddy says so honestly. */
    LLM_BACKEND: z.enum(['vertex', 'disabled']).default('vertex'),
    GOOGLE_CLOUD_PROJECT: z.string().optional(),
    GOOGLE_VERTEX_LOCATION: EuLocation.default('europe-west4'),
    /** Service-account JSON inline (Vercel); written to a temp file at boot. */
    GOOGLE_APPLICATION_CREDENTIALS_JSON: z.string().optional(),
    /**
     * Conversation, planning, tutoring, reading worksheets, speech. Gemini 3.6 Flash through the
     * EU multi-region endpoint: it passed every eval (tutor 26/27, Buddy 22/22, speech 6/6,
     * pronunciation stricter than 2.5); Gemini 2.5 Flash is retired in October 2026.
     */
    VERTEX_MODEL_SMART: ModelSpec.default('eu/gemini-3.6-flash'),
    /** Cheaper model for short low-stakes tasks (no feature uses it: the Lite models failed the tutor eval). */
    VERTEX_MODEL_FAST: ModelSpec.default('eu/gemini-3.1-flash-lite'),
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
    /**
     * Buddy's natural voice (ADR 0008): 'google' = Cloud Text-to-Speech (Chirp 3: HD voices)
     * through its EU endpoint, with the Vertex service account. 'disabled': the app reads
     * aloud with the phone's own voice, as before.
     */
    SPEECH_BACKEND: z.enum(['google', 'disabled']).default('disabled'),
    /** Only the EU endpoint: the text of her replies is processed in the EU (docs/privacy.md). */
    SPEECH_ENDPOINT: z
      .enum(['eu-texttospeech.googleapis.com'])
      .default('eu-texttospeech.googleapis.com'),
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
    if (c.SPEECH_BACKEND === 'google' && !c.GOOGLE_CLOUD_PROJECT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GOOGLE_CLOUD_PROJECT'],
        message:
          'required when SPEECH_BACKEND=google (set SPEECH_BACKEND=disabled to use the phone voice)',
      });
    }
    const tls = databaseTlsIssue(c.DATABASE_URL);
    if (tls) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['DATABASE_URL'], message: tls });
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

/** Modes that would allow a plaintext or unverified connection when written into the URL. */
const WEAK_SSLMODES = new Set(['disable', 'allow', 'prefer', 'no-verify']);

function databaseHost(url: string): string | null {
  try {
    const u = new URL(url);
    return decodeURIComponent(u.hostname || u.searchParams.get('host') || '');
  } catch {
    return null;
  }
}

/**
 * A remote database is only reached over verified TLS (lib/db.ts forces it). A URL that asks
 * for less is refused at boot instead of being silently upgraded, so the operator notices.
 */
export function databaseTlsIssue(url: string): string | null {
  const host = databaseHost(url);
  if (host === null) return 'not a valid postgres:// URL';
  if (isLocalDatabaseHost(host)) return null;
  const mode = new URL(url).searchParams.get('sslmode');
  if (mode && WEAK_SSLMODES.has(mode.toLowerCase())) {
    return `sslmode=${mode} would send learner data unencrypted or unverified; remove it (TLS with certificate verification is always used for ${host})`;
  }
  return null;
}

/**
 * EU member-state regions of the providers we use. London (eu-west-2) and Zurich
 * (eu-central-2) are not in the EU.
 */
const EU_DATABASE_REGIONS = new Set([
  'eu-central-1',
  'eu-west-1',
  'eu-west-3',
  'eu-north-1',
  'eu-south-1',
  'eu-south-2',
]);

/**
 * Where the database lives, as far as the host name tells (audit H-33). docs/privacy.md promises
 * an EU region. The region decision is open (D-4), so this only warns; it never refuses to boot.
 */
export function databaseRegionWarning(url: string): string | null {
  const host = databaseHost(url);
  if (host === null || isLocalDatabaseHost(host)) return null;
  const pooler = /^aws-\d+-([a-z]+-[a-z]+-\d+)\.pooler\.supabase\.com$/.exec(host.toLowerCase());
  if (pooler) {
    const region = pooler[1]!;
    return EU_DATABASE_REGIONS.has(region)
      ? null
      : `database region ${region} (${host}) is not an EU member state, but docs/privacy.md promises an EU region`;
  }
  return `database region cannot be read from ${host}; confirm it is an EU member state (docs/privacy.md)`;
}

/** Problems worth an operator's attention that do not stop the API (logged at boot). */
export function bootWarnings(c: Config): string[] {
  const warnings: string[] = [];
  const region = databaseRegionWarning(c.DATABASE_URL);
  if (region) warnings.push(region);
  const host = databaseHost(c.DATABASE_URL);
  if (host !== null && !isLocalDatabaseHost(host) && !c.DATABASE_CA_CERT) {
    warnings.push(
      `DATABASE_CA_CERT is not set: TLS to ${host} is verified against the system roots only (Supabase needs its own CA from Dashboard → Database → SSL)`,
    );
  }
  return warnings;
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
  hints: 60,
} as const;
