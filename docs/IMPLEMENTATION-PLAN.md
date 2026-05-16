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
- [ ] Mobile `apps/mobile/lib/auth/session.ts` — token storage via `expo-secure-store`, refresh on 401 _(storage done; refresh-on-401 deferred to A2 — see Open follow-ups)_
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

- [ ] `POST /auth/login` (or rely on Supabase JS in mobile and just send JWT to API; either works — choose one)
- [ ] Mobile `login.tsx` form + Supabase JS auth call
- [ ] Mobile `reset-password.tsx` deep-link handler
- [ ] Magic-link path documented (uses Supabase out of the box; mobile catches the deep link)

**Done when:** Returning user can log in on a fresh install, recover password, magic-link login.

### Slice A3 — PIN + biometric admin gate

- [ ] `apps/mobile/lib/auth/pin.ts` — `expo-secure-store` PIN + bcrypt-on-device verify (or scrypt via `react-native-keychain`)
- [ ] Mobile `pin-setup.tsx` writes PIN
- [ ] Mobile `(admin)/unlock.tsx` triggers biometric, fallback PIN, 5-fail lockout per Doc 05 §Unlock
- [ ] All `(admin)/*` screens gated through `unlock` per `_layout.tsx`

**Done when:** Admin section can only be entered with biometric / PIN, lockout works.

---

## Phase B — Learner can create profile + first subject

### Slice B1 — Learners CRUD

- [ ] `POST /learners` — minor consent record handling, 409 on duplicate
- [ ] `PATCH /learners/:id` — partial update (LearnerUpdate schema)
- [ ] `DELETE /learners/:id` — soft archive (`archived_at = now()`); 30-day grace
- [ ] Tests for all three paths
- [ ] Mobile `who-uses.tsx` → branches to `add-profile` or `profile-minor-consent`
- [ ] Mobile `add-profile.tsx` calls `POST /learners`
- [ ] Mobile `profile-minor-consent.tsx` records `minor_consent_version` before POST

**Done when:** A signed-up account can create exactly one learner profile with the right consent record.

### Slice B2 — Subjects + Folders CRUD

- [ ] `GET /learners/:learnerId/subjects`, `POST /learners/:learnerId/subjects`
- [ ] `PATCH /subjects/:id`, `DELETE /subjects/:id` (soft archive)
- [ ] `GET /subjects/:subjectId/folders`, `POST /subjects/:subjectId/folders`
- [ ] `PATCH /folders/:id`, `DELETE /folders/:id` (soft archive)
- [ ] `GET /learners/:learnerId/schedule-summary` — returns test-date chips per Doc 04
- [ ] Tests
- [ ] Mobile home renders real subjects from API (TanStack Query)
- [ ] Mobile subject screen with Ordner/Material tabs renders from API
- [ ] Long-press → rename / archive sheet wired

**Done when:** Learner can create subjects, folders with test dates, and the home screen reflects state.

---

## Phase C — Material capture pipeline (without LLM)

### Slice C1 — Camera + quality scoring

- [ ] `apps/mobile/lib/quality.ts` — local blur/brightness/tilt scoring per Doc 05 §Capture
- [ ] Mobile `capture.tsx` — `expo-camera` viewfinder, live chip overlay, thumbnail strip
- [ ] Multi-photo (1–10) with delete in strip
- [ ] "Trotzdem behalten" override
- [ ] Subject/folder picker post-capture (when not pre-targeted)

**Done when:** User can take 1–10 photos, gets live quality feedback, lands on "uploading…" screen.

### Slice C2 — Upload-URL + materials POST (no LLM yet)

- [ ] `POST /materials/upload-url` — signed PUT URLs from Supabase Storage
- [ ] `POST /materials` — accepts upload IDs, creates `materials` row, returns SSE that immediately yields "done" with **placeholder items** (3 fake items for now)
- [ ] `GET /materials/:id`, `GET /materials/:id/items`
- [ ] Tests
- [ ] Mobile capture → uploads → opens material screen with fake items

**Done when:** Photos upload, material row exists, fake items appear on material screen.

---

## Phase D — LLM-backed AI pipeline

### Slice D1 — Vertex AI gateway + vision extraction

- [ ] `apps/api/src/lib/llm/vertex.ts` — real Gemini 2.5 Flash-Lite client (EU region)
- [ ] Implement `visionExtract()` per Doc 06 §P1 + safety guard + post-processing
- [ ] Implement diagram cropping + marker overlay (sharp) per Doc 06 §2
- [ ] Replace placeholder items in `POST /materials` with real Vertex output
- [ ] Credit debit + refund logic per Doc 08
- [ ] Tests with recorded fixtures (no live calls in CI)

**Done when:** Real photo → real questions, with credit accounting.

### Slice D2 — Regenerate, evaluate, explain endpoints

- [ ] `POST /materials/:id/regenerate-items` with style hints (einfacher / schwieriger / andere art)
- [ ] `POST /attempts` SSE — local-uncertain attempts go to LLM evaluate (P3)
- [ ] `POST /explain` SSE — three styles + "Was bedeutet die Frage?" tab per DEEP §1.6
- [ ] Tests

**Done when:** Hints, evaluation, explain all work against real Vertex.

### Slice D3 — Templates + practice runs

- [ ] Template extraction in vision pipeline (Doc 06 §P1.4)
- [ ] Server-side feasibility validation (5-sample, ≥60%)
- [ ] `POST /templates/:id/practice-run` (server picks variant range, mobile generates client-side)
- [ ] Mobile practice-run screen with `mathjs` variants
- [ ] Tests

**Done when:** Math items can spawn 10+ variants per Doc 07 §6.

---

## Phase E — Studying & adaptive review

### Slice E1 — Sessions + Attempts (server side)

- [ ] `POST /sessions` — FSRS-driven item selection per Doc 04
- [ ] `POST /attempts/batch` — batch attempts replay from outbox; server recomputes FSRS
- [ ] Local attempt evaluation (`apps/mobile/lib/eval/local.ts` already exists — wire it)
- [ ] Tests

### Slice E2 — Mobile session UX (answer kinds)

- [ ] `<MathInput>` component (formula + numeric, KaTeX preview)
- [ ] `<MathKeyboard>` component
- [ ] `<LatexText>` renderer
- [ ] `<VoiceButton>` component (native ASR via SFSpeech / Android SpeechRecognizer + VAD)
- [ ] `<DiagramQuestion>` (pinch zoom, marker pulse)
- [ ] `<FunctionPlot>` (victory-native)
- [ ] `<SvgStimulus>` (sanitized)
- [ ] `<FillBlank>` component
- [ ] Replace hardcoded `session/[sessionId].tsx` with real flow
- [ ] Hint chain, "Erklär mir das" modal

**Done when:** Every answer kind in Doc 07 §3 actually works on device.

---

## Phase F — Subscription, credits, notifications

### Slice F1 — RevenueCat + webhooks

- [ ] Mobile `react-native-purchases` integration (signup uses fresh `revenuecat_app_user_id`)
- [ ] `POST /webhooks/revenuecat` — webhook signature verify, tier updates, credit grants
- [ ] Daily reconciliation Edge Function (`infra/supabase/functions/reconcile-revenuecat/`)
- [ ] Mobile subscription screen — upgrade / downgrade / cancel / restore

### Slice F2 — Notifications

- [ ] `apps/mobile/lib/notifications.ts` — expo-notifications wrapper, per-profile scheduling
- [ ] Practice nudge (default 16:30, only on days unopened)
- [ ] Test heads-up (3 days / 1 day / morning-of)
- [ ] Mobile admin notifications screen

---

## Phase G — DSGVO, edge functions, polish

### Slice G1 — DSGVO export / delete

- [ ] `POST /dsgvo/export` — queue worker job
- [ ] Edge Function `dsgvo-export-worker` — assembles `account.json`, learners, etc., uploads to Storage, sends signed URL email
- [ ] `POST /dsgvo/delete-account` — 7-day hold + cancel
- [ ] Edge Function `dsgvo-delete-executor` — runs at 7 days
- [ ] Mobile admin → Data screen wired

### Slice G2 — Photo wipe + audit

- [ ] Edge Function `photo-wipe` — daily, removes raw photos at T+7d
- [ ] `dsgvo_requests` audit log table queries
- [ ] Mobile admin → Privacy & consent review screen

### Slice G3 — Admin surface completion

- [ ] `(admin)/profile-edit.tsx`
- [ ] `(admin)/profile-notifications.tsx`
- [ ] `(admin)/archived.tsx`
- [ ] `(admin)/subscription.tsx`
- [ ] `(admin)/data.tsx`
- [ ] `(admin)/about.tsx`
- [ ] `(admin)/account-settings.tsx`
- [ ] `(admin)/material/[id].tsx` — read-only items list, delete bad question

---

## Phase H — Locales, accessibility, polish

- [ ] `apps/mobile/locales/fr/*.json`, `es/*.json`, `it/*.json` (legal namespaces hand-translated; rest machine-translated with missing-key handler)
- [ ] Accessibility audit per `USER-FLOWS-DEEP §5` — VoiceOver, dynamic type, color-blind, reduced motion, dyslexia font option
- [ ] Settings the docs don't fully spec (`USER-FLOWS-DEEP §9`) — haptics toggle, session length picker, photo retention, data saver
- [ ] Tutorial / power-feature first-time moments (`USER-FLOWS-DEEP §10`)

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
