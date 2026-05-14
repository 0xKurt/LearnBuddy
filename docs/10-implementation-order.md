# 10 — Implementation Order

This document is the build sequence. It is logical dependency order — earlier steps unblock later ones — not a release plan. Every step's "acceptance" is a concrete, automatable check. An agent works through the list in order; when every step's acceptance passes, the system is complete.

There are no phases, no MVP, no v2. The whole specification (docs 01–09) is what gets built.

## Conventions

- Each step lists **inputs** (which doc sections define the work), **work**, and **acceptance** (how to verify done).
- "✓" in acceptance means an automated test or check passes. Manual checks are explicitly marked.
- Steps run sequentially. Parallelization is fine for steps that share no inputs.

---

## Step 1 — Repository scaffold

Inputs: README, doc 02 §repository-layout.

Work:
- Initialize the pnpm monorepo with the layout from doc 02.
- Configure Node 22, TypeScript strict, ESLint, Prettier, Husky pre-commit.
- Add empty packages: `apps/mobile`, `apps/api`, `packages/shared-types`, `packages/shared-math`, `infra/supabase`.

Acceptance:
- `pnpm install` succeeds with zero `peerDependencies` warnings.
- `pnpm typecheck` succeeds across the workspace.
- `pnpm lint` succeeds across the workspace.

## Step 2 — Shared types and shared math

Inputs: doc 03 §shared-typescript-types, doc 07 §4-formula-representation.

Work:
- Implement the Zod schemas from doc 03 in `packages/shared-types`.
- Implement the MathLite tokenizer and parser in `packages/shared-math`, producing both a LaTeX string and a `mathjs`-evaluatable AST. Implement `parseNumericInput` from doc 07 §4.3.
- Implement unit-tests for the parser covering each row of the MathLite syntax table.

Acceptance:
- ✓ Every row in the MathLite table has at least one passing test that asserts both the LaTeX and the AST.
- ✓ Parser tests include malformed inputs that the parser must reject with positional errors.
- ✓ `parseNumericInput` handles German decimal commas, unit aliases, and rejects non-numeric residue.

## Step 3 — Supabase project and schema

Inputs: doc 03, doc 09 (RLS notes scattered).

Work:
- Create the Supabase project in `eu-central-1`.
- Write SQL migrations in `infra/supabase/migrations/` for every table in doc 03.
- Apply all RLS policies. Configure storage buckets `materials-raw` (private) and `study-assets` (private) with appropriate policies.
- Configure auth providers (email + password, magic link). Email verification on.
- Set up `pg_cron` and schedule placeholders for the three Edge Functions.

Acceptance:
- ✓ Drizzle introspection generates the same schema as the migrations.
- ✓ A test account holder user can be created via Supabase Auth.
- ✓ A test query against `learners` from another account holder user returns zero rows (RLS verified).
- ✓ A signed PUT URL to `materials-raw` is generated and accepted by Storage.

## Step 4 — API skeleton on Vercel

Inputs: doc 02 §api, doc 04 §conventions.

Work:
- Create the Hono app with route handlers for every endpoint in doc 04, returning `501 Not Implemented` initially.
- Implement Supabase JWT middleware that resolves `account_id` and validates `X-Learner-Id`.
- Implement Zod validation middleware reading the shared-types schemas.
- Implement the error-envelope conventions and the rate-limit middleware.
- Wire up Vercel deployment, Sentry, and structured logs.

Acceptance:
- ✓ `GET /account` returns 401 without a token.
- ✓ `GET /account` returns 200 with a valid token and the seeded account.
- ✓ A request that violates rate limits returns 429 with `Retry-After`.
- ✓ Sentry receives a test error event from the API.

## Step 5 — LLM Gateway

Inputs: doc 02 §llm-gateway, doc 06 entire, doc 08 §atomic-debit.

Work:
- Implement `apps/api/lib/llm/` with the four gateway functions.
- Implement Vertex AI client with the locked config.
- Implement the four prompt builders in `apps/api/prompts/` and concatenate subject guidance branches.
- Implement post-processing in `apps/api/lib/llm/postProcess.ts` including problem template validation (with sampling and constraint evaluation).
- Implement credit cost computation in `apps/api/lib/credits/cost.ts`.

Acceptance:
- ✓ A unit test injecting a mocked Vertex response exercises every output path: success, JSON-parse retry, safety block, `not_educational`.
- ✓ Problem-template validation drops templates with < 60 % feasibility against deterministic test cases.
- ✓ `costToCredits(2_000_000, 500_000)` returns the expected credit count.

## Step 6 — Image processor

Inputs: doc 06 §image-processing, doc 07 §5-diagrams.

Work:
- Implement `apps/api/lib/diagrams/process.ts` with the algorithm in doc 06 §2.
- Stream-load the original image from a Supabase signed URL, run sharp pipelines, write the result to `study-assets`.
- Handle the mask-safety fallback (> 8 % area, invalid boxes).

Acceptance:
- ✓ Fixture test: a known diagram input produces a PNG with the expected number of markers at known coordinates (within ±2 px).
- ✓ Fixture test: a "bad mask" input falls back to no-masking and sets `metadata.fallback = 'no_masking'`.

## Step 7 — Eval harness

Inputs: doc 06 §eval-harness.

Work:
- Implement `apps/api/evals/run.ts`.
- Add the minimum fixture set listed in doc 06 §fixture-inventory.
- Wire a `pnpm eval` script and a GitHub Actions job that runs it on pull requests touching `apps/api/prompts/**` or `apps/api/lib/llm/**`.

Acceptance:
- ✓ `pnpm eval` runs end-to-end against Vertex and produces a JSON summary.
- ✓ All baseline fixtures pass on the locked prompt version.
- ✓ Removing one required `topic` from a fixture's expectations causes the eval to fail (negative-control test).

## Step 8 — Credit ledger

Inputs: doc 08, doc 04 §credits.

Work:
- Implement `apps/api/lib/credits/ledger.ts` with `debitEstimate`, `settle`, `refundEstimate`, `grant`, `softCapStatus`.
- Implement the RevenueCat webhook with idempotency on the event id.
- Implement the `credit-reconcile` Edge Function.
- Implement `GET /account/credits/summary`.

Acceptance:
- ✓ A concurrent debit test (two simultaneous requests for one account) leaves the bucket with one debit applied, the other rejected with `insufficient_credits`.
- ✓ A simulated RevenueCat `RENEWAL` event grants the correct allotment, respects the rollover cap, and inserts a `credit_events` row.
- ✓ The reconcile cron processes an account with a stale period and grants the missing allotment.

## Step 9 — Implement /materials end-to-end

Inputs: doc 04 §materials, doc 06, doc 07.

Work:
- `POST /materials/upload-url`, `POST /materials` (with SSE streaming), `GET /materials/:id`, `GET /materials/:id/items`, `GET /materials/:id/templates`, `POST /materials/:id/regenerate-items`, `PATCH`, `DELETE`.
- Tie into the gateway, post-processing, image processor, and credit ledger.
- Schedule the photo-wipe outbox entry on success.

Acceptance:
- ✓ End-to-end test: a real fixture photo passed through the pipeline yields ≥ 6 items, ≥ 1 template (for the math fixture), and ≥ 1 study asset (for the biology fixture).
- ✓ A failure (mocked) triggers a refund event.
- ✓ A `not_educational` response is surfaced as the documented error code.

## Step 10 — Implement /attempts, /sessions, /explain, /templates

Inputs: doc 04, doc 06.

Work:
- `POST /sessions`, `POST /attempts` (SSE), `POST /attempts/batch`, `POST /attempts/:client_id/finalize`, `POST /explain` (SSE).
- `POST /templates/:id/practice-run`, `PATCH /templates/:id/practice-run/:run_id`, `DELETE /templates/:id`.
- FSRS recomputation in the batch endpoint using `ts-fsrs` on the server.

Acceptance:
- ✓ A scripted session with mixed local-verdict and LLM-verdict attempts persists correctly.
- ✓ Batch endpoint replays five attempts in order and produces an `item_states` row that matches the FSRS step-by-step expectation.

## Step 11 — DSGVO endpoints and Edge Functions

Inputs: doc 04 §dsgvo, doc 09 §account-holder-rights.

Work:
- Implement `POST /dsgvo/export`, `GET /dsgvo/requests/:id`, `POST /dsgvo/delete-account`, `POST /dsgvo/cancel-deletion`.
- Implement Edge Functions `dsgvo-export` (assemble ZIP, upload to private signed URL, email account holder) and `dsgvo-delete` (run after 7-day delay).
- Implement `photo-wipe` Edge Function and its pg_cron schedule.

Acceptance:
- ✓ Export produces the documented file set and the resulting ZIP can be opened.
- ✓ Delete cascade removes all rows for the account and all storage objects in both buckets.
- ✓ Photo-wipe deletes raw photos 7 days after extraction; study assets survive.

## Step 12 — Mobile shell

Inputs: doc 05 §navigation-structure, doc 02 §decisions-that-are-final.

Work:
- Initialize Expo app with the dependencies in README §tech-stack.
- Set up `expo-router` with the route file tree from doc 05.
- Configure `eas.json` with `development`, `preview`, `production` profiles.
- Add Sentry, PostHog (EU), and i18next with empty namespace stubs for all five languages.
- Set up Drizzle over `expo-sqlite` with the schema from doc 05 §local-db.

Acceptance:
- ✓ `eas build --profile development --platform ios` produces a runnable simulator build.
- ✓ The app starts with the welcome screen and navigates to a stub home.
- ✓ The local SQLite DB is migrated to the current schema on first run.

## Step 13 — Onboarding flow

Inputs: doc 05 §onboarding, doc 09 §german-plain-language-privacy-summary.

Work:
- Implement all eleven onboarding screens: welcome, age-check, hand-off-to-adult (under-16 branch), account-signup, verify-email, consent, who-uses, add-profile, profile-minor-consent (conditional on minor birth year), pin-setup, hand-off.
- Wire `POST /auth/account/signup`, email verification, `POST /auth/account/consent`, `POST /learners`.
- Implement account holder PIN/biometric setup using `expo-secure-store`.
- Handle the under-16 branch: from age-check, route to hand-off-to-adult, then the adult restarts at age-check.
- Handle the who-uses branching: "Ich selbst" pre-fills account holder's birth year; "Mein Kind" creates a separate minor profile and triggers profile-minor-consent before pin-setup.

Acceptance:
- ✓ A new adult user (16+) completes the full onboarding flow and lands directly in the learner experience.
- ✓ A user under 16 is routed to the hand-off-to-adult screen and cannot proceed past it.
- ✓ DSGVO consent is recorded with the version constant.
- ✓ A user attempting to skip the consent checkbox cannot proceed.
- ✓ Creating a minor profile records the per-minor consent in the same `POST /learners` call.
- ✓ A second call to `POST /learners` for the same account returns `409 learner_already_exists`.

## Step 14 — Capture flow and material processing

Inputs: doc 05 §learner-surface, doc 06.

Work:
- Implement the camera screen with continuous quality scoring.
- Implement upload via signed URLs and SSE consumption of `POST /materials`.
- Implement the material screen with item list, regenerate, delete.

Acceptance:
- ✓ A captured material with two photos appears in the material list with generated items within 30 s on a reference test material.
- ✓ Camera quality thresholds correctly flag blurry/dark photos.
- ✓ Regenerate adds new items without duplicating existing ones.

## Step 15 — Study session with answer kinds

Inputs: doc 05 §session, doc 07 §3-answer-kinds.

Work:
- Implement the session screen with item presentation.
- Implement `<LatexText>`, `<MathInput>`, `<MathKeyboard>`, `<FunctionPlot>`, `<SvgStimulus>`, `<DiagramQuestion>`, `<VoiceButton>`, `<FillBlank>`.
- Implement the local evaluator in `apps/mobile/lib/eval/local.ts` covering every answer kind.
- Wire `POST /attempts` SSE consumption.

Acceptance:
- ✓ Each of the seven answer kinds has a passing end-to-end test on the simulator: render → answer → verdict → advance.
- ✓ The local evaluator's unit test suite covers all bullets in doc 07 §3 for each kind.
- ✓ A formula item answered with a re-arranged but equivalent formula is graded correct (LLM fallback).

## Step 16 — FSRS and practice runs

Inputs: doc 02 §F2, doc 07 §6-problem-templates, doc 05 §practice.

Work:
- Wrap `ts-fsrs` in `apps/mobile/lib/fsrs/` with consistent rating mapping.
- Implement the practice-run flow with client-side variant generation.
- Implement adaptive difficulty per doc 07 §6.5.

Acceptance:
- ✓ A session of 10 items produces the expected `item_states` updates locally and, after sync, on the server.
- ✓ A practice run generates 10 distinct variants for a sample template and computes the solution for each correctly.
- ✓ A run with 9/10 correct triggers a `difficulty_adjustment += 1` capped at +2.

## Step 17 — Offline-first and sync engine

Inputs: doc 02 §F4, doc 05 §sync-engine.

Work:
- Implement the local outbox and the sync engine in `apps/mobile/lib/sync/`.
- Implement connectivity probing (a HEAD to the API with a tight timeout, not OS state alone).
- Implement conflict resolution per doc 02 and doc 05.

Acceptance:
- ✓ A scripted offline session of 5 attempts queues correctly and drains to the server on reconnect.
- ✓ An attempt with `unknown` local verdict is finalized correctly when network returns.
- ✓ A subject created offline and edited online by another device resolves with server-LWW; the mobile pulls the canonical state without crashing.

## Step 18 — Notifications

Inputs: doc 05 §notifications.

Work:
- Implement the notification scheduler.
- Hook into learner settings, folder schedule, and `GET /learners/:learnerId/schedule-summary`.

Acceptance:
- ✓ Permission is requested at the right moment in onboarding.
- ✓ Scheduled notifications are visible in the system "Pending Notifications" inspector during a simulator test.
- ✓ Disabling a category in settings cancels its scheduled notifications.

## Step 19 — Admin surface

Inputs: doc 05 §admin-surface.

Work:
- Implement the admin unlock screen with biometric + PIN fallback (and 5-attempt lockout).
- Implement overview (single profile shown directly), profile drill-in, profile edit, profile notifications, archived items, settings (account / privacy), subscription, data screens.
- Wire RevenueCat purchase flow on the subscription screen.
- Wire the export and delete flows on the data screen.
- Implement the "Profil archivieren" action with 30-day recovery semantics and the explicit warning that this retires the account's data.

Acceptance:
- ✓ The account holder can unlock the admin surface via biometric, view the profile overview, and exit back to the learner surface.
- ✓ Five wrong PIN attempts in 5 minutes lock the PIN for 15 minutes; biometric still works.
- ✓ Editing the profile updates the local DB optimistically and reconciles with `PATCH /learners/:id`.
- ✓ Subscription upgrade via RevenueCat sandbox triggers a webhook that updates the account's tier and grants credits.
- ✓ Export-data flow shows pending state and updates when the request completes.
- ✓ Account deletion shows the 7-day cancellable banner; `POST /dsgvo/cancel-deletion` clears it.
- ✓ Archiving the single profile moves it to the archived list and is restorable for 30 days.

## Step 20 — Localization

Inputs: doc 05 §internationalization, doc 09 §german-plain-language-privacy-summary.

Work:
- Fill all `de` translation files (primary).
- Fill `en` translation files (secondary, complete).
- Provide `fr`, `es`, `it` translation files for at least `common`, `onboarding`, `errors`, `legal` namespaces. The remaining namespaces can ship machine-translated with a flag in i18next missing-key handler.
- Verify `Intl.DateTimeFormat`/`Intl.NumberFormat` outputs per locale.

Acceptance:
- ✓ Switching `ui_locale` to each of de/en/fr/es/it shows the relevant string for every used translation key (CI check via `i18next-parser` against the codebase).
- ✓ The legal namespace is fully translated for all five languages.
- ✓ German decimal commas display correctly throughout the app.

## Step 21 — Store readiness

Inputs: doc 09 §app-store-and-play-store-posture.

Work:
- Write store listings (title, subtitle, description, screenshots) in German and English.
- Configure the App Store privacy label and the `PrivacyInfo.xcprivacy`.
- Configure the Play Data Safety section.
- Configure subscriptions in App Store Connect and Play Console (Standard and Account, with monthly and annual variants).
- Configure RevenueCat products to match.

Acceptance:
- Manual: App Store Connect TestFlight build accepted with the privacy label.
- Manual: Play Console internal-testing track accepts the build.
- ✓ RevenueCat dashboard shows the four products with prices in the expected EU currencies.

## Step 22 — End-to-end production verification

Run the following scenarios manually against a production-equivalent environment with a freshly-created account holder account.

Inputs: doc 01 §user-journeys.

Scenarios:
1. **J3 capture → J4 study (online):** Take 2 photos of a real grade-7 math worksheet. Verify items, templates, study assets all appear. Start a session, answer items via voice and text. Verify FSRS state updates.
2. **J5 practice run:** Open a math item with a template, run 10 variants, verify all gradable locally with no LLM calls.
3. **J6 offline:** Disable network. Run a 5-item session. Re-enable. Verify outbox drains and state syncs.
4. **J1 onboarding (solo adult):** Fresh install. Complete the adult onboarding flow. Verify DSGVO consent recorded and credit bucket created with trial allotment.
5. **J2 onboarding (account holder + minor):** Fresh install. Complete the minor-profile onboarding flow. Verify minor consent recorded with the profile.
6. **J7 account holder review:** Unlock admin surface via biometric, drill into the profile, verify aggregates (streak, weekly minutes, mastered topics).
7. **Export and delete:** Trigger DSGVO export, receive email, download ZIP, verify completeness. Trigger account deletion, verify 7-day pending state, cancel, verify cancellation.
8. **J8 subscription:** Subscribe via sandbox. Verify webhook updates tier and grants credits. Trigger renewal in sandbox; verify second grant respects rollover cap.
9. **Photo wipe:** Force-run the photo-wipe Edge Function with a recent material; verify raw photos are removed and study assets remain.
10. **J11 edit/delete:** Long-press a question, archive it, verify it disappears from FSRS pool. Restore from admin → archived. Rename a subject, archive a folder, restore both.
11. **Eval harness:** Run `pnpm eval` against production prompts; verify all baseline fixtures pass with `success_rate >= 0.95`.
12. **Locales:** Switch UI to each of de/en/fr/es/it and walk through onboarding → capture → session. Verify no missing keys.

Acceptance:
- All twelve scenarios pass on iOS and Android.
- The eval harness CI run is green.
- Sentry has zero unresolved errors from the verification runs.

---

## Definition of done

The system is complete when:

- ✓ Every step's acceptance passes.
- ✓ All eval-harness fixtures pass on the locked prompt version.
- ✓ A 7-day soak run by the developer's child produces zero unhandled errors and at least three completed study sessions across two subjects.
- ✓ The DSGVO export ZIP for that soak account is verified to contain every category in doc 09 §4.
- ✓ The cost monitor reports an average credit spend per active account per day ≤ 25 credits (well within the Standard tier).
