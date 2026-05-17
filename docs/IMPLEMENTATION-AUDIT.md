# LearnBuddy — Implementation Audit (vs USER-FLOWS v1+v2)

> **Stale — superseded by `docs/CODEBASE-AUDIT.md` (2026-05-17).** This file
> captures the 5-day-old skeleton state and is kept as a checkpoint for the
> early-build retrospective. Do not use it as ground truth — the API is no
> longer all 501s; migrations 0001–0012 are applied; FSRS-driven sessions,
> RevenueCat webhook, DSGVO export/delete, Vertex Gemini integration, and
> 7 of the 8 admin screens are real. See `CODEBASE-AUDIT.md` for the current
> picture.

Date: 2026-05-16
Auditor: Claude (subagent, repository read-only sweep)
Scope: every file under `apps/mobile`, `apps/api`, `packages/*`, `infra/supabase`.
Method: read every screen, route, library file, migration, and locale; cross-checked against the 23 v1 buckets in `docs/USER-FLOWS.md` and the 11 deep sections in `docs/USER-FLOWS-DEEP.md`.

## Status — overall verdict (blunt)

This is a **skeleton, not a product**. The repository contains a clean architectural scaffold — folder layout, route surface, type definitions, design tokens, a few real lib files (FSRS wrapper, local evaluator, MathLite parser) — but almost no flow from `USER-FLOWS.md` is wired end-to-end. The API has zero working routes: every handler returns HTTP 501 via `notImplemented()`. The auth middleware unconditionally throws `unauthenticated` ("JWT verification not implemented"). The LLM Gateway is a TypeScript interface with no implementation file. Every learner screen renders hardcoded `DEMO_*` data; signup/login/PIN/biometrics/camera/voice/RevenueCat/notifications/DSGVO/edge functions are all absent or placeholder copy. The Supabase migrations and shared-types are the most mature parts of the codebase. Realistic completion: roughly **5–8 % of the user-facing flow inventory**, **0 % of the backend behavior**. The repo is at the end of "Step ~11" of an implementation plan that the code itself references ("kommt in Schritt 14", "TODO(Step 17)", "Step 12 acceptance work"). Nothing about this is shippable.

---

## TL;DR scoreboard (v1 buckets, 23 total)

| #   | Bucket                              | Done | Partial / stub | Missing | Coverage |
| --- | ----------------------------------- | ---- | -------------- | ------- | -------- |
| 1   | First-run / install                 | 1    | 1              | 4       | ~15 %    |
| 2   | Account creation & auth             | 0    | 3              | 8       | ~5 %     |
| 3   | Learner profile creation & mgmt     | 0    | 2              | 9       | ~5 %     |
| 4   | Capturing material                  | 0    | 1              | 10      | ~2 %     |
| 5   | Organizing material                 | 0    | 1              | 12      | ~3 %     |
| 6   | AI generation                       | 0    | 0              | 9       | 0 %      |
| 7   | Studying / practicing               | 0    | 2              | 14      | ~5 %     |
| 8   | Adaptive review (FSRS)              | 1    | 1              | 4       | ~25 %    |
| 9   | Voice & ASR                         | 0    | 0              | 8       | 0 %      |
| 10  | Math & formula                      | 1    | 1              | 5       | ~25 %    |
| 11  | Subscription & credits              | 0    | 0              | 9       | 0 %      |
| 12  | Privacy / DSGVO                     | 0    | 1              | 11      | ~3 %     |
| 13  | Admin surface                       | 0    | 2              | 14      | ~5 %     |
| 14  | Notifications                       | 0    | 0              | 8       | 0 %      |
| 15  | Errors & offline                    | 1    | 2              | 8       | ~15 %    |
| 16  | Account holder + minor flows        | 0    | 1              | 7       | ~5 %     |
| 17  | Edge cases                          | 0    | 0              | 12      | 0 %      |
| 18  | Onboarding tutorials / empty states | 0    | 1              | 7       | ~5 %     |
| 19  | Search / discovery                  | 0    | 0              | 5       | 0 %      |
| 20  | Cross-cutting micro-flows           | 0    | 0              | 10      | 0 %      |
| 21  | Header / chrome / nav               | 1    | 1              | 4       | ~20 %    |
| 22  | Internationalization                | 0    | 1              | 4       | ~10 %    |
| 23  | Observability touchpoints           | n/a  | n/a            | n/a     | n/a      |

**Rough weighted total coverage: ~5–8 %.** Heavy mass in buckets 6 (AI), 9 (Voice), 11 (Subscription), 14 (Notifications), 17 (Edge cases), 20 (Cross-cutting) which are 0 %.

---

## Codebase inventory

### apps/mobile/app (expo-router screens, 27 files)

| File                                     | LOC | Verdict           | Notes                                                                                                                                                            |
| ---------------------------------------- | --- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `_layout.tsx`                            | 34  | OK                | Stack provider, react-query, gesture root, status bar.                                                                                                           |
| `index.tsx`                              | 8   | Stub              | Always redirects to `(onboarding)/welcome` — no auth/account check. Comment admits: "Production checks the account row via GET /account and routes accordingly." |
| `login.tsx`                              | 14  | Placeholder       | Renders only the title and "Doc 05 §login — pending implementation."                                                                                             |
| `reset-password.tsx`                     | 14  | Placeholder       | "Pending implementation."                                                                                                                                        |
| `(onboarding)/_layout.tsx`               | 13  | OK                | Stack.                                                                                                                                                           |
| `(onboarding)/welcome.tsx`               | 41  | UI shell          | Wires to age-check; no analytics, no consent-version check.                                                                                                      |
| `(onboarding)/age-check.tsx`             | 76  | Partial           | Year grid (only 12 of 20 years visible); routes <16 → hand-off-to-adult, ≥16 → signup. No persistence, no minimum-age error path.                                |
| `(onboarding)/hand-off-to-adult.tsx`     | 66  | UI shell          | Static copy, button loops back to age-check.                                                                                                                     |
| `(onboarding)/account-signup.tsx`        | 56  | UI shell          | Form does **not** call any API; "Weiter" goes to verify-email regardless of input.                                                                               |
| `(onboarding)/verify-email.tsx`          | 33  | Placeholder       | No deep-link handler, no polling.                                                                                                                                |
| `(onboarding)/consent.tsx`               | 61  | UI shell          | Two checkboxes; no version persisted, no API call.                                                                                                               |
| `(onboarding)/who-uses.tsx`              | 39  | UI shell          | Branch on `?for=self                                                                                                                                             | child`. |
| `(onboarding)/add-profile.tsx`           | 43  | UI shell          | Single name input; no validation, no API.                                                                                                                        |
| `(onboarding)/profile-minor-consent.tsx` | 26  | UI shell          | Single checkbox, no copy of actual DSGVO summary.                                                                                                                |
| `(onboarding)/pin-setup.tsx`             | 44  | Placeholder       | Both buttons go to hand-off — neither actually sets a PIN nor calls `expo-secure-store` nor invokes Face ID.                                                     |
| `(onboarding)/hand-off.tsx`              | 39  | UI shell          | "✨" + replace to learner home.                                                                                                                                  |
| `(learner)/_layout.tsx`                  | 36  | OK                | BottomNav routing; "profile" tab routes to `(admin)/unlock`.                                                                                                     |
| `(learner)/home.tsx`                     | 136 | Stub w/ demo data | Hardcoded `DEMO_SUBJECTS` array. Add-subject button has empty `onPress={() => {}}`. No data fetching.                                                            |
| `(learner)/capture.tsx`                  | 18  | Placeholder       | Literal text "expo-camera viewfinder + live blur/brightness chips kommen in Schritt 14." Zero camera code.                                                       |
| `(learner)/result.tsx`                   | 115 | Stub w/ demo data | Hardcoded `STATS` and chips. No real session-result wiring.                                                                                                      |
| `(learner)/session/[sessionId].tsx`      | 156 | Stub w/ demo data | Hardcoded "2x + 7 = 15", fake "Mathe-Tastatur" string append, "erkannt" chip is static. No real MathInput, no real evaluator call, no FSRS write.                |
| `(learner)/subject/[subjectId].tsx`      | 198 | Stub w/ demo data | Hardcoded `DEMO_FOLDERS`, `DEMO_MATERIALS`. Ordner/Material tabs work visually; nothing fetched.                                                                 |
| `(learner)/folder/[folderId].tsx`        | 15  | Placeholder       | Renders the ID only.                                                                                                                                             |
| `(learner)/material/[materialId].tsx`    | 15  | Placeholder       | Renders the ID only.                                                                                                                                             |
| `(learner)/practice/[templateId].tsx`    | 15  | Placeholder       | Renders the ID only.                                                                                                                                             |
| `(admin)/_layout.tsx`                    | 13  | OK                | Empty Stack.                                                                                                                                                     |
| `(admin)/overview.tsx`                   | 22  | Placeholder       | "Doc 05 §overview — pending implementation."                                                                                                                     |
| `(admin)/unlock.tsx`                     | 40  | Placeholder       | "Mit Face ID entsperren" goes straight to overview — no actual biometric prompt, no PIN entry.                                                                   |

**Missing screens per 05-mobile §Admin surface:**

- `(admin)/profile/[profileId].tsx`
- `(admin)/profile/[profileId]/edit.tsx`
- `(admin)/profile/[profileId]/notifications.tsx`
- `(admin)/archived.tsx`
- `(admin)/settings/account.tsx`
- `(admin)/settings/privacy.tsx`
- `(admin)/subscription.tsx`
- `(admin)/data.tsx`

That's **8 of 10 admin screens completely absent.**

### apps/mobile/components/lb (13 files)

All thirteen are real UI atoms, mostly 20–65 LOC. Pure presentational, no business logic.

| File                | LOC | Notes                 |
| ------------------- | --- | --------------------- |
| `Avatar.tsx`        | 36  | Initials + tone bg.   |
| `Banner.tsx`        | 31  | Toned banner.         |
| `BottomNav.tsx`     | 65  | 4-tab bar.            |
| `Btn.tsx`           | 61  | 5 variants × 3 sizes. |
| `Card.tsx`          | 41  | Toned card.           |
| `Chip.tsx`          | 31  | Toned chip.           |
| `CircleBtn.tsx`     | 30  | Icon button.          |
| `EmptyState.tsx`    | 66  | Glyph + title + body. |
| `Icon.tsx`          | 164 | Inline SVG icon set.  |
| `Progress.tsx`      | 26  | Progress bar.         |
| `SessionTopBar.tsx` | 48  | Progress + exit.      |
| `SubjectGlyph.tsx`  | 21  | Emoji glyph circle.   |
| `index.ts`          | 13  | Barrel.               |

**Missing components per 05-mobile §Key components (every one of them):**

- `<LatexText>` — required for question/feedback rendering.
- `<MathInput>` — required for formula/numeric answer mode.
- `<MathKeyboard>` — soft keyboard with MEHR layer.
- `<FunctionPlot>` — victory-native graph stimulus.
- `<SvgStimulus>` — runtime SVG whitelist render.
- `<DiagramQuestion>` — pinch-zoom asset + highlight ring.
- `<VoiceButton>` — ASR control with live transcript.
- `<FillBlank>` — inline input chain.

The fake `KEYS` grid inside `session/[sessionId].tsx` is a static visual mockup, not `<MathKeyboard>`.

### apps/mobile/lib (10 files)

| File                   | LOC | Verdict                                                                                                                                                                                                                                                                                                                      |
| ---------------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db/index.ts`          | 17  | OK — lazy Drizzle opener. No migration runner.                                                                                                                                                                                                                                                                               |
| `db/schema.ts`         | 62  | Partial — only 5 tables (learners, subjects, folders, outbox_local, sync_state). Missing materials, items, item_states, sessions, attempts, study_assets, problem_templates, practice_runs. Comment admits: "Skeleton: minimum tables needed for the learner surface to boot. Full mirror lands in Step 12 acceptance work." |
| `eval/local.ts`        | 170 | Real — covers all 6 `answer_kind` branches (mc, numeric, formula via MathLite canon, short/diagram_label via normalized token overlap, long, fill_blank). No tests for it locally.                                                                                                                                           |
| `fsrs/index.ts`        | 95  | Real — ts-fsrs wrapper, verdict→Rating mapping, `pickDueItems` with due-first sort. No "Klassenarbeit folder bias" logic despite comment claiming it.                                                                                                                                                                        |
| `i18n/index.ts`        | 33  | Partial — only de + en wired; no fr/es/it; no `learner`/`admin`/`errors`/`legal` namespaces.                                                                                                                                                                                                                                 |
| `legal/consent.ts`     | 4   | Stub — single exported constant `CONSENT_VERSION = '2026-01'`. No version comparison, no "did user accept this version?" check.                                                                                                                                                                                              |
| `store/index.ts`       | 15  | Stub — single Zustand store with active_learner_id only.                                                                                                                                                                                                                                                                     |
| `sync/connectivity.ts` | 21  | Real — HEAD-ish fetch to /health with timeout.                                                                                                                                                                                                                                                                               |
| `sync/outbox.ts`       | 100 | Partial stub — enqueue/pending implemented; `drain()` marks rows done without calling any API. Comment: "TODO(Step 17): dispatch to per-kind handler. For the skeleton we mark items done so the outbox doesn't grow during dev." That's worse than a stub — it silently discards work.                                      |
| `theme/colors.ts`      | 66  | Real — pastel palette, tone maps.                                                                                                                                                                                                                                                                                            |

**Missing lib modules per docs:**

- `lib/asr/` (or `lib/voice/`) — no ASR/SpeechRecognition wrapper anywhere.
- `lib/tts/` — no `expo-speech` wrapper.
- `lib/notifications/` — no scheduler.
- `lib/iap/` or `lib/purchases/` — no RevenueCat wrapper.
- `lib/camera/` and `lib/quality.ts` — no blur/brightness/edge scorer.
- `lib/sentry.ts`, `lib/posthog.ts` — neither dep is initialized anywhere despite being in package.json.
- `lib/sync/handlers.ts` — referenced as TODO in outbox.ts, does not exist.
- `lib/auth/` / Supabase client wrapper.
- `lib/api.ts` — there is no HTTP client wrapping fetch with auth headers.

### apps/api/src (15 files)

| File                       | LOC                | Verdict                                                                                                                                                       |
| -------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app.ts`                   | 58                 | OK — Hono composition, `/health` works, all routes mounted.                                                                                                   |
| `dev-server.ts`            | 8                  | OK — node-server.                                                                                                                                             |
| `api/[[...slug]].ts`       | (Vercel entry, 13) | OK — Hono Vercel adapter.                                                                                                                                     |
| `lib/errors.ts`            | 66                 | OK — ApiError class, 14 error codes mapped to HTTP, `notImplemented()` helper.                                                                                |
| `lib/llm/gateway.ts`       | 89                 | Skeleton — **interface only**, no `vertex.ts` implementation. Comment: "Implementations belong in apps/api/src/lib/llm/vertex.ts" — that file does not exist. |
| `middleware/auth.ts`       | 49                 | Stub that always throws — `requireAuth` unconditionally throws `unauthenticated` ("JWT verification not implemented"). Comment is honest about it.            |
| `middleware/error.ts`      | 15                 | OK.                                                                                                                                                           |
| `middleware/rate-limit.ts` | 30                 | Partial — in-memory Map (per docs should be Postgres-backed). Will not survive serverless cold start.                                                         |
| `routes/account.ts`        | 9                  | All 2 endpoints → 501.                                                                                                                                        |
| `routes/admin.ts`          | 16                 | Allowlist check works; `/spend` → 501.                                                                                                                        |
| `routes/attempts.ts`       | 23                 | All 3 endpoints → 501. (POST /, POST /batch, POST /:client_id/finalize)                                                                                       |
| `routes/auth.ts`           | 7                  | Both endpoints → 501. (signup, consent)                                                                                                                       |
| `routes/dsgvo.ts`          | 11                 | All 4 endpoints → 501.                                                                                                                                        |
| `routes/explain.ts`        | 13                 | → 501.                                                                                                                                                        |
| `routes/folders.ts`        | 9                  | Both → 501.                                                                                                                                                   |
| `routes/items.ts`          | 8                  | → 501.                                                                                                                                                        |
| `routes/learners.ts`       | 17                 | All 6 endpoints → 501.                                                                                                                                        |
| `routes/materials.ts`      | 28                 | All 8 endpoints → 501.                                                                                                                                        |
| `routes/render.ts`         | 10                 | → 501 (but Cache-Control header is correct).                                                                                                                  |
| `routes/sessions.ts`       | 13                 | → 501.                                                                                                                                                        |
| `routes/subjects.ts`       | 11                 | All 4 endpoints → 501.                                                                                                                                        |
| `routes/templates.ts`      | 19                 | All 3 endpoints → 501.                                                                                                                                        |
| `routes/webhooks.ts`       | 7                  | → 501.                                                                                                                                                        |

**Total functional endpoints in the API: exactly one** (`GET /health`). Every domain endpoint returns 501 not-implemented.

### packages/shared-types (15 source files)

All real Zod schemas, well-structured. ~800 lines across the package. Mature.

| File              | LOC |
| ----------------- | --- |
| `enums.ts`        | 98  |
| `account.ts`      | 42  |
| `learner.ts`      | 51  |
| `subject.ts`      | 33  |
| `folder.ts`       | 24  |
| `material.ts`     | 80  |
| `item.ts`         | 150 |
| `attempt.ts`      | 68  |
| `session.ts`      | 28  |
| `template.ts`     | 82  |
| `credits.ts`      | 53  |
| `subscription.ts` | 14  |
| `study-asset.ts`  | 35  |
| `error.ts`        | 28  |
| `index.ts`        | 16  |

Note: `Locale` enum claims `'de'|'en'|'fr'|'es'|'it'` — but the mobile bundles only de + en JSON. Mobile crashes (or falls back) if a learner record arrives with fr/es/it.

### packages/shared-math (7 source files + 2 test files)

| File                              | LOC | Verdict                                |
| --------------------------------- | --- | -------------------------------------- |
| `mathlite.ts`                     | 654 | Real, substantial parser.              |
| `normalize.ts`                    | 73  | Real.                                  |
| `numeric-input.ts`                | 75  | Real.                                  |
| `units.ts`                        | 85  | Real.                                  |
| `index.ts`                        | 6   | Barrel.                                |
| `__tests__/mathlite.test.ts`      | 65  | Only test file with mathlite coverage. |
| `__tests__/numeric-input.test.ts` | 48  | Numeric-input coverage.                |

**Only tested package in the entire monorepo.** No tests for `lib/eval/local.ts`, no tests for `lib/fsrs/index.ts`, no API tests, no screen tests.

### infra/supabase/migrations (8 files + .gitkeep)

| File                       | LOC | Notes                                                                     |
| -------------------------- | --- | ------------------------------------------------------------------------- |
| `0001_identity.sql`        | 71  | `accounts`, `learners`, RLS, pgcrypto.                                    |
| `0002_organization.sql`    | 78  | `subjects`, `folders`, RLS, subject_kind check.                           |
| `0003_materials_items.sql` | 180 | `materials`, `material_photos`, `study_assets`, `items`, all enums + RLS. |
| `0004_templates_runs.sql`  | 80  | `problem_templates`, `practice_runs`, RLS.                                |
| `0005_fsrs_sessions.sql`   | 101 | `item_states`, `sessions`, `attempts`, RLS.                               |
| `0006_credits_billing.sql` | 69  | `credit_buckets`, `credit_events`, `subscriptions`, read-only RLS.        |
| `0007_ops_dsgvo.sql`       | 35  | `outbox`, `dsgvo_requests`, service-only.                                 |
| `0008_storage_buckets.sql` | 40  | `materials-raw`, `study-assets` buckets + RLS.                            |

Migrations are the **healthiest part of the repo**. However: no migration for `subscription_history` (doc 03 mentions it), no pg_cron jobs for photo wipe, no reconciliation cron defined as SQL.

### infra/supabase/functions

**Empty.** Only a `.gitkeep`. Per the docs the following Edge Functions are expected:

- `photo-wipe` — DSGVO 7-day photo deletion.
- `reconciliation-cron` — RevenueCat ↔ subscriptions reconcile.
- `dsgvo-export` — produce export tarball.
- `dsgvo-delete` — soft-delete then hard-delete after grace.
- `fsrs-recompute` — server-authoritative scheduling.
- `outbox-drain` — server outbox worker.

None present. Zero Deno code.

### apps/mobile/locales (4 files)

Only `de/common.json`, `de/onboarding.json`, `en/common.json`, `en/onboarding.json`. **No** `learner`, `admin`, `errors`, or `legal` namespaces (05-mobile §i18n lists all five required). **No** fr/es/it directories, despite `Locale` enum.

---

## Bucket-by-bucket coverage

### 1. First-run / install (USER-FLOWS §1)

- 1.1 Cold launch on welcome — **OK** (`app/index.tsx` + `(onboarding)/welcome.tsx`).
- 1.2 Resume in the middle of onboarding — **Missing**. `app/index.tsx` always redirects to welcome; no persistence of `onboarding_step`.
- 1.3 Welcome screen → CTA — **OK**.
- 1.4 Skip option to login — **Missing**. No "Already have an account?" affordance on welcome.
- 1.5 Re-launch after install completes — **Missing**. Same redirect behavior.
- 1.6 App update with new consent version — **Missing**. `lib/legal/consent.ts` is one constant; no compare against stored value.

### 2. Account creation & authentication (§2)

- 2.1 Adult-only age gate — **Partial** (`age-check.tsx` branches but no telemetry, no minimum-year bound on the picker).
- 2.2 Under-16 hand-off-to-adult — **Partial** (screen exists; loops back to age-check; no link to "Open on parent device").
- 2.3 Email + password signup — **Stub** (UI only; no `POST /auth/account/signup` call; the endpoint is 501 anyway).
- 2.4 Email verification — **Missing** (no deep-link handler, no polling, no resend).
- 2.5 Login — **Missing** (`login.tsx` is a placeholder).
- 2.6 Forgot password / reset — **Missing** (`reset-password.tsx` placeholder).
- 2.7 OAuth (Apple/Google) — **Missing** (not mentioned in code at all).
- 2.8 Sign-out — **Missing**.
- 2.9 Re-auth after token expiry — **Missing**.
- 2.10 Account deletion — **Missing** (DSGVO route is 501).
- 2.11 Session timeout / app-locked re-prompt — **Missing**.

### 3. Learner profile creation & management (§3)

- 3.1 Solo adult profile creation — **Stub** (`add-profile.tsx` UI only).
- 3.2 Minor profile creation with consent — **Stub**.
- 3.3 Multiple profiles on one account — **Missing**.
- 3.4 Switch active profile — **Missing** (Zustand store has the field but no UI).
- 3.5 Edit profile — **Missing** (`(admin)/profile/[profileId]/edit.tsx` does not exist).
- 3.6 Archive / restore profile — **Missing**.
- 3.7 Grade-level setting — **Missing**.
- 3.8 ui_locale per profile — **Missing**.
- 3.9 Avatar choice — **Missing**.
- 3.10 Display name change — **Missing**.
- 3.11 First-time profile coach marks — **Missing**.

### 4. Capturing material (§4)

- 4.1 Open camera from home — Route exists, screen is a literal "kommt in Schritt 14" placeholder.
- 4.2 Quality scoring (blur/brightness/glare) — **Missing**. `lib/quality.ts` does not exist.
- 4.3 Live capture chips ("zu nah", "zu unscharf") — **Missing**.
- 4.4 Multi-page capture — **Missing**.
- 4.5 Re-shoot — **Missing**.
- 4.6 Album import — **Missing**.
- 4.7 OCR preview pre-extraction — **Missing**.
- 4.8 Permission denied path — **Missing** (no permission requests at all).
- 4.9 Camera permission rationale copy per age — **Missing**.
- 4.10 Upload progress / SSE listening — **Missing**.
- 4.11 Capture → upload-URL → POST /materials — **Missing** (endpoints 501).

### 5. Organizing material (§5)

- 5.1 Subjects list — **Stub** (DEMO_SUBJECTS in `home.tsx`).
- 5.2 Add subject — Tile present, `onPress={() => {}}`.
- 5.3 Edit subject — **Missing**.
- 5.4 Archive subject — **Missing**.
- 5.5 Folders inside subject — **Stub** (DEMO_FOLDERS).
- 5.6 Create folder with `scheduled_for` ("Klassenarbeit") — **Missing**.
- 5.7 Move material between folders — **Missing**.
- 5.8 Long-press context menu — **Missing**.
- 5.9 Material drill-in — **Placeholder** (15-line shell).
- 5.10 Material rename — **Missing**.
- 5.11 Material delete / archive — **Missing**.
- 5.12 Bulk operations — **Missing**.
- 5.13 Reordering — **Missing**.

### 6. AI generation (§6) — **0 %**

- 6.1 Vision extract + items + templates — **Missing** (gateway interface only; no Vertex client).
- 6.2 Regenerate items — **Missing**.
- 6.3 Regeneration styles (simpler/harder/variety) — Type exists; route 501.
- 6.4 Non-educational rejection — **Missing**.
- 6.5 Safety blocking — **Missing**.
- 6.6 Diagram detection + labels — **Missing**.
- 6.7 Locale detection — **Missing**.
- 6.8 Credit cost reporting — **Missing**.
- 6.9 SSE streaming progress — **Missing**.

### 7. Studying / practicing (§7)

- 7.1 Start session — **Stub** (`session/[sessionId].tsx` renders hardcoded "2x + 7 = 15"). `POST /sessions` is 501.
- 7.2 Question display (text, math, stimulus) — **Stub** for text only; no math/stimulus components exist.
- 7.3 Answer input — multiple_choice — **Missing**.
- 7.4 Answer input — numeric — **Missing** (no `<MathInput>`).
- 7.5 Answer input — formula — **Missing**.
- 7.6 Answer input — short/long — **Missing**.
- 7.7 Answer input — diagram_label — **Missing**.
- 7.8 Answer input — fill_blank — **Missing**.
- 7.9 Voice answer — **Missing**.
- 7.10 Submit attempt — local evaluator wired? **No.** `lib/eval/local.ts` exists but is not called from any screen.
- 7.11 LLM evaluation via SSE — **Missing** (route 501).
- 7.12 Feedback rendering — **Missing**.
- 7.13 Skip — **Missing**.
- 7.14 Hint chain — **Missing**.
- 7.15 Exit session early — Button exists, no persistence.
- 7.16 Session result — **Stub** with demo numbers.

### 8. Adaptive review / FSRS (§8) — best-covered bucket

- 8.1 FSRS scheduling — **OK** (`lib/fsrs/index.ts` real wrapper). Not yet invoked from any screen.
- 8.2 Verdict → Rating map — **OK**.
- 8.3 Server-authoritative recompute — **Missing** (no Edge Function).
- 8.4 Mastery score — Function exists locally; never persisted to server.
- 8.5 Schedule summary (home pill, upcoming items) — **Missing** (GET /learners/:id/schedule-summary is 501).
- 8.6 Folder bias for `scheduled_for` — **Missing** (`pickDueItems` claims to bias but does not).

### 9. Voice & ASR (§9) — **0 %**

- 9.1 Microphone permission + rationale — **Missing**.
- 9.2 Push-to-talk button — **Missing** (`<VoiceButton>` not implemented).
- 9.3 VAD auto-stop — **Missing**.
- 9.4 Live transcript — **Missing**.
- 9.5 Tip-of-tongue helper — **Missing** (DEEP §2).
- 9.6 Wrong-language detection — **Missing**.
- 9.7 Voice + math input — **Missing**.
- 9.8 Voice + multiple choice — **Missing**.

`expo-speech` and `react-native-purchases` are in dependencies, but no file imports them.

### 10. Math & formula (§10)

- 10.1 MathLite parser — **OK** (`shared-math/mathlite.ts`, 654 LOC, tested).
- 10.2 Numeric-input parsing — **OK** (`numeric-input.ts`, tested).
- 10.3 Formula canonicalization — **OK** (`canonicalizeFormula`).
- 10.4 Local formula evaluation — **OK** (`lib/eval/local.ts`).
- 10.5 `<MathInput>` UI — **Missing**.
- 10.6 `<MathKeyboard>` UI — **Missing** (static mock-up only).
- 10.7 `<LatexText>` rendering — **Missing** (no KaTeX or react-native-katex usage).

### 11. Subscription & credits (§11) — **0 %**

- 11.1 Trial onboarding — **Missing**.
- 11.2 Tier display in admin — **Missing**.
- 11.3 Credit summary screen — **Missing** (`/account/credits/summary` is 501).
- 11.4 Insufficient-credits CTA — **Missing**.
- 11.5 Subscription purchase via RevenueCat — **Missing** (`react-native-purchases` installed, not imported anywhere).
- 11.6 Restore purchase — **Missing**.
- 11.7 Cancel-in-grace flow — **Missing**.
- 11.8 RevenueCat webhook — **Missing** (`/webhooks/revenuecat` → 501).
- 11.9 Reconciliation cron — **Missing** (no Edge Function).

### 12. Privacy / DSGVO (§12)

- 12.1 Consent screen — **Stub** UI only.
- 12.2 Consent version pinning — **Missing**.
- 12.3 Photo retention 7 days — **Missing** (no `photo-wipe` Edge Function).
- 12.4 DSGVO export request — **Missing** (route 501; no polling UI).
- 12.5 DSGVO export download — **Missing**.
- 12.6 Account deletion with 30-day grace — **Missing**.
- 12.7 Cancel deletion — **Missing**.
- 12.8 Privacy summary surface — **Missing** (no `(admin)/settings/privacy.tsx`).
- 12.9 Data-out per profile — **Missing**.
- 12.10 EU residency notice surface — **Missing**.
- 12.11 Audit log / data view — **Missing**.

### 13. Admin surface (§13)

- 13.1 Unlock screen — **Placeholder** (button bypasses Face ID).
- 13.2 Overview — **Placeholder** ("pending implementation").
- 13.3 Profile drill-in — **Missing** (screen not present).
- 13.4 Profile edit — **Missing**.
- 13.5 Profile notifications — **Missing**.
- 13.6 Archived items — **Missing**.
- 13.7 Account settings — **Missing**.
- 13.8 Privacy settings — **Missing**.
- 13.9 Subscription screen — **Missing**.
- 13.10 Data screen — **Missing**.
- 13.11 Admin spend (admin allowlist) — **Stub** (allowlist middleware works; `/spend` → 501).
- 13.12 Switch profile from admin — **Missing**.
- 13.13 Add/remove learner — **Missing**.
- 13.14 Hand-back to learner — **Missing**.
- 13.15 Lock admin on background — **Missing**.
- 13.16 Admin re-lock timeout — **Missing**.

### 14. Notifications (§14) — **0 %**

- 14.1 Permission request just-in-time — **Missing**.
- 14.2 Daily reminder — **Missing**.
- 14.3 Test-date reminder — **Missing**.
- 14.4 Streak-keep reminder — **Missing**.
- 14.5 Material ready notification — **Missing**.
- 14.6 DSGVO export ready — **Missing**.
- 14.7 Per-category opt-in — **Missing**.
- 14.8 Quiet hours — **Missing**.

`expo-notifications` is in deps; nothing imports it.

### 15. Errors & offline (§15)

- 15.1 Offline detection — **OK** (`sync/connectivity.ts`).
- 15.2 Offline banner UI — Banner component exists; never shown.
- 15.3 Outbox enqueue — **OK**.
- 15.4 Outbox drain — **Stub** (silently marks rows done without API calls).
- 15.5 Rate-limit error UX — **Missing**.
- 15.6 Insufficient-credits modal — **Missing**.
- 15.7 Safety-blocked rejection — **Missing**.
- 15.8 Camera permission denied — **Missing**.
- 15.9 Network timeout retry — **Missing**.
- 15.10 SSE stream failure — **Missing**.
- 15.11 Crash dialog / bug report — **Missing** (Sentry installed, not initialized).

### 16. Account holder + minor specific flows (§16)

- 16.1 Adult sets up child profile — **Partial** (`add-profile?for=child` exists but no actual age/grade collection).
- 16.2 Hand-back UX from admin to learner — **Missing**.
- 16.3 Locked actions for minor (admin unlock prompt) — **Missing**.
- 16.4 Minor cannot archive subject — **Missing**.
- 16.5 Adult sees child's progress in admin — **Missing**.
- 16.6 Profile turns 16 — **Missing** (DEEP §8.9).
- 16.7 Minor consent re-prompt — **Missing**.
- 16.8 Family share / multiple kids — **Missing**.

### 17. Edge cases (§17) — **0 %**

None addressed. Listing top items:

- Material extraction failed retry, low-confidence extraction, regenerate after delete, conflict on rename, two-device edit, FSRS state divergence reconcile, deep-link to deleted resource, profile-switch mid-session, time-zone change, locale change mid-session, app force-update — all missing.

### 18. Onboarding tutorials / empty states (§18)

- 18.1 Empty home — `<EmptyState>` component exists, used in home.tsx.
- 18.2 First-time math keyboard coach — **Missing**.
- 18.3 First-time voice coach — **Missing**.
- 18.4 First-time camera coach — **Missing**.
- 18.5 First-time diagram coach — **Missing**.
- 18.6 Tutorial replay — **Missing**.
- 18.7 First-streak celebration — **Missing**.
- 18.8 First-mastery celebration — **Missing**.

### 19. Search / discovery (§19) — **0 %**

- 19.1 Search across materials — **Missing**.
- 19.2 Filter folders by upcoming test — **Missing**.
- 19.3 Find item by topic — **Missing**.
- 19.4 Recents — **Missing**.
- 19.5 Pinned subjects — **Missing**.

### 20. Cross-cutting micro-flows (§20) — **0 %**

- 20.1 Undo toast — **Missing**.
- 20.2 Long-press context menu — **Missing**.
- 20.3 Pull-to-refresh — **Missing**.
- 20.4 Optimistic write on edit — **Missing**.
- 20.5 Haptic feedback — **Missing**.
- 20.6 Skeleton loading — **Missing**.
- 20.7 Toast/snackbar system — **Missing**.
- 20.8 Deep-link router — **Missing**.
- 20.9 Share intent receiver — **Missing**.
- 20.10 Universal links — **Missing**.

### 21. Header / chrome / navigation (§21)

- 21.1 Bottom nav — **OK** (`BottomNav.tsx`).
- 21.2 Session top bar — **OK** (`SessionTopBar.tsx`).
- 21.3 Header on subject screen — **OK** (inline in subject.tsx).
- 21.4 Modal admin presentation — **OK** (`presentation: 'modal'`).
- 21.5 Pull-to-dismiss on admin — **Missing**.
- 21.6 Tab switcher mid-session warns — **Missing**.

### 22. Internationalization (§22)

- 22.1 i18next set up — **OK** (de+en only).
- 22.2 fr/es/it — **Missing**.
- 22.3 Namespaces — Partial (only `common`+`onboarding`; missing `learner`, `admin`, `errors`, `legal`).
- 22.4 Intl date/number format — **Missing** (not used anywhere).
- 22.5 RTL — n/a (per docs).

### 23. Observability — n/a per docs (no direct user-facing flow).

---

## Deep-flow gaps (from `USER-FLOWS-DEEP.md`)

### 1. End-to-end named journeys (DEEP §1)

| Journey                                                                           | State                                                                                                 |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1.1 "Klassenarbeit in 2 Wochen" — folder bias, daily ramp-up, day-of test prep    | **0 %** — no `scheduled_for` UI, no folder-bias logic in FSRS picker despite the comment claiming so. |
| 1.2 "Ich vergesse das Wort mitten in der Antwort" — voice tip-of-tongue help      | **0 %** — no ASR pipeline.                                                                            |
| 1.3 "Erste Lern-Session überhaupt" — novice first interaction                     | **0 %** — coach marks missing.                                                                        |
| 1.4 "Eltern setzen Kind auf" — parent setup then hand-back                        | **5 %** — branching exists; hand-back UX missing.                                                     |
| 1.5 "Ich war 3 Wochen weg" — gentle re-entry                                      | **0 %** — no re-entry banner, no triage.                                                              |
| 1.6 Confusion recovery dual-tab "Was bedeutet die Frage?" vs "Erklär das Konzept" | **0 %** — explain endpoint is 501; no dual-tab UI.                                                    |
| 1.7 AI verdict appeal path                                                        | **0 %** — no appeal action wired.                                                                     |
| 1.8 "Quatsch fotografiert" — non-educational rejection                            | **0 %**.                                                                                              |
| 1.9 "Vor dem Schlafen kurz" — micro-session                                       | **0 %** — no time-budgeted session config.                                                            |
| 1.10 30 variants of one problem                                                   | **0 %** — practice-run endpoint 501.                                                                  |
| 1.11 Full offline journey                                                         | **20 %** — outbox enqueue real, drain stub.                                                           |
| 1.12 App-update force / migration                                                 | **0 %**.                                                                                              |

### 2. Voice patterns (DEEP §2) — entirely missing

Every sub-pattern (tip-of-tongue, ambient noise, "warte neu", wrong-language, long pause, voice+math, voice+diagram, voice+MC) requires `<VoiceButton>` and ASR plumbing that does not exist.

### 3. Edit / delete / undo matrix (DEEP §3) — entirely missing

No edit UI for any entity except in-progress text fields in onboarding. No delete confirms. No undo toasts. No long-press menus. No conflict resolution UI.

### 4. Real-world edge cases (DEEP §4) — entirely missing

Network (15 cases), permissions (4), device (5), time (3), locale (3), storage (3), account (4), subscription (4), DSGVO (3), multi-device (3), email (3), onboarding (2), photo (5), voice (4), math (3), display (5), charging (2). **Zero** addressed.

### 5. Accessibility (DEEP §5) — entirely missing

No `accessibilityLabel`/`accessibilityRole` audit visible; no Dynamic Type plumbing; no reduced-motion guard; no high-contrast; no dyslexia font option; no read-aloud-everything toggle; no extended-time mode.

### 6. Help & support (DEEP §6) — entirely missing

No help center, no tooltips, no FAQ surfaces, no contact-support form, no crash bug-report, no status banner, no tutorial replay.

### 7. Multi-actor chaos (DEEP §7) — entirely missing

No "phone borrowed" warning, no in-flight upload preservation, no admin re-lock on background, no two-siblings-one-tablet profile picker on cold start.

### 8. Lifecycle moments (DEEP §8) — entirely missing

No streak counter, no anniversary, no mastery celebration, no folder-finished moment, no "you haven't opened in 4 weeks", no end-of-school year, no grade transition, no profile-turns-16, no new-device welcome.

### 9. Settings docs don't fully spec (DEEP §9) — entirely missing

No sound toggle, no haptics toggle, no session-length default, no difficulty preference, no answer timeout, no photo retention setting, no auto-archive, no digest email, no data-saver, no beta opt-in, no spoken-math vocab toggle, no theme picker, no first-day-of-week.

### 10. Power-feature first-time coaching (DEEP §10) — entirely missing

None of the 12 coach marks (math keyboard, test mode, voice, diagram, explain, more questions, scheduled folder, stimulus, fill-blank, album pick, streak, admin) implemented.

### 11. Additional surfaces (DEEP §11) — entirely missing

No drag-to-reorder, no search, no pinning, no quick-capture from home, no material preview pre-extraction, no explicit session pause, no streak viz, no share/export, no admin digest, no real-photo avatar, no per-category notification test, no skip button, no voice/text persistence, no admin empty states, no settings search, no auto-read toggle, no last-session recap, no cross-references, no item metadata surface.

---

## Critical gaps — top 20 that block ship

1. **Entire backend is stub** — every domain route returns 501. The app cannot send/receive any real data. (`apps/api/src/routes/*.ts`)
2. **Auth middleware always throws** — `requireAuth` throws `unauthenticated` unconditionally; even with a valid token nothing works. (`apps/api/src/middleware/auth.ts:32`)
3. **No LLM implementation** — `lib/llm/gateway.ts` is an interface only. No `vertex.ts`, no Gemini client, no prompt code. AI generation/eval/explain all dead.
4. **No camera screen** — `(learner)/capture.tsx` is 18 lines of placeholder text. No `expo-camera` usage, no quality scoring (`lib/quality.ts` missing), no upload flow.
5. **No voice / ASR anywhere** — `<VoiceButton>` not implemented; `expo-speech` not imported anywhere; tip-of-tongue and voice answer flows are 0 %.
6. **No `<MathInput>` / `<MathKeyboard>` / `<LatexText>` / `<DiagramQuestion>` / `<FillBlank>` / `<FunctionPlot>` / `<SvgStimulus>`** — the entire question-rendering and answer-input layer. The session screen is a hardcoded "2x + 7 = 15" mockup.
7. **8 of 10 admin screens missing** — profile drill-in, profile edit, archived, account settings, privacy settings, subscription, data, notifications all absent.
8. **PIN + biometrics not real** — `pin-setup.tsx` skips silently; `(admin)/unlock.tsx` "Mit Face ID entsperren" navigates without invoking biometrics; no `expo-secure-store` calls anywhere.
9. **RevenueCat not wired** — dependency installed; no import, no purchase, no restore, no webhook handler. Bucket 11 is 0 %.
10. **No notification scheduler** — `expo-notifications` installed, never imported. Bucket 14 is 0 %.
11. **No Supabase Edge Functions at all** — `infra/supabase/functions/` is empty. Photo-wipe (DSGVO 7-day), reconciliation, DSGVO export/delete, FSRS recompute, outbox drain — all absent.
12. **Outbox drain is a silent void** — `lib/sync/outbox.ts:85` marks rows done without dispatching to a handler. Any "offline write" is silently dropped after first online drain.
13. **Local SQLite schema is incomplete** — only 5 tables; materials/items/item_states/sessions/attempts/study_assets/templates/practice_runs all missing from `lib/db/schema.ts`. Offline-first not possible.
14. **Login / reset-password are placeholders** — entire returning-user path is dead.
15. **Locales fr / es / it missing** — `Locale` enum accepts them; app has only de+en. Crashes/falls-back if a learner record uses fr/es/it.
16. **Locale namespaces `learner`, `admin`, `errors`, `legal` missing** — only `common` and `onboarding` exist; everywhere else strings will be the i18n keys.
17. **No HTTP client / Supabase client wrapper on mobile** — there is literally no `lib/api.ts` or auth-token attachment; even if API routes existed the mobile cannot call them.
18. **No DSGVO export polling UI** — endpoint stubbed, no screen.
19. **Long-press edit/archive/delete UX entirely missing** — central pattern per 05-mobile §"Edit and delete patterns" is not implemented for any entity.
20. **No Sentry / PostHog init** — both deps installed; no setup file; observability bucket effectively 0 % despite §23 being marked non-user-facing.

---

## Implementation quality red flags

- **`apps/api/src/routes/*.ts`** — every single non-`/health` route is `notImplemented()`. 19 endpoints across 11 routers, all 501.
- **`apps/api/src/middleware/auth.ts:32`** — `throw new ApiError('unauthenticated', 'JWT verification not implemented')` is the production-path of the auth middleware.
- **`apps/mobile/lib/sync/outbox.ts:78-91`** — `// TODO(Step 17): dispatch to per-kind handler. For the skeleton we mark items done` — silently swallows queued operations.
- **`apps/mobile/app/(learner)/home.tsx:19-24`** — `// Static demo data so the screen renders.` Hardcoded `DEMO_SUBJECTS`.
- **`apps/mobile/app/(learner)/subject/[subjectId].tsx:17-29`** — `DEMO_FOLDERS` and `DEMO_MATERIALS` hardcoded.
- **`apps/mobile/app/(learner)/result.tsx:13-22`** — hardcoded `STATS` array.
- **`apps/mobile/app/(learner)/session/[sessionId].tsx`** — entire question/keyboard is a static mock.
- **`apps/mobile/app/(learner)/capture.tsx:11`** — literal text "kommt in Schritt 14" shown to the user.
- **`apps/mobile/app/login.tsx:10` and `app/(admin)/overview.tsx:13`** — visible "pending implementation" copy.
- **Hardcoded button onPress no-op:** `app/(learner)/home.tsx` add-subject tile has `onPress={() => {}}`.
- **Types defined but unused** — `shared-types` `Locale`, `Verdict`, `AnswerKind`, `StimulusKind`, `StudyAssetKind`, `RegenerateStyle`, `ExplainStyle`, `SubscriptionStatus`, `Tier`, `ExtractionStatus`, `SourceKind` are mostly referenced only by other type files; no runtime code uses most of them.
- **Tests** — only in `packages/shared-math`. No mobile screen tests, no API tests, no test for `lib/eval/local.ts` (170 LOC) or `lib/fsrs/index.ts` (95 LOC) or `lib/sync/outbox.ts`.
- **Migrations vs. routes mismatch** — migrations create `material_photos`, `study_assets`, `problem_templates`, `practice_runs` tables; no API route can read or write them.
- **Vercel runtime config** — `apps/api/api/[[...slug]].ts` uses `runtime: 'nodejs'`. Per docs the SSE endpoints (POST /materials, POST /attempts) likely want edge or streaming; none of them stream anything today so it's moot.
- **In-memory rate limit Map** — `apps/api/src/middleware/rate-limit.ts` will reset on every serverless invocation. Docs require Postgres-backed sliding window.
- **No migration runner on mobile** — `lib/db/index.ts` opens SQLite but does not apply migrations; first launch on a clean device will have empty tables.
- **`Locale` enum lists 5 langs; bundle has 2** — first non-DE/EN user crashes or sees raw i18n keys.

---

## Recommended next steps (prioritized)

If the goal is "get to a usable v0.1", the order should be:

1. **Backend authentication path** (Supabase JWT verify in `requireAuth`; implement `POST /auth/account/signup`, `POST /auth/account/consent`). Without this nothing else can land.
2. **Mobile HTTP client + Supabase client** (`apps/mobile/lib/api.ts`, `apps/mobile/lib/supabase.ts`) — attach Bearer + X-Learner-Id.
3. **Account + learner endpoints end-to-end** (`GET /account`, `POST /learners`, `GET /learners/:id/subjects`) — and wire `(learner)/home.tsx` to real data.
4. **Local DB schema completion** — mirror materials/items/item_states/sessions/attempts to SQLite; add a real migration runner.
5. **Camera screen + `lib/quality.ts` + `POST /materials/upload-url` + `POST /materials` SSE pipeline + Vertex AI gateway implementation.** This is the longest, hardest chunk — most of bucket 6.
6. **Session loop with real components**: `<LatexText>`, `<MathInput>`, `<MathKeyboard>`, `<DiagramQuestion>`. Wire `POST /sessions`, `POST /attempts`, local evaluator hand-off to LLM, FSRS write-back.
7. **PIN + biometrics + admin gating** (`expo-secure-store`, `expo-local-authentication`).
8. **8 missing admin screens** + long-press edit/archive/delete pattern across all entities.
9. **Voice (ASR + TTS)** — `<VoiceButton>`, `expo-speech-recognition`, microphone permission flow.
10. **RevenueCat (purchase/restore/webhook + reconciliation Edge Function).**
11. **Notifications scheduler (`expo-notifications` setup, per-category opt-ins, test-date reminder logic).**
12. **DSGVO surfaces (export polling UI, account-deletion flow, photo-wipe Edge Function, `(admin)/settings/privacy.tsx`).**
13. **i18n completion** — fr/es/it bundles, `learner`/`admin`/`errors`/`legal` namespaces.
14. **Coach marks, lifecycle moments, accessibility primitives** (DEEP §5, §8, §10).
15. **Sentry + PostHog init + tests** (mobile screen tests, API integration tests, `lib/eval/local.ts` coverage).

The first 6 items are the critical path to a demo. Items 7–10 are needed for a private beta. Items 11–15 are needed for App Store / Play Store submission.

---

_End of audit._
