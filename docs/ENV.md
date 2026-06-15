# ENV

All environment variables consumed by the LearnBuddy API and mobile
app. Canonical source: `apps/api/src/lib/env.ts` (Zod schema). This
doc mirrors that schema in human-readable form so you don't have to
read TypeScript to know what to put in your `.env.local` or in
Vercel's env settings.

If you change a default in the code, **update this table too**.
There is no auto-generation.

## How to set them

- **Local dev:** `apps/api/.env.local` (gitignored). Loaded by the
  dotenv side-effect at the top of every probe script and by
  `apps/api/src/lib/env.ts` when Hono boots.
- **Vercel production:** Settings → Environment Variables. Vercel
  injects them into `process.env` at cold start; the typed loader
  reads from there.
- **Tests:** vitest does NOT read `.env.local`. Tests inject env via
  `loadEnv({ ... })` in `apps/api/src/test/fake-supabase.ts`. Adding
  a new required env? Update `fake-supabase.ts` AND
  `dev-server-fake.ts` so dev + tests pass.

---

## API (`apps/api`)

### Required everywhere

| Var                         | Default | What it does                                                       |
| --------------------------- | ------- | ------------------------------------------------------------------ |
| `SUPABASE_URL`              | —       | Project URL, e.g. `https://abc.supabase.co`.                       |
| `SUPABASE_ANON_KEY`         | —       | Public anon key — used to verify JWTs server-side. ≥ 20 chars.     |
| `SUPABASE_SERVICE_ROLE_KEY` | —       | Bypass-RLS key for writes. **Never expose to mobile.** ≥ 20 chars. |

### Required for the live LLM / voice path (Vertex AI)

Set BOTH `GOOGLE_CLOUD_PROJECT` and ONE of the credential vars. Without these the gateways throw at boot in non-test environments.

| Var                                   | Default                 | What it does                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_CLOUD_PROJECT`                | —                       | GCP project id, e.g. `learnbuddy-496516`. Required for Vertex LLM, STT, TTS.                                                                                                                                                                                                                                                                                                          |
| `GOOGLE_VERTEX_LOCATION`              | `europe-west4`          | Vertex region. `europe-west4` (NL) and `europe-west3` (DE) are GDPR-OK.                                                                                                                                                                                                                                                                                                               |
| `GOOGLE_APPLICATION_CREDENTIALS`      | —                       | Path to the service-account JSON file. Used locally.                                                                                                                                                                                                                                                                                                                                  |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | —                       | The same JSON inline as a string. Vercel-friendly; bootstrap code writes it to a tempfile and sets `GOOGLE_APPLICATION_CREDENTIALS` at cold start.                                                                                                                                                                                                                                    |
| `LLM_BACKEND`                         | auto                    | `vertex` for real LLM, `fake` for tests / dev without GCP. Auto: `fake` when `NODE_ENV=test`, else `vertex`.                                                                                                                                                                                                                                                                          |
| `VOICE_BACKEND`                       | auto                    | Same shape — STT + TTS routing. Auto-default = `fake` in tests, `vertex` elsewhere.                                                                                                                                                                                                                                                                                                   |
| `VERTEX_MODEL_ID`                     | `gemini-2.5-flash-lite` | Text-only generation model (P2 regenerate, reflect). Accepts Gemini ids or Vertex partner ids like `deepseek-ai/deepseek-v3.2-maas` — partner ids route through the OpenAI-compatible endpoint automatically.                                                                                                                                                                         |
| `VISION_MODEL_ID`                     | `gemini-2.5-flash-lite` | Vision-only pin (P1 photos → items). Must be a multimodal Gemini id — partner MaaS models have no vision. We pin this separately so `VERTEX_MODEL_ID` can swing to DeepSeek without breaking extraction.                                                                                                                                                                              |
| `VERTEX_TUTOR_MODEL_ID`               | `gemini-2.5-flash`      | Model for the conversational tutor + explain calls. Accepts Gemini ids (`gemini-2.5-flash`, `gemini-2.5-pro`) or Vertex partner ids (`deepseek-ai/deepseek-v3.2-maas`). When set to a partner id, Gemini-specific cost levers (context caching, flash-lite trivial routing) are skipped — partner-native prefix caching kicks in instead. flash-lite is too weak to teach (ADR 0002). |
| `PARTNER_MODEL_LOCATION`              | `global`                | Region for Vertex partner MaaS models (DeepSeek, Llama, Mistral). DeepSeek V3.2 is currently only published on Vertex's `global` endpoint (404 in `europe-west4` / `us-central1`). **`global` does NOT guarantee EU data residency** — Google routes to whichever region has capacity, which may be US. For strict GDPR pin to a regional endpoint, but expect partner models to 404 until they're published regionally. Gemini calls keep using `GOOGLE_VERTEX_LOCATION` regardless. |
| `AGENT_PROMPT_VERSION`                | `v3.1`                  | Which tutor system prompt to send. `v3.1` is the production prompt (compressed, ~half the input cost of v3). Set to `v3` to fall back to the verbose v3 baseline; `v2` for the legacy quiz-bot. Does NOT toggle any other cost lever — flash-lite routing, history truncation, and conditional material context run for every version. See `docs/tutor-research/10-cost-levers.md`.   |

### Operational

| Var                         | Default                     | What it does                                                                                                        |
| --------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                  | `development`               | `development` / `test` / `production`. Affects auth path (test uses `signUp`), backend auto-selection, dev routes.  |
| `PUBLIC_APP_URL`            | `learnbuddy://`             | Deep-link base for emails.                                                                                          |
| `EMAIL_REDIRECT_URL`        | `learnbuddy://verify-email` | Target the email-confirmation link lands on.                                                                        |
| `DSGVO_CONSENT_VERSION`     | `2026-05-01`                | Bumping this requires every learner to re-consent.                                                                  |
| `ADMIN_ALLOWLIST_EMAILS`    | —                           | Comma-separated. JWT email must match an entry for `/admin/*` access.                                               |
| `API_CORS_ORIGINS`          | —                           | Comma-separated allow-list for browser CORS.                                                                        |
| `REVENUECAT_WEBHOOK_SECRET` | —                           | Shared secret on the RevenueCat webhook. Verified with `timingSafeEqual` — incorrect → 401.                         |
| `EXTRACTION_WORKER_SECRET`  | —                           | Shared secret pg_cron sends with `POST /materials/jobs/drain`. Drain is refused unless set AND matched. (ADR 0003.) |
| `ENABLE_DEV_ROUTES`         | `'false'`                   | Literal string `'true'` mounts `/dev/*` reset/seed routes. **Never set in production.**                             |
| `SENTRY_DSN`                | —                           | Optional. When set, the API installs the Sentry SDK.                                                                |
| `SENTRY_RELEASE`            | —                           | Optional. Release tag for grouping Sentry events.                                                                   |

### Cost / behaviour levers (no env knob — they just run)

These do NOT have env switches; they're either always-on for safety
or version-gated as a technical detail. Documented here so you don't
go hunting for a knob.

- **Implicit Gemini caching** — always-on (free Vertex feature).
- **Explicit Vertex caching** — always-on for `v3.1` prompt
  (cacheable static prefix exists). For `v2`/`v3` it's skipped
  because their builders don't expose a stable prefix.
- **flash-lite routing** for trivial-correct turns — always-on
  (every prompt version). See `agent.ts` `isLooseAnswerMatch`.
- **History truncation** (12 messages + current item's opener) —
  always-on.
- **Conditional material context** (only inject when tutoring) —
  always-on.

---

## Mobile (`apps/mobile`)

The mobile app reads at most two env vars, surfaced via
`apps/mobile/lib/env.ts`. They're set at build time by Expo / EAS
(or by `eas.json` profiles).

| Var                             | Default                 | What it does                                                                                              |
| ------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_API_URL`           | `http://localhost:6101` | Where the mobile fetches the API. In dev, your laptop's LAN IP. In production, the Vercel deployment URL. |
| `EXPO_PUBLIC_SUPABASE_URL`      | `SUPABASE_URL` mirror   | The Supabase project the mobile uses for auth (Supabase JS SDK).                                          |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | mirror of API           | Same anon key the API uses, but used here by Supabase JS for sign-in / refresh.                           |

That's it for mobile. No mobile-side feature flags — the API does the routing.

---

## Quick `.env.local` template (apps/api)

For a local dev setup pointing at real Vertex + Supabase:

```bash
# Required: Supabase
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>

# Required for Vertex (LLM + STT + TTS)
GOOGLE_CLOUD_PROJECT=learnbuddy-496516
GOOGLE_APPLICATION_CREDENTIALS=/Users/kurt/.config/learnbuddy/vertex-sa.json

# Optional (defaults are sensible)
NODE_ENV=development
ENABLE_DEV_ROUTES=true
ADMIN_ALLOWLIST_EMAILS=you@example.com
# AGENT_PROMPT_VERSION=v3.1     # default — only set to override
# VERTEX_TUTOR_MODEL_ID=gemini-2.5-flash  # default — only set to override
```

For tests, none of this is read — the test runner uses the
`fake-supabase.ts` env stub.

For Vercel production, mirror the required block above into Settings
→ Environment Variables. `GOOGLE_APPLICATION_CREDENTIALS_JSON`
replaces the file-path variant (paste the SA JSON as a single
multi-line value).
