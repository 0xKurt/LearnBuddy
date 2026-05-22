// Typed env loader. Doc 02 §config.
//
// Fail-fast on missing required vars at boot. Tests inject overrides via
// `loadEnv({ ... })` rather than mutating `process.env`.

import { z } from 'zod';

export const Env = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  /** Used to build absolute deep-link URLs we send in emails. */
  PUBLIC_APP_URL: z.string().url().default('learnbuddy://'),
  /** Email confirmation redirect target — the universal/deep link the user lands on after tapping the email link. */
  EMAIL_REDIRECT_URL: z.string().url().default('learnbuddy://verify-email'),
  /** Current DSGVO consent version constant — bumped requires re-consent. */
  DSGVO_CONSENT_VERSION: z.string().default('2026-05-01'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // ── Vertex AI (Doc 06 §provider-configuration, Doc 09 EU-residency) ─────
  /** GCP project id, e.g. "learnbuddy-496516". Required when LLM_BACKEND='vertex'. */
  GOOGLE_CLOUD_PROJECT: z.string().optional(),
  /** Vertex region. europe-west4 (NL) and europe-west3 (DE) are GDPR-OK. */
  GOOGLE_VERTEX_LOCATION: z.string().default('europe-west4'),
  /** Path to the service-account JSON. The Google SDK reads this automatically. */
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  /** Same JSON inline (Vercel-friendly). Bootstrap code writes it to a
   *  tempfile and sets GOOGLE_APPLICATION_CREDENTIALS at cold start. */
  GOOGLE_APPLICATION_CREDENTIALS_JSON: z.string().optional(),
  /** Backend selector. 'fake' → tests + dev without GCP; 'vertex' → real LLM.
   *  Defaults to 'fake' when NODE_ENV=test, else 'vertex'. */
  LLM_BACKEND: z.enum(['vertex', 'fake']).optional(),
  /** STT + TTS backend selector. Same semantics as LLM_BACKEND — 'vertex'
   *  for the real GCP Speech-to-Text v2 + Text-to-Speech, 'fake' for the
   *  deterministic stubs used in tests / Expo Go dev. Defaults to 'fake'
   *  when NODE_ENV=test, else 'vertex'. */
  VOICE_BACKEND: z.enum(['vertex', 'fake']).optional(),
  /** Model id for batch/extraction (vision = P1, regenerate = P2). The
   *  vision call (P1) always uses a Gemini model since DeepSeek/Llama
   *  have no vision; this env applies to the text-only regenerate path
   *  too — when set to a partner model like `deepseek-ai/deepseek-v3.2-maas`,
   *  regenerate routes through the Vertex OpenAI-compatible endpoint.
   *  Vision sticks to VISION_MODEL_ID below. */
  VERTEX_MODEL_ID: z.string().default('gemini-2.5-flash-lite'),
  /** Vision-only override. P1 (photos → items) needs a multimodal model
   *  — DeepSeek and other partner MaaS models have no vision. We pin
   *  this independently so VERTEX_MODEL_ID can swing to DeepSeek without
   *  breaking the photo pipeline. Defaults to the same Gemini Lite tier
   *  VERTEX_MODEL_ID used before. */
  VISION_MODEL_ID: z.string().default('gemini-2.5-flash-lite'),
  /** Model for the learner-facing pedagogy calls (conversational tutor +
   *  explain). Accepts both Gemini ids (`gemini-2.5-flash`) and Vertex
   *  partner ids (`deepseek-ai/deepseek-v3.2-maas`). When a partner id
   *  is set, the gateway routes through the OpenAI-compatible Vertex
   *  endpoint and skips Gemini-specific levers (context caching,
   *  flash-lite trivial routing). Divergence from Doc 06 documented in
   *  ADR 0002. */
  VERTEX_TUTOR_MODEL_ID: z.string().default('gemini-2.5-flash'),
  /** Region for partner MaaS models (DeepSeek, Llama, Mistral). DeepSeek
   *  V3.2 is currently only published on Vertex's `global` endpoint —
   *  there's no `europe-west4` deployment as of 2026-05. The `global`
   *  endpoint does NOT guarantee EU data residency: Google routes the
   *  call to whichever region has capacity, which may be US. For strict
   *  GDPR data-residency, pin to a regional endpoint (e.g.
   *  `europe-west1`) — but expect 404 until partner models land there.
   *  Gemini calls keep using GOOGLE_VERTEX_LOCATION regardless. */
  PARTNER_MODEL_LOCATION: z.string().default('global'),
  /** Which tutor prompt to send to the LLM. Default `v3.1` is the
   *  production prompt (compressed v3, same behaviour at ~half the
   *  input-token cost). Set to 'v3' to fall back to the verbose v3
   *  prompt, 'v2' for the legacy quiz-bot prompt — both reachable
   *  without a redeploy for fast rollback. Does NOT toggle any other
   *  cost lever; flash-lite routing, history truncation, and
   *  conditional material context run for every version. */
  AGENT_PROMPT_VERSION: z.enum(['v2', 'v3', 'v3.1']).default('v3.1'),
  // ── Observability + ops ─────────────────────────────────────────────────
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_RELEASE: z.string().optional(),
  /** Comma-separated allow-list. Both layers of admin auth must agree:
   *  the request's JWT email must match an entry here. */
  ADMIN_ALLOWLIST_EMAILS: z.string().optional(),
  /** Comma-separated origin allow-list for browser-originated requests. */
  API_CORS_ORIGINS: z.string().optional(),
  /** RevenueCat webhook shared secret. Verified with timingSafeEqual. */
  REVENUECAT_WEBHOOK_SECRET: z.string().optional(),
  /** Shared secret the extraction worker / pg_cron sends to drive
   *  POST /materials/jobs/drain. Drain is refused unless this is set AND the
   *  request header matches it. ADR 0003. */
  EXTRACTION_WORKER_SECRET: z.string().optional(),
  /** Must be the literal string 'true' to mount /dev routes. Never set in production. */
  ENABLE_DEV_ROUTES: z.string().default('false'),
});

export type Env = z.infer<typeof Env>;

export function loadEnv(overrides?: Partial<Record<string, string>>): Env {
  const merged = { ...process.env, ...overrides };
  return Env.parse(merged);
}
