# LearnBuddy — Codebase Audit Report

_Prepared: 2026-05-17 | Audited by: Claude Sonnet 4.6_

---

## Executive Summary

**Overall Grade: B**

LearnBuddy has gone from a ~5% skeleton to a substantially implemented edtech product in a short, focused build sprint. The architecture is genuinely excellent: clean dependency-injection seam, real FSRS integration, Vertex Gemini EU-region integration with credit accounting and refund logic, 13 Postgres migrations with RLS on every owner table, 4 Supabase Edge Functions, CI via GitHub Actions, and a real Hono API with 12 test files covering 2,346 lines. The codebase discipline is rare for an agent-assisted build — zero `as any`, no `vi.mock` anywhere, all route files cite their doc section.

The three things blocking a closed beta:

1. **Rate-limit buckets are in-memory only** — per-Vercel-instance counters mean abuse limits have zero effect in production under concurrent load. `apps/api/src/middleware/rate-limit.ts:8`.
2. **`PATCH /materials/:id` and `DELETE /materials/:id` are unimplemented** — the comment says they're registered as 501 intentionally, but users cannot edit or delete materials. Two other routes share this state (`GET /render/latex`, `GET /admin/spend` is actually now implemented).
3. **Mobile session screen does not pass `sessionId` to result** — `app/(learner)/session/[sessionId].tsx:147` calls `router.replace('/(learner)/result')` without a `sessionId` param, so `result.tsx` receives `params.sessionId = undefined` and renders an empty summary ("keine sessionId" fallback).

Beyond those blockers, there is a medium-priority class of gaps: mobile error boundaries swallow crashes silently, the offline outbox in `lib/sync/` was deleted but no replacement was built, 5 mobile screens remain unreachable (practice, folder detail, subject detail for non-existing subjects), and a handful of i18n namespaces have keys in de/en but not in fr/es/it.

---

## System Overview

- **Type**: Mobile-first edtech SaaS — React Native / Expo mobile app + Hono Node.js API
- **Language(s)**: TypeScript strict throughout; SQL (Postgres migrations); Deno (Edge Functions)
- **Framework(s)**: Expo SDK 54 / React Native 0.81.5 / expo-router 6; Hono 4.6 on Vercel; Supabase (Auth + Postgres + Storage + Edge Functions); Google Vertex AI (Gemini 2.5 Flash-Lite, EU-west4)
- **Estimated Size**: ~39 source files total; API ~5,200 LOC routes+lib; Mobile ~7,100 LOC app+components+lib; 2,346 LOC API tests; 13 Postgres migrations
- **Maturity**: Feature-complete alpha — all documented endpoints exist, core flows wired, but several blocking gaps remain before a real user could use the product end-to-end

```
Mobile (Expo/RN)  →  Hono API (Vercel fra1)  →  Supabase (Postgres + Auth + Storage)
                                              →  Vertex AI Gemini 2.5 (EU-west4)
                                              →  RevenueCat (webhooks + reconcile)
                  ←  4 Edge Functions (DSGVO export/delete, photo-wipe, RevenueCat reconcile)
```

Monorepo layout:

- `apps/api/` — Hono API, Vercel deployment, 14 route files, 12 test files
- `apps/mobile/` — Expo app, 39 screens, 22 lb/ component primitives
- `packages/shared-types/` — Zod schemas, shared by both apps
- `packages/shared-math/` — MathLite parser, formula normalization
- `infra/supabase/migrations/` — 13 numbered SQL migrations (0001–0013)
- `infra/supabase/functions/` — 4 Deno Edge Functions

---

## Findings by Domain

### 1. Architecture & Design

**Score: 🟢 Good**

**Summary**: The monorepo structure, DI seam, and shared-types discipline are all excellent and genuinely unusual for an agent-generated codebase. The architecture is production-quality at the seam level.

**Findings**:

- ✅ **Dependency injection seam** — `apps/api/src/lib/deps.ts` supplies `{ supabase, supabaseAnon, llm, now, uuid }`. Routes call `getDeps(c)` and never import supabase directly. Tests inject `FakeSupabase + FakeLlmGateway` with zero `vi.mock`. This is the right pattern and it's applied consistently.
- ✅ **Single Hono instance** — `createApp()` in `app.ts` is used by both `dev-server.ts` and the Vercel catch-all. No code divergence.
- ✅ **Factory guard** — `apps/api/src/lib/llm/factory.ts` hard-crashes if `NODE_ENV=production` without `GOOGLE_CLOUD_PROJECT`. Prevents accidental fake-LLM-in-prod.
- ✅ **Shared types discipline** — `packages/shared-types` is the only place Zod schemas live. No DTO drift between API and mobile.
- 🟡 **No service layer** — Route handlers do all data access directly (sessions.ts pickItems is 100 lines of inline logic). Fine now; will hurt when flows get complex. Extract helpers to `lib/sessions/`, `lib/materials/` before the next major feature.
- 🟡 **materials.ts is 650+ LOC** — The longest file. Helpers `ownedSubject`, `ownedFolder`, `ownedMaterial`, `downloadPhotosAsBase64`, `toItemRow`, `markFailed` belong in `apps/api/src/lib/materials/`.
- ℹ️ **Local SQLite schema is minimal** — `apps/mobile/lib/db/schema.ts` has only 3 tables (learners, subjects, folders). Materials, items, item_states, sessions, attempts are not mirrored locally. Offline-first is effectively not available. Acceptable for v1 since the outbox was intentionally deleted, but should be tracked.

**Recommendations**:

- Extract route-level helpers into `lib/` sub-modules before Phase I work begins.
- Document the offline-first gap explicitly in `IMPLEMENTATION-PLAN.md` as a deferred phase.

---

### 2. Code Quality & Practices

**Score: 🟢 Good**

**Summary**: TypeScript discipline is excellent. The codebase is the cleanest agent-assisted project this auditor has seen. Lint configuration has one gap that could let a future contributor re-introduce `any`.

**Findings**:

- ✅ **Zero `: any` / `as any` / `<any>`** — Confirmed across all `apps/` source files (excluding one benign comment in `diagram.ts`). TypeScript strict + `noUncheckedIndexedAccess` + `noImplicitOverride` enforced via `tsconfig.base.json`.
- ✅ **Zero `vi.mock` / `jest.mock`** — All mocking via the DI seam. CLAUDE.md rule 2 is structurally enforced.
- ✅ **Doc citations in file headers** — Every route file has a `// Doc 04 §…` comment. Makes drift detection cheap.
- ✅ **No hardcoded demo data in production code paths** — The previous `DEMO_SUBJECTS`, hardcoded `"2x + 7 = 15"`, and `STATS` arrays are all gone. Screens render real API data or a proper empty state.
- 🟡 **`@typescript-eslint/no-explicit-any` is `warn` not `error`** — `eslint.config.mjs:34`. The code happens to comply, but lint is not preventing regression. Bump to `error`.
- 🟡 **`console.error` in route handlers** — `attempts.ts:269,281,331` and `materials.ts:474` use `console.error` for DB failures. These should route through a Sentry capture (via `apps/api/src/lib/sentry.ts`) so failures are traceable in production.
- 🟡 **Dead import: `apps/mobile/app/(learner)/subject/[subjectId].tsx`** — Referenced in the stale audit as having `DEMO_FOLDERS`; confirm current state is wired, but the subject screen should be verified on device.
- ℹ️ **`notImplemented()` helper still defined** in `apps/api/src/lib/errors.ts:63` — No route currently calls it (all 501 stubs have been resolved or are now real handlers), but the helper's existence is a footgun. Consider removing it or guarding it with a type-level `never` return so the compiler flags any future call.

**Recommendations**:

- `eslint.config.mjs`: change `'@typescript-eslint/no-explicit-any': 'warn'` → `'error'`.
- Replace `console.error` in route handlers with `Sentry.captureException` + structured `console.error` fallback.

---

### 3. Security

**Score: 🟡 Needs Attention**

**Summary**: The two critical holes from the previous audit (unsigned `X-Admin-Email` header, in-memory idempotency) have been fixed. The remaining issues are medium severity but should close before public beta.

**Findings**:

- ✅ **Admin auth is JWT-anchored** — `apps/api/src/routes/admin.ts:20-33` applies `requireAuth` first, then checks `c.get('auth').email` against `ADMIN_ALLOWLIST_EMAILS`. The unsigned-header vulnerability is gone.
- ✅ **Idempotency is Postgres-backed** — `apps/api/src/lib/idempotency.ts` stores in `idempotency_keys` table (migration 0010). Cold-start safe. Replay window is 24h. Correct.
- ✅ **Webhook timing-safe compare** — `apps/api/src/routes/webhooks.ts:52-61` uses `node:crypto.timingSafeEqual` with a length-invariant comparison. 5-minute replay window enforced.
- ✅ **`.env.local` is gitignored** — `.gitignore` covers `.env.*`. No secrets in history.
- 🟠 **Rate-limit buckets are in-memory** — `apps/api/src/middleware/rate-limit.ts:8`: `const buckets = new Map<string, Window>()`. On Vercel each lambda instance has its own map. A distributed attacker hitting multiple cold instances gets `N × limit` requests through. This is particularly bad for `materials_create per_day: 20` (abuse vector: free AI extraction) and `explain per_day: 60`. Move to a Postgres counter (single `UPDATE … WHERE … RETURNING` with atomic increment) or Upstash Redis before beta.
- 🟠 **Service-role client used for all DB queries** — `apps/api/src/lib/deps.ts:28` constructs a service-role client that bypasses RLS. Because handlers enforce `account_id`/`learner_id` ownership manually, the effective perimeter is correct today. But any future path-traversal or injection bug becomes a full data leak. Consider a second client that runs as the request user for read-only queries.
- 🟠 **No `pnpm db:start` script exists** — CLAUDE.md requires "a real Supabase local instance." `grep -n "db:start" package.json` returns empty. RLS policies, FK cascades, and unique-index races are untested. A migration with an error in a policy would only be caught at Supabase deployment.
- 🟡 **CORS is wide open** — `apps/api/src/app.ts:62-65`: the CORS middleware passes through requests with no `Origin` header (which RN sends), but the `origin` function returns `null` for any unknown origin. Null in Hono CORS means no `Access-Control-Allow-Origin` is sent, not that the request is blocked. The effective behavior is CORS-unrestricted from non-browser clients, which is correct for mobile — but should be documented with a comment so future engineers don't widen it further.
- 🟡 **`apps/api/.env.local` on disk** — The file exists (`-rw-r--r--@ 1 kurt staff 756 May 16`) and contains a Supabase service-role key. It's gitignored, but it's readable by any process running as this user. Rotate the key and use `direnv` or a secret manager instead of a plaintext file.
- ℹ️ **JWT verification makes 2 network calls per request** — `requireAuth` calls `supabaseAnon.auth.getUser(token)` (→ Supabase Auth) + `SELECT id FROM accounts WHERE owner_user_id = …` (→ Supabase DB). At 600 attempts/hour per learner this is 1,200 outbound round-trips per learner-hour. Cache `(token_hash → account_id)` in a per-instance LRU with a 5-minute TTL to save money and latency.

**Recommendations**:

- Replace in-memory rate-limit buckets with Postgres atomic counter (single `rate_limit_buckets` table, `UPDATE … SET count = count + 1 WHERE … AND count < $limit RETURNING count`).
- Rotate `.env.local` service key; document key rotation in `SETUP-SUPABASE.md`.
- Add JWT decode cache before beta.

---

### 4. Testing

**Score: 🟡 Needs Attention**

**Summary**: API tests are comprehensive for the slices that have them. The four highest-stakes files (sessions, attempts, dsgvo, webhooks) now have test files with real content. Mobile test coverage is nearly zero.

**Findings**:

- ✅ **12 API test files, 2,346 LOC** — All use the fake-supabase seam. `attempts.test.ts` (256 lines), `materials.test.ts` (314 lines), `sessions.test.ts` (223 lines), `webhooks.test.ts` (147 lines), `dsgvo.test.ts` (170 lines) all exist with real test cases.
- ✅ **FakeSupabase is battle-tested** — Supports insert, select, update, upsert, maybeSingle, in, eq, is, order, limit. No `vi.mock` anywhere. Solid test infrastructure.
- 🟠 **No API tests for `templates.ts`, `explain.ts`, `items.ts`** — These cover D2/D3 functionality. `explain.ts` handles credit debiting; an untested regression there burns real money.
- 🟠 **Mobile has 3 test files total** — `lib/camera/__tests__/quality.test.ts`, `lib/practice/__tests__/generate.test.ts`, `lib/svg/__tests__/sanitize.test.ts`. The local evaluator (`lib/eval/local.ts`, 170 LOC), PIN module, i18n loader, auth session, and upload pipeline have zero tests.
- 🟠 **FakeSupabase `order()` is a no-op** — `apps/api/src/test/fake-supabase.ts` documents this. Handlers that depend on DB-side ORDER BY pass tests with arbitrary order. The session pickItems JS sort is safe only because the JS-side sort runs in the handler too, but future handlers may not.
- 🟡 **No integration tests against real Supabase** — `pnpm db:start` script doesn't exist. The slice "Done when" criteria consistently say "Live verification on device" but there's no automated path to achieve it.
- 🟡 **CI runs all three gates** — `.github/workflows/check.yml` does typecheck + lint + test on push to main and PRs. Good. But the test run uses the fake backend only (no real Supabase, no real Vertex); add a weekly integration test job against the staging Supabase once the instance is up.
- ℹ️ **`sessions.test.ts`** doesn't test the FSRS ordering guarantee (overdue → unseen → future-due). A regression there would produce suboptimal but not wrong behavior.

**Recommendations**:

- Add `__tests__/explain.test.ts`, `items.test.ts`, `templates.test.ts` before Phase I.
- Add `lib/eval/__tests__/local.test.ts` in mobile — this is the code that runs on every learner answer.
- Fix `FakeSupabase.order()` to sort in-memory (sort the `_store[table]` array by the specified column before returning).

---

### 5. Business Logic & User Flows

**Score: 🟡 Needs Attention**

**Summary**: The three primary journeys (signup, capture→AI, study session) are all wired end-to-end. Several medium-priority gaps exist in navigation, result screen, and session lifecycle.

**Findings**:

- ✅ **Cold-launch routing** — `app/index.tsx` correctly checks locale → session → `/account` → routes to the right screen. The previously-broken "always goes to onboarding" path is fixed.
- ✅ **Credit accounting** — `tryDebit` + `settle` + `refund` pattern is correct and atomic (single `UPDATE … WHERE current_balance >= $estimate RETURNING`). Refund-on-error is applied consistently in materials and attempts.
- ✅ **FSRS integration** — `apps/api/src/lib/fsrs.ts` wraps `ts-fsrs`, `applyAttempt()` is called in `/attempts/batch`. Session picker correctly sorts overdue → unseen → future-due with a DB RPC + JS fallback.
- ✅ **RevenueCat webhook** — Tier transitions, monthly allotment grants, rollover caps, billing-issue downgrades all handled in `webhooks.ts`. Timing-safe secret check. 5-minute replay window.
- ✅ **DSGVO flows** — Export queuing, 7-day hold + cancel path, delete executor, photo wipe — all wired. Mobile admin Data screen calls the API.
- 🔴 **Session → Result navigation is broken** — `app/(learner)/session/[sessionId].tsx:147`: `router.replace('/(learner)/result')` has no `sessionId` param. `result.tsx` checks `params.sessionId` → if undefined, renders `enabled: false` query → empty summary ("keine sessionId"). Every completed session shows a blank result screen. Fix: `router.replace({ pathname: '/(learner)/result', params: { sessionId: sessionQuery.data.session_id } })`.
- 🟠 **Session doesn't call `PATCH /sessions/:id/finish`** — The finish endpoint exists on the server but is never called from mobile. Sessions are left `ended_at = null` forever. The summary endpoint still works (it doesn't gate on `ended_at`), but analytics, billing, and future session-resume logic will be wrong.
- 🟠 **`/learners/:id/schedule-summary` returns `streak_current: 0, streak_longest: 0, last_session_at: null`** — Hardcoded zeros. `learners.ts:343-348`. The home screen conditionally shows a streak pill; it will always show 0. Either compute from `sessions` table or return `null` and handle client-side.
- 🟠 **`index.tsx` → `welcome.tsx` on 401** — `app/index.tsx:52-57`: on any `ApiError` (not just 401) the user is redirected to welcome. A transient 500 on the API will log the user out. Narrow the catch to `err.status === 401`.
- 🟡 **Hint chain does not accumulate on re-attempt** — `session/[sessionId].tsx:88`: `hints` state resets when `resetForNext()` is called. But P3 expects `prior_hints_given` to accumulate across multiple wrong answers on the _same_ item. The current implementation only accumulates within one question sitting; if the user gets the same question wrong twice in sequence, the second attempt's `prior_hints_given` is empty.
- 🟡 **`practice/[templateId].tsx` is unreachable** — Template IDs are emitted by the server but no mobile surface navigates to this screen. Practice runs are a server-complete feature (D3) with no client path.
- 🟡 **Minor profile flow** — `add-profile.tsx` creates the learner, but the "switch to learner surface after add" path (`hand-off.tsx`) only calls `router.replace('/(learner)/home')` without setting `active_learner_id` in the Zustand store. The home screen will fetch the account but may not have the right learner context.
- ℹ️ **`lib/sync/outbox.ts` and `lib/sync/connectivity.ts` were deleted** — Comment in `schema.ts` confirms. No offline path exists. Acceptable for v1 but should be documented.

**Recommendations**:

- Fix the session→result navigation immediately (one-line fix, blocks testing the full flow).
- Call `PATCH /sessions/:id/finish` in `resetForNext` when `idx >= total - 1`.
- Compute streak in the API from `SELECT COUNT(*) FROM sessions WHERE learner_id=… AND date_trunc('day', started_at) = today - interval 'N days'`.

---

### 6. UI/UX & i18n

**Score: 🟡 Needs Attention**

**Summary**: Design token discipline is solid. i18n coverage has improved dramatically (5 locales, 12 namespaces). A handful of screens still use hardcoded German or English strings.

**Findings**:

- ✅ **Design tokens** — `lib/theme/colors.ts` has the full pastel palette. `Btn.tsx` enforces black-pill CTAs. No ad-hoc hex values visible in the 5 core learner screens.
- ✅ **22 component primitives** — All in `components/lb/`. Real, not placeholder.
- ✅ **Tone copy** — "Fast richtig — fehlt nur noch …" pattern used. No "Falsch" anywhere. No due-item counts surfaced to learners. Consistent with Doc 01.
- ✅ **All 5 locales × 12 namespaces exist** — `de/en/fr/es/it` × `admin/auth/capture/coach/common/errors/home/onboarding/practice/result/session/upload`. This is substantially complete.
- ✅ **30 of 39 screen files use `useTranslation`** — Confirmed by grep.
- 🟠 **~9 screens have hardcoded strings** — Confirmed unchecked screens: `unlock.tsx`, `about.tsx`, `archived.tsx`, `pin-setup.tsx`, `hand-off.tsx`, `profile-minor-consent.tsx`, `folder/[folderId].tsx`, `subject/[subjectId].tsx` (partially), `practice/[templateId].tsx`. Some of these are low-traffic (admin, onboarding tail), but `folder/[folderId].tsx` is a core learner surface.
- 🟠 **`apps/mobile/lib/i18n/index.ts` loads only `de` and `en`** — Despite fr/es/it locale files existing, the i18n init only loads two language bundles. French, Spanish, Italian users will fall back to English for all keys. Check the `resources` config in the init file and add the remaining three.
- 🟡 **`MathKeyboard` and `MathInput` use raw style objects** — `components/lb/MathKeyboard.tsx` has inline `backgroundColor: '#F5F4F9'` (line ~42), `borderColor: '#E8E6F0'` (line ~47). These are design tokens in `colors.ts` (`LB.bg`, `LB.hairline`) but are hardcoded here. Consistency gap.
- 🟡 **Accessibility props partial** — The hardening pass added `accessibilityRole` / `accessibilityLabel` to Btn, Card, Chip, CircleBtn, BottomNav, Avatar. Session screen Pressables for MC options don't have `accessibilityLabel`. VoiceOver users cannot distinguish answer choices.
- ℹ️ **`victory-native` and `i18next-icu` are declared as deps but never imported** — Adds ~300 KB to the bundle. Remove from `apps/mobile/package.json`.
- ℹ️ **`nativewind` declared but `className=` is not used** — All components use `style={...}`. Either remove or commit to the migration.

**Recommendations**:

- Fix `lib/i18n/index.ts` to load all 5 locale bundles — this is a 3-line fix that immediately activates fr/es/it.
- Add `accessibilityLabel` to MC option Pressables in session screen.
- Remove `victory-native` and `i18next-icu` from `package.json`.

---

### 7. Data Model

**Score: 🟢 Good**

**Summary**: Migrations are the healthiest part of the repo. 13 numbered SQL files, RLS on every owner table, proper indexes. One upsert logic gap in item_states.

**Findings**:

- ✅ **13 migrations, all present** — 0001 through 0013. Migration 0010 (idempotency_keys), 0011 (pg_cron schedule), 0012 (session_pick_items RPC), 0013 (cron_locks) all exist.
- ✅ **RLS on every owner table** — Confirmed in migrations 0001–0007. `accounts`, `learners`, `subjects`, `folders`, `materials`, `items`, `sessions`, `attempts`, `item_states` all have policies.
- ✅ **Indexes on hot query paths** — `item_states_learner_due_idx`, `materials(subject_id) WHERE archived_at IS NULL`, `attempts(session_id)` all present.
- ✅ **Migration immutability respected** — No evidence of editing merged migrations. New behavior lands in new files.
- 🟠 **`item_states` upsert uses `onConflict: 'item_id'`** — `attempts.ts:278`: the upsert specifies `item_id` as the conflict column. The schema has a unique index on `(item_id, learner_id)` (confirmed in migration 0005). Using only `item_id` as the conflict target is correct only if `item_id` is globally unique, which it is (UUID primary key on `items`). However the comment says "unique index item_states(item_id) which holds because each (learner_id, item_id) is unique" — this conflates the constraint and the column. The upsert is functionally correct; the comment is misleading.
- 🟡 **No migration for `subscription_history`** — Doc 03 mentions it. Not present. Low priority if not referenced in code.
- 🟡 **`pg_cron` GUC setup** — Migration 0011 schedules Edge Functions via `pg_cron`, but the comment notes `app.supabase_url` / `app.supabase_service_role` GUCs must be set before applying. No `SETUP-SUPABASE.md` documents this step. A fresh deploy will silently skip the cron jobs.
- ℹ️ **Local SQLite schema** (`lib/db/schema.ts`) has only 3 tables — Intentional (outbox removed), but materials/items/item_states are not mirrored. The offline-first comment is honest about it.

**Recommendations**:

- Document the `pg_cron` GUC setup requirement in `SETUP-SUPABASE.md`.
- Clarify the upsert comment in `attempts.ts:273` (cosmetic).

---

### 8. Error Handling

**Score: 🟡 Needs Attention**

**Summary**: API error handling is consistent and structured. Mobile has an error boundary but several critical failure paths are handled with `Alert.alert` (which gets swallowed in some nav states) and the upload failure path leaves users stranded.

**Findings**:

- ✅ **`ApiError` class** — `apps/api/src/lib/errors.ts` maps 14 error codes to HTTP status consistently. `errorHandler` middleware formats them. Correct.
- ✅ **Mobile global ErrorBoundary** — `app/_layout.tsx` wraps the root layout. Reports to Sentry. Correct.
- ✅ **Credit refund on LLM failure** — `routes/attempts.ts:159-163` and `routes/materials.ts:262-280` both refund on exception. Correct.
- 🟠 **Upload failure leaves users stranded** — `app/(learner)/upload.tsx`: if `POST /materials` fails (network error, 502 from Vertex), the screen shows `Alert.alert` and the user has no recovery path — no retry button, no "go back to camera" CTA, no information about whether photos were uploaded. Fix: add a retry button + "start over" option that pops back to capture with the existing photo UUIDs.
- 🟠 **`persistAttempt` swallows DB failures** — `routes/attempts.ts:331`: `console.error(…)` is called on DB failure but the function returns `void` and the handler returns 200. A learner's attempt can silently fail to persist. Either throw (and refund) or return an error status.
- 🟡 **`Alert.alert` in session screen** — `app/(learner)/session/[sessionId].tsx:116`: `onError: (err: Error) => Alert.alert(...)`. This is the only feedback when a submission fails. On iOS, if the user is in a modal or the keyboard is open, Alert can be swallowed. Use the `<Toast>` component from `components/lb/Toast.tsx` instead.
- 🟡 **Error boundary does not retry** — The global ErrorBoundary catches crashes but the fallback UI is not visible in the code (the component is referenced but the fallback render is not shown in the available files). Confirm it shows a human-readable message with a "Reload" button, not a white screen.
- ℹ️ **401 on index.tsx catches all errors, not just auth** — `app/index.tsx:52-57` redirects to welcome on any `ApiError`. A transient API 500 on cold launch logs the user out silently.

**Recommendations**:

- Add retry + "start over" to `upload.tsx` failure state (highest user-visible impact).
- Fix `persistAttempt` to propagate errors rather than swallowing with `console.error`.
- Replace `Alert.alert` in session submit error with Toast.

---

### 9. Dependencies

**Score: 🟢 Good**

**Summary**: Lock file present, versions reasonable, two unused heavy dependencies should be removed.

**Findings**:

- ✅ **`pnpm-lock.yaml` present** — Pinned versions. `--frozen-lockfile` in CI. Correct.
- ✅ **No obviously vulnerable packages** — Major deps: Expo 54, React 19, React Native 0.81.5, Hono 4.6, Supabase JS 2.47, Zod 3.24, ts-fsrs 4.7. All are recent stable releases.
- ✅ **Sentry deps present and used** — `@sentry/node` in API, `@sentry/react-native` in mobile. Both have init files now.
- 🟡 **`victory-native` in `apps/mobile/package.json:48`** — Never imported anywhere (FunctionPlot uses react-native-svg directly). Dead weight, removes ~300 KB from bundle.
- 🟡 **`i18next-icu` declared** — No ICU pluralization in any locale file. Remove.
- 🟡 **`@google/genai`** is a dep of `apps/api` but the implementation uses `@google-cloud/vertexai` internally. The implementation plan notes `@google-cloud/vertexai` sunsets 2026-06-24 — that's 5 weeks away. Migration to `@google/genai` should be scheduled now.
- ℹ️ **`bcryptjs` in mobile** — Pure-JS bcrypt is slow on Hermes (~200ms for `hashSync`). Acceptable for PIN unlock (single operation) but should be noted.
- ℹ️ **`nativewind` declared but unused** — Zero `className=` in app/. Either adopt or remove to reduce install surface.

**Recommendations**:

- Remove `victory-native` and `i18next-icu` from `apps/mobile/package.json`.
- Schedule Vertex SDK migration (`@google-cloud/vertexai` → `@google/genai`) before 2026-06-24.

---

### 10. DevOps / CI

**Score: 🟢 Good**

**Summary**: CI exists and runs the full gate. Pre-commit hook is wired. The only gap is the absence of a local Supabase dev setup script.

**Findings**:

- ✅ **GitHub Actions CI** — `.github/workflows/check.yml` runs typecheck + lint + test on push to main and all PRs. 15-minute timeout. Correct.
- ✅ **Husky pre-commit** — `lint-staged` runs ESLint + Prettier on staged files. `pnpm prepare` wires it.
- ✅ **Vercel deployment** — `apps/api/vercel.json` exists with rewrite rules for `/v1` → root. Security headers (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy) configured.
- ✅ **Sentry + PostHog wired** — API `src/lib/sentry.ts`, mobile `lib/sentry.ts` + `lib/analytics.ts`. Init at module load. Correct.
- 🟠 **No `pnpm db:start` script** — CLAUDE.md references it; it doesn't exist. There's no documented local Supabase setup. A new contributor cannot run the full test suite (fake-supabase only) plus integration tests in the same `pnpm test`. Add `supabase start` / `supabase stop` scripts and document the one-time setup.
- 🟡 **No staging environment** — Production Vercel and nothing else. A dedicated staging Vercel project with the staging Supabase would allow E2E testing without touching production data.
- 🟡 **Edge Functions not tested** — The 4 Deno Edge Functions have no tests. `dsgvo-export-worker` in particular does complex data assembly; a bug there could produce a garbled DSGVO export which is a legal liability.
- ℹ️ **`pnpm test` in CI runs all workspaces in parallel** — If a workspace's test runner crashes (not just fails), the parallel runner may mask the failure. Add `--bail` or check exit codes explicitly.

**Recommendations**:

- Add `pnpm db:start` / `pnpm db:stop` scripts wrapping `supabase start` / `supabase stop`.
- Add at least smoke tests for the 4 Edge Functions (Deno test harness).
- Create a staging Vercel project before beta.

---

## Priority Action Plan

| #   | Action                                                                                       | Severity    | Effort         | Domain         |
| --- | -------------------------------------------------------------------------------------------- | ----------- | -------------- | -------------- |
| 1   | Fix session→result navigation (`router.replace` missing `sessionId` param)                   | 🔴 Critical | Tiny (1 line)  | Business Logic |
| 2   | Move rate-limit buckets to Postgres                                                          | 🟠 High     | Small (1 day)  | Security       |
| 3   | Fix `lib/i18n/index.ts` to load fr/es/it bundles                                             | 🟠 High     | Tiny (3 lines) | i18n           |
| 4   | Call `PATCH /sessions/:id/finish` on session complete                                        | 🟠 High     | Small          | Business Logic |
| 5   | Add retry/recover UI to upload failure path                                                  | 🟠 High     | Small          | Error Handling |
| 6   | Add `__tests__/explain.test.ts` and `items.test.ts`                                          | 🟠 High     | Medium         | Testing        |
| 7   | Add `lib/eval/__tests__/local.test.ts` (mobile)                                              | 🟠 High     | Small          | Testing        |
| 8   | Remove `victory-native`, `i18next-icu` from mobile deps                                      | 🟡 Medium   | Tiny           | Dependencies   |
| 9   | Bump `@typescript-eslint/no-explicit-any` to `error`                                         | 🟡 Medium   | Tiny           | Code Quality   |
| 10  | Fix streak computation in `/learners/:id/schedule-summary`                                   | 🟡 Medium   | Small          | Business Logic |
| 11  | Wire remaining ~9 screens to `useTranslation`                                                | 🟡 Medium   | Small          | i18n           |
| 12  | Add `pnpm db:start` script + Supabase local setup docs                                       | 🟡 Medium   | Small          | DevOps         |
| 13  | Schedule Vertex SDK migration (`@google-cloud/vertexai` → `@google/genai`) before 2026-06-24 | 🟡 Medium   | Medium         | Dependencies   |
| 14  | Add accessibilityLabel to session MC options                                                 | 🟡 Medium   | Tiny           | UI/UX          |
| 15  | Replace `console.error` in route handlers with Sentry capture                                | 🔵 Low      | Small          | Error Handling |
| 16  | Fix `persistAttempt` to propagate DB errors rather than swallow                              | 🔵 Low      | Tiny           | Error Handling |
| 17  | Extract route helpers from `materials.ts` into `lib/materials/`                              | 🔵 Low      | Small          | Architecture   |
| 18  | Add Edge Function smoke tests (Deno test harness)                                            | 🔵 Low      | Medium         | Testing        |
| 19  | Document `pg_cron` GUC setup in `SETUP-SUPABASE.md`                                          | 🔵 Low      | Tiny           | Data Model     |
| 20  | Implement `practice/[templateId].tsx` client flow                                            | 🔵 Low      | Medium         | Business Logic |

---

## What's Working Well

**Architecture seams**: The `getDeps(c)` / `FakeSupabase` / `FakeLlmGateway` pattern is genuinely excellent. It's the kind of testability design that most engineers only get right after painful experience with hard-coded dependencies. Zero `vi.mock` anywhere is a strong signal.

**Credit accounting**: The `tryDebit` → `settle` → `refund` pattern is atomic, handles partial LLM usage, and is tested. Getting money flows right is hard; this is done correctly.

**DSGVO compliance**: Export queuing, 7-day hold, photo wipe, delete executor — all 4 are real implementations, not stubs. For a product targeting German minors, this is legally essential and it's done.

**Vertex AI integration**: EU-region endpoint, safety guard, JSON-retry-once, detected language passthrough, diagram pipeline in place. The probe script (`pnpm -F @learnbuddy/api probe:vertex`) enables live verification without a full device.

**FSRS integration**: `ts-fsrs` wrapper, overdue/unseen/future-due ordering, server-side RPC with JS fallback — the adaptive learning algorithm that makes the product work is correctly implemented on both client and server.

**TypeScript discipline**: Zero `as any` in 13,000+ LOC of application code. `noUncheckedIndexedAccess`. No `vi.mock`. File headers cite doc sections. This level of discipline is rare.

**Design system**: The pastel-maximalist token set in `lib/theme/colors.ts` matches the brief. Black-pill CTAs enforced in `Btn.tsx`. Tone copy consistently non-harsh throughout the session and result screens.

**Session UX**: The session screen (`session/[sessionId].tsx`, 548 LOC) handles all 6 answer kinds (short, long, numeric, formula, multiple_choice, fill_blank), voice mode switching, hint accumulation, local FSRS eval before LLM call, and coach marks. This is the most complex mobile screen in the app and it's well-structured.

---

## Appendix — File Reference

Key files for follow-up on each finding:

- Session→result nav bug: `/apps/mobile/app/(learner)/session/[sessionId].tsx:147`
- Rate limit in-memory: `/apps/api/src/middleware/rate-limit.ts:8`
- i18n bundle loader: `/apps/mobile/lib/i18n/index.ts` (check `resources` object)
- Schedule summary hardcoded zeros: `/apps/api/src/routes/learners.ts:343-348`
- Upload failure recovery: `/apps/mobile/app/(learner)/upload.tsx`
- persistAttempt swallows errors: `/apps/api/src/routes/attempts.ts:315-332`
- Vertex SDK sunset: `/apps/api/package.json` — `@google-cloud/vertexai`
- pg_cron GUC setup: `/infra/supabase/migrations/0011_pg_cron_schedule.sql` (comment)
- Unused deps: `/apps/mobile/package.json` — `victory-native`, `i18next-icu`, `nativewind`

---

_End of audit. Audited commit: HEAD on `main` branch, 2026-05-17._
