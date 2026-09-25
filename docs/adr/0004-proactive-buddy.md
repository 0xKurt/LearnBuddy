# ADR 0004 — Proactive Buddy: one surface in front, explicit modules behind

- Status: accepted; backend implemented and verified with real-Postgres tests, app rebuild in progress
- Date: 2026-09-25
- Diverges from: docs/legacy/01-product.md §Notifications ("local notifications only — no push
  servers"), §Features (home = subject grid, credits), docs/legacy/03-data-model.md and docs/legacy/04-api.md
  (replaced), docs/legacy/05-mobile.md §home, §Notifications, docs/legacy/06-ai-pipeline.md §P3 (tutor output
  format), docs/legacy/08-cost-and-credits.md (credits replaced by per-learner daily limits),
  docs/DESIGN-BRIEF.md "self-led, not app-driven" (kept as a hard constraint on _how_ Buddy may be
  proactive, see below), CLAUDE.md "a migration once merged is immutable" (see Transition).
- Diagnosis and product principle (German): [docs/buddy/01-prinzip-und-diagnose.md](../buddy/01-prinzip-und-diagnose.md)
- Architecture reference: [docs/architecture.md](../architecture.md); privacy: [docs/privacy.md](../privacy.md)

## Context

LearnBuddy should behave like a companion that gets to know the learner, keeps context, does
organising work, thinks ahead and reaches out on sensible occasions — even when the app is closed —
while the learner only sees a minimal surface. The diagnosis shows the previous system could not
do this and that prompt changes would not help: there was no memory, no plan state, no scheduler
for learners, no delivery evidence; the tutor papered over missing capabilities with word lists
and canned replies (including an endless "sag ‚Tipp'" loop); the client could claim answers
correct; every learner without a grade was treated as grade 7.

## Decision

### 1. Rebuild as a modular monolith

The API is rebuilt (`apps/api/src/`) as one Hono app with modules behind narrow interfaces:
`identity`, `buddy` (turns, checks, tools, contact policy, delivery, home), `materials`,
`practice`, `scheduler`. Postgres is accessed directly (`pg`, transactions, row locks) instead of
through the Supabase REST client, because Buddy's guarantees (context fence, leases,
compare-and-set) need transactions. No new services.

### 2. The model interprets and plans; code enforces

- Structured JSON answers (Vertex `responseJsonSchema` derived from zod) validated again with zod.
- The model never writes ids or dates: aliases resolve to the learner's own rows; day and
  duration specs are resolved server-side in the learner's zone; clock-change ambiguities are
  rejected.
- Changes to memory, goals, agreed reminders and settings carry the learner's exact words,
  checked against their latest message (provenance, not language understanding — no word lists).
- A decision is applied atomically, only on the context version it was made on; the first
  invalid action rejects the whole decision; one repair round, then an honest failure.
- Background checks may only prepare, ask for material or schedule a look; they can never change
  what the learner said. Contact can only be reduced by Buddy.

### 3. Proactivity rules (DESIGN-BRIEF kept as hard constraints)

- Contact outside the app is **opt-in**, off by default; for minors only the account holder
  (server-side PIN gate) can enable or increase it. Anyone can pause or reduce.
- Occasions come from the learner's own goals and prepared work (test approaching, material
  ready, agreed reminder, how did the test go) — never counts of due items, missed days or streaks.
- Defaults: 1 unsolicited message per day and 4 per week, quiet hours 20:00–07:00, preferred
  window 15:00–18:30 (learner's zone), topic dedupe 72 h, no follow-up while the last message is
  unanswered (48 h), relevance ≥ 0.6, nothing sent in bulk after a pause. Silence is a valid,
  logged outcome.

### 4. Honest delivery evidence

`scheduled → sending → accepted (Expo ticket) → provider_accepted | provider_rejected (receipt)`;
`send_uncertain` is never resent; `in_app` when there is no push channel or the learner is in
the app; only the app can record "opened". Push goes through Expo (US subprocessor) and is
**disabled** (`PUSH_BACKEND=disabled`) until legal review; Buddy then works in the app only.

### 5. Structured tutor

The tutor returns `{intent, verdict, reply, gave_hint, revealed_answer}`; the server enforces
that a non-attempt is never graded, a reveal never counts as right and rule-checked wrong answers
stay wrong. Without a model nothing is graded. Spaced repetition gets one review per question per
session.

### 6. One surface

The app becomes one Buddy screen: _now_ (one primary card), _the one open decision_, _done_
(what Buddy prepared or did, with status and undo), _next_, and the conversation with contextual
quick replies. Material, memory, contact settings and history are one tap away.

## Transition: fresh start

Decided with the product owner on 2026-09-25 ("hier muss nichts migriert werden, wir können
komplett fresh starten"): there is no production data to carry over, so there is **no data
migration and no compatibility layer**.

- The legacy migrations 0001–0021 are replaced by `0001_baseline.sql` + `0002_scheduler.sql`
  (they remain in git history). This deliberately breaks the "merged migrations are immutable"
  rule once; from now on the rule applies to the new baseline.
- Operator steps (not automated, destructive): reset the hosted database (e.g. `supabase db
reset --linked`, or a new project), apply the new migrations, set the Vault secrets
  `lb_api_url` and `lb_tick_secret`, and configure the API environment (`apps/api/.env.example`).
- The old edge functions (photo wipe, DSGVO workers, RevenueCat reconcile) are removed: their
  work is done by the API scheduler; billing/credits are not part of this release.
- The app no longer schedules local notifications; it clears any still queued on a device.

## Consequences

- One source of truth for timing (the API clock), testable with simulated time.
- Real-Postgres integration tests replace the previous mocked-database tests.
- Model cost is bounded per learner and day and recorded per call; no credits.
- Open: live-model evaluation of Buddy's judgement (scripted tests verify the machinery, not the
  model), push on real devices, legal review of Expo push.
