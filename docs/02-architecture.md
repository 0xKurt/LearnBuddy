# 02 — Architecture

## System diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Mobile (Expo)                              │
│                                                                     │
│   UI (React Native + nativewind) ─┬─ Native ASR (SFSpeech /         │
│                                   │   Android SpeechRecognizer)     │
│                                   ├─ Native TTS (expo-speech)       │
│                                   ├─ Camera + quality scoring       │
│                                   ├─ Local DB (expo-sqlite, Drizzle)│
│                                   ├─ MathLite parser, mathjs        │
│                                   └─ Outbox sync queue              │
│                                  │                                  │
└──────────────────────────────────┼──────────────────────────────────┘
                                   │ HTTPS (Supabase JWT)
                                   │
┌──────────────────────────────────▼──────────────────────────────────┐
│                       API (Hono on Vercel, Node)                    │
│                                                                     │
│   /materials  /sessions  /attempts  /templates  /credits  /dsgvo   │
│        │              │               │             │              │
│        ▼              ▼               ▼             ▼              │
│   ┌───────────────────────────────────────────────────┐            │
│   │  LLM Gateway (single interface, four functions)    │  ─▶  Vertex│
│   │   visionExtractAndGenerate / regenerateFromText   │     AI EU  │
│   │   evaluateAnswer / explain                         │  (Gemini  │
│   └───────────────────────────────────────────────────┘  2.5 Flash-│
│        │                                                  Lite)    │
│        ├─ Credit ledger (atomic debit-then-settle)                  │
│        ├─ Image processor (sharp)                                   │
│        └─ Template validator (mathjs)                               │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Supabase (eu-central-1 / Frankfurt)                │
│                                                                     │
│   Postgres │ Auth │ Storage (materials-raw, study-assets)           │
│   pg_cron + Edge Functions (photo wipe, credit grant reconciliation)│
└─────────────────────────────────────────────────────────────────────┘

External: RevenueCat (subs) • PostHog EU (analytics) • Sentry (errors)
```

## Components

### Mobile app

- All UI, all i18n, all FSRS scheduling, all local evaluation, all practice variant generation.
- A complete SQLite mirror of the learner's data is kept on device for offline use: subjects, folders, materials, items, item states, attempts, problem templates, recent practice runs.
- A sync outbox handles writes made offline (see §3).
- Camera flow runs image quality checks locally (see doc 05).
- Voice input and output use native iOS/Android APIs; audio never leaves the device.
- LaTeX rendering via `react-native-katex` (a small WebView per formula); function plots via `victory-native`; SVG figures via `react-native-svg`.
- Math computation, constraint checking, practice variant generation use `mathjs`.

### API (Hono on Vercel, Node runtime)

- Stateless route handlers.
- Verifies Supabase JWT and resolves the account/learner context on each request.
- All LLM calls go through the LLM Gateway. Feature code never imports the Vertex SDK directly.
- All credit accounting is atomic — debit on success path before the LLM call, settle to actual cost afterward, refund on failure.
- Image post-processing (diagram label masking, numbered marker compositing) runs here with `sharp`.
- Streams long responses (vision pipeline progress, evaluation feedback) via Server-Sent Events.

The Node runtime is required (not Edge) because `sharp` needs native bindings and `mathjs` is heavier than typical Edge workloads. Vercel Fluid Compute is enabled to allow vision calls to run up to 300 s; in practice they finish in 5–15 s.

### Supabase

- **Postgres** in `eu-central-1`. All durable data. Row-Level Security on every table with `enable_row_level_security`. RLS policies scope reads/writes to the caller's account.
- **Auth.** Only account holders are auth users. Learner profiles are rows owned by the account. Magic link and email+password both enabled.
- **Storage.**
  - `materials-raw` (private bucket) — uploaded photos. Lifecycle: deleted by `pg_cron` job seven days after the material is marked `extraction_status = 'ready'`.
  - `study-assets` (private bucket) — derivative images (numbered diagrams, cropped graphs). No automatic deletion; lives until the account holder deletes the material.
- **Edge Functions.**
  - `photo-wipe` — runs hourly, deletes storage objects for materials past their `scheduled_photo_deletion_at`.
  - `credit-reconcile` — runs daily, catches RevenueCat webhook misses and applies monthly credit grants where due.
  - `dsgvo-export` — runs on request, assembles the account's data into a ZIP under a signed URL.
  - `dsgvo-delete` — runs after the 7-day cancel window, hard-deletes the account.
- **pg_cron** schedules the Edge Functions and runs the FSRS due-cache refresh.

### LLM Gateway

The single seam between feature code and the LLM provider. Located at `apps/api/lib/llm/`. Exposes exactly four functions:

```ts
type Locale = 'de' | 'en' | 'fr' | 'es' | 'it';

interface LLMGateway {
  visionExtractAndGenerate(input: {
    images: { mimeType: string; base64: string }[];
    locale: Locale;
    gradeLevel: number;        // 1..13
    subject: string;           // free text label
    subjectKind: SubjectKind;  // see doc 07
    targetCount: number;       // 1..25
  }): Promise<VisionResult>;

  regenerateFromText(input: {
    extractedMarkdown: string;
    locale: Locale;
    gradeLevel: number;
    subject: string;
    subjectKind: SubjectKind;
    targetCount: number;
    style?: 'simpler' | 'harder' | 'more-variety';
    excludeQuestions: string[];
  }): Promise<RegenerateResult>;

  evaluateAnswer(input: {
    question: string;
    expectedAnswer: string;
    acceptableAnswers: string[];
    answerKind: AnswerKind;
    latexExpected?: string;
    latexAcceptable?: string[];
    units?: string;
    kidAnswer: string;
    parsedKidLatex?: string;
    locale: Locale;
    gradeLevel: number;
    priorHints: string[];
  }): Promise<EvaluationResult>;

  explain(input: {
    topic: string;
    context?: string;
    locale: Locale;
    gradeLevel: number;
    style: 'simpler' | 'step-by-step' | 'analogy';
  }): Promise<ExplainResult>;
}
```

Every method returns a `creditCost` integer alongside its content. The gateway is the only place that knows token counts and translates them into credits.

The Vertex AI configuration is locked to `gemini-2.5-flash-lite` in `europe-west3`, paid tier (so the prompt content is not used for training). Safety filters are set to `BLOCK_MEDIUM_AND_ABOVE`. Generation config: temperature 0.4, top-p 0.95, max output tokens 2048.

## Data flow examples

### F1 — Photo to items

1. Mobile camera captures N photos. Each is scored: minimum 800 × 600 pre-resize; Laplacian-variance blur score ≥ 60; brightness mean in [50, 220]. Photos below threshold prompt the learner to retake but are not blocked.
2. Mobile resizes each photo to 1024 px longest side at JPEG quality 80, then `POST /materials/upload-url` to reserve signed PUT URLs.
3. Mobile uploads each photo directly to Supabase Storage.
4. Mobile `POST /materials` with metadata. The API:
   1. Atomically debits the estimated credit cost. On insufficient credits, returns 402.
   2. Inserts the material row with `extraction_status = 'pending'`.
   3. Calls `llm.visionExtractAndGenerate` (which reads the images via the signed URLs the API generates internally).
   4. Receives extracted Markdown, items, diagrams, problem templates.
   5. Runs the image processor for each diagram: crops, masks labels, draws numbered markers, writes a PNG into `study-assets`, inserts a `study_assets` row.
   6. Validates each problem template by sampling 5 random parameter sets against the constraints + solution expression with `mathjs`; templates with < 60 % feasibility are dropped.
   7. Inserts `items` rows, links any to `study_assets` and to `problem_templates`.
   8. Settles the credit debit to the actual cost.
   9. Schedules photo deletion in `outbox` for T+7 days.
   10. Returns the items and templates.
5. Mobile persists items and templates into the local SQLite mirror.

### F2 — Answering an item

1. Learner answers via voice (transcribed locally), text, or multiple-choice tap.
2. Mobile runs `localEvaluate(item, answer)`:
   - Multiple choice: exact index match.
   - Numeric: parse with `mathjs`, apply ±1 % tolerance, unit normalization.
   - Formula: run MathLite → LaTeX on learner's input, normalize both sides, compare to `latex_expected` and `latex_acceptable`.
   - Short / long: normalize (NFKC, lowercase, strip punctuation, ß↔ss), compare to `expected_answer` and `acceptable_answers`; require token-overlap ≥ 0.9 and length ≥ 70 % of reference.
   - Diagram label: same as short.
   - Fill-blank: per-blank exact match after normalization.
3. If `localEvaluate` returns `correct`, mobile records the attempt locally with `evaluated_by = 'local'` and advances. No network, no credits.
4. If it returns `unknown`, mobile streams `POST /attempts`. API calls `evaluateAnswer`, streams `verdict`, `feedback`, optional `nextHint`, and final `done` event with `credits_used`.
5. Mobile records the attempt, updates the FSRS state for the item, advances.

### F3 — Practice run

1. Learner taps "10 ähnliche Aufgaben üben" on a math item that has a linked `problem_template`.
2. Mobile reads the template from local DB. Generates 10 fresh variants in `apps/mobile/lib/practice/generate.ts` using `mathjs` for parameter sampling, constraint evaluation, solution computation, and stimulus parameter substitution.
3. Each variant is answered. The local evaluator handles all grading (numeric or formula via MathLite normalization). No LLM calls in a normal practice run.
4. Mobile records a `practice_runs` row at the end with the summary. Individual variants are never persisted.

### F4 — Offline session and reconnection

1. Mobile detects no network (connectivity probe; not just the OS state).
2. Study session proceeds with locally-cached items and locally-generated practice variants.
3. Attempts the local evaluator cannot decide are marked `verdict = 'pending'` and shown to the learner as "wartet auf Internet."
4. All writes (attempts, practice run summaries, FSRS state updates) go into the local `outbox` table tagged with operation type and payload.
5. On reconnect (probe succeeds), the sync engine drains the outbox in order:
   - `attempts_batch` — `POST /attempts/batch`
   - `pending_attempt_eval` — `POST /attempts` per item, awaiting verdict
   - `practice_run_summary` — `POST /templates/:id/practice-run`
6. Server is authoritative on conflicts. The merge policy is:
   - `attempts` is append-only — no conflict possible.
   - `item_state` (FSRS): the **server-recomputed** state from the replayed attempts wins. Mobile discards its locally-derived state and re-pulls.
   - `material`, `item`, `subject`, `folder`: server-only creation, mobile only modifies title/archive flags; LWW by `updated_at`.

## Repository layout

```
learning-app/
├── apps/
│   ├── mobile/                       # Expo app — see doc 05
│   └── api/                          # Hono on Vercel — see doc 06
├── packages/
│   ├── shared-types/                 # Zod schemas, TS types — see doc 03
│   └── shared-math/                  # MathLite parser, normalizer — see doc 07
├── docs/                             # these files
└── infra/
    ├── supabase/
    │   ├── migrations/               # SQL — see doc 03
    │   └── functions/                # Edge Functions — see this doc
    └── vercel.json
```

`pnpm` workspaces. Node 22. TypeScript strict mode everywhere.

## Hosting, secrets, environments

- Three environments: `local` (developer machines), `preview` (Vercel + Supabase preview projects, one per PR), `production` (single Vercel project + single Supabase project).
- Mobile builds: `EAS Build` profile per environment. `eas.json` ships with `development`, `preview`, `production` profiles.
- Secrets live in Vercel env vars (API side) and Supabase secrets (Edge Functions). The mobile app never holds an LLM key, never a service-role key. Only the Supabase anon key, the RevenueCat public key, the PostHog public key, the Sentry DSN.

## Observability

- **Sentry** captures crashes and unhandled errors on mobile and the API. Data scrubbing is configured to drop the fields named in doc 09. The Sentry release tag matches the EAS build number on mobile and the Vercel deployment SHA on the API.
- **PostHog EU** captures aggregate product usage events (session_started, material_captured, item_answered, practice_run_completed) with learner_id replaced by a hashed per-account pseudonym. No content, no answers.
- **API request logs** include `account_id`, `learner_id`, the route, the latency, and the credit delta. They live in Vercel's log drain to the standard Vercel log retention.

## Decisions that are final

These are picked. Do not reopen.

- **API framework: Hono.** No Next.js. The API has no web pages.
- **Mobile router: `expo-router`.** No React Navigation.
- **Validation: Zod, end-to-end.** Same schemas on mobile and API via `packages/shared-types`.
- **Math computation: `mathjs`.** The same package is used on mobile and API for parser parity. Heavier alternatives (Algebrite, Algebra.js) are not needed.
- **Math rendering: `react-native-katex`.** No MathJax.
- **Graphs: `victory-native`.** No `react-native-chart-kit`, no WebView-based libs.
- **Image processing: `sharp`.** No `jimp`, no canvas libraries.
- **Spaced repetition: `ts-fsrs`.** No SM-2 or other algorithms.
- **Subscriptions: RevenueCat.** Direct StoreKit / Play Billing integration is not done.
- **Local DB: SQLite via `expo-sqlite` + Drizzle.** No WatermelonDB.
- **Sync conflict policy: server-authoritative + append-only attempts.** No CRDTs.
- **Analytics: PostHog EU Cloud.** Self-hosted PostHog is not done.
- **No web app.** No admin web app. Admin is a single token-gated route on the API.
- **No premium voice provider.** Native TTS only.
- **No model routing.** Gemini 2.5 Flash-Lite handles all four gateway functions.
