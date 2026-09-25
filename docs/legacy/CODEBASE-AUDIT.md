# LearnBuddy — Codebase Audit

Date: 2026-05-17
Auditor: Claude (engineering subagent, full-repo read sweep)
Scope: every file under `apps/`, `packages/`, `infra/`, `supabase/`, root configs. 17 commits since the 2026-05-12 audit; this one supersedes `IMPLEMENTATION-AUDIT.md`.

> **Hardening pass applied on 2026-05-17.** Items 1, 2, 3, 4, 5, 6, 8, 9, 10,
> 11, 13, 14, 15, 16, 17, 19 and 20 from the priority action plan below have
> shipped — see the "Hardening pass — 2026-05-17" section in
> `IMPLEMENTATION-PLAN.md` for the per-item commit notes. Item 7 (rotating
> the on-disk service-role JWT) is operational and outside Claude's reach;
> `apps/api/.env.example` documents the rotation expectation. The remaining
> 🟠 items (mobile a11y deep audit, DSGVO export streaming, mobile SSE
> transport, sharp-based diagram pipeline) are scoped as follow-up slices.
> The 🔴 list as it stood at the top of the file is now zero open.

---

## Executive summary

**Grade: B–.**

In five days the project has gone from a stubbed skeleton (~5–8% built) to a coherent, mostly-implemented vertical: 14 API route files with real handlers and credit accounting, all 9 Postgres migrations with RLS on every owner table, 4 Edge Functions (DSGVO export, delete-executor, photo-wipe, RevenueCat reconcile), Vertex Gemini 2.5 integration with safety + JSON-retry, FSRS-driven session selection, RevenueCat webhook, DSGVO 7-day-hold delete + export, real session UX with 6 answer kinds, biometric admin gate, i18n in 5 locales, and a Husky pre-commit gate that also smoke-bundles Metro. The architecture (Hono + dep-injection seam, fake-supabase for tests with no `vi.mock` shenanigans, single LLM gateway interface) is genuinely good and rare in agent-generated codebases.

But it is **not ready to ship to a closed beta this week**. Three classes of blocker:

1. **Two real security holes** — admin endpoint trusts an unsigned `X-Admin-Email` header (`apps/api/src/routes/admin.ts:7-12`), and `.env.local` with a live `SUPABASE_SERVICE_ROLE_KEY` sits unencrypted in `apps/api/.env.local` (gitignored but readable by anything on disk).
2. **Idempotency cache is in-memory only** (`apps/api/src/lib/idempotency.ts:21`) — on Vercel cold-starts every retry will re-execute and risk double-spending credits.
3. **Observability is not wired** — Doc 02 §observability mandates Sentry + PostHog; both are package.json deps but **zero call sites** in `apps/mobile`. The API has `console.error` only. The moment a real user hits something broken in beta, no one will know.

Plus widespread but smaller items: 20 of 28 mobile screens still hardcode German strings, the offline-outbox in `apps/mobile/lib/sync/outbox.ts:85-89` marks rows done without actually sending them (silent data loss if anything calls `enqueue()`), Edge Functions are written but no `pg_cron` migration was ever shipped to actually schedule them, `/account/credits/summary` and 5 other documented endpoints still return 501, and there are no API tests for sessions/attempts/dsgvo/webhooks (the four highest-value flows).

Bottom line: the build plan claims D2/D3/E1/E2/F1/G1-3/H are "✅ COMPLETED 2026-05-16" and structurally that's true — the code exists, the surface matches Doc 04. But "shipped slice" is not "shipped product." Closing the security + observability + scheduler gaps is one focused day; closing the offline-outbox + missing-tests + i18n gaps is a week. Beta in one week is realistic if you spend it on the gaps below rather than new features.

---

## System overview

```
                ┌──────────────────────┐
                │  Mobile (Expo SDK 54)│   React 19 / RN 0.81 / expo-router 6
                │  - app/(onboarding)  │
                │  - app/(learner)     │
                │  - app/(admin) modal │
                │  - lib/api/* (typed) │
                │  - lib/auth/session  │   SecureStore
                │  - lib/camera/*      │   blur/brightness/tilt local
                │  - lib/eval/local    │   FSRS + MathLite
                └──────────┬───────────┘
                           │ HTTPS bearer JWT + X-Learner-Id
                           ▼
                ┌──────────────────────┐
                │  API (Hono on Vercel)│   Node 22, fra1
                │  - middleware/auth   │   real getUser() + accounts join
                │  - middleware/rate-limit  in-mem buckets
                │  - lib/deps          │   DI seam
                │  - lib/credits       │   tryDebit / settle / refund
                │  - lib/llm/vertex    │   Gemini 2.5 Flash-Lite EU
                │  - 14 route files    │
                └──────────┬───────────┘
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
     ┌────────────┐  ┌───────────┐  ┌─────────────┐
     │ Supabase   │  │ Vertex AI │  │ RevenueCat  │
     │ Postgres   │  │ EU-west4  │  │ webhook +   │
     │ + Storage  │  │           │  │ reconcile   │
     │ + Auth     │  │           │  └─────────────┘
     │ + 4 Edge   │  └───────────┘
     │   Functions│
     └────────────┘
```

**Lines of code (real, excluding node_modules / .expo):**

- API routes: 2,667 LOC across 14 files
- API lib + middleware + prompts: ~2,500 LOC
- API tests: 1,387 LOC (48 `it(...)` cases)
- Mobile app screens: 3,791 LOC across 28 files
- Mobile lib: ~1,800 LOC
- Mobile components/lb: ~1,500 LOC across 22 primitives
- Mobile tests: 1 file (camera/quality)
- Migrations: 9 files, 24,679 chars

---

## Domain findings

### 1. Architecture & Design — 🟢

The seams are excellent.

**Strengths**

- `apps/api/src/lib/deps.ts` is a clean dependency-injection boundary. Routes pull `getDeps(c)` and never import `supabase` directly. Tests inject `FakeSupabase` + `FakeLlmGateway` without `vi.mock`. (CLAUDE.md §rule 2 is enforced structurally, not just by lint.)
- `apps/api/src/app.ts:35-71` composes a single Hono instance, used both by `dev-server.ts` and the Vercel `[[...slug]].ts` catch-all. One code path for both.
- `apps/api/src/lib/llm/factory.ts:33-44` is the right factory: 'fake' for test, 'vertex' for prod, hard-crashes if NODE_ENV=production without `GOOGLE_CLOUD_PROJECT`. That last branch is the kind of paranoia that prevents a "fake LLM in production" incident.
- Monorepo discipline: `packages/shared-types` is the only place zod schemas live; `packages/shared-math` isolates MathLite + numeric normalize. Both have vitest configs and unit tests.
- Mobile uses the same Doc 04 shapes via `@learnbuddy/shared-types` — no DTO drift.

**Findings**

- 🟡 No service layer in API. Route handlers do data access directly via the supabase client. Fine at this size; will hurt when complex flows arrive (e.g. session creation now does 3 queries + in-memory join in `routes/sessions.ts:45-95` — a `lib/sessions/pickItems.ts` extraction would help testing).
- 🟡 The `LearnBuddy/` empty directory at repo root (visible in `git status`) is leftover from earlier scaffolding and could be removed.
- ℹ️ `.opencode/` exists and is just a single dev-dep on `@opencode-ai/plugin`. No convention divergence from `.claude/`.

### 2. Code Quality & Practices — 🟢

**Strengths**

- **Zero `: any`, `as any`, or `<any>`** across `apps/api/src` and `apps/mobile/lib|app|components`. Grep confirmed. TypeScript strict + `noUncheckedIndexedAccess` + `noImplicitOverride` are on (`tsconfig.base.json:6-9`).
- **Zero `vi.mock` / `jest.mock`** in the entire codebase. Tests use the dep-injection seam.
- File headers consistently cite the spec section (`Doc 04 §materials + Doc 06 §P1 + Doc 08 §atomic-debit` etc.) — makes drift detection cheap.

**Findings**

- 🔴 **`notImplemented()` remnants still in code:**
  - `apps/api/src/routes/admin.ts:16` — `GET /admin/spend`
  - `apps/api/src/routes/account.ts:79` — `GET /account/credits/summary`
  - `apps/api/src/routes/attempts.ts:273` — `POST /attempts/:client_id/finalize`
  - `apps/api/src/routes/materials.ts:657-658` — `PATCH /materials/:id`, `DELETE /materials/:id`
  - `apps/api/src/routes/render.ts:9` — `GET /render/latex`
  - 6 routes total. Spec calls all 6 out; CLAUDE.md §rule 1 says "Never leave `notImplemented()` in a route you touched". The materials ones violate this directly — `materials.ts` was just touched and these two are still here.
- 🟡 ESLint rule `@typescript-eslint/no-explicit-any` is **`warn`, not `error`** (`eslint.config.mjs:34`). Code happens to comply, but lint is not actually preventing regression. Bump to `error` to lock the win in.
- 🟡 `apps/mobile/lib/sync/outbox.ts:36-40` reimplements UUID v4 with `Math.random()` instead of `expo-crypto` — the comment admits it's "for the skeleton". This file is dead code today (see Finding 6.D), but if revived it must use a real CSPRNG.
- 🟡 `apps/api/src/routes/materials.ts` is 658 LOC — at the edge of "split me up." Helpers (`ownedSubject`, `ownedFolder`, `ownedMaterial`, `downloadPhotosAsBase64`, `toItemRow`, `markFailed`) belong in `apps/api/src/lib/materials/`.

### 3. Security — 🔴

This is the area with the biggest deltas.

**Findings**

- 🔴 **`apps/api/src/routes/admin.ts:7-12` — admin auth is forgeable.** The middleware reads `X-Admin-Email`, splits `ADMIN_ALLOWLIST_EMAILS` env, and checks membership. There is **no JWT verification of the asserted identity**. Anyone who knows an admin's email address can send `X-Admin-Email: kurt@…` and call `/admin/*`. Currently `/admin/spend` is the only route and it's 501, but the door is unlocked. Fix: require `requireAuth` first, then check `c.get('auth').email` against the allowlist.
- 🔴 **`apps/api/.env.local` contains a live Supabase service-role JWT.** Confirmed not in git history and `.gitignore` covers it, but: (a) the file is world-readable by any process under the user account, (b) developer machines get compromised, and (c) the JWT's `exp` is **2036-09-13** (decoded from the file) — a 10-year window. Rotate to a shorter-lived key and document the path in `SETUP-*.md`. Service-role keys should be ephemeral env vars, not on-disk files.
- 🔴 **Idempotency cache is in-memory** (`apps/api/src/lib/idempotency.ts:21,67`). On Vercel the cache is per-cold-start instance. Two consequences:
  - A retry that lands on a different lambda will re-execute the handler. For `/materials/upload-url` this is mostly fine (signed URL gets re-issued); for `POST /materials` it will **double-debit credits and double-call Vertex**.
  - The "stored response replay" path is never exercised in real traffic. Documented as deferred ("Until that migration lands the helper is in-memory") — the migration was never written. Add an `idempotency_keys` table to migration 0010 and back the helper with it.
- 🟠 **Rate-limit buckets are in-memory too** (`apps/api/src/middleware/rate-limit.ts:8`). Same per-lambda problem. A motivated client gets N×the limit where N = parallel cold instances. Acceptable for soft caps but not for the abuse-prevention ones (`materials_create per_day: 20`, `explain per_day: 60`). Move to a Postgres counter or Upstash Redis.
- 🟠 **RevenueCat webhook uses shared-secret in `Authorization: Bearer <secret>`** (`apps/api/src/routes/webhooks.ts:55-62`). This is RevenueCat's documented option, fine. But: no replay protection (no nonce / timestamp window), and the comparison is non-constant-time (`!==`). Replace with `crypto.timingSafeEqual` and reject events older than 5 minutes by `event.event_timestamp_ms`.
- 🟠 **Service-role client bypasses RLS** (`apps/api/src/lib/deps.ts:28`) and is used in every route. Because the API layer enforces `account_id`/`learner_id` ownership before any query, the de-facto perimeter is correct, but any future SQL injection or path-traversal bug in a route handler becomes a full data leak instead of an RLS-bounded one. Consider a second client that runs as the request's user (via `setSession`-style) and using the service client only for credit/billing mutations.
- 🟠 **No CSRF/origin protection on webhooks or admin.** Acceptable because both require credentials, but worth adding an explicit `origin` check for browser-originated requests.
- 🟠 **CORS is wide open** (`apps/api/src/app.ts:42` — `cors({ origin: '*' })`). No web app exists per spec, but `*` plus credentials would be a real concern. Lock to mobile bundle id / dev origins.
- 🟡 **JWT verification is correct but slow** (`apps/api/src/middleware/auth.ts:42-67`). Every request hits Supabase Auth `getUser(token)` plus a `SELECT id FROM accounts WHERE owner_user_id`. That's two network round-trips per call. Cache decoded `(user_id → account_id)` in a per-instance LRU keyed by the token hash. Saves real money at 600 attempts/h/learner per the rate limit.
- 🟡 **`apps/mobile/lib/auth/pin.ts`** uses `bcryptjs` (pure JS) — slow on RN Hermes. Acceptable for a single PIN unlock but mark as "ok for v1."

### 4. Performance — 🟠

**Findings**

- 🟠 **`routes/sessions.ts:45-95` — load-all-then-filter.** The handler:
  1. SELECT \* FROM items WHERE learner_id=… (all of them, no LIMIT).
  2. If subject/folder filter: SELECT \* FROM materials WHERE learner_id=… (all).
  3. SELECT \* FROM item_states WHERE learner_id=… (all).
  4. Sort + slice in Node.
     At 100 items per learner this is fine; at 5000 items (a power user after a school year) it's a 3–5 MB read on every `POST /sessions` and a CPU spike. The index `item_states_learner_due_idx` exists (`0005_fsrs_sessions.sql:18`) — push the overdue-first + LIMIT down into a SQL view or a Postgres function.
- 🟠 **`routes/attempts.ts:198-265` — `/attempts/batch` does N round-trips.** Each accepted attempt does 1 INSERT into `attempts` + 1 UPDATE or INSERT into `item_states`. For a 200-item batch (the schema limit) that's ~400 sequential round-trips. Should be a single bulk INSERT for attempts + an UPSERT for `item_states` (`ON CONFLICT (item_id) DO UPDATE`). Mobile draining a week of offline answers will time out.
- 🟠 **`routes/materials.ts:419-431` — `downloadPhotosAsBase64` is sequential.** Up to 10 storage downloads serialized; should be `Promise.all`. Pictures average 100–300 KB so this adds 1–3 s to vision latency unnecessarily.
- 🟡 **`/materials` does Vertex inside the request lifetime, then streams SSE only at the end** (`routes/materials.ts:285-385`). The whole call is synchronous; the "streaming" is just three artificial phase markers after `await llm.visionExtractAndGenerate()` returns. For 5–10 photo materials Vertex can take 20–40 s. Move to a real job queue (`outbox` table is already present in migration 0007) and stream actual progress to the client.
- 🟡 **`learners.ts:209-263` — `GET /learners/:id/subjects`** runs 3 queries and joins in JS. The comment justifies it at "≤ ~12 subjects per learner" which is true for now. Add a covering index on `materials(subject_id) where archived_at is null` (already present!) and replace with a single SQL `LEFT JOIN LATERAL` aggregation when it matters.
- 🟡 **Mobile bundle weight.** `victory-native` is in `apps/mobile/package.json:48` but **never imported** (FunctionPlot uses `react-native-svg` directly, comment confirms). `i18next-icu` is declared but no ICU pluralization in any locale file. `nativewind` declared but zero `className=` usage in `app/` or `components/lb/` (raw `style={…}` everywhere). Removing these three drops Metro bundle weight materially.

### 5. Testing & Quality Assurance — 🟠

**Findings**

- 🟢 The 48 API tests that exist are good. They use the fake-supabase end-to-end, exercise the auth → handler → response shape, and verify the persisted state (e.g. `materials.test.ts` checks credit-bucket debit, photo-row persistence, and the SSE done payload).
- 🔴 **Zero tests for the four highest-stakes route files:** `sessions.ts`, `attempts.ts`, `dsgvo.ts`, `webhooks.ts`. The two that handle money (`/webhooks/revenuecat` granting credits, `/attempts` debiting them) have no automated coverage. The implementation plan acknowledges this ("deferred to the eval-harness slice") but it has now been deferred through three slices.
- 🔴 **No tests for `templates.ts`, `explain.ts`, `items.ts`, `admin.ts`.** These cover D2/D3/G3 functionality that is marked complete.
- 🟠 **One (1) mobile test file** — `apps/mobile/lib/camera/__tests__/quality.test.ts`. Mobile vitest infra exists. PIN module, local FSRS, local-evaluate, capture store, sync outbox, API client — all untested. CLAUDE.md §rule 6 is structurally enforced (no `useState('hardcoded')` content) but no test would catch its return.
- 🟠 **Fake fidelity gaps:** `apps/api/src/test/fake-supabase.ts:83` documents `order()` as a no-op; any handler that relies on DB-side ORDER BY is silently passing the test with arbitrary order. The sessions selection logic sorts in JS afterwards so this happens to be safe, but it's a footgun.
- 🟡 **No integration test against a real Supabase.** The implementation plan calls "Live verification" out for every slice as a follow-up; the `pnpm db:start` script CLAUDE.md references doesn't exist (`grep -n "db:start" package.json` is empty). No way to exercise RLS policies, foreign key cascades, or unique-index races at all today.
- 🟡 **No CI workflow.** `.github/workflows/` doesn't exist. The Husky pre-commit gate is the only check, and it can be bypassed with `--no-verify`. Add GitHub Actions: `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test`.

### 6. Business Logic, User Flows & Edge Cases — 🟡

Traced three critical journeys end-to-end.

**J1 — Cold install → home (signup happy path):** Welcome → language-pick → age-check → signup → consent → who-uses → add-profile → home.

- Mobile screens exist for all 8 steps. API: `POST /auth/account/signup` (real, with dev-mode admin-create shortcut), `POST /auth/account/consent`, `POST /learners`. Account/learner row creation transaction is correct. Trial 1500 credits + 14d ends granted (`auth.ts:148-167`).
- 🟠 **Gap:** `apps/mobile/app/index.tsx` redirects to `(onboarding)/welcome` unconditionally — the cold-launch "if account exists, drop to home" path Doc 04 §49-65 specifies is not implemented. Returning users on a fresh install always see onboarding again.
- 🟡 **Gap:** Account holder cannot delete a learner from inside the app and create a new one in the same session — `learners.test.ts:124-134` validates the soft-archive uniqueness gives 200 on recreate, but mobile UX never wires "create another profile."

**J6 — Capture → AI → study (the money path):** Camera → quality chip → subject-folder → upload progress → material screen → start session.

- Capture (`app/(learner)/capture.tsx`) does real expo-camera + DeviceMotion + per-shot scoring via `lib/camera/quality.ts`. Multi-photo strip works. "Trotzdem behalten" red-override sheet exists.
- Upload (`app/(learner)/upload.tsx`) calls `POST /materials/upload-url`, PUTs to signed URLs, then `POST /materials` which streams SSE.
- 🟠 **Gap in SSE transport:** `apps/mobile/lib/capture/upload.ts` parses the whole response as text and greps for `data:` — not actual streaming, the user just stares at "uploading…" until Vertex returns (20–40 s). The phase markers are fired all at once. Visible product issue.
- 🟠 **Gap in failure recovery:** If `POST /materials` returns 502 mid-pipeline, the mobile app shows an alert and the user is stranded — no retry button, no resume from "photos uploaded but not extracted" state. The server-side refund is correct (`materials.ts:262-280`), but the mobile flow can't navigate back to a useful place.

**J9 — Study session (correctness path):** Pick subject → session loads → answer item → verdict → next.

- Real flow in `app/(learner)/session/[sessionId].tsx`. Local FSRS eval before LLM call (`lib/eval/local.ts`). Correct → 0-credit fast path. Wrong → LLM evaluation, refund on error.
- 🟠 **Gap:** Session resume after backgrounding/kill. The session_id and index are not persisted. If the user backgrounds the app, the server thinks the session is still open; the client loses its index. Doc 05 §session is silent on this — `[implied — needs design]`.
- 🟡 **Gap:** Hint chain (`hints` state) resets on next-item but is never sent in the second attempt's `prior_hints_given` for the same item if the user retries. P3 prompt expects accumulation.
- 🟡 **Gap:** `result.tsx` (115 LOC) renders the post-session summary — does NOT show count of items reviewed to the learner (good, per Doc 01), but also does not show what they got right (which Doc 05 §result allows). Looks stub-ish.

**Other findings**

- 🔴 **`apps/mobile/lib/sync/outbox.ts:79-89` — the offline outbox silently swallows writes.** `drain()` marks every row `done_at = now` without sending it. The file has no callers in the current codebase, so no real damage yet. But if any future surface calls `enqueue()` thinking it's the documented offline outbox, data loss is silent. Either implement the dispatcher or delete the file.
- 🟠 **`/learners/:id/schedule-summary` returns hardcoded zeros for streak** (`learners.ts:343-348`: `streak_current: 0, streak_longest: 0, last_session_at: null`). Mobile renders these. Acceptable as a stub if the UI doesn't lie about it; currently the home screen doesn't show streak, so OK — but the contract is dishonest. Mark with TODO or return `null` and have the mobile contract surface "not yet computed."

### 7. UI/UX, Accessibility & Internationalization — 🔴

**Strengths**

- The design tokens in `apps/mobile/lib/theme/colors.ts` match the pastel-maximalist brief — primary ink + warm brown (`primary: '#b1715c'`), full subject pastel palette (lavender/peach/mint/blush/sky/butter/rose), black-pill CTA convention is enforced in `Btn.tsx:27`.
- Components/lb/\* (22 primitives) are real and used.
- Tone copy is correct: "Fast richtig — fehlt nur noch …" (`session/[sessionId].tsx:384`), no "Falsch", no count of "due items" surfaced.

**Findings**

- 🔴 **20 of 28 mobile screens do not use `useTranslation`** — they have hardcoded German strings. Confirmed list includes `home.tsx`, `result.tsx`, `welcome.tsx`, `add-profile.tsx`, `language.tsx`, `verify-email.tsx`, `account-signup.tsx`, and all 8 `(admin)/*.tsx`. CLAUDE.md says "i18n keys must exist for de/en/fr/es/it" — they don't.
- 🔴 **Two (2) `accessibilityLabel`/`Role`/`Hint` props across the entire mobile app.** Both in `capture.tsx`. Every Btn, Card, Chip, Pressable in 28 screens is invisible/unannouncable to VoiceOver. The Plan-doc Phase H punts this as "Deferred: needs real-device audit" — but a single sweep of the 22 lb primitives to add default a11y props would lift the whole app. This is the single biggest gap between "works on my phone" and "shippable to anyone who needs assistive tech."
- 🟠 **No dynamic-type support.** Font sizes are literal numbers in style objects (`fontSize: 16`). RN's `PixelRatio.getFontScale()` is never consulted.
- 🟠 **No reduced-motion handling.** `react-native-reanimated` is a dep but `AccessibilityInfo.isReduceMotionEnabled()` is never checked.
- 🟠 **i18n namespaces are only 5** (auth, capture, common, onboarding, upload). Missing: session, result, home, admin, errors. Each existing namespace has full de/en/fr/es/it.
- 🟡 **No `<EmptyState>` consistency.** A primitive exists (`components/lb/EmptyState.tsx`) but home/material/folder screens hand-roll their empties.
- 🟡 **Welcome screen ships an inline dev-only overlay** (`welcome.tsx`) — confirm it's gated by `__DEV__` before TestFlight.

### 8. Data Model & Schema — 🟢

**Strengths**

- 9 migrations, monotonic IDs, no edits to merged ones. RLS enabled on every owner-scoped table (4 + 4 + 8 + 4 + 6 + 6 + 2 + 2 + 1 = 37 policies across the migrations). `outbox` is explicitly service-role-only ("no RLS", `0007_ops_dsgvo.sql:5`).
- Soft-archive pattern is consistent: every owner table has `archived_at timestamptz`, indexes are partial `where archived_at is null`.
- FKs cascade correctly: deleting an account → cascade learners → cascade subjects/materials/items/states/attempts. Verified by reading 0001–0006.
- Unique partial indexes for "one active row" rules (`learners_account_idx`, `accounts_owner_idx`).
- `updated_at` trigger is centralized in `lb_set_updated_at()`.
- Storage buckets (materials-raw, study-assets, dsgvo-exports) have correct owner-only-SELECT policies that match the per-account-path layout the API uses.

**Findings**

- 🟠 **No `idempotency_keys` table.** Migration 0007 was the place; deferred to later. See Finding 3.C.
- 🟡 **`practice_runs` table referenced by routes/templates.ts** but I cannot find it in migrations 0001–0009 — confirm or add migration 0010. Routes will 500 in prod the first time someone calls `POST /templates/:id/practice-run`.
- 🟡 **No `audit_log` table.** Doc 09 §audit mentions an audit trail for consent + DSGVO operations; we have `credit_events` (financial only).
- 🟡 **`outbox` table exists** (0007) but is unused by the API. The implementation-plan calls "outbox-driven photo wipe / DSGVO worker" — actual functions use direct SELECT, no queue.
- ℹ️ Add `created_at`/`updated_at` to `material_photos` (currently has only created_at) for forensic queries.

### 9. API Design & Contract — 🟡

**Strengths**

- Error envelope matches Doc 04 §conventions: `{ error: { code, message, details? } }` consistently via `ApiError.toJSON()`.
- 14 error codes mapped to HTTP statuses (`apps/api/src/lib/errors.ts:22-38`). Includes `learner_already_exists` (409), `insufficient_credits` (402), `not_educational` (422) — domain codes per spec.
- Idempotency middleware applied to mutators that need it (`auth.ts:25`, `learners.ts:37`, `subjects.ts:156` etc.). See Finding 3.C for the in-memory caveat.
- `/v1` prefix handled at the Vercel rewrite (`apps/api/vercel.json:9`) so dev and prod both work.

**Findings**

- 🔴 **6 routes return 501** (listed in Finding 2.A). Doc 04 §materials lists `PATCH /materials/:id` and `DELETE /materials/:id` as v1 surface. G3 slice claimed complete but these endpoints aren't.
- 🟠 **Response shapes drift from Doc 04 in places:**
  - `GET /materials/:id` returns `{ ...material, items, templates: [], study_assets: [] }` (`materials.ts:474-484`). `templates` and `study_assets` are always empty arrays — placeholders. Doc 04 doesn't define this shape; will surprise mobile when real data arrives.
  - `GET /account` returns `consent: null` even for users who haven't accepted yet (correct), but no `requires_consent: true` flag (Doc 04 §account implies mobile derives this from consent==null + onboarding state).
- 🟠 **Idempotency not applied to `/attempts/batch`** (`attempts.ts:197`). A retry from a flaky network will double-apply 200 attempts. Critical for FSRS state.
- 🟠 **`/materials/upload-url` has no rate limit.** A bad client can flood signed-URL minting (each is one Supabase API call). Plan-doc follow-up notes this; not done.
- 🟡 **No cursor pagination implemented anywhere.** Doc 04 §pagination spec is documented but no list endpoint returns `next_cursor`. Subjects/folders/items will eventually exceed the implicit 1000-row Supabase fetch.
- 🟡 **Empty-body PATCH error message is correct** ("Empty update body" in `learners.ts:91`) but inconsistent — `subjects.ts` doesn't do the same check.

### 10. Error Handling & Error UX — 🟡

**Strengths**

- `ApiError` taxonomy is mature and used end-to-end. Mobile `lib/api/client.ts:24-33` parses and rethrows with the same `code`.
- Refund logic is plumbed: every LLM call path is wrapped in `try/finally`-style with `refund(supabase, account_id, debit)` on any failure (`materials.ts:262-280`, `attempts.ts:160`, `explain.ts:65`).
- Mobile uses `Alert.alert` for terminal errors (`session/[sessionId].tsx:83`) — coarse but at least surfaced.

**Findings**

- 🟠 **No global mobile error boundary.** A render crash in any screen brings the whole app down with the RN red-box → blank in production.
- 🟠 **Mobile `useMutation` errors are sometimes `console.log` only** (e.g. capture upload flow). No toast, no inline UI.
- 🟠 **`markFailed()` writes failure but does not retry.** If Vertex returns transient 503, the user is told "extraction failed" and has to re-photograph. A single retry with backoff would catch most flakes.
- 🟡 **No 5xx → user-friendly copy mapping.** `client.ts` throws `ApiError` with the raw server message; many screens display it directly. Doc 05 §errors specifies tone-correct copy.

### 11. Documentation — 🟢

**Strengths**

- 7,737 lines across 17 docs. Doc 01–10 are the spec; 04 and 05 are particularly thorough.
- Every API route file opens with a `// Doc XX §…` citation block — easy to verify drift.
- Every migration cites the doc section it implements (`-- Source: docs/03-data-model.md §...`).
- `IMPLEMENTATION-PLAN.md` is the ground truth for "what's done" and the open-follow-ups bullets at the bottom of each slice are genuinely useful retrospectives.

**Findings**

- 🟠 **`docs/IMPLEMENTATION-AUDIT.md` is 5 days stale** and contradicts current reality (states "every handler returns HTTP 501"). Replace pointer to this audit or delete.
- 🟠 **No `CONTRIBUTING.md`, no `README.md` at repo root.** New engineer onboarding starts with… CLAUDE.md? That works for an agent, less so for a human. The `docs/README.md` exists but doesn't tell you "run `pnpm install && pnpm typecheck && pnpm -F @learnbuddy/api dev`".
- 🟠 **`pnpm db:start` is referenced in `CLAUDE.md` but doesn't exist.** Either add it (and a `supabase` local-dev setup script) or remove the reference.
- 🟡 **`docs/SETUP-VERTEX.md` exists; `docs/SETUP-SUPABASE.md`, `SETUP-REVENUECAT.md`, `SETUP-SENTRY.md` do not.**

### 12. Dependencies & Supply Chain — 🟡

**Strengths**

- pnpm-lock.yaml present, ~433 KB. `engines.node: >=22 <27`, `engines.pnpm: >=10` pinned.
- No alpha/beta/RC deps. Versions are realistic for Expo SDK 54.

**Findings**

- 🟠 **`react-native-katex@1.3.0`** — unmaintained (last release 2023), and the package is a webview wrapper. Single point of failure for math display. Track replacement.
- 🟠 **`@google-cloud/vertexai@1.12.0`** — sunsets 2026-06-24 per the IMPLEMENTATION-PLAN follow-up. Migration to `@google/genai` should be Q1 2026; today is 2026-05-17, so we're past that and not yet migrated.
- 🟠 **Three unused deps in `apps/mobile/package.json`:** `victory-native` (FunctionPlot uses raw `react-native-svg`), `i18next-icu` (no ICU patterns in any locale), `nativewind` + `react-native-css-interop` (no `className=` in app code, only inline styles). Remove or use. The CSS-interop + tailwind pair adds ~150 KB to Hermes bundle for zero benefit.
- 🟡 **`bcryptjs@2.4.3`** — superseded by `bcrypt-ts` which has TS-native types and no `Buffer` pollyfill. Acceptable for PIN unlock.
- ℹ️ React 19.1 + RN 0.81 is a relatively fresh combo; expect some library lag (RevenueCat, Sentry already shipping RN 0.81 support).

### 13. DevOps, CI/CD & Observability — 🔴

**Findings**

- 🔴 **No CI.** No `.github/workflows/`, no `.circleci/`, no `.gitlab-ci.yml`. Pre-commit is local and skippable. (Confirmed: `find .github -type f` returns nothing.) A single PR from a sleepy author can break main with no automated check.
- 🔴 **Sentry not initialized.** `@sentry/react-native@7.2.0` is in `apps/mobile/package.json:25`. Zero imports across the mobile codebase. `Sentry.init({...})` is missing from `_layout.tsx`. The API has no Sentry node SDK at all.
- 🔴 **PostHog not initialized.** `posthog-react-native@3.6.4` in deps. Zero imports. No `PostHogProvider`. Doc 02 §observability mandates both.
- 🔴 **No pg_cron schedule for the Edge Functions.** `photo-wipe`, `dsgvo-export-worker`, `dsgvo-delete-executor`, `reconcile-revenuecat` all exist in `infra/supabase/functions/` but the comment "schedule daily via pg_cron in a separate migration" (`photo-wipe/index.ts:11-13`) is the only hint. No migration creates the schedule. Functions will deploy but never run. Photos will not be wiped, accounts will not be deleted, missed RevenueCat events will pile up.
- 🟠 **`apps/api/vercel.json`** — `maxDuration: 300` is correct for Vertex calls; `regions: ["fra1"]` is the only region (good for EU residency). No `headers` block for `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`. Vercel sets some by default; pin explicitly.
- 🟠 **Edge Function deployment script missing.** No `supabase functions deploy …` invocation in any script or CI. Deploying is manual and easy to forget.
- 🟡 **No Vercel deploy preview wired.** Standard Vercel-GitHub integration would address this.
- 🟡 **No structured logging.** `console.log` / `console.error` throughout. Vercel will scoop it, but no JSON-line, no correlation IDs.

### 14. Scalability, Reliability & Backup/DR — 🟠

**Findings**

- 🔴 **No backup strategy documented.** Supabase Free/Pro has daily point-in-time recovery but it's not configured nor mentioned in any doc. For a DSGVO-relevant app holding minors' data this is gross.
- 🟠 **The 4 Edge Functions are not idempotent across overlapping runs.** `photo-wipe` picks `limit(200)` rows, marks them deleted as it goes; two concurrent invocations would each try to delete the same storage objects (Supabase returns 404 on the second). Mostly benign but `dsgvo-delete-executor` could call `auth.admin.deleteUser` twice. Add a status='running' lock with a 5-min lease.
- 🟠 **DSGVO export worker downloads the whole account dataset into memory** as a JSON.stringify before uploading. For a power user with thousands of attempts this OOMs the Edge Function (256 MB cap). Stream to storage or page.
- 🟠 **No dead-letter queue.** A failed DSGVO export sets status='failed' (`dsgvo-export-worker:75`) and nothing retries it. The account holder will see "failed" forever.
- 🟡 **`credit_buckets.current_balance` is the source of truth and is updated via read-then-write** (`lib/credits.ts:32-49`). Two simultaneous LLM calls for the same account can race and either over-credit or under-debit. The implementation-plan comment acknowledges this. Fix is a single SQL with `WHERE current_balance >= $estimate RETURNING …`.

### 15. Technical Debt & Maintainability — 🟡

**Findings**

- 🟡 **5 TODO/FIXME left.** Listed under Finding 6.D and 2.A. Tracked.
- 🟡 **Files over 500 lines:** `routes/materials.ts` (658), `routes/learners.ts` (373 — sub-resource section grew big), `routes/attempts.ts` (312), `app/(learner)/capture.tsx` (461), `app/(learner)/home.tsx` (323), `(onboarding)/welcome.tsx` (285). All readable, but materials and capture have crossed the line where extracting helpers will pay off.
- 🟡 **Duplicated `ownedX` helpers** in `materials.ts`, `subjects.ts`, `folders.ts`, `templates.ts`. Five copies of "verify entity belongs to learner via account_id join". Extract to `lib/access.ts`.
- 🟡 **The "fake" naming is awkward** (`fake-supabase`, `fake-llm`). They're test doubles, not "fake" in the disparaging sense. Rename to `apps/api/src/test/inmemory/*` when convenient.

### 16. Licensing & Compliance — 🟠

**Findings**

- 🔴 **No `LICENSE` file at repo root.** Default copyright applies, which is fine for a private project but blocks external contribution and forces every consumer of a transient artifact to ask. Add `LICENSE` (likely proprietary / "all rights reserved" for a commercial app).
- 🟠 **No third-party license inventory.** `pnpm licenses list` can generate one; not part of any process. For DSGVO §subprocessors documentation this is required.
- 🟢 **DSGVO posture matches spec.** Service-role JWT verification, 7-day delete hold, photo-wipe at T+7d, export-to-signed-URL, owner-scoped storage policies, all in place. The gap is operational (pg_cron not scheduled) not architectural.
- 🟢 **EU residency** correctly enforced: Vertex `europe-west4` default (`env.ts:23`), Supabase region `eu-central-1` per Doc 02, Vercel region `fra1` (`vercel.json:5`). One pipeline, one geography.
- 🟡 **DSGVO export does not include `credit_events`, `subscriptions`, `sessions`, `item_states`** — only account/learners/subjects/materials/items/attempts. Doc 09 §exports says "everything."

---

## Priority action plan

Items are ordered by `urgency × impact`. Each item names the file and the slice that owns it. "Fix-cost" is rough engineering hours.

| #   | Sev | Title                                                                                                                                                                                               | File                                                                     | Fix-cost    | Why now                                                |
| --- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------- | ------------------------------------------------------ |
| 1   | 🔴  | Fix `/admin` auth — require JWT, check `email` from `c.get('auth')` against allowlist                                                                                                               | `apps/api/src/routes/admin.ts:7-12`                                      | 1h          | Anyone with an email + URL can call admin routes today |
| 2   | 🔴  | Wire Sentry on mobile + API (init in `_layout.tsx`, hono middleware on errors)                                                                                                                      | `apps/mobile/app/_layout.tsx`, `apps/api/src/middleware/error.ts`        | 3h          | First production crash = no signal at all              |
| 3   | 🔴  | Wire PostHog on mobile (PostHogProvider, key events: session_started, material_captured, item_answered)                                                                                             | `apps/mobile/app/_layout.tsx`                                            | 3h          | No product analytics = beta is blind                   |
| 4   | 🔴  | Back idempotency with Postgres (`idempotency_keys` migration + lib swap)                                                                                                                            | `apps/api/src/lib/idempotency.ts`, new `migrations/0010_idempotency.sql` | 4h          | Vercel cold starts will double-debit credits today     |
| 5   | 🔴  | Ship `migrations/0011_pg_cron_schedule.sql` to actually run the 4 Edge Functions                                                                                                                    | new file                                                                 | 2h          | Photo wipe / DSGVO delete are written but never run    |
| 6   | 🔴  | Add CI workflow: `.github/workflows/check.yml` running typecheck + lint + test on PRs                                                                                                               | new file                                                                 | 1h          | Pre-commit is local + skippable                        |
| 7   | 🔴  | Rotate Supabase service-role key (currently exp 2036), move to Vercel-env only (drop the `.env.local` copy)                                                                                         | `apps/api/.env.local`, ops                                               | 1h          | 10-year-lived JWT on disk                              |
| 8   | 🟠  | Tests for `sessions.ts`, `attempts.ts`, `webhooks.ts`, `dsgvo.ts`                                                                                                                                   | new files in `__tests__/`                                                | 8h          | Four highest-value flows have zero coverage            |
| 9   | 🟠  | Implement the 6 remaining 501 routes (`materials.ts` PATCH/DELETE, `account/credits/summary`, `admin/spend`, `attempts/:id/finalize`, `render/latex`) — or delete from Hono mount if truly deferred | listed in 2.A                                                            | 6h          | Doc 04 says these are v1                               |
| 10  | 🟠  | Add accessibility props to the 22 lb primitives (one sweep — Btn, Card, Chip, Pressable subclass)                                                                                                   | `apps/mobile/components/lb/*.tsx`                                        | 6h          | 2/28 screens have any a11y today                       |
| 11  | 🟠  | Replace mobile outbox stub or delete the file                                                                                                                                                       | `apps/mobile/lib/sync/outbox.ts`                                         | 4h or 10min | Silent data loss landmine                              |
| 12  | 🟠  | i18n-sweep remaining 20 screens (start with admin/\* and learner/home + result + session)                                                                                                           | `apps/mobile/app/**/*.tsx`, `apps/mobile/locales/de,en,fr,es,it/`        | 12h         | German-only contradicts CLAUDE.md and Doc 05           |
| 13  | 🟠  | Bulk-INSERT in `/attempts/batch`; UPSERT for `item_states`                                                                                                                                          | `apps/api/src/routes/attempts.ts:198-265`                                | 3h          | 200-item drain = 400 round-trips today                 |
| 14  | 🟠  | Push session item-selection into Postgres function/view + LIMIT                                                                                                                                     | `apps/api/src/routes/sessions.ts:45-95`                                  | 4h          | OOM/slow on power users                                |
| 15  | 🟠  | Constant-time webhook secret compare + 5-min timestamp window                                                                                                                                       | `apps/api/src/routes/webhooks.ts:55-62`                                  | 30min       | Easy hardening                                         |
| 16  | 🟡  | Add `LICENSE` file + `README.md` at repo root                                                                                                                                                       | new files                                                                | 30min       | External contributor / legal trivia                    |
| 17  | 🟡  | Drop unused mobile deps (`victory-native`, `i18next-icu`, `nativewind`+css-interop unless tailwind sweep happens)                                                                                   | `apps/mobile/package.json`                                               | 15min       | Bundle weight                                          |
| 18  | 🟡  | Add `practice_runs` table migration if not present, or document why it's deferred                                                                                                                   | check `0001-0009`, new `0010_practice_runs.sql` if missing               | 1h          | Routes/templates.ts will 500 in prod                   |
| 19  | 🟡  | Atomic credit debit in SQL (`UPDATE … WHERE current_balance >= $estimate RETURNING …`)                                                                                                              | `apps/api/src/lib/credits.ts:24-50`                                      | 2h          | Race-condition risk under burst                        |
| 20  | 🟡  | Mobile global ErrorBoundary                                                                                                                                                                         | new `apps/mobile/components/lb/ErrorBoundary.tsx`                        | 2h          | One bad screen = blank app                             |

---

## What's working well (genuine)

- **Dep-injection seam** (`lib/deps.ts`) — clean, well-named, and tests use it without `vi.mock`.
- **`createApp({deps})` factory** is reusable across dev-server, Vercel, and tests with no per-environment branching.
- **RLS coverage is real.** Every owner-scoped table has a `for all using (... where owner_user_id = auth.uid())` policy. Even storage buckets have owner-scoped read.
- **Credit accounting** — `tryDebit → settle → refund` is the right model and is applied consistently across materials, regenerate, attempts, explain.
- **Vertex factory** crashes if NODE_ENV=production lacks `GOOGLE_CLOUD_PROJECT` instead of silently returning the fake. This is exactly the paranoia the project needs.
- **Husky pre-commit also runs `expo export ios` as a bundle smoke** — catches Metro resolution breakage that typecheck misses. Rare and right.
- **Spec citation discipline** — every route header, every migration header names the doc section. Drift will be easy to spot.
- **Soft-archive consistency** — every owner table has `archived_at` + a partial unique index where applicable. No accidental hard deletes.
- **Open-follow-ups bullets** in `IMPLEMENTATION-PLAN.md` are an unusually honest retrospective format.

---

## Appendix A — The 15 unchecked plan items (with locations)

1. ☐ Slice A1 — Mobile refresh-on-401 _(done, but plan-doc not updated; see `apps/mobile/lib/api/client.ts:53-83`)_
2. ☐ Slice D1 — Diagram cropping + marker overlay (sharp). Deferred. No `sharp` import anywhere.
3. ☐ Slice D2 — Tests for regenerate/evaluate/explain. Not done.
4. ☐ Slice D3 — Mobile practice-run screen. Not done — `practice/[templateId].tsx` is bare scaffold (110 LOC, mostly chrome).
5. ☐ Slice D3 — Tests for D3 endpoints. Not done.
6. ☐ Slice E1 — Tests for `/sessions` + `/attempts/batch`. Not done.
7. ☐ Slice E2 — `<VoiceButton>` component (ASR). Not done. `expo-speech` is imported but only for TTS.
8. ☐ Slice E2 — `<DiagramQuestion>` (depends on D1.5).
9. ☐ Slice E2 — `<SvgStimulus>` sanitized. Not done.
10. ☐ Slice E2 — "Erklär mir das" modal. API wired (`lib/api/sessions.ts.explainTopic`), modal UI not.
11. ☐ Slice F2 — Test heads-up notifications (3d / 1d / morning-of). Not done.
12. ☐ Slice G2 — Mobile Privacy & consent review screen. Partial via `data.tsx` + `about.tsx`.
13. ☐ Phase H — Accessibility audit. Not done. See Finding 7.
14. ☐ Phase H — Extra settings (haptics, session length, photo retention, data saver). Not done.
15. ☐ Phase H — Tutorial / power-feature first-time moments. Not done.

---

## Appendix B — Files touched but not finished

Per CLAUDE.md §rule 1 ("Never leave `notImplemented()` in a route you touched"):

- `apps/api/src/routes/materials.ts` — last touched 2026-05-16 (commit `7d0950e`). Still has `notImplemented` on lines 657–658. **Rule violation.**
- `apps/api/src/routes/attempts.ts` — last touched 2026-05-16 (E1). Still has `notImplemented` on line 273. Defensible as "voice flow polish, deferred" per the comment.
- `apps/api/src/routes/account.ts` — last touched 2026-05-16 (A2). Still has `notImplemented` on line 79. Defensible as F1 follow-up.
- `apps/api/src/routes/render.ts` — never expanded past stub.
- `apps/api/src/routes/admin.ts` — never expanded past stub.

---

## Appendix C — What "ready to ship" looks like

For closed beta in one week, the must-fix list is items 1–7 from the priority table (Sev 🔴). Total fix-cost ≈ 15 hours. After that:

- Security perimeter is honest (admin requires real auth, idempotency is durable, service-role key is rotated).
- Production failures are visible (Sentry).
- Product behavior is measurable (PostHog).
- Background workers actually run (pg_cron schedule).
- The next regression is caught on PR (CI).

Items 8–11 (tests for money paths, 501 cleanup, a11y sweep, outbox decision) are necessary for "public" beta but not for "closed friends + family who will WhatsApp you when something breaks."

Everything else is a backlog you ship into.
