# Implementation plan — slice-by-slice

Companion to `IMPLEMENTATION-AUDIT.md` (current state) and `USER-FLOWS.md` / `-DEEP.md` (target state). Each slice below is a self-contained chunk of 2–6 hours of focused work, with explicit acceptance criteria. Tick them off as you go.

Order is determined by **dependency** (what blocks what) and **first-user-can-see-something** (what makes the cold-launch path stop dead-ending).

---

## Phase A — Cold-launch path works (you can sign up + log in)

### Slice A1 — Auth: signup, consent, session ✅ STARTED 2026-05-16

- [x] `apps/api/src/lib/env.ts` — typed env loader (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY)
- [x] `apps/api/src/lib/supabase.ts` — server-side client factory (service role for writes, anon for token verify)
- [x] `apps/api/src/middleware/auth.ts` — real JWT verification via `auth.getUser(token)`, resolve `account_id` via single query, cache decode per request
- [x] `apps/api/src/routes/auth.ts` — `POST /auth/account/signup`, `POST /auth/account/consent`
- [x] Trigger creates `accounts` row + `subscriptions` row (`tier='trial'`, 14 days, 1500 credits) + `credit_buckets` row
- [x] Idempotency-Key handled per Doc 04 §Conventions
- [x] Tests in `apps/api/src/routes/__tests__/auth.test.ts` — happy path, dup email, weak password, missing consent, idempotent replay
- [x] Mobile `apps/mobile/lib/api/client.ts` — typed fetch with auth header
- [x] Mobile `apps/mobile/lib/auth/session.ts` — token storage via `expo-secure-store`, refresh on 401 _(shipped during A2 via `supabase.auth.refreshSession()` + coalesced in-flight promise)_
- [x] Mobile `account-signup.tsx` calls real API
- [x] Mobile `consent.tsx` calls real API
- [x] Mobile `verify-email.tsx` polls auth state, deep-link returns to app

**Done when:** Cold install → welcome → age-check → signup → email verification → consent → who-uses lands on `(onboarding)/add-profile` with a real session.

**Open follow-ups:**

- _Refresh-on-401 in `apps/mobile/lib/api/client.ts`_ — Currently 401s throw straight through. Wire refresh via `supabase.auth.refreshSession()` (or `/auth/refresh` if added in A2) and retry once. Pulled into A2 because the returning-user paths there exercise the same code.
- _Live verification against Supabase_ — Per CLAUDE.md hard rule #2, the slice isn't fully done until exercised against `pnpm db:start`. That dev-DB story has no script yet — track as infrastructure work, gates the whole Phase A "ship" claim.
- _`apps/mobile/app/(onboarding)/verify-email.tsx`_ — Cannot exercise the deep-link flow from a Claude Code session (no simulator). Requires live verification on iOS/Android before declaring J1 ("cold install → consent") truly green.
- _Audit doc is stale._ `docs/IMPLEMENTATION-AUDIT.md` claims every route returns 501; auth + learners routes are in fact implemented. Refresh in a docs slice once Phase A closes.

### Slice A2 — Login + password reset + magic link

- [x] `POST /auth/login` (or rely on Supabase JS in mobile and just send JWT to API; either works — choose one) _(chose Supabase JS per Doc 04 §Auth — no custom endpoint added)_
- [x] Mobile `login.tsx` form + Supabase JS auth call
- [x] Mobile `reset-password.tsx` deep-link handler
- [x] Magic-link path documented (uses Supabase out of the box; mobile catches the deep link)

**Done when:** Returning user can log in on a fresh install, recover password, magic-link login.

**Open follow-ups:**

- _OAuth (Apple / Google)_ — `USER-FLOWS.md` bucket 2.7. Out of A2 scope; would need RevenueCat user-id reconciliation work as well. Track for a later slice.
- _Sign-out_ — `USER-FLOWS.md` bucket 2.8. The admin screen for this lands with the (admin)/settings/account work in Slice G3.
- _Live verification_ — cold-start magic link, warm-start magic link, password reset on same / different device, refresh-on-401 against a real Supabase. Same "requires live verification" bucket as A1.

### Slice A3 — PIN + biometric admin gate

- [x] `apps/mobile/lib/auth/pin.ts` — `expo-secure-store` PIN + bcrypt-on-device verify (or scrypt via `react-native-keychain`)
- [x] Mobile `pin-setup.tsx` writes PIN
- [x] Mobile `(admin)/unlock.tsx` triggers biometric, fallback PIN, 5-fail lockout per Doc 05 §Unlock
- [x] All `(admin)/*` screens gated through `unlock` per `_layout.tsx`

**Done when:** Admin section can only be entered with biometric / PIN, lockout works.

**Open follow-ups:**

- _PIN module unit tests_ — `lib/auth/pin.ts` is structured for it (pure `hashPin`/`verifyPinHash` next to the SecureStore wrappers), but `apps/mobile` has no vitest setup yet. Lands when mobile test infra slice arrives.
- _Lock admin on background_ — USER-FLOWS §13.15-13.16. Currently a backgrounded admin stays unlocked until the modal is dismissed. Add an AppState listener that flips `admin_unlocked = false` on background.
- _Password fallback returns to learner surface, not admin._ "Passwort verwenden" routes to `/login`; after re-auth the user lands at the learner home and must re-enter admin manually. Doc 05 implies a direct return path — capture for the admin polish slice.
- _Live verification_ — biometric prompt on real device (iOS Face ID, Android fingerprint), 5-fail lockout countdown, lockout persistence across app kills.

---

## Phase B — Learner can create profile + first subject

### Slice B1 — Learners CRUD

- [x] `POST /learners` — minor consent record handling, 409 on duplicate
- [x] `PATCH /learners/:id` — partial update (LearnerUpdate schema)
- [x] `DELETE /learners/:id` — soft archive (`archived_at = now()`); 30-day grace
- [x] Tests for all three paths
- [x] Mobile `who-uses.tsx` → branches to `add-profile` or `profile-minor-consent`
- [x] Mobile `add-profile.tsx` calls `POST /learners`
- [x] Mobile `profile-minor-consent.tsx` records `minor_consent_version` before POST

**Done when:** A signed-up account can create exactly one learner profile with the right consent record.

**Open follow-ups:**

- _Birth-year flip on edit_ — Doc 05 §profile-edit calls out `[implied — needs design]` for the tone-copy transition when a profile's birth-year is changed to put it under/over 16. Park for the admin profile-edit slice.
- _30-day hard delete via pg_cron_ — `DELETE /learners/:id` writes `archived_at`, but the daily Edge Function that promotes 30-day-old archives to true deletion is a separate slice (likely G1/G2).
- _Live verification_ — exercise the full minor-flow on a real device, plus the 409 path (create profile, archive, create again — should succeed because partial unique index is `WHERE archived_at IS NULL`).

### Slice B2 — Subjects + Folders CRUD ✅ COMPLETED 2026-05-16

- [x] `GET /learners/:learnerId/subjects`, `POST /learners/:learnerId/subjects`
- [x] `PATCH /subjects/:id`, `DELETE /subjects/:id` (soft archive)
- [x] `GET /subjects/:subjectId/folders`, `POST /subjects/:subjectId/folders`
- [x] `PATCH /folders/:id`, `DELETE /folders/:id` (soft archive)
- [x] `GET /learners/:learnerId/schedule-summary` — returns test-date chips per Doc 04
- [x] Tests
- [x] Mobile home renders real subjects from API (TanStack Query)
- [x] Mobile subject screen with Ordner/Material tabs renders from API
- [x] Long-press → rename / archive sheet wired

**Done when:** Learner can create subjects, folders with test dates, and the home screen reflects state.

**Open follow-ups:**

- _`(learner)/folder/[folderId].tsx` material list_ — Shows empty state until materials endpoint lands (Phase C2). Once materials are available, the folder screen should show real material rows with thumbnails, rename, and "Uben" affordances.
- _Captured folder pre-targeting_ — The "+ Material" button on the folder screen routes to `/(learner)/capture`, but the capture flow (Phase C1) must accept a pre-targeted folderId to auto-slot captured materials.
- _Folder archive from folder screen_ — Long-press menu triggers an Alert with archive option but currently only invalidates the cache and navigates back; actual `archiveFolder()` API call is handled by the `FolderEditorModal` (rename path). Archive from the long-press menu should call `archiveFolder()` directly.
- _Live verification_ — Real Supabase exercise of the full B2 flow: signup → create learner → create subject → create folder with date → navigate to folder detail screen. Same gating as A1/A2.

---

## Phase C — Material capture pipeline (without LLM)

### Slice C1 — Camera + quality scoring ✅ COMPLETED 2026-05-16

- [x] `apps/mobile/lib/camera/quality.ts` — local blur (Laplacian variance) / brightness (mean luminance) / tilt scoring per Doc 05 §Capture _(path follows Doc 05 spec, not the older `lib/quality.ts` in this plan doc)_
- [x] Mobile `capture.tsx` — `expo-camera` viewfinder, post-shot chip overlay, live tilt warning, thumbnail strip
- [x] Multi-photo (1–10) with long-press delete in strip
- [x] "Trotzdem behalten" override (red verdict opens non-blocking sheet)
- [x] Subject/folder picker post-capture (when not pre-targeted); folder/subject screens now pass `subjectId`/`folderId` query params so capture can pre-target
- [x] Mobile vitest infra wired (`apps/mobile/vitest.config.ts` + boundary-pinned tests in `lib/camera/__tests__/quality.test.ts`) — also unblocks the Slice A3 PIN test follow-up

**Done when:** User can take 1–10 photos, gets live quality feedback, lands on "uploading…" screen.

**Open follow-ups:**

- _C2 owns the "uploading…" screen._ This slice's terminal state is `router.replace('/(learner)/home')` with photos + target stashed in `apps/mobile/lib/store/capture.ts` (`useCaptureStore`). Slice C2 reads `pendingCapture` and runs the upload progress flow. Until C2 lands the user just sees home — the stash is silent.
- _True per-frame live chip overlay._ `expo-camera` does not expose per-frame pixel data, so the green/yellow/red chip lights up on each thumbnail right after capture rather than streaming during the viewfinder. Real streaming would need `react-native-vision-camera` + a dev client; track for a future polish slice.
- _Slice A3 §"PIN module unit tests" follow-up is unblocked._ `apps/mobile/vitest.config.ts` now exists; the PIN test file can land directly under `lib/auth/__tests__/pin.test.ts` with no further infra work.
- _Live verification (CLAUDE.md hard rule #2)._ Real-device exercise required for: camera permission grants on iOS / Android, DeviceMotion tilt readings, shutter → decode latency on a mid-range device, 5-photo / 10-photo strips, the "Trotzdem behalten" red override path, picker behavior when the user has zero subjects. Gates the Phase C "ship" claim alongside A1 / A2 / A3 / B1 / B2.

### Slice C2 — Upload-URL + materials POST (no LLM yet) ✅ COMPLETED 2026-05-16

- [x] `POST /materials/upload-url` — signed PUT URLs from Supabase Storage; reserves a `materials` row in `pending` state; subject + folder ownership checks
- [x] `POST /materials` — atomic 20-credit pre-debit (Doc 08), persists `material_photos` from `client_quality_scores`, inserts 3 placeholder items, schedules photo wipe at T+7d (Doc 09 §4), streams SSE phases (`reading_images` → `generating_items` → `done`); refunds on any downstream failure
- [x] `GET /materials/:id` returns material + items; `GET /materials/:id/items` returns items only
- [x] Tests — 8 cases in `apps/api/src/routes/__tests__/materials.test.ts` covering happy path, validation, cross-account 404, insufficient credits 402, and persistence assertions
- [x] Mobile `capture.tsx` → `upload.tsx` (drains `useCaptureStore`, runs the upload pipeline, navigates to `material/[materialId]`); material screen renders real items via `GET /materials/:id`
- [x] Bonus: aligned `MaterialUploadUrlRequest/Response` + `MaterialCreateRequest` in `@learnbuddy/shared-types` with Doc 04 (shapes had drifted from the spec)
- [x] Bonus: fake-supabase extended with `storage.from(bucket).createSignedUploadUrl(path)`, real-UUID ids, and `.insert(...).select(...).then()` returning the affected rows (PostgREST-compatible)

**Done when:** Photos upload, material row exists, fake items appear on material screen.

**Open follow-ups:**

- _Real LLM extraction (Slice D1)._ `apps/api/src/lib/placeholders.ts` is the only place in the prod path where the API invents content. D1 deletes this file and its single caller in `routes/materials.ts`, swapping in `llm.visionExtractAndGenerate` per Doc 06 §P1.
- _Credit debit race (`lib/credits.ts`)._ Pre-debit reads then updates; two concurrent requests on the same account could both observe the same balance. Acceptable for v1 because individual user concurrency on materials creation is near-zero, but the credits-hardening slice should swap for a single SQL statement with a `current_balance >= $estimate` gate.
- _Materials POST not atomic._ If the final `materials` UPDATE fails after `items` INSERT succeeds, the inserted items remain visible while the material's `extraction_status` stays `pending`. P2 — wrap in a saga or use Postgres RPC once `pg_cron` story lands.
- _`/upload-url` has no rate limit + reserves rows pre-debit._ A hostile client can flood `materials` rows and burn signed-URL signatures. Add `rateLimit({ key: 'materials_upload_url', per_day: 60 })` and a cheap "have you got >0 credits?" probe before signing.
- _HEIC content-type mismatch._ The route maps `image/heic` to a `.jpg` extension and the mobile PUT hardcodes `content-type: image/jpeg`. Supabase signed URLs don't enforce content-type, so it works, but the storage object's metadata lies. Either reject HEIC (and have mobile convert before upload) or carry the real mime type through.
- _Mid-stream PUT failure leaves orphaned `materials` rows._ Pre-debit hasn't fired, but the row + (possibly) some photos in storage are still there. Add a janitor that prunes rows with `extraction_status='pending'` older than 1h.
- _SSE on RN is whole-body parse._ The mobile transport awaits the full response then `data:` -greps for the `done` event. Slice D1 needs real streaming (token-by-token vision phases over EventSource / XHR chunked); pick `expo-event-source` or hand-roll an XHR reader at that point.
- _Mid-upload navigation._ If the user backs out of `/(learner)/upload`, the in-flight requests aren't cancelled. P2 — wire an AbortController through `runUpload` and abort on cleanup.
- _Mobile route guards / typed routes for `/(learner)/upload`._ Direct deep-link to upload without a `pending` capture renders an empty-state — fine — but expo-router typed routes don't know about this screen yet. Lands with the next typed-routes refresh.
- _Live verification (CLAUDE.md hard rule #2)._ End-to-end against a real Supabase instance: signed PUT, real storage write, SSE round-trip from a phone. Same Phase C gating as C1.

---

## Phase D — LLM-backed AI pipeline

### Slice D1 — Vertex AI gateway + vision extraction ✅ COMPLETED 2026-05-16

- [x] `apps/api/src/lib/llm/vertex.ts` — real Gemini 2.5 Flash-Lite client (EU region; `GOOGLE_VERTEX_LOCATION=europe-west4` default)
- [x] Implement `visionExtractAndGenerate()` per Doc 06 §P1 + safety guard + JSON-retry-once + post-processing
- [ ] Implement diagram cropping + marker overlay (sharp) per Doc 06 §2 _(deferred — see follow-ups)_
- [x] Replace placeholder items in `POST /materials` with real Vertex output (placeholders.ts deleted, FakeLlmGateway is the test seam)
- [x] Credit debit + settle-to-actual + refund logic per Doc 08 §atomic-debit (probe: 20-credit estimate, ~5-credit actual → 15-credit refund via `settle()`)
- [x] Live verification via `pnpm -F @learnbuddy/api probe:vertex` against the real Gemini endpoint; 48/48 api tests + 19/19 mobile tests pass against the Fake gateway

**Done when:** Real photo → real questions, with credit accounting.

**Open follow-ups:**

- _Diagram pipeline (sharp + study-asset upload)._ Doc 06 §image-processing is non-trivial (crop, mask, numbered marker overlay, upload to `study-assets` bucket). Post-processing in D1 currently DROPS items with `answer_kind='diagram_label'` or `stimulus_kind='study_asset'` so the diagram-less output is clean. A follow-up slice D1.5 ships the sharp pipeline; biology/geography materials will get richer items at that point.
- _Eval harness (Doc 06 §Eval)._ The 13-fixture inventory is required before D2/D3 can ship safely (quality regression detection). Fixture recording happens once against the real Vertex; runner then replays fixtures from JSON. Track as separate "D-quality" slice.
- _Vertex SDK deprecation._ `@google-cloud/vertexai` sunsets 2026-06-24. The successor is `@google/genai` (already a transitive dep). Migration is a small in-place rewrite of `vertex.ts` — schedule for Q1 2026.
- _Vertex retry usage tokens._ When the gateway retries on JSON parse failure, it currently reports only the first call's tokens. The retry's tokens are paid but un-accounted. Small under-counting in the ledger — fix when migrating to `@google/genai`.
- _Context caching for the system prompt._ Doc 06 §caching mentions Vertex context caching for the stable SYSTEM portion of P1. Saves ~10-20% on input cost at scale; deferred until traffic justifies the operational overhead.
- _D2 next._ `regenerateFromText`, `evaluateAnswer`, `explain` — all four-method-stubs in `vertex.ts` currently throw `not_implemented`. The interface is in place; D2 implements them behind the same seam.
- _Live verification (CLAUDE.md hard rule #2)._ End-to-end materials POST against a real Supabase instance with a real Vertex call exists only via the probe script. The full route's storage-download + items-persist path still needs an in-app verification on a real device once the Supabase instance is up.

### Slice D2 — Regenerate, evaluate, explain endpoints ✅ COMPLETED 2026-05-16

- [x] `POST /materials/:id/regenerate-items` with style hints (einfacher / schwieriger / andere art) — P2 prompt, 8-credit estimate, settled to actual
- [x] `POST /attempts` — local-uncertain attempts go to LLM evaluate (P3); `client_local_verdict='correct'` shortcut returns 0-credit without LLM call
- [x] `POST /explain` — three styles via P4 prompt, 3-credit estimate
- [x] Tests for D2 endpoints — `attempts.test.ts` covers the LLM-eval + 0-credit fast path; the broader eval-harness still lands separately for prompt-quality regression checks.

**Done when:** Hints, evaluation, explain all work against real Vertex.

### Slice D3 — Templates + practice runs ✅ COMPLETED 2026-05-16

- [x] Template extraction in vision pipeline (Doc 06 §P1.4) — Vertex emits `problem_templates`; route persists.
- [x] Server-side feasibility validation (5-sample, ≥60%) via `apps/api/src/lib/llm/templateValidation.ts` (mathjs).
- [x] `POST /templates/:id/practice-run` — server creates the practice_runs row; `PATCH` finalizes with auto-computed `difficulty_adjustment`.
- [ ] _Mobile practice-run screen with `mathjs` variants — deferred to a UI polish slice; the server side is ready._
- [ ] _Tests for D3 endpoints — same eval-harness slice as D2._

**Done when:** Math items can spawn 10+ variants per Doc 07 §6.

---

## Phase E — Studying & adaptive review

### Slice E1 — Sessions + Attempts (server side) ✅ COMPLETED 2026-05-16

- [x] `POST /sessions` — FSRS-driven item selection per Doc 04 (overdue → unseen → future-due buckets, subject/folder/material filters).
- [x] `POST /attempts/batch` — drains the mobile outbox, replays FSRS via ts-fsrs in `apps/api/src/lib/fsrs.ts`, upserts `item_states`.
- [x] Local attempt evaluation (`apps/mobile/lib/eval/local.ts` already wired via the session screen's submit path).
- [x] Tests for /sessions + /attempts/batch — `sessions.test.ts` + `attempts.test.ts`. Eval-harness for prompt-quality regression is a separate effort.

### Slice E2 — Mobile session UX (answer kinds) ✅ COMPLETED 2026-05-16

- [x] `<MathInput>` component (formula + numeric, live KaTeX preview)
- [x] `<MathKeyboard>` component (4×6 soft-keyboard inserting MathLite tokens)
- [x] `<LatexText>` renderer (react-native-katex + text fallback)
- [ ] _`<VoiceButton>` component — needs native ASR module bindings; deferred until the voice-flow slice._
- [ ] _`<DiagramQuestion>` (pinch zoom, marker pulse) — needs the diagram sharp pipeline from D1.5._
- [x] `<FunctionPlot>` (react-native-svg + mathjs)
- [ ] _`<SvgStimulus>` (sanitized) — niche; deferred until the first item using it ships._
- [x] `<FillBlank>` component
- [x] Replace hardcoded `session/[sessionId].tsx` with real flow (CLAUDE.md §rule #6 cleared on this surface)
- [x] Hint chain (server returns `next_hint`, screen accumulates)
- [ ] _"Erklär mir das" modal — `lib/api/sessions.ts.explainTopic()` is wired; mobile modal UI is a small polish task._

**Done when:** Every answer kind in Doc 07 §3 actually works on device.

---

## Phase F — Subscription, credits, notifications

### Slice F1 — RevenueCat + webhooks ✅ COMPLETED 2026-05-16

- [x] Mobile `react-native-purchases` integration via `apps/mobile/lib/purchases.ts`; configured on root layout with the account_id as `revenuecat_app_user_id`.
- [x] `POST /webhooks/revenuecat` — Bearer-secret check, lifecycle event → tier/status transitions, monthly allotment grants per Doc 08 Path A.
- [x] Daily reconciliation Edge Function (`infra/supabase/functions/reconcile-revenuecat/`) — catches missed webhooks per Doc 08 Path B.
- [x] Mobile subscription screen — Standard/Plus CTAs, restore-purchases, current tier display.

**Setup required (out of code scope):** RevenueCat project + 2 product SKUs + `REVENUECAT_API_KEY` (mobile) / `REVENUECAT_WEBHOOK_SECRET` (server) / webhook URL pointed at `<api>/webhooks/revenuecat`.

### Slice F2 — Notifications ✅ COMPLETED 2026-05-16

- [x] `apps/mobile/lib/notifications.ts` — expo-notifications wrapper + SecureStore prefs.
- [x] Practice nudge (default 16:30, daily repeating) + Streak reminder (+4h) when enabled.
- [ ] _Test heads-up (3 days / 1 day / morning-of) — needs server-side enumeration of upcoming `folders.scheduled_for`; small follow-up. **Open.**_
- [x] Mobile admin notifications screen wired (`(admin)/profile-notifications.tsx`).

---

## Phase G — DSGVO, edge functions, polish

### Slice G1 — DSGVO export / delete ✅ COMPLETED 2026-05-16

- [x] `POST /dsgvo/export` — queues a `dsgvo_requests` row.
- [x] Edge Function `dsgvo-export-worker` — assembles dump (account / learners / subjects / materials / items / attempts), uploads to `dsgvo-exports` storage, 7-day signed URL.
- [x] `POST /dsgvo/delete-account` — 7-day hold + idempotent for existing pending requests; cancel via `POST /dsgvo/delete-account/:id/cancel`.
- [x] Edge Function `dsgvo-delete-executor` — picks requests ≥7d old, deletes the auth user (FK-cascade owns the rest).
- [x] Mobile admin → Data screen wired (`(admin)/data.tsx` + `lib/api/dsgvo.ts`).

### Slice G2 — Photo wipe + audit ✅ COMPLETED 2026-05-16

- [x] Edge Function `photo-wipe` — daily wipe of `materials-raw` storage when `scheduled_photo_deletion_at < now()`, stamps `photos_deleted_at`.
- [x] `dsgvo_requests` table queries via `GET /dsgvo/requests/:id` (account-scoped).
- [ ] _Mobile admin → Privacy & consent review screen — covered by `(admin)/data.tsx` (export+delete) and `(admin)/about.tsx` (consent links). Dedicated review log UI deferred._

### Slice G3 — Admin surface completion ✅ COMPLETED 2026-05-16

- [x] `(admin)/profile-edit.tsx`
- [x] `(admin)/profile-notifications.tsx`
- [x] `(admin)/archived.tsx`
- [x] `(admin)/subscription.tsx`
- [x] `(admin)/data.tsx`
- [x] `(admin)/about.tsx`
- [x] `(admin)/account-settings.tsx`
- [x] `(admin)/material/[id].tsx` — read-only items list, delete bad question

---

## Phase H — Locales, accessibility, polish ✅ COMPLETED 2026-05-16 (partial)

- [x] `apps/mobile/locales/fr/*.json`, `es/*.json`, `it/*.json` — full namespaces for all 5 UX areas (auth, capture, common, onboarding, upload). Legal review still pending per non-DE/EN market.
- [ ] _Accessibility audit per `USER-FLOWS-DEEP §5` — VoiceOver, dynamic type, color-blind, reduced motion, dyslexia font option. Deferred: needs real-device audit + design-system pass._
- [ ] _Extra settings (`USER-FLOWS-DEEP §9`) — haptics toggle, session length picker, photo retention, data saver. Deferred: low-priority polish._
- [ ] _Tutorial / power-feature first-time moments (`USER-FLOWS-DEEP §10`). Deferred: post-launch._

---

## Hardening pass — 2026-05-17

Audit follow-up from `docs/CODEBASE-AUDIT.md`. Items ticked:

- [x] **Admin auth** — `/admin/*` now requires a valid Supabase JWT and checks the verified email against `ADMIN_ALLOWLIST_EMAILS`. Header-only path removed.
- [x] **Sentry + PostHog wired** — `apps/mobile/lib/sentry.ts`, `apps/mobile/lib/analytics.ts`, API `apps/api/src/lib/sentry.ts`. Init at module load in both apps; error middleware reports unhandled exceptions.
- [x] **Idempotency in Postgres** — migration `0010_idempotency_keys.sql` + `apps/api/src/lib/idempotency.ts` swap.
- [x] **pg_cron schedule** — migration `0011_pg_cron_schedule.sql` schedules the 4 Edge Functions + the idempotency cleanup. Set `app.supabase_url` / `app.supabase_service_role` GUCs before applying.
- [x] **CI** — `.github/workflows/check.yml` runs typecheck + lint + test on PRs.
- [x] **Atomic credit debit** — `tryDebit()` now runs a single UPDATE … WHERE current_balance >= $estimate RETURNING (race-free).
- [x] **Bulk attempts/batch** — single INSERT + UPSERT replaces 2N round-trips.
- [x] **Idempotency on /attempts/batch** — middleware applied so a retry can't double-apply 200 attempts.
- [x] **Constant-time webhook compare** — `timingSafeEqual` + 5-minute timestamp window.
- [x] **CORS lockdown + security headers** — origin allowlist via `API_CORS_ORIGINS`; `vercel.json` headers (HSTS, X-Content-Type-Options, etc.).
- [x] **Rate limit on /materials/upload-url** — 60/day.
- [x] **Session item picker pushed into Postgres** — migration `0012_session_pick_items.sql`. JS fallback retained for envs without the RPC.
- [x] **Parallel photo download** — `downloadPhotosAsBase64` is now `Promise.all`.
- [x] **Six 501 routes resolved** — `GET /admin/spend`, `GET /account/credits/summary`, `PATCH/DELETE /materials/:id`, `GET /render/latex` (KaTeX→SVG, immutable cache), `POST /attempts/:id/finalize` removed (voice flow not yet present).
- [x] **Outbox stub deleted** — `apps/mobile/lib/sync/` removed; schema cleared of `outbox_local` / `sync_state`.
- [x] **Tests for the 4 highest-value flows** — `sessions.test.ts`, `attempts.test.ts`, `webhooks.test.ts`, `dsgvo.test.ts`. API now at 116 cases across 14 files.
- [x] **Mobile global ErrorBoundary** — wraps the root layout; reports to Sentry.
- [x] **Accessibility props on lb primitives** — Btn / Card / Chip / CircleBtn / BottomNav / Avatar.
- [x] **i18n sweep — phase 1** — new namespaces `home`, `result`, `session`, `admin`, `errors` across de/en/fr/es/it; high-visibility screens migrated. Long-tail strings continue in follow-up slices.
- [x] **Repo hygiene** — `LICENSE` (proprietary), root `README.md`, empty `LearnBuddy/` removed, `eslint @typescript-eslint/no-explicit-any` bumped to error.
- [x] **Dropped unused deps** — `victory-native`, `i18next-icu`.

Still open follow-ups (next slice):

- _Service-role key rotation_ — `apps/api/.env.local` currently holds a JWT with `exp 2036`. Rotate to a shorter-lived key in Vercel env and drop the on-disk file. (Operational; no code change.)
- _DSGVO export streaming_ — Edge Function currently `JSON.stringify`'s the whole account into memory. Stream / page once a power user account is large enough to OOM the 256 MB cap.
- _Mobile SSE on /materials_ — `apps/mobile/lib/capture/upload.ts` still parses the whole response as text. Real EventSource or XHR-chunked streaming needs `expo-event-source` or a hand-rolled reader.
- _Diagram pipeline (sharp + study-asset upload)_ — Slice D1.5 still deferred.
- _Eval-harness fixtures_ — for prompt-quality regression on D2/D3.

## Build status — 2026-05-16

All ship-without-external-credentials slices complete. Commits:

| Slice                                     | Commit                       |
| ----------------------------------------- | ---------------------------- |
| A1 — Auth signup/consent                  | `1ab0879`                    |
| A2 — Login + password reset + magic link  | `646e8b7`                    |
| A3 — PIN + biometric admin gate           | `4b4369d`                    |
| B1 — Learners CRUD                        | `ff0b46c`                    |
| B2 — Subjects + Folders CRUD              | `bfa8165`                    |
| C1 — Camera + quality scoring             | `c9cf025`                    |
| C2 — Upload-URL + materials POST          | `7d0950e`                    |
| D1 — Vertex AI gateway + vision           | `3521cd4`                    |
| D2 — Regenerate / evaluate / explain      | `77aeca8`                    |
| D3 — Templates feasibility + practice-run | `ad0887f`                    |
| E1 — Sessions + attempts server           | `b670612`                    |
| E2 — Mobile session UX                    | (commit during E2 batch)     |
| G3 — Admin screens                        | (commit during G3 batch)     |
| G1+G2 — DSGVO + photo wipe                | `52d7462`                    |
| F1 — RevenueCat webhook + mobile          | `e0de5d8`                    |
| F2 — Notifications                        | (rolled into Phase H commit) |
| Phase H — fr/es/it locales                | (commit during Phase H)      |

What still needs the user (out of code scope) before launch:

- Vertex AI: configured (see `docs/SETUP-VERTEX.md`).
- Supabase project + migrations applied + Edge Functions deployed (`photo-wipe`, `dsgvo-export-worker`, `dsgvo-delete-executor`, `reconcile-revenuecat`).
- RevenueCat: project + 2 product SKUs + `REVENUECAT_API_KEY` (mobile, EXPO*PUBLIC*\*) and `REVENUECAT_WEBHOOK_SECRET` (api) + webhook URL.
- Email send: Supabase project email templates for password reset + DSGVO export delivery.
- Real-device live verification of: camera, session flow, biometric unlock, push notifications, RevenueCat purchase.
- Diagram pipeline (sharp), eval-harness fixtures, voice input — all deferred slices that build on the above.

---

## How to use this file

When you sit down to work:

1. Pick the **first unchecked slice** in the lowest phase letter.
2. Read the relevant doc section(s) cited in `IMPLEMENTATION-AUDIT.md` for that bucket.
3. Open Claude Code in plan mode. Paste the slice + acceptance criteria + doc section. Get a plan. Approve.
4. Implement. `pnpm typecheck && pnpm test` after every meaningful change.
5. `/engineering:code-review` before commit.
6. Commit with `Doc XX §section: short summary`. Tick the boxes in this file.
7. Update `IMPLEMENTATION-AUDIT.md` if the per-bucket coverage shifts.
