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
    safeguard: ModelSpec,
    explain: ModelSpec,
    extraction: ModelSpec,
    figures: ModelSpec,
    pronounce: ModelSpec,
    transcribe: ModelSpec,
    hints: ModelSpec,
    reexplain: ModelSpec,
    summary: ModelSpec,
    consolidate: ModelSpec,
    forms: ModelSpec,
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
     * Conversation, planning, tutoring, reading worksheets, speech.
     *
     * Still Gemini 3.6 Flash, although the owner asked on 01.10. to move to 3.8. The 3.8 runs of
     * 01.10. (47/49, 34/49, 39/49, every failure `model_unavailable`, almost no prefix cache)
     * are NOT a measurement of 3.8: the same evening showed the project has no quota for 3.8 in
     * `eu` — 429 RESOURCE_EXHAUSTED on the first call (docs/decisions/model-choice-2026-10-01.md,
     * "Nachtrag 2"). So nothing is known about 3.8's quality or speed yet (#665, audit F11).
     * What keeps 3.6 is only that it is measured and answers; the switch waits for the quota
     * (a Cloud Console action) and a fresh run of `npx tsx evals/buddy/run.ts` with
     * VERTEX_MODEL_SMART=eu/gemini-3.8-flash.
     */
    VERTEX_MODEL_SMART: ModelSpec.default('eu/gemini-3.6-flash'),
    /** Cheaper model for separately measured narrow tasks: the distress check (#867), not the tutor. */
    VERTEX_MODEL_FAST: ModelSpec.default('eu/gemini-3.1-flash-lite'),
    /**
     * Text embeddings for the hybrid material search (issue #23). gemini-embedding-001
     * does not serve the EU multi-region "eu" (checked live 2026-09-29), so the default
     * rides on GOOGLE_VERTEX_LOCATION (europe-west4, where it is served).
     */
    VERTEX_MODEL_EMBEDDING: ModelSpec.default('gemini-embedding-001'),
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
    /**
     * Forms a domain switched off in this environment (issue #296), comma-separated names, e.g.
     * "grid_draw,find_error" — the learning domain's practice forms (`ItemKind`): one that is off
     * is not in the schema the model is sent, and nothing new of it is stored
     * (`practice/setProfiles.ts` `profileFor`, `practice/items.ts` `formsOn`). Switching it on or
     * off is this variable, not a release. The domain checks the names when it registers
     * (`configCheck`, learning/config.ts): an unknown name stops the boot rather than switching
     * nothing.
     */
    FORMS_OFF: z
      .string()
      .optional()
      .transform(
        (raw): ReadonlySet<string> =>
          new Set(
            (raw ?? '')
              .split(',')
              .map((s) => s.trim())
              .filter((s) => s !== ''),
          ),
      ),
    /**
     * Push via Expo (ADR 0004 §4, amendment 2026-10-15): the owner closed the legal review on
     * 15.10.2026 (#677). Whether a message may reach her phone is still decided per learner in
     * code (opt-in, the parents' PIN under 16, quiet hours: `policy.ts`). `disabled` is the
     * operator's switch and is named at boot (`bootWarnings`).
     */
    PUSH_BACKEND: z.enum(['expo', 'disabled']).default('expo'),
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
  // Buddy's natural voice off means every reply is read with the phone's own voice — the
  // app sounds like a robot and nothing in it says so (issue #176, owner 01.10.: "alle
  // finden die abgehakte computerstimme gruselig"). The fallback is correct; being silent
  // about it was not.
  if (c.SPEECH_BACKEND !== 'google') {
    warnings.push(
      "SPEECH_BACKEND is not 'google': Buddy has no natural voice, so every reply is read with the phone's own",
    );
  }
  // Push off means nothing Buddy sends reaches her phone, even with contact on: it all waits in
  // the app (#677). Correct, but never silent.
  if (c.PUSH_BACKEND !== 'expo') {
    warnings.push(
      "PUSH_BACKEND is not 'expo': no message reaches the phone, everything Buddy sends waits in the app",
    );
  }
  return warnings;
}

/** Per-learner daily limits for model calls (cost and abuse bound). */
export const DAILY_LIMITS = {
  buddy_turn: 80,
  buddy_check: 8,
  tutor: 300,
  /**
   * The practice distress check (#747): a reserve of its own, so a long practice day that used up
   * the tutor's calls never leaves her words unread. Generous — one tiny call per answer in her
   * own words — and still a bound on abuse.
   */
  safeguard: 600,
  // The forms chosen before a run or a reading (#627) count with it, not on their own (callAhead).
  explain: 60,
  extraction: 12,
  /** Concept images (issue #50): one vision pass per reading, bounded like extraction. */
  figures: 12,
  pronounce: 200,
  transcribe: 400,
  hints: 60,
  /** "Anders erklären": a new explanation after an explanation or a solution. */
  reexplain: 60,
  /** Two to four sentences about a conversation that ended (issue #22); a handful a day. */
  summary: 12,
  /** Tidying up what Buddy knows (issue #20): one call per kind, once a day. */
  consolidate: 8,
  /**
   * Text embeddings for the hybrid material search (issue #23): indexing a sheet's
   * passages (one batched call per sheet) and embedding search queries (one per
   * search_material lookup or pre-injection). Cents per day even at the cap; when
   * it is reached the search runs as full text + trigram, never refuses.
   */
  embedding: 400,
} as const;

/**
 * What a domain checks of the configuration when it registers (issue #107): its own names in the
 * core's keys (FORMS_OFF). Each returns its issues as `KEY: message`; `createApp` stops the boot
 * on any, with the same words `loadConfig` uses.
 */
const checks: Array<(config: Config) => string[]> = [];

export function configCheck(check: (config: Config) => string[]): void {
  checks.push(check);
}

/** Stops the boot when a registered check finds the configuration wrong. */
export function checkConfig(config: Config): void {
  const issues = checks.flatMap((check) => check(config));
  if (issues.length > 0) throw new Error(`Invalid configuration: ${issues.join('; ')}`);
}
