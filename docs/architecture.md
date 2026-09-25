# LearnBuddy architecture (Buddy rebuild)

Status: current for the rebuild on branch `claude/exciting-galileo-nl25uq` (2026-09-25).
Decision record: [ADR 0004](adr/0004-proactive-buddy.md). Why the rebuild: [Buddy: Prinzip und
Diagnose](buddy/01-prinzip-und-diagnose.md). Privacy: [privacy.md](privacy.md).
The numbered docs `01`–`10` describe the previous app and are kept for history.

Buddy takes organising, planning and remembering off the learner. In front there is one screen;
behind it there are small modules with narrow interfaces. **The model interprets and plans;
application code enforces permissions, tenant isolation, time rules, version checks and limits.**

```
 app (Expo)  ── HTTPS, Supabase JWT, x-timezone ──▶  API (Hono, Node; Vercel or any Node host)
                                                      │
   Supabase Auth (sign-in)                            ├─ identity   account, learner, PIN gate, export/deletion
   Supabase Storage (photos, signed upload URLs)      ├─ buddy      turns, checks, tools, contact policy, delivery, home
                                                      ├─ materials  photos → questions (model, job)
                                                      ├─ practice   sessions, rule checks, tutor, FSRS
                                                      └─ scheduler  durable jobs + tick
                                                      │
   Postgres (Supabase) ◀── direct connection (pg) ────┘      Vertex AI (Gemini, EU)   Expo push (off by default)
   pg_cron ── every minute ──▶ POST /internal/tick
```

Code: `apps/api/src/`. Schema: `infra/supabase/migrations/0001_baseline.sql`,
`0002_scheduler.sql`. Contracts shared with the app: `packages/shared-types/src/contracts/`.

## Core loop

1. **Get to know** — the learner writes in their own words ("Mathearbeit am Freitag über Brüche").
   Buddy records what matters (level, the test, preferences) through tools, and asks only for
   what is missing for the next useful step (e.g. a photo of the worksheet).
2. **Keep context** — memory with provenance (the learner's exact words), goals with their date,
   steps with explicit states, practice progress per topic. Temporary situations end by themselves.
3. **Act on its own** — durable wake-ups (test approaching, material ready, practice finished,
   agreed reminder, a check Buddy scheduled, a daily routine) run whether the app is open or not.
4. **Show a useful result** — prepared practice as one "now" card; results as cards with real data.
5. **Understand feedback** — "kürzer bitte", "diese Woche keine Nachrichten" become memory or
   settings changes, each traceable and undoable.
6. **Adapt** — later decisions see the new state; contact rules are enforced by code.

The whole loop, including failures and interruptions, is exercised end to end against a real
Postgres in `apps/api/src/__tests__/` (see [Testing](#testing)).

## API

Hono app composed in `src/app.ts`; the same routes are served under `/`, `/v1`, `/api`,
`/api/v1` (the app calls `/v1/…`; Vercel rewrites `/v1/*` to the function).

- Auth: `Authorization: Bearer <Supabase access token>`, verified with Supabase Auth
  (`auth/verifier.ts`). The API never sees passwords.
- Every learner-scoped route takes the learner from the verified user (`http/context.ts`), never
  from the body, the path or a model output. The device sends its IANA zone in `x-timezone`.
- Minors: loosening contact rules and account data need a short-lived admin token (PIN,
  `x-admin-token`, 10 minutes, HMAC). Tightening (pause, quieter) is always allowed.
- Errors: `{"error": {"code", "message", "details"?}}` with stable codes (`lib/errors.ts`); no
  provider bodies, SQL or user content in messages or logs.
- Bodies are JSON ≤ 64 KB, validated with zod (`http/validate.ts`); photos go straight to storage.

| Route                                                                                                | Purpose                                                  |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `GET /me`, `POST /account`, `POST /learner`, `PATCH /learner`                                        | onboarding (consent version must match)                  |
| `PUT /account/pin`, `POST /account/admin-session`                                                    | PIN gate (5 tries, 15 min lock)                          |
| `GET /account/export`, `POST/DELETE /account/deletion`                                               | privacy (account holder)                                 |
| `GET /buddy`, `GET /buddy/thread`                                                                    | the home: now / decision / done / next / thread / system |
| `POST /buddy/messages`                                                                               | a learner message (idempotent on `client_message_id`)    |
| `POST /buddy/steps/:id/start\|skip`, `POST /buddy/actions/:id/undo`, `POST /buddy/goals/:id/outcome` | explicit taps, no model                                  |
| `POST /buddy/contact/opt-in`, `GET/PATCH /buddy/settings`, `POST/DELETE /buddy/push-tokens`          | contact                                                  |
| `POST /buddy/outreach/:id/opened`                                                                    | the only evidence a message was opened                   |
| `GET/PATCH /buddy/memory`                                                                            | what Buddy knows, correctable                            |
| `GET/POST /materials`, `GET/DELETE /materials/:id`, `POST /materials/:id/submit\|retry`              | photos → questions                                       |
| `POST /practice/sessions`, `GET /practice/sessions/:id`, `POST …/answer\|reveal\|finish`             | practice                                                 |
| `GET /health`, `POST /internal/tick` (`x-tick-secret`)                                               | operations                                               |

## Buddy decisions

The model never writes ids, dates or instants (`modules/buddy/decision.ts`):

- **Aliases** — STATE lists entities as `g1`, `st2`, `m3`, `f1`; tools resolve them for this
  learner only (`context.ts`). "new" references a test planned earlier in the same answer.
- **DaySpec / UntilSpec** — "weekday 5", "in 1 day", a named date, "end of week"; resolved in
  the learner's zone against the time the learner _wrote_ (`lib/time.ts`). Nonexistent or
  doubled local times (clock changes) are rejected, never guessed.
- **Quotes** — changes to memory, goals, agreed reminders or settings carry the learner's exact
  words from their latest message, checked by normalised substring match (provenance, not
  language understanding).
- **Context fence** — `buddy_settings.context_version` is bumped by every change a decision
  depends on. `apply.ts` applies a whole decision in one transaction only if the version is
  unchanged (compare-and-set, row lock); otherwise the decision is stale and nothing is applied.
- **All or nothing** — the first rejected action rolls back the whole decision; the reasons go
  back to the model for one repair round, then the turn fails honestly.
- Every decision — applied, waiting, stale, rejected, failed — is stored in `buddy_decisions`
  (validated output, errors, model, prompt version; no hidden reasoning). Applied changes are in
  `buddy_actions` with the data needed to undo them.

## Turns

`modules/buddy/turn.ts`. A learner message is stored first (idempotent per `client_message_id`)
with a claim token. The turn builds the context (STATE + dialogue), asks the model for a
`TurnDecision` (JSON schema), validates and applies it.

- Duplicate request → replay (done) or "processing" (202); never a second run.
- A newer message during a turn supersedes it: the newer turn answers both.
- Stale context → rebuild and ask again (≤ 4 rounds); invalid output → one repair round.
- Interrupted turn (process died, function frozen) → after 3 minutes the scheduler (or a client
  retry) takes over with a new claim token; the old runner can no longer publish or fail it.
- Failure → the message is marked `failed` with a stable code (`model_unavailable`,
  `model_invalid`, `budget_exhausted`, `stale`); nothing half-applied, no invented reply.

## Tools

`modules/buddy/tools.ts`. The only way a decision changes anything. Each tool validates against
current rows (inside the decision's transaction), makes a bounded change and returns a card
summary plus undo data. Enforced here, not in the prompt:

- background checks may only `prepare_practice`, `request_material`, `schedule_check`;
- contact can only be reduced or shifted by Buddy (`set_contact`), never enabled or increased;
- agreed times may not fall into quiet hours; checks lie between 1 hour and 21 days ahead;
- temporary situations need an end (≤ 60 days); plans lie ≤ 1 year ahead;
- undo is refused when the object changed since (version check) — no blind overwrite of, e.g.,
  an adult's later settings change.

## Proactivity

`modules/buddy/check.ts`. Wake-ups are jobs (`reason`: `exam_countdown` 5/3/1 days before at the
start of the preferred window, `exam_followup` the day after, `material_ready`,
`session_finished`, `step_due`, `checkin_requested`, `routine`). Gates, cheapest first:

1. one worker per learner (lease on `buddy_settings`);
2. agreed reminders → fixed template (i18n), no model; with contact off or paused the reminder
   waits in the app, as Buddy promised;
3. learner is in the app right now → an unasked look (routine, countdown, a scheduled check) waits
   20 minutes; what follows from the learner's own action (photos read, practice finished) runs now —
   right after the reading or the practice, not on the next scheduler run;
4. nothing to work with, or only a routine look while contact is off → silence, no model call;
5. no model configured → fixed fallbacks immediately;
6. the model decides (`CheckDecision`: act or wait, ≤ 3 actions, ≤ 1 message proposal);
7. apply with the context fence; the contact policy decides whether and when a message is sent;
8. provider outage → retry in 10 minutes (bounded), then fallbacks keep time-critical help
   working (prepared practice before a test, "how did it go").

## Delivery

`modules/buddy/policy.ts` (pure) and `delivery.ts`.

- Policy: opt-in; pause; quiet hours in the learner's zone; Buddy's own messages need relevance
  ≥ 0.6, go into the preferred window, at most 1/day and 4/week (all contact counts), no repeat
  of a topic within 72 h (topic keys are stored with real ids), no second message while the last
  one is unanswered (48 h). Agreed reminders go out at the agreed minute (quiet hours and pause
  apply, limits and avoided weekdays do not).
- Rules are re-checked at send time; a message about something already done is cancelled.
  A message is linked to its goal and step (`step: "new"` = the practice prepared in the same
  decision), so "practice is ready" is dropped once that practice was done. Pausing cancels
  everything planned — nothing is sent in bulk afterwards. Planned messages are listed on the
  home under what comes next.
- Evidence chain (`buddy_outreach.status`): `scheduled → sending → accepted` (Expo ticket) →
  `provider_accepted | provider_rejected` (receipt, 15 min–24 h). `send_uncertain` (no answer, or
  a crash while sending) is never resent. `in_app` when the learner is in the app, has no device
  or push is disabled. Only the app can record `opened`. The text is always also in the thread.
- `DeviceNotRegistered` (ticket or receipt) deactivates the token.
- Lock-screen texts carry no scores or personal details.

## Background work

`modules/scheduler/`. One durable queue (`jobs`) for extraction, Buddy checks, turn recovery,
photo purge and account deletion. Claimed with `FOR UPDATE SKIP LOCKED` and a lease token;
finishing and retrying are compare-and-set on the token, so a worker whose lease expired cannot
overwrite its successor. At most `max_attempts` (default 3), then parked as `failed`. A cancelled
job can be planned again with the same key (an exam moved away and back).

`POST /internal/tick` runs everything due within a 45 s budget: recovery → reading photos →
Buddy per learner (one learner's failure does not stop the others) → delivery → receipts →
maintenance. pg_cron calls it every minute via pg_net (`0002_scheduler.sql`, URL and secret from
Supabase Vault). The Node server can run it in-process for development. A heartbeat makes a dead
scheduler visible (`GET /health` → 503, and "scheduler: stale" in the app).

## Model calls

`llm/`. One seam (`LlmGateway`): structured JSON for a zod-derived schema, validated again with
zod. `VertexGateway` (Gemini, `europe-west4`) with explicit output-token cap, thinking budget and
timeout; `DisabledGateway` when no model is configured (Buddy says so). Every call reserves
against a per-learner daily limit first (atomic upsert) and is recorded in `llm_calls` with
tokens, cost and outcome — never with prompt or answer text.

## Limits

| What                            | Limit                                                                     |
| ------------------------------- | ------------------------------------------------------------------------- |
| Model calls per learner and day | turn 80, check 8, tutor 300, extraction 12 (`config.ts`)                  |
| Turn                            | ≤ 4 model rounds, 30 s timeout each, 2048 output tokens, thinking 512     |
| Check                           | ≤ 3 rounds (repair/stale), 40 s timeout, 2048 output tokens, thinking 768 |
| Tutor                           | 20 s timeout, 1024 output tokens, no thinking; rules first                |
| Extraction                      | 120 s timeout, 12 000 output tokens, ≤ 3 runs per material, ≤ 20 photos   |
| Jobs                            | 3 attempts, leases 120–180 s; tick budget 45 s                            |
| Turn stall                      | taken over after 3 minutes                                                |
| Contact                         | 1/day, 4/week (adjustable down), topic dedupe 72 h, unanswered 48 h       |
| Memory                          | 60 active items; temporary ≤ 60 days                                      |

Pricing used for cost records (Vertex AI, 2026-09-25): gemini-2.5-flash $0.30 input / $2.50
output per 1M tokens (output includes thinking), gemini-2.5-flash-lite $0.10 / $0.40.

## Material

`modules/materials/`. `create` reserves the material and signed upload URLs (idempotent per
client id) → the app uploads directly → `submit` verifies the photos arrived and queues the
reading (and starts it right away via `waitUntil`) → the job reads them with the model into
questions (validated item by item) → the capture step Buddy asked for is done with evidence →
Buddy is woken. Status is what the database says: `awaiting_upload → queued → processing →
ready | failed(reason)`. Photos are deleted 7 days after reading (also when unreadable), and
immediately when the learner deletes the material.

## Practice

`modules/practice/`. A session is a fixed set of questions chosen up front (due → new → rest,
focus topics). Answers are checked by rules where exactness is decidable (multiple choice,
numbers with decimal comma and units, exact matches); otherwise the tutor model judges with a
structured decision, and the server enforces invariants (a non-attempt is never graded, a
revealed answer never counts as right, a rule-checked wrong answer stays wrong). Without a model,
nothing is graded ("kann ich gerade nicht prüfen"). Each question feeds spaced repetition (FSRS,
no short-term steps) once per session: first try → Good, with help → Hard, revealed → Again.
Finishing records evidence on Buddy's step (only if something was answered) and wakes Buddy.

### Learning modes (migration `0003_learning_modes.sql`)

Questions come from a photo (`material`), from Buddy on a topic the learner named (`buddy`,
shown as "Frage von Buddy"), from a typed list (`typed`) or from homework (`homework`). All
share one validated shape (`practice/items.ts`: `ItemDraft`, `usableItems`, `insertItems`).

- **help** — homework, from a photo (`materials.purpose = 'homework'`: the tasks as printed, a
  help session is created when they are read) or typed (`POST /practice/topic` kind `help`; tasks
  the model adds are dropped — `fromLearnerText`). The stored solution only guides hints. The
  server enforces "never the solution": no reveal endpoint (409 `reveal_not_allowed`), closed
  items carry no answer, and a tutor reply that contains the solution in any notation
  (`givesAwayHomework`) gets one repair round, then is replaced by a safe hint. Confirming what
  the learner worked out is allowed. No FSRS for homework.
- **explain** — `POST /practice/topic` kind `explain`: a short explanation (`session.intro`) at
  the learner's grade, then 3–5 check questions; the tutor sees the explanation.
- **practice on a topic** — kind `practice`: Buddy's own questions, marked as such.
- **vocab** — pairs (`prompt_lang` → `lang`) from a photographed list or typed (kind `vocab`);
  each pair becomes two questions (both directions, own FSRS state). Rule check: exact after
  normalisation = right; only accents differ = `close` → partially right, the tutor names the
  letter.
- **speak** — say a sentence aloud (kind `speak`; `POST /practice/sessions/:id/speak` with a
  ≤ 15 s recording, bodies up to 2 MB only on this route). The model listens to the audio itself:
  it writes the expected pronunciation and the sounds actually produced (IPA), then judges word
  by word (`practice/speak.ts`). good → right, almost → right with help, retry → stays open.
  The recording is never stored. Live checks (`evals/speak/run.ts`, espeak-ng recordings): wrong
  words are recognised reliably, a strong German accent in 2 of 3 runs; it is an AI assessment,
  not a phonetic measurement. A dedicated pronunciation-assessment service (phoneme scores)
  would replace `speakItem`'s model call behind the same contract.
- **Math and figures** — texts carry math between dollar signs in a small LaTeX subset (the app
  renders fractions, powers, roots; `apps/mobile/components/math/`); LaTeX the model forgot to
  wrap is wrapped server-side, and rule checks compare \\frac{3}{4} and 3/4 as equal. A question
  may carry a `figure` (fraction, number line, function plot, bar chart, geometry, table) as data
  (`contracts/figure.ts`); the server drops figures it cannot draw (e.g. an expression that does
  not compile with `@learnbuddy/shared-math` `compileExpression`) without dropping the question.

## Voice

Talking instead of typing, everywhere she would otherwise type (chat, answers):

- **Speech to text** — on the device first (iOS/Android speech recognition, the browser's Web
  Speech API; streams while she speaks, nothing leaves the device for this). Where that is not
  available: `POST /voice/transcribe` (`modules/voice/`): the model writes down the recording
  (answer mode writes numbers and fractions as such, and gets the question as context so short
  answers like "drei Viertel" are heard as 3/4). Live checks with espeak-ng recordings
  (`evals/voice/run.ts`): 5/6 with context; the lite model invented words and is not used. The
  recording is never stored.
- **Voice mode** (app): Buddy's replies, questions and feedback are read aloud with the
  device's voices (`expo-speech`); she answers with the mic. The microphone never starts by
  itself. This is turn by turn (tap, speak, listen) — a live, interruptible conversation (e.g.
  a realtime audio API) is not built.
- **Pronunciation** — see Learning modes (`speak`).

## Home

`modules/buddy/home.ts`. Everything is derived from stored state: **now** (resume practice ›
result of the last practice › prepared practice › material failed › material being read, or
photos still being sent for up to 10 minutes › photo needed), **working** (Buddy is acting on
the learner's own photos or just-finished practice: a due or running check they caused),
**decision** (how did the test go › enable contact), **done** (Buddy's actions of the last 72 h
with status and undo), **next** (tests and planned steps), the **thread** (with the action cards
and delivery status of each message) and **system** status (model, push, contact, scheduler).

Photos that never all arrive are set aside after a day and whatever did arrive is deleted at
once (`abandonStaleUploads`, run by the scheduler).

## Testing

- Unit: time and DST (`lib/__tests__`), contact policy, i18n parity.
- Integration against a real Postgres (`src/__tests__/*.int.test.ts`, harness in
  `src/testing/`): every test file gets its own database created from a template with the real
  migrations. Only the outside world is replaced: a scripted model (every call must be scripted;
  scripts can assert on the context the model sees), fake push provider, fake auth, in-memory
  storage, and a single test clock.
- Locally: a Postgres 16 on `127.0.0.1:5432` (`LB_TEST_DATABASE_URL` to change). Without one the
  database tests are skipped; `LB_REQUIRE_TEST_DB=1` (CI) makes that a failure.
- Not covered by automated tests: the live model's judgement quality, real push delivery to
  devices, Supabase Auth/Storage themselves, pg_cron/pg_net on a hosted project.
- Browser walkthrough: `pnpm --filter @learnbuddy/api dev:stack` starts the real API and
  scheduler on a throwaway copy of the schema with stand-ins for Supabase Auth, photo storage and
  a scripted model (`src/testing/dev-stack.ts`, scenario in `src/testing/scenarios/`). The app's
  web build talks to it like to production. Test tooling only; never deployed.
