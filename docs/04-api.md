# 04 — API

REST-ish JSON over HTTPS. Base URL `https://api.<domain>/v1`. All endpoints require `Authorization: Bearer <supabase_jwt>` unless explicitly marked **public** or **service**.

The learner context is selected per request by `X-Learner-Id` header. The server validates that the learner belongs to the caller's account. Endpoints that do not need a learner context (e.g. `/account`, `/dsgvo/*`) ignore the header.

Streaming endpoints use Server-Sent Events (`Content-Type: text/event-stream`).

## Conventions

- Request and response bodies are JSON unless otherwise noted.
- Errors: `{ "error": { "code": "string", "message": "string", "details"?: any } }` with appropriate HTTP status.
- Idempotency: POST endpoints that create resources accept `Idempotency-Key`. Server stores the keyed response for 24 hours and replays.
- Pagination: cursor-based, `?cursor=<opaque>&limit=<n>`. Responses include `next_cursor` when more data is available.
- All timestamps in responses are ISO 8601 UTC.
- All request/response bodies are validated server-side with the shared Zod schemas from `packages/shared-types`.

## Auth

### `POST /auth/account/signup` — public

Body:
```json
{ "email": "string", "password": "string", "locale": "de|en|fr|es|it", "country_code": "string" }
```
Creates the Supabase auth user, the `accounts` row, and the `subscriptions` row with `tier='trial'`. Sends email verification through Supabase Auth.

Response 201:
```json
{ "account_id": "uuid", "user": { "id": "uuid", "email": "string" } }
```

### `POST /auth/account/consent`

Body:
```json
{ "accepted": true, "version": "2026-01" }
```
Records the DSGVO consent for the account. Must succeed before any learner is created.

Response 200: `{}`

### Login and password reset

Handled client-side via Supabase Auth SDK. No custom API endpoints.

## Account and learners

### `GET /account`

Response:
```json
{
  "id": "uuid",
  "display_name": "string|null",
  "locale": "de",
  "country_code": "DE",
  "subscription": { "tier": "standard", "status": "active", "expires_at": "iso8601|null", "trial_ends_at": "iso8601|null" },
  "consent": { "version": "2026-01", "accepted_at": "iso8601" },
  "learner": null
}
```

`learner` is either the account's single Learner object, or `null` if onboarding hasn't reached the profile-creation step yet, or if the only profile is currently archived.
```

### `POST /learners`

Creates the single learner profile on the account. Used during onboarding; subsequent calls return `409 conflict` because the account already has an active profile.

Body:
```json
{
  "display_name": "string",
  "birth_year": 2014,
  "grade_level": 7,
  "ui_locale": "de",
  "avatar_id": 3,
  "preferred_answer_mode": "voice",
  "minor_consent_version": "v1.2024-11"
}
```

`minor_consent_version` is required when the calculated age (`current_year - birth_year`) is under 16; the server stores the consent record alongside the profile. For adult profiles, omit or pass `null`.

Response 201: full Learner object.

Response 409 `learner_already_exists`: an active learner profile already exists on this account. To replace it, archive the existing one first (`DELETE /learners/:id`), then re-call.

### `PATCH /learners/:id`

Body: partial Learner fields. Notifications settings included here:
```json
{
  "display_name": "string?",
  "grade_level": 8,
  "ui_locale": "en",
  "avatar_id": 2,
  "preferred_answer_mode": "text",
  "notifications_practice_nudge_enabled": true,
  "notifications_practice_nudge_time": "16:30",
  "notifications_test_heads_up_enabled": true
}
```

### `DELETE /learners/:id`

Soft-deletes the learner (`archived_at = now()`). Cascades to subjects → folders → materials → items → attempts. For hard deletion, the account holder uses the DSGVO delete-account flow.

## Subjects and folders

### `GET /learners/:learnerId/subjects`

Response:
```json
[
  {
    "id": "uuid",
    "name": "Mathe",
    "subject_kind": "math",
    "color_hex": "#6B8AFD",
    "icon_id": "string|null",
    "sort_order": 0,
    "archived_at": null,
    "folder_count": 2,
    "material_count": 5,
    "upcoming_test_in_days": 3
  }
]
```

The `upcoming_test_in_days` field is the number of days until the nearest folder's `scheduled_for` date within the next 7 days, or `null`. It powers the small "Test in N Tagen" chip on subject tiles. No counts of pending items are exposed; the learner never sees a "due" number.

### `POST /learners/:learnerId/subjects`

Body:
```json
{ "name": "Biologie", "subject_kind": "biology", "color_hex": "#3FA876", "icon_id": "leaf", "sort_order": 1 }
```

### `PATCH /subjects/:id`, `DELETE /subjects/:id`

### `GET /subjects/:subjectId/folders`

### `POST /subjects/:subjectId/folders`

Body: `{ "name": "Klassenarbeit 14.06.", "scheduled_for": "2026-06-14" }`. `scheduled_for` is optional; folders without a date are just groupings.

### `PATCH /folders/:id`, `DELETE /folders/:id`

## Materials and AI processing

### `POST /materials/upload-url`

Reserves storage and returns signed PUT URLs for the photos.

Body:
```json
{
  "subject_id": "uuid",
  "folder_id": "uuid|null",
  "photo_count": 2,
  "mime_type": "image/jpeg"
}
```

Response:
```json
{
  "material_id": "uuid",
  "uploads": [
    { "position": 1, "signed_url": "https://...", "storage_path": "materials-raw/{userId}/{materialId}/1.jpg", "expires_at": "iso8601" },
    { "position": 2, "signed_url": "https://...", "storage_path": "materials-raw/{userId}/{materialId}/2.jpg", "expires_at": "iso8601" }
  ]
}
```

The signed URLs are PUT-only and expire in 10 minutes.

### `POST /materials`

Confirms photos are uploaded and triggers extraction.

Body:
```json
{
  "material_id": "uuid",
  "subject_id": "uuid",
  "folder_id": "uuid|null",
  "title": "string|null",
  "locale": "de",
  "grade_level": 7,
  "target_item_count": 10,
  "client_quality_scores": [
    { "position": 1, "blur": 142.3, "brightness": 138, "width": 1024, "height": 768 },
    { "position": 2, "blur": 98.1, "brightness": 145, "width": 1024, "height": 768 }
  ]
}
```

Behavior:
1. Atomic credit debit by estimate. On insufficient → 402 `insufficient_credits`.
2. Insert material with `extraction_status='pending'`.
3. Call `llm.visionExtractAndGenerate` synchronously, streaming progress events via SSE.
4. Validate problem templates with `mathjs`. Drop templates with < 60 % feasibility.
5. Run the diagram image processor for any diagrams.
6. Persist items, problem_templates, study_assets, mark `extraction_status='ready'`.
7. Settle credit debit to actual cost.
8. Schedule photo deletion in `outbox` for T+7 days.

Response (SSE stream):
```
event: phase
data: {"phase":"reading_images"}

event: phase
data: {"phase":"generating_items"}

event: phase
data: {"phase":"processing_diagrams"}

event: done
data: {
  "material_id":"uuid",
  "items": [ /* GeneratedItem with server-assigned ids */ ],
  "templates": [ /* problem templates with ids */ ],
  "study_assets": [ /* study_asset metadata */ ],
  "extracted_language": "de",
  "credits_used": 22
}
```

If extraction fails after retries:
```
event: error
data: {"code":"extraction_failed","message":"..."}
```
The material is marked `failed` and the credit estimate is refunded.

### `GET /materials/:id`

Response: full material with items, templates, study_assets metadata.

### `GET /materials/:id/items`

Items only, paginated.

### `GET /materials/:id/templates`

Problem templates for the material.

### `POST /materials/:id/regenerate-items`

Body:
```json
{
  "target_item_count": 10,
  "style": "simpler|harder|more-variety|null"
}
```
Reuses `extracted_markdown` (never re-OCRs). Debits a smaller credit amount.

Response (SSE, similar phases without `reading_images`):
```
event: done
data: { "added_items": [ /* GeneratedItem */ ], "credits_used": 8 }
```

### `PATCH /materials/:id`

Body: `{ "title": "string", "folder_id": "uuid|null" }`

### `DELETE /materials/:id`

Soft-deletes. Schedules photo wipe and study-asset deletion.

### `DELETE /items/:id`

Soft-deletes a single item (learner wants to drop a bad question).

### `DELETE /templates/:id`

Soft-deletes a problem template.

## Studying

### `POST /sessions`

Body:
```json
{
  "subject_id": "uuid|null",
  "folder_id": "uuid|null",
  "test_mode": false,
  "max_items": 20
}
```
Server picks due items using FSRS state. If `test_mode=true`, test-mode rules apply (see doc 05).

Response:
```json
{
  "session_id": "uuid",
  "items": [ /* full item objects including stimulus */ ]
}
```

### `POST /attempts`

Single-attempt endpoint with LLM evaluation. SSE stream.

Body:
```json
{
  "session_id": "uuid",
  "item_id": "uuid",
  "mode": "voice|text|multiple_choice",
  "kid_answer": "string",
  "parsed_learner_latex": "string|null",
  "prior_hints_given": ["string"],
  "duration_ms": 4200,
  "test_mode": false,
  "client_local_verdict": "correct|null"
}
```

Behavior:
- If `client_local_verdict='correct'`, the server skips the LLM and records the attempt. Returns immediately with `verdict='correct'` and `credits_used=0`.
- Otherwise calls `llm.evaluateAnswer` and streams.

Response (SSE):
```
event: verdict
data: {"verdict":"partially_correct"}

event: feedback
data: {"text":"Fast! Du hast den ersten Teil richtig …"}

event: hint
data: {"text":"Denk an die zweite Phase …"}

event: done
data: {"attempt_id":"uuid","credits_used":1,"fsrs_rating":2}
```

### `POST /attempts/batch`

Replays locally-evaluated attempts from an offline session.

Body:
```json
{
  "attempts": [
    {
      "client_id": "string",        // dedup key
      "item_id": "uuid",
      "session_id": "uuid|null",
      "mode": "voice",
      "kid_answer": "string|null",
      "verdict": "correct|partially_correct|incorrect|skipped",
      "hints_used": 0,
      "duration_ms": 2400,
      "test_mode": false,
      "created_at": "iso8601",
      "fsrs_rating": 4
    }
  ]
}
```

Server re-runs FSRS over each attempt in `created_at` order to produce the canonical item state, then writes attempts + state. Returns:

```json
{
  "applied": ["client_id1", "client_id2"],
  "rejected": [{"client_id": "string", "reason": "string"}],
  "updated_item_states": [{"item_id": "uuid", "due": "iso8601", "state": 2}]
}
```

### `POST /attempts/:client_id/finalize`

For attempts that were left pending offline (local verdict unknown). The mobile sends the learner's answer for server LLM evaluation when network returns. Same response shape as `POST /attempts`.

### `POST /explain`

Body:
```json
{
  "topic": "string",
  "context": "string|null",
  "locale": "de",
  "grade_level": 7,
  "style": "simpler|step-by-step|analogy"
}
```
Response (SSE): streaming explanation tokens, then `done` with `credits_used`.

## Problem templates and practice runs

### `POST /templates/:id/practice-run`

Records the start of a practice run. The client owns variant generation.

Body:
```json
{
  "client_id": "string",
  "started_at": "iso8601",
  "intended_count": 10
}
```
Response: `{ "run_id": "uuid" }`

### `PATCH /templates/:id/practice-run/:run_id`

Updates the run with results when the learner finishes.

Body:
```json
{
  "ended_at": "iso8601",
  "problems_generated": 10,
  "problems_correct": 8,
  "avg_time_ms": 18000,
  "difficulty_adjustment": 0
}
```

## Schedule and streak

### `GET /learners/:learnerId/schedule-summary`

Returns the data the mobile needs to render gentle, non-pressuring UI: upcoming folder dates and the current streak. **No counts of pending items are exposed** — the learner never sees "X questions due." The repetition engine picks items quietly at session start.

Response:
```json
{
  "upcoming_tests": [
    {"folder_id": "uuid", "subject_id": "uuid", "name": "Klassenarbeit Bio", "scheduled_for": "2026-06-14", "days_until": 3}
  ],
  "streak_current": 5,
  "streak_longest": 12,
  "last_session_at": "iso8601|null"
}
```

`upcoming_tests` includes only folders with `scheduled_for` within the next 7 days, sorted ascending. The mobile uses this to render the small "Test in N Tagen" chip on subject tiles and the account-holder overview. The streak fields are shown only on the result screen and on the account-holder overview — never on the learner's home screen as a "don't lose this" pressure cue.

## Math rendering

### `GET /render/latex` — public, cacheable

Query: `?src=<urlencoded LaTeX>&size=md`

Server renders the LaTeX to SVG using KaTeX in Node and returns `image/svg+xml`. Used by mobile only when rendering many formulas at once would cost too many WebViews. Cached aggressively by content hash; `Cache-Control: public, max-age=31536000, immutable`.

## Credits (read-only)

### `GET /account/credits/summary`

Response:
```json
{
  "tier": "standard",
  "period_start": "iso8601",
  "period_end": "iso8601",
  "balance": 2840,
  "monthly_allotment": 4000,
  "rollover_cap": 12000
}
```

Used by mobile only for the soft-cap UX thresholds. Cached client-side for 5 minutes.

## DSGVO

### `POST /dsgvo/export`

Body: `{}`. Response: `{ "request_id": "uuid", "status": "pending" }`. Email with signed download URL is sent when the export is built.

### `GET /dsgvo/requests/:id`

Polls export/delete request status.

Response:
```json
{
  "id": "uuid",
  "kind": "export|delete",
  "status": "pending|running|done|failed|cancelled",
  "result_signed_url": "string|null",
  "result_signed_url_expires_at": "iso8601|null"
}
```

### `POST /dsgvo/delete-account`

Body: `{ "confirm_email": "string" }`. Sets `accounts.scheduled_deletion_at = now() + 7 days`. Sends confirmation email.

Response: `{ "request_id": "uuid", "scheduled_deletion_at": "iso8601" }`

### `POST /dsgvo/cancel-deletion`

Cancels the pending deletion if within the 7-day window. Clears `accounts.scheduled_deletion_at`.

## Webhooks

### `POST /webhooks/revenuecat` — service

RevenueCat webhook. Verifies the `Authorization` header against `RC_WEBHOOK_SECRET`. Updates `subscriptions` and grants credits via the credit grant logic in doc 08.

## Admin

### `GET /admin/spend` — service-allowlist

Header `X-Admin-Email` must match one of the addresses in `ADMIN_ALLOWLIST_EMAILS`. Returns daily LLM spend (USD), per-account burn distribution, prompt-version cost-per-success.

## Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `unauthenticated` | 401 | Missing or invalid JWT |
| `forbidden` | 403 | RLS violation or learner not in account |
| `not_found` | 404 | Resource missing or archived |
| `validation_failed` | 422 | Zod validation failed; `details` contains issues |
| `insufficient_credits` | 402 | Bucket empty, even after rollover |
| `subscription_required` | 402 | Trial expired and no active subscription |
| `extraction_failed` | 502 | LLM vision call failed after retries |
| `evaluation_failed` | 502 | LLM evaluation call failed after retries |
| `rate_limited` | 429 | See rate limits below |
| `not_educational` | 422 | Vision identified non-educational content; client should prompt retake |
| `internal` | 500 | Unexpected; surfaced to Sentry |

## Rate limits

Soft caps to catch runaway clients. The real cost cap is the credit bucket.

| Endpoint | Per learner | Per account |
|---|---|---|
| `POST /materials` | 20/day | 60/day |
| `POST /materials/:id/regenerate-items` | 10/day | 30/day |
| `POST /attempts` | 600/hour | — |
| `POST /attempts/batch` | 60/hour | — |
| `POST /explain` | 60/day | 200/day |
| `POST /sessions` | 60/day | — |
| `POST /templates/:id/practice-run` | 50/day | — |

Limits are tracked in an in-memory + Postgres-backed sliding-window counter. Exceeding returns 429 with `Retry-After` header.

## Versioning

The API ships under `/v1`. The version is part of the URL.
