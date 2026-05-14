# Learning Companion

An AI learning companion for school children. The learner photographs learning material (worksheets, notebook entries, book pages), the app generates study questions, and the learner practices through voice/text dialog with adaptive feedback and spaced repetition.

These documents are the complete specification of the system to be built. Each document is the canonical source for its concern. There is no phasing, no "later," no optional content — everything in these docs is in scope and must be built.

## How to read

The documents are written for coding agents. Each document is self-contained for its concern and cross-references other documents only when needed for context. Read in order on first pass; jump directly to a document when implementing one concern.

1. [`docs/01-product.md`](docs/01-product.md) — features, user journeys, pricing, brand
2. [`docs/02-architecture.md`](docs/02-architecture.md) — system design, components, data flow, repository layout
3. [`docs/03-data-model.md`](docs/03-data-model.md) — complete Postgres schema and shared types
4. [`docs/04-api.md`](docs/04-api.md) — complete HTTP API surface
5. [`docs/05-mobile.md`](docs/05-mobile.md) — mobile app: screens, components, sync, offline, notifications, onboarding, errors, i18n
6. [`docs/06-ai-pipeline.md`](docs/06-ai-pipeline.md) — LLM gateway, complete prompts, image processing, eval harness
7. [`docs/07-content-types.md`](docs/07-content-types.md) — subjects, answer kinds, stimuli, formulas, diagrams, problem templates
8. [`docs/08-cost-and-credits.md`](docs/08-cost-and-credits.md) — internal credit system and quotas
9. [`docs/09-privacy.md`](docs/09-privacy.md) — DSGVO, data lifecycle, parental consent, subprocessors
10. [`docs/10-implementation-order.md`](docs/10-implementation-order.md) — build sequence and verification criteria

## Working conventions

- **Code, comments, identifiers, schema, and prompts: English.** User-facing UI: German and English at launch; French, Spanish, Italian wired through i18n with translation files ready to fill.
- **Single LLM provider:** Gemini 2.5 Flash-Lite via Vertex AI in `europe-west3` (Frankfurt). The LLM Gateway interface (doc 06) is the only place that knows the provider.
- **Single database:** Supabase Postgres in `eu-central-1`. Row-Level Security on every table.
- **Single hosting target:** Vercel for the API, Supabase for data and storage, Expo EAS for mobile builds.
- **No web app, no admin web app.** Anything an administrator needs is a Vercel route protected by an env-controlled allowlist.

## Tech stack — final, no alternatives

| Concern | Choice |
|---|---|
| Mobile framework | React Native with Expo (managed workflow) |
| Mobile bundler | Metro (Expo default) |
| Mobile build & distribution | EAS Build, EAS Submit, EAS Update |
| Mobile router | `expo-router` (file-based) |
| Mobile styling | `nativewind` (Tailwind for React Native) |
| Mobile state | TanStack Query (server cache) + Zustand (UI) |
| Mobile local DB | `expo-sqlite` with Drizzle ORM |
| Mobile camera | `expo-camera` |
| Mobile image manipulation | `expo-image-manipulator` |
| Mobile voice input | `expo-speech-recognition` (native `SFSpeechRecognizer` / `SpeechRecognizer`) |
| Mobile voice output | `expo-speech` |
| Mobile notifications | `expo-notifications` (local notifications only) |
| Mobile math rendering | `react-native-katex` |
| Mobile math computation | `mathjs` |
| Mobile graphs | `victory-native` over `react-native-svg` |
| Mobile spaced repetition | `ts-fsrs` |
| Mobile subscriptions | `react-native-purchases` (RevenueCat SDK) |
| Mobile analytics | `posthog-react-native` (EU cloud) |
| Mobile errors | `@sentry/react-native` |
| Mobile i18n | `i18next` + `react-i18next` + `i18next-icu` |
| API framework | Hono on Node runtime, deployed to Vercel as route handlers |
| API validation | Zod |
| API auth | Supabase JWT verification |
| API LLM SDK | `@google-cloud/vertexai` |
| API image processing | `sharp` |
| API math (server-side validation) | `mathjs` |
| Database | Supabase Postgres (EU `eu-central-1`) |
| Auth | Supabase Auth (email + password, magic link) |
| Object storage | Supabase Storage |
| Background jobs | Supabase `pg_cron` + Supabase Edge Functions |
| LLM | Gemini 2.5 Flash-Lite via Vertex AI (`europe-west3`) |
| Subscription processor | RevenueCat |
| Analytics backend | PostHog Cloud EU |
| Error backend | Sentry (EU region) |

## Repository layout

```
learning-app/
├── apps/
│   ├── mobile/                       # Expo app
│   │   ├── app/                      # expo-router routes
│   │   ├── components/
│   │   ├── lib/
│   │   │   ├── db/                   # Drizzle schema, migrations, queries
│   │   │   ├── sync/                 # outbox, conflict resolution
│   │   │   ├── eval/                 # local answer evaluator
│   │   │   ├── fsrs/                 # spaced repetition wrapper
│   │   │   ├── math/                 # MathLite parser, function-plot eval
│   │   │   ├── practice/             # template-based variant generation
│   │   │   ├── camera/               # image quality scoring
│   │   │   └── i18n/
│   │   └── locales/
│   │       ├── de/                   # primary
│   │       ├── en/
│   │       ├── fr/
│   │       ├── es/
│   │       └── it/
│   └── api/                          # Hono on Vercel
│       ├── routes/
│       ├── lib/
│       │   ├── llm/                  # LLM Gateway + Vertex AI client
│       │   ├── credits/              # debit/settle/grant logic
│       │   ├── diagrams/             # sharp-based image processor
│       │   ├── math/                 # server-side MathLite parser, template validator
│       │   ├── db/                   # shared Drizzle schema
│       │   └── auth/
│       ├── prompts/                  # versioned prompt strings (build-time constants)
│       └── evals/                    # fixture-based evaluation harness
├── packages/
│   ├── shared-types/                 # Zod schemas shared mobile ↔ api
│   └── shared-math/                  # MathLite tokenizer/parser; same code mobile + api
├── docs/                             # these files
└── infra/
    ├── supabase/
    │   ├── migrations/               # SQL migrations
    │   └── functions/                # Edge Functions
    └── vercel.json
```

Mono-repo with `pnpm` workspaces.

## Core principles

1. **Cheap by default.** One LLM tier (Gemini 2.5 Flash-Lite) for all inference. Native on-device speech in and out. Practice variants generated client-side with no LLM calls.
2. **Local-first evaluation.** A learner's answer is checked locally first; the LLM is called only when the local check is uncertain.
3. **Offline-first.** Captured material requires network. Studying — including practice variants from problem templates and test mode — works fully offline. State syncs when network returns.
4. **Learner-first UX.** A nine-year-old uses the app without help.
5. **Account-holder-owned.** The account holder holds the account, gives DSGVO consent, pays, and can export or delete everything.
6. **EU-resident.** All durable data and inference live in EU regions. No US or non-EU paths in production.
7. **Provider-agnostic LLM layer.** Feature code calls four gateway functions and nothing else. Swapping the LLM is a single-file change.

## Glossary

- **Material** — A photographed source (one worksheet, one book page, one notebook entry) belonging to a subject.
- **Item** — One question with expected answer, derived from a material.
- **Stimulus** — Optional visual attached to an item: a study asset, a function plot, or an SVG figure. See doc 07.
- **Problem template** — A parameterized math problem with parameter ranges, constraints, and a solution expression. The learner generates infinite variants client-side. See doc 07.
- **Practice run** — A session of generated variants from one problem template.
- **Attempt** — One try at one item or one practice variant.
- **Session** — A continuous study run by the learner.
- **Subject / Folder** — Organizational containers under a learner.
- **Subject kind** — Enum (`math`, `physics`, `chemistry`, `biology`, …) that drives prompt branches and answer-kind defaults.
- **Study asset** — A derivative image (numbered diagram, cropped graph, rendered formula) that survives the photo-deletion lifecycle. See doc 07.
- **MathLite** — The natural typed-math syntax learners use. Parsed to LaTeX for display, evaluated with `mathjs` for computation. See doc 07.
- **Credit** — Internal unit of usage cost. Never user-facing. See doc 08.
- **Account** — The billing and data-ownership unit. Owned by one adult account holder; has exactly one learner profile.
