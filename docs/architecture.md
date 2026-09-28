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
                                                      ├─ voice      speech to text (recordings → model)
                                                      ├─ devices    push device binding (install id)
                                                      └─ scheduler  durable jobs + tick
                                                      │
   Postgres (Supabase) ◀── direct connection (pg) ────┘      Vertex AI (Gemini, EU)   Expo push (off by default)
   pg_cron ── every minute ──▶ POST /internal/tick
```

Code: `apps/api/src/`. Schema: `infra/supabase/migrations/` (`0001_baseline.sql` and the numbered
migrations after it). Contracts shared with the app: `packages/shared-types/src/contracts/`.

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
`/api/v1` (the app calls `/v1/…`). On Vercel the single function `apps/api/api/index.ts` gets
every `/v1/*` and `/api/*` request through two rewrites (nested paths included; the original
path stays in the request URL); Node is pinned by `engines` in `apps/api/package.json`, and only
`apps/api/public/` is served statically. The database connection uses TLS with certificate
verification for every non-local host (`lib/db.ts`, CA in `DATABASE_CA_CERT`); a URL asking for
less is refused at boot, and a database region outside the EU is logged as a boot warning
(`config.ts`; the region itself is an open decision, D-4).

- Auth: `Authorization: Bearer <Supabase access token>`, verified with Supabase Auth
  (`auth/verifier.ts`). The API never sees passwords. Only a token Supabase Auth definitely
  rejects (a 4xx other than 408/429) is 401; when Supabase Auth cannot answer (network, 5xx, 429) the API answers 503 `unavailable`, so an auth outage never looks like a sign-out.
- Every learner-scoped route takes the learner from the verified user (`http/context.ts`), never
  from the body, the path or a model output. The device sends its IANA zone in `x-timezone`.
- Under 16: loosening contact to the phone, account data, sign-in details, a birth-date
  correction and agreeing to a new privacy text need a short-lived admin token (PIN,
  `x-admin-token`, 5 minutes, HMAC; the app drops it after the one step). The gate is the age,
  not who set the profile up: from 16 (DSGVO Art. 8, German age) she consents and decides
  herself, also on a profile her parents created (ADR 0006). Tightening (pause, quieter) is
  always allowed.
- Consent: every route behind `requireAccount` answers 409 `consent_outdated` while the
  account's `consent_version` is not the current one; `/me`, `POST /account`, the PIN, export
  and deletion (`requireAccountAnyConsent`) keep working, and so does unregistering a phone
  (`DELETE /buddy/push-tokens`, it only reduces contact). The scheduler does the same: no
  reading, Buddy check or outreach for such an account (they wait queued); erasure jobs run.
- Errors: `{"error": {"code", "message", "details"?}}` with stable codes (`lib/errors.ts`); no
  provider bodies, SQL or user content in messages or logs.
- Bodies are JSON ≤ 64 KB, validated with zod (`http/validate.ts`); photos go straight to storage.
- Older app builds (audit M-69): responses the home is built from are forward compatible — a
  card, notice, decision, action or message kind a build does not know is left out
  (`tolerantArray`, `.catch` in `contracts/buddy.ts`), never the whole response. The app sends
  `x-app-version`; with `MIN_APP_VERSION` set, older builds get 426 `update_required` ("bitte
  aktualisieren"), and kept answers wait for the update instead of being dropped.
- Indexes (migration `0017_fk_indexes.sql`): every foreign key has an index, so the account
  deletion cascade and the per-subject counts cost her data, not everybody's
  (`scale.int.test.ts` keeps it so for future foreign keys). `0028_scan_indexes.sql` does the
  same for the scheduler's per-minute lookups (jobs by material, turns still processing).

| Route                                                                                                | Purpose                                                                                          |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `GET /me`, `POST /account`, `POST /learner`, `PATCH /learner`                                        | onboarding (consent version must match); child + PIN in one request; birth-date correction (PIN) |
| `PUT /account/pin`, `POST /account/admin-session`                                                    | PIN gate (shared lock, §Limits)                                                                  |
| `PUT /account/password`                                                                              | new password (Supabase admin), PIN for a minor                                                   |
| `GET /account/export`, `POST/DELETE /account/deletion`                                               | privacy (account holder; also without a profile)                                                 |
| `GET /buddy`, `GET /buddy/thread`                                                                    | the home: now / decision / done / next / thread / system                                         |
| `POST /buddy/messages`                                                                               | a learner message (idempotent on `client_message_id`)                                            |
| `POST /buddy/messages/:clientMessageId/stop`                                                         | "Stopp" while Buddy writes: the turn ends stopped, or says it was already answered (§Turns)      |
| `POST /buddy/steps/:id/start\|skip`, `POST /buddy/actions/:id/undo`, `POST /buddy/goals/:id/outcome` | explicit taps, no model                                                                          |
| `POST /buddy/contact/opt-in`, `GET/PATCH /buddy/settings`, `POST/DELETE /buddy/push-tokens`          | contact                                                                                          |
| `POST /push-devices/claim`, `POST /push-devices/release` (no session)                                | one learner per install (push)                                                                   |
| `POST /buddy/outreach/:id/opened`                                                                    | the only evidence a message was opened                                                           |
| `GET/PATCH /buddy/memory`                                                                            | what Buddy knows, correctable                                                                    |
| `GET/POST /materials`, `GET/DELETE /materials/:id`, `POST /materials/:id/submit\|retry`              | photos → questions                                                                               |
| `PATCH /materials/:id`, `GET /materials/:id/items`, `DELETE /materials/:id/items/:itemId`            | rename; her questions (never solutions); delete one                                              |
| `POST /practice/sessions`, `GET /practice/sessions/:id`, `POST …/answer\|reveal\|finish`             | practice                                                                                         |
| `POST /practice/sessions/:id/items/:itemId/flag`                                                     | "Frage passt nicht": skipped here, archived                                                      |
| `GET /health`, `POST /internal/tick` (`x-tick-secret`)                                               | operations                                                                                       |

## Buddy decisions

The model never writes ids, dates or instants (`modules/buddy/decision.ts`):

- **Aliases** — STATE lists entities as `g1`, `st2`, `m3`, `f1`; tools resolve them for this
  learner only (`context.ts`). "new" references a test planned earlier in the same answer.
- **DaySpec / UntilSpec** — "weekday 5", "in 1 day", a named date, "end of week"; resolved in
  the learner's zone against the day the model counted from (the "Now" in its STATE; `lib/time.ts`).
  Nonexistent or doubled local times (clock changes) are rejected, never guessed — also for a
  time the model gives `schedule_check`.
- **Quotes** — changes to memory, goals, agreed reminders or settings carry the learner's exact
  words — whole words from what she wrote since Buddy's last answer — checked by normalised
  word-boundary match (provenance, not language understanding; §Turns).
- **Context fence** — `buddy_settings.context_version` is bumped by every change a decision
  depends on, including the learner's time zone (the `x-timezone` header bumps it in the same
  statement when the zone changes). `apply.ts` applies a whole decision in one transaction only
  if the version is unchanged (compare-and-set, row lock); otherwise the decision is stale and
  nothing is applied. A lock conflict Postgres breaks (deadlock, serialization) counts as stale.
- **One lock order** — every transaction that bumps the context locks the learner's
  `buddy_settings` row first (`plan.ts lockContext`), then steps, goals, memories or outreach,
  as applying a decision does; a tap during an apply waits instead of deadlocking (repro-01).
- **Undo never loosens contact under 16 without the adult**: undoing a pause, earlier quiet
  hours or a day off needs the PIN like the same change in the settings, and the button is not
  offered to her.
- **All or nothing** — the first rejected action rolls back the whole decision; the reasons go
  back to the model for one repair round, then the turn fails honestly.
- Every decision — applied, waiting, stale, rejected, failed — is stored in `buddy_decisions`
  (validated output, errors, model, prompt version; no hidden reasoning). Applied changes are in
  `buddy_actions` with the data needed to undo them.

## Turns

`modules/buddy/turn.ts`. A learner message is stored first (idempotent per `client_message_id`)
with a claim token. The turn builds the context (STATE + dialogue), asks the model for a
`TurnDecision` (JSON schema) — after up to two rounds of lookups (below) — validates and applies it.

- Duplicate request → replay (done) or "processing" (202); never a second run.
- A newer message during a turn supersedes it: the newer turn answers both. The older one is
  released, not "done": it becomes done with the newer answer, or failed with the newer
  failure. An answer closes earlier failed, superseded or crashed (stalled) messages only
  within the 24-message dialogue the model saw.
- `reply_to_id` is stored only when it names one of her own messages.
- Stale context → rebuild and ask again (≤ 4 rounds); invalid output → one repair round.
- Interrupted turn (process died, function frozen) → after 3 minutes without a model call (each
  call refreshes the claim, so a long live turn is not mistaken for a dead one) the scheduler (or a client
  retry) takes over with a new claim token; the old runner can no longer publish or fail it.
  After three takeovers that died too, the message fails (`internal`) instead of being run
  (and billed) again every few minutes.
- Failure → the message is marked `failed` with a stable code (`model_unavailable`,
  `model_invalid`, `budget_exhausted`, `stale`, `internal` for anything else — a database
  error or a bug never leaves it "processing"); nothing half-applied, no invented reply. The
  message keeps why (`buddy_messages.failure_code`, migration 0020), so the app says what
  happened ("Buddy konnte gerade nicht antworten") instead of "not arrived", and offers no
  resend once the day's allowance is used up.
- **Stopped** (`POST /buddy/messages/:clientMessageId/stop`, migration 0034): while Buddy writes,
  the app's send button is "Stopp". Under the settings lock, her still-processing message (and
  the unanswered ones before it that wait for the same answer) become `failed` with
  `failure_code = 'stopped'` and lose their claim; the context is bumped. The running turn can
  then neither apply its answer (apply.ts checks the claim under the same row lock) nor start
  another model call (each round re-checks its claim); a call already under way finishes in the
  background and its answer is dropped. Nothing of the reply is stored — the thread shows her
  message "Gestoppt" with "Nochmal senden" (the same `client_message_id` runs again). A turn
  that finished first stays finished: the answer says `done` and the reply is there. Only her
  own messages (404 otherwise); `stop.int.test.ts`.
- **Safeguarding** (audit I-9, decision D-10). Distress — being hurt, bullied, abused or
  threatened, thoughts of self-harm — is a code path, not an improvisation:
  - the model marks it with `concern` (first field of `TurnDecisionForModel`, zod-validated);
    code then answers with a fixed reply per locale and age (`i18n` `safeguarding.*`: a trusted
    adult and a helpline — DE Nummer gegen Kummer 116 111, FR 119, ES Fundación ANAR
    900 20 20 10, IT Telefono Azzurro 19696, EN Childline 0800 1111; adults: someone they trust
    and 112). The model's own words are never shown or streamed. `remember`/`correct_memory`
    are refused in such a turn, and the prompt forbids storing health, family trouble, abuse or
    self-harm as knowledge (`docs/privacy.md`). No parent is notified (the child's privacy).
  - a provider safety block (`LlmError('blocked')`, finish reason kept in `llm_calls`) is not a
    glitch to resend: code stores the same kind of fixed reply as Buddy's answer, marks her
    message `failure_code = 'blocked'`, releases the budget reservation, and replaces the
    blocked text with a neutral placeholder in every later prompt — one block can never mute
    Buddy (audit H-31, H-32).
  - The copy needs pedagogical and legal review before real learners (noted for the ADR).
  - Live check: `evals/buddy` has distress cases in all five languages and one "test nerves are
    not a concern" case; whether Vertex blocks such messages is only verifiable live.
- **Her words**: a quote must be whole words from what she wrote since Buddy's last answer —
  several quick messages count together (audit M-49) — and a quote of fewer than four letters
  counts only as a whole message (a bare "Ja"), never as a fragment ("ge" in "geschlagen").
- **Only what she said** (live finding 4: "hab gleich Handballtraining" became "hat sonntags
  Nachmittag Handballtraining"): a memory (`remember`, `correct_memory`) may name a day, time of
  day, month or number only if her quote does (a correction: or the statement known before) —
  `unsupportedSpecifics` in `buddy/text.ts`, from the platform's calendar names (Intl/CLDR in her
  locale, weekdays and times of day also as a word's start: "sonntags"), not a word list. Refused
  with the details named, so the model restates it; the prompt says the same (buddy.17).
- **Dialogue order**: Buddy messages that arrived after her message (a reminder posted while
  she typed) are placed before her unanswered messages, so the model always answers her last.
- **Days** are resolved from the day the model counted from (the attempt's "Now"), not from
  when the message was written; an older message (a resend, a recovery after midnight) is
  named in STATE so the model asks when a day she named has passed (audit M-51).
- **Naming days** (live finding 9: "in 4 Tagen" for Thursday): every date in STATE carries the
  words for it in her language, rendered by code (`say "Donnerstag"` within a week — `dayLabel` —,
  later weekday and date via Intl), and the prompt says to use them, never "in N days".

## Tools

`modules/buddy/registry.ts` (ADR 0005 stage 2) registers every act tool once: its call schema
(`decision.ts`), the surfaces allowed to call it (`turn`, `check`), what it touches, whether it
needs the learner's quote and can be undone, and its handler (`tools.ts`). The model-facing
action schemas and the tool catalogue in the prompt are generated from it; `runAct` checks the
surface again before running (a check can never run a turn-only tool — also unit-tested).

Every part of the app is reachable by asking: `open_area` (library, memory, settings, history,
capture) changes nothing and shows a button in the conversation, like `offer_learning`.
A reply that asks for permission (`asks_permission`, required in the model's answer) may not
remove anything in the same answer (dropping a goal, forgetting, cancelling a step): the code
rejects it and asks for a repair (`askedButActed`). Removing on her clear wish is allowed — it is
visible as a card with undo (`docs/UX-PRINCIPLES.md` §18).

`modules/buddy/tools.ts`. The only way a decision changes anything. Each tool validates against
current rows (inside the decision's transaction), makes a bounded change and returns a card
summary plus undo data. Enforced here, not in the prompt:

- background checks may only `prepare_practice`, `request_material`, `schedule_check`;
- contact can only be reduced or shifted by Buddy (`set_contact`), never enabled or increased;
  quiet hours may only start earlier ("nicht nach 19 Uhr" → 19:00), and the preferred window then
  ends there — a reply may only claim what the tool actually changed (found by the Lena run);
- agreed times may not fall into quiet hours; checks lie between 1 hour and 21 days ahead;
- temporary situations need an end (≤ 60 days); plans lie ≤ 1 year ahead; a known situation
  said again with another end gets that end (`remember` replaces the row, undo restores it),
  and `correct_memory` may move the end (`until`);
- `update_step` either changes the state or moves the step, never both; `prepare_practice`
  never replaces a step her agreed reminder prepared;
- undo is refused when the object changed since (version check) — no blind overwrite of, e.g.,
  an adult's later settings change; undoing `close_goal` opens the steps it cancelled again;
  undoing `forget` never makes a second copy when the same is known again meanwhile.
- `set_level`: the model names the school year the way her school system does (`SchoolYear`:
  de Klasse, fr CP…Tle, es primaria/ESO/bachillerato, it primaria/media/superiore, uk Year, us
  grade — a zod enum per system); code converts it into years of schooling, the German-Klasse
  scale `learners.grade` and every prompt use ("4e" → 8, "2º ESO" → 8, "terza media" → 8,
  Year 8 → 7), and a label the system does not have is rejected. The card shows the stored
  meaning ("Klasse 8", "8e année de scolarité"). Audit M-39; a live eval of the label choice
  for fr/es/it is still to do.
- `set_voice` ("sprich langsamer", "schneller", "wieder normal", "andere Stimme", ADR 0008): the
  model says only the direction (`slower`/`faster`/`normal`, `other` or a named voice of the
  curated four) with her quote; code takes one step within −2…+2 and picks the next voice. Past
  the limit, or a change that changes nothing, is rejected back to the model, which says so.
  Undo (`restore_voice`) only while nothing changed the settings since.
- Thread action cards offer "Rückgängig" only where `undoApplies` holds, like `done` (audit
  M-56); history offers it too, for the same 7 days.

### Lookups (ADR 0005, stage 1)

`modules/buddy/lookups.ts` + `connectors/`. Before answering, a turn or check may read:
`search_material` (passages of her read worksheets, Postgres full text, prefix words; a
homework sheet only by title, never its text — help with homework happens in the help session),
`practice_history` (finished sessions: what sat, what was shaky) and `find_questions`
(questions on a topic with the latest result — never the solutions). Registered once (name,
schema, surfaces, connectors); the model-facing schema and prompt lines are generated from the
registry. Enforced in code:

- at most 2 lookup rounds × 3 lookups, then the final schema offers no lookups;
- results ≤ 6000 characters per round, marked as data; invalid calls report an error and are
  not run;
- every connector query is scoped by the learner id; lookups change nothing;
- the audit (`buddy_decisions.output.lookups`) records which lookups ran, not their results.

Live eval (`evals/buddy/run.ts`, case `de_lookup_sheet`): the answer came from the sheet in every
run (6/6). Act tools move to the same registry in stage 2; external connectors (stage 3) and
the event log (stage 4) are planned.

## Proactivity

`modules/buddy/check.ts`. Wake-ups are jobs (`reason`: `exam_countdown` 5/3/1 days before at the
start of the preferred window, `exam_followup` the day after, `material_ready`,
`session_finished`, `step_due`, `checkin_requested`, `routine`). Gates, cheapest first:

1. one worker per learner (lease on `buddy_settings`);
2. agreed reminders → fixed template (i18n), no model. An agreed reminder never vanishes
   (D-13): with contact off or paused, when quiet hours were moved over it, when a pause lands
   while it waits for a slot, or when the scheduler is hours late, it waits in the app — late
   ones say so ("Ich wollte dich um 17:30 erinnern – sorry, das kommt verspätet. …"). It
   prepares practice only from what she named (the goal's material, or the subject and topics
   `plan_step` stored) and otherwise only reminds; an agreed reminder whose usual time is over
   today is refused so Buddy asks for a time, never silently unscheduled;
3. learner is in the app right now → an unasked look (routine, countdown, a scheduled check) waits
   20 minutes; what follows from the learner's own action (photos read, practice finished) runs now —
   right after the reading or the practice, not on the next scheduler run;
4. nothing to work with → silence, no model call. With contact to the phone off or paused Buddy
   still looks and speaks in the app (ADR 0006); the daily routine look runs while an exam is
   within 14 days;
5. no model configured → fixed fallbacks immediately;
6. the model decides (`CheckDecision`: act or wait, ≤ 3 actions, ≤ 1 message proposal);
7. apply with the context fence; the contact policy decides whether and when a message is sent;
8. provider outage → retry in 10 minutes (bounded), then fallbacks keep time-critical help
   working (prepared practice before a test, "how did it go", and Buddy's own promise to look
   again as an honest in-app line). A check that answers her own action falls back also after
   three stale rounds, so she is never left without an answer.

A background check never replaces practice she asked for in the chat, and the message it posts
carries its decision, so what Buddy did in the background appears in the thread with its cards
and undo. "Heute nicht" on a prepared practice moves it (and an agreed reminder) to tomorrow; it
is not skipped for good.

**Looking back** (`modules/buddy/lookback.ts`, migration `0038_buddy_lookbacks.sql`; gaps #7):
visible progress without pressure. After a finished practice or before a test
(`session_finished`, `exam_countdown`) code may offer the check one fact — a topic that was
shaky in a practice at least 5 days ago (and not since) and where now every question she
practised (at least 2, the latest within 7 days) was right at once; before a test only from its
subject, after a practice that session's topics first. The model may phrase it in
`CheckDecision.look_back` (fact alias `p1`, one sentence) or leave it out; a look back that was
not offered is rejected and repaired. It is a message in the thread only — never an outreach,
never on the lock screen — and is kept in `buddy_lookbacks`: at most one per 7 days, the same
topic not again within 60 days. Only what was reached: no counts, nothing still open, no missed
days (rule 6).

## Delivery

`modules/buddy/policy.ts` (pure) and `delivery.ts`.

- **Messages are the core of the app and are not limited** (ADR 0006, product owner
  2026-09-27): nothing counts Buddy's messages, in the app or to the phone — no daily or weekly
  cap, no "wait until she answered". Buddy's own message needs relevance ≥ 0.6 and a topic not
  raised in the last 72 h (topic keys are stored with real ids; in the app too) — that is all
  that drops one.
- **The phone is the learner's choice**: contact outside the app is opt-in (the setting and the
  OS permission); quiet hours at night, a pause, the preferred window and days without messages
  are her settings and apply to the phone. What cannot go to the phone (contact off, paused, no
  allowed time before it expires) waits in the app (`in_app`). Agreed reminders go out at the
  agreed minute (quiet hours and pause apply, avoided weekdays do not). Buddy's answer to her
  own action (origin `learner`: her photos were read, her practice is finished) is pushed now
  when contact is on and it is not night.
- The whole policy runs again at send time (tightened days, window, a pause, contact off): then
  the message waits in the app instead; a message about something already done is cancelled. A message is linked to its goal
  and step (`step: "new"` = the practice prepared in the same decision), so "practice is ready"
  is dropped once that practice was done. Pausing or switching off cancels everything Buddy
  planned on its own — nothing is sent in bulk afterwards; agreed reminders stay and wait in the
  app. Planned messages are listed on the home under what comes next. Stopping contact hides
  the opt-in card for 14 days.
- Every status write of a claimed row is conditioned on the claim (status `sending` and the
  lease it set): a slow run can never send or overwrite a row another run settled.
- A push carries the message's expiry (`expiration`): a phone that was off does not get a stale
  message later — the thread has it anyway.
- Evidence chain (`buddy_outreach.status`): `scheduled → sending → accepted` (Expo ticket) →
  `provider_accepted | provider_rejected` (receipt, 15 min–24 h). `send_uncertain` (no answer, or
  a crash while sending) is never resent. `in_app` when the learner is in the app, has no device
  or push is disabled; a message due now while she is in the app (used it in the last 3 min) is
  `in_app` from the start and in the thread in the same transaction as the change it is about
  (the card of the practice it prepared), not a delivery run later (`planOutreach`). Only the app can record `opened`. The text is always also in the thread.
- `DeviceNotRegistered` (ticket or receipt) deactivates the token.
- Devices (`modules/devices/`, migration `0018_push_device_binding.sql`, D-6): a token is
  registered with a random install id, and an install holds at most one active token (partial
  unique index). Registering deactivates the install's other tokens; a signed-in person's
  `POST /push-devices/claim` (on every start and sign-in) deactivates tokens on that install
  that belong to other learners; sign-out sends `POST /push-devices/release` (no session
  needed, bounded to 4 s, kept on the device and retried until the server has it). With
  contact on and the permission already given, each signed-in start registers the current
  token again, so the phone in use is the newest token; settings says when her messages go to
  another device. Every push targets the Android channel `buddy` the app creates.
- `opened` (app, `lib/push.ts`): every tap — also the one that cold-starts the app, read with
  `getLastNotificationResponse` — is kept on the device (`lib/pushQueue.ts`, 7 days) and sent
  once signed in, retried on start and when back online; only a clear 4xx drops it.
  Not yet verified on a device (audit §17, `repro-19`).
- **Buttons on a notification** (gaps #16; migration `0039_notification_actions.sql`): the
  server sets `categoryId` per push — `lb_practice` ("Jetzt üben", "Heute nicht", "Seltener
  schreiben") when the message is about practice that is prepared, `lb_message` ("Heute nicht",
  "Seltener schreiben") otherwise; the app registers the buttons (`lib/pushActions.ts`). A press
  is kept on the device like a tap and sent to `POST /buddy/outreach/:id/act`; code decides what
  it does. "Jetzt üben" starts that prepared practice and the app opens it (not just the home).
  "Heute nicht" moves its practice (and an agreed reminder) to tomorrow and cancels Buddy's own
  messages planned for the rest of her day. "Seltener schreiben" sets `phone_only_important`:
  Buddy's own initiatives then reach the phone only at relevance ≥ 0.85 (the rest waits in the
  app, `only_important`); agreed reminders and answers to her own actions are unaffected. It only
  reduces contact, so it needs no PIN; Buddy says in the thread what changed, and settings shows
  the way back — which, being a loosening, needs the parents under 16. The two lock-screen
  buttons do not open the app: they report no `opened`; when the app is not running, a
  background task (`lib/pushTask.ts`, expo-task-manager, defined from the entry `index.ts`)
  sends them. Not yet verified on a device.
- **Lock-screen texts are built by code** (S-6): title "Buddy" and a fixed sentence per kind
  (`i18n push.*`: "Deine verabredete Erinnerung ist da."), never a title, a count, a score or
  anything the model wrote. Buddy's words are in the thread. Texts whose words depend on the day
  ("Morgen ist …") are stored as a template (`buddy_outreach.body_template`) and rendered when
  they reach the thread; `send_uncertain` rows swept after a crash are mirrored to the thread too.

## Background work

`modules/scheduler/`. One durable queue (`jobs`) for extraction, Buddy checks, turn recovery,
photo purge and account deletion. Claimed with `FOR UPDATE SKIP LOCKED` and a lease token;
finishing and retrying are compare-and-set on the token, so a worker whose lease expired cannot
overwrite its successor. A Buddy check heartbeats its leases (the learner's check lease and
its claimed jobs) before every model call, so a check that runs longer than one lease is never
taken over while alive; it applies a decision (and its fallbacks) only while it still holds the
learner's lease — a check is never applied twice (repro-17). At most `max_attempts` (default 3), then parked as `failed` — except the
erasure jobs (`purge_photos`, `purge_content`, `delete_account`, `PERSISTENT_KINDS` in
`scheduler/jobs.ts`): a privacy promise does not expire after three tries, so they are queued
again with backoff (1, 2, 4 … minutes, at most 6 h) with `last_error` recorded, also after a lost
lease. A cancelled job can be planned again with the same key (an exam moved away and back).

**Erasure** (`modules/materials/purge.ts`, `identity/privacy.ts`, migration `0016_erasure.sql`;
D-7, D-9). The account deletion is a resumable job whose stage lives in its payload: `start`
(marks `accounts.deletion_started_at`; from here it cannot be cancelled — `DELETE
/account/deletion` answers 409 `deletion_running` — and the account takes no more writes) →
`photos` (every live photo path goes to the `storage_deletions` queue) → `content` (the learner's
tables, children first, 2 000 rows per statement, 20 s per run, resuming at the saved table) →
`auth` (the auth user, which cascades the account, profile and settings). The account does not
wait for Storage: queued paths are removed in requests of ≤ 1 000 (the Storage limit, also
enforced by the test fake) and retried with backoff until gone. Maintenance after the job loop
works that queue, re-plans a purge for photos no job will delete any more (failed or read more
than 7 days ago, deleted), and erases removed/replaced memories after their 7-day undo window
(below). `GET /health` fails (503, `erasure`) when an account is more than a day past its
deletion date or a queued path is more than a day old. `/me` says `deletion_running` once the
hold is over. Every foreign-key column is indexed (`0017_fk_indexes.sql`), so the cascades follow
the learner's own rows, not the table size.

**No job kind ends silently** (`scheduler/terminal.ts`, audit S-5). Each kind has a terminal
effect, enforced by the type of the registry, applied once per parked job by the tick: a parked
Buddy check comes back once as a model-free fallback (the countdown before a test still
prepares practice; an agreed reminder is still sent by its template); a parked turn recovery
marks her message failed (`internal`); a parked extraction is reported to the operator (parked
counts and the last error per kind in `GET /health`); erasure kinds are never parked (above).

`POST /internal/tick` runs everything due within a 45 s budget: recovery → reading photos →
Buddy per learner (one learner's failure does not stop the others) → delivery → receipts →
maintenance. pg_cron calls it every minute via pg_net (`0002_scheduler.sql`, URL and secret from
Supabase Vault). The Node server can run it in-process for development. A heartbeat makes a dead
scheduler visible: `GET /health` is 503 unless the last run is recent **and** finished without
errors **and** no due work has waited over 10 minutes (`scheduler/health.ts`: state
`ok | stale | failing`, last error, parked jobs per kind). The app shows "scheduler: stale" also
when there never was a heartbeat but her own work is waiting (a misconfigured cron is not
"unknown"), and `system.model` is false when no model is configured or today's allowance for
conversations is used up.

### Events (ADR 0005 stage 4)

`modules/buddy/events.ts`, table `buddy_events` (`0007_events.sql`). Something that just
happened — `material_ready`, `homework_ready`, `session_finished` — is written once per (type,
row), in the same transaction as the change, with the app clock. Its subscribers decide what
follows: `material_ready` and `session_finished` wake Buddy for a check (the job carries the
`event_id`, the check marks the event handled — `handled_at` is an audit field for the export
and for reading the log; nothing re-reads it to re-drive an event: a wake-up job that dies is
handled by its job's terminal state, `scheduler/terminal.ts`); `homework_ready` is only recorded
(help starts in the app). Schedules — exam countdowns, agreed reminders, routine, `schedule_check` — stay jobs.
An event never bypasses the contact rules.

## Model calls

`llm/`. One seam (`LlmGateway`): structured JSON for a zod-derived schema, validated again with
zod. `VertexGateway` (Gemini 3.6 Flash via the EU multi-region `eu`; only EU locations start) with explicit output-token cap, thinking budget and
timeout; `DisabledGateway` when no model is configured (Buddy says so). Every call reserves
against a per-learner daily limit first (atomic upsert) and is recorded in `llm_calls` with
tokens, cost, latency and outcome — never with prompt or answer text; a safety block keeps the
provider's finish reason (`blocked:SAFETY`). A call that the provider did not run for her — provider
down, request refused, safety block — gives its reservation back; a timeout or unusable output
keeps it (the provider may have done and billed the work).

**One error classification at every external seam** (`lib/outcome.ts`, audit S-7): `ok`,
`refused` (a definitive no: a 4xx other than 429, a safety block, unusable output — never
retried automatically), `transient` (5xx, 429, network — retry later is fine), `unknown` (no
answer: a model call may be retried because it changes nothing; a push is never repeated).
`LlmError.outcome`, the push errors, `StorageError.outcome` and the auth verifier
(`authOutcomeOf`) carry it; a provider 4xx is `refused`, no longer retried three times as an
outage. Auth: `refused` makes a token invalid (401), everything else is 503; a refused password
change is `invalid_input`, not "try again later". Storage: an absent object is `null`, never an
error, and an error is never "absent".

Models per task: each call names its purpose; `VERTEX_ROUTES` (JSON, zod-checked) maps a purpose
to a model, else a measured default (`DEFAULT_ROUTES` in `llm/vertex.ts`: pronunciation on 3.1
Flash-Lite — as strict as 3.6 Flash in `evals/speak`, half the cost), else the tier's model. A model may carry its location
(`eu/gemini-3.1-flash-lite`): the Gemini 3.x models are served in the EU only through the EU
multi-region endpoint `eu`, not in `europe-west4` (probed 2026-09-26). A route changes only after
the task's eval passes on it (`evals/buddy`, `evals/tutor`, `evals/speak`, `evals/speed`).
`evals/lena` plays whole journeys of a 12-year-old against the live model (child-like typing,
photographed sheets, spoken answers, begging for the solution) and writes a transcript to read;
report in `reports/Lena-Durchlauf.md`. `evals/buddy`, `evals/tutor`, `evals/voice`, `evals/lena`
and `evals/speed` exit 1 when a case, a check or a time budget fails; `evals/speak`,
`evals/stream`, `evals/modes/show` and `evals/lena/day` only print for a person to read. A spoken or typed choice counts as the option it names —
exactly, by its letter, or said first and explained (`choiceNamed`).

### Speed

Waiting kills practice. Budgets (end to end, measured in process by `apps/api/evals/speed/run.ts`
against the live model; a deployed API adds network and possibly a cold start):
an answer checked within **1.5 s**, Buddy's reply within **3 s**. Rules that follow:

- What code can decide, code decides at once, without a model call: a right answer by the rules
  (multiple choice, numbers, exact matches), and in a test also a wrong one — including a plain
  number or fraction with another value as a short answer (`differentNumber`; not in homework,
  where "12" may be a right step). A test needs only the judgement. Fast and free.
- Thinking where it pays: preparing (reading a worksheet, writing items, keys and explanations —
  once, mostly in the background) gets 2048; on 3.6 Flash that cost about the same time and money
  and gave more careful content. The tutor gets none: on 3.6 Flash more thinking was slower and not
  better (0: 26/27 at 1.1 s; 1024: 16/18 at 1.4–1.7 s; 4096: 17/18 at 2.5 s, evals/tutor).
- A model call is only as slow as it must be: thinking budget only where it measurably helps.
  Buddy's turns keep 512 (without: 18/22 instead of 20/22 eval cases, among them solving
  homework in chat); the pronunciation judgement uses none (heard_ipa is its close listening;
  twice as fast, no worse).
- Anything that adds a model call to a step Lena waits on needs a measurement first.
- **Buddy's replies stream** (`POST /buddy/messages` with `Accept: text/event-stream`;
  `ReplyStreamEvent`, `modules/buddy/stream.ts`): the model writes its answer in the order
  lookups → actions → reply (`TurnDecisionForModel`), so when the reply starts code already knows
  what the answer does. Only an answer that changes nothing — no lookups, only actions that touch
  nothing (an offer button), no safeguarding `concern`, and no longer than validation allows
  (700 characters) — is shown while it is written; everything else appears once it is
  validated and applied, as before (rules 1 and 5: nothing is claimed before it is true). A
  rejected or repaired answer starts a new `round` whose text replaces the last. **Shown is not
  spoken**: the app reads a reply aloud only once it is stored — after the provider's final
  safety verdict (the finish reason arrives with the last chunk) and zod validation — so a child
  never hears words that are withdrawn (audit M-52, repro-28); `expo/fetch` streams on the
  phone. Measured (live, 3.6 Flash,
  `evals/stream/run.ts`, medians): first words after 1.35–1.6 s instead of the whole answer after
  1.76–1.86 s — about 0.3–0.5 s, more for long explanations. Most of the wait is before the model
  writes its first character; the order change kept 22/22 in `evals/buddy`. On a deployed API
  the host must pass streamed responses through (needs live verification).
- The tutor's answers are not streamed: code checks the whole reply first (the solution-leak
  guard, verdict invariants), and streaming would save only ~0.3 s there (1.1 s → 1.4 s).

Measured baseline (median of 3 rounds, 2026-09-26): rule-decided answers 10–25 ms; answers the
model judges 0.7–1.6 s; Buddy's replies 1.7–3.9 s (one outlier 10 s); speech to text 1.1 s;
pronunciation 6 s (before dropping its thinking budget, 3–4 s after); preparing a practice
2.5–6 s (Buddy says so meanwhile). Model cost per step: $0.0003–0.0005 for a judged answer,
$0.001–0.002 for a reply, $0.0015–0.004 for preparing a practice.

## Limits

| What                            | Limit                                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------- |
| Model calls per learner and day | turn 80, check 8, tutor 300, extraction 12, new explanations 60 (`config.ts`)                      |
| Turn                            | ≤ 4 rounds × ≤ 3 calls (lookups) = ≤ 12 calls, 30 s timeout each, 2048 output tokens, thinking 512 |
| Check                           | ≤ 3 rounds (repair/stale), 40 s timeout, 2048 output tokens, thinking 768                          |
| Tutor                           | 20 s timeout, 1024 output tokens, no thinking; rules first                                         |
| Extraction                      | 120 s timeout, 12 000 output tokens, thinking 2048, ≤ 3 runs per material, ≤ 20 photos             |
| Jobs                            | 3 attempts (erasure jobs: unlimited, backoff ≤ 6 h), leases 120–180 s; tick budget 45 s            |
| Turn stall                      | taken over after 3 minutes                                                                         |
| Contact                         | none: messages are not counted (ADR 0006); the same topic is not raised twice within 72 h          |
| Memory                          | 60 active items; temporary ≤ 60 days                                                               |
| PIN (all PIN routes, shared)    | 5 wrong → locked 15 min, every time (no escalation); the right PIN resets (423 + `Retry-After`)    |
| Forgotten PIN (fresh sign-in)   | 5 per hour, never while the PIN is locked                                                          |
| Requests per account            | abuse protection only: practice answers 600/h, messages to Buddy 120/h (429 + `Retry-After`)       |
| Natural voice (ADR 0008)        | cost protection only: 1 000 newly synthesised sentences per account and hour; cached ones always   |

Budgets are rows in `attempt_counters` (migration 0014; `lock_level` dropped in 0033) changed by
one atomic upsert with the app clock (`lib/limits.ts` `consume`); answers and messages are counted
by one middleware in front of the routes (`http/limits.ts`). A request budget exists only against
scripts and must never limit normal use — 10 answers or 2 messages a minute for a whole hour;
the owner's rule is to add no constraint that is not strictly needed (ADR 0006). Password-reset e-mails are Supabase Auth's own rate limit.

Pricing used for cost records: `apps/api/src/llm/pricing.ts` (Vertex list prices read 2026-09-25;
gemini-3.6-flash via `eu` $0.825 input / $4.125 output per 1M tokens until 2026-12-31, twice that
from 2027; output includes thinking). Note: Gemini 3.x bills the response schema as input tokens
(Buddy's turn schema ≈ 9 400 → 8 500 tokens after flattening day/duration specs into one object
each and moving repeated descriptions into the prompt; `$ref`/`$defs` do not help, Gemini expands
them before billing — measured 2026-09-26), 2.5 did not. Tokens scale with schema text; the
largest tools are set_contact (~1 300), remember (~1 100), plan_step (~900). Next levers: explicit
context caching of the fixed part, or offering only the tools a turn can use.

## Material

**Photo check on the phone** (`apps/mobile/lib/photo/quality.ts`, `check.ts`; the old app's most
common failure was an unreadable photo): right after a photo is taken or picked, a small copy is
decoded on the device (jpeg-js, the same on phone and web) and measured — too dark (mean
brightness), washed out (ink hardly darker than the paper), blurry (the strongest edges relative to
that contrast; soft edges also make ink paler, so blur is checked first), too small (shorter side
under 700 px; an 800 px messenger copy or screenshot of a sheet reads well, user feedback #16) or tilted (`lib/photo/tilt.ts`: the ink pixels are projected at trial angles and the
sharpest profile gives the angle of the text lines; 10° or more, or 8° difference between the upper
and lower half — a phone held at a slant to the side). A phone tipped forward (lines level but
smaller towards the top) is not judged: the line spacing was not reliable with a few lines of text.
Only thin strokes count as ink (paper within 4 px): the inside of a dark table around the sheet
does not, and points are thinned by a position hash, not every n-th in raster order — a dark desk
border used to make straight sheets "schief" (audit M-26, dark-desk variants in the unit test).
Tilt is only advised when the photo is otherwise fine. Nothing leaves the device for this. A photo with a problem is marked "Schwer lesbar"
and a calm card says what is wrong and how to do better, with "Neu fotografieren" (replaces it and
opens the camera) and "Trotzdem behalten". Calibrated on sixteen rendered sample photos (in focus,
noisy, shadow, little text, three kinds of blur, dark, washed out, small, turned 5°/15°/−22°, slanted
to the side and forward; unit-tested) — real phone photos may need the limits adjusted. Live guidance while aiming the camera would need our own camera
screen and is not built. What the phone cannot see (a page cut off at the edge, a finger over the
text) the model reports per page (below).

`modules/materials/`. `create` reserves the material and signed upload URLs (idempotent per
client id; a request id whose material was given up or deleted starts a new material, so a draft
resent the next day never loops on "gibt es nicht mehr" — audit H-13) → the app uploads directly
→ `submit` verifies the photos arrived and queues the reading (and starts it right away via
`waitUntil`) → the job reads them with the model into questions (validated item by item:
`itemsOneByOne` drops a broken item, never the list; more than 8 accepted answers are clipped
to the 8 the prompts name, a figure over a bound is dropped and the question kept — audit H-14,
H-15) → the capture step Buddy asked for is done with evidence (a study photo sent without a
link — the composer camera, "Mein Stoff" — while exactly one capture step is open is that
photo: it joins its goal, audit H-16) → Buddy is woken. Status is what the database says: `awaiting_upload → queued → processing →
ready | failed(reason)`. Photos are deleted 7 days after reading (also when unreadable), at once
when they are not learning material (a letter, a recipe: they cannot be read again anyway), and
immediately when the learner deletes the material — and once more 2 hours later, when no signed
upload URL can deliver a late photo any more (a submit for a deleted material also purges at once).
A material becomes failed in one place (`markMaterialFailed`), from the job and from the tick's
recovery alike: status, the purge and a context bump in one transaction.

**Reading stages** (gap 5, migration 0035): the run holding the reading job's lease reports where
it is — `read_stage` `opening` (photos being loaded) then `reading` (the model reads them), each
stamped with the app clock; a requeued reading clears it. The home's `material_processing` card
carries only real stages (`stage`: `sending` photos on their way, `waiting` for the reader,
`reading`, and `building` — read, and the Buddy check it woke is due or running, with `found`,
the tasks found, a result and never a count of work to do), the number of photos (`pages`) and
the purpose (homework has no practice to build). All pages are read in one model call, so there
is no page-by-page progress and none is shown; nothing moves by itself (CLAUDE.md rule 5). The app
(`components/buddy/SlimBar.tsx` `ReadingBar`, `lib/buddy/readingStages.ts`) shows it as one slim
bar on top of the home (owner request: the card was "ein Riesenbrett"; ~60 pt): the photo, the
stage in a few words and the steps as dots inline, the step being worked on named; a tap opens
the details (the line "Du kannst die App solange schließen", every step by name). Prepared
practice gets the same bar (`ReadyBar`: "Übung bereit", what and how long in one line, a compact
"Jetzt üben"; the test it is for, the focus and "Heute nicht" on a tap). Screen readers hear the
whole content as the bar's label; closing and swiping it away stay as before;
`reading-stages.int.test.ts`.
"Mein Stoff" follows a sheet being read the same way (live finding 3: the list still said "Ohne
Titel · wird gelesen" once the sheet was read): it is fetched every 2.5 s and on every visit while
a row is `queued`/`processing`, a fresher view of the sheet from its own screen is written into the
list at once, and a home poll that no longer reports a reading refreshes a list that still shows
one (`lib/api/libraryCache.ts`).

**Quick answers belong to their moment** (live finding 8): a Buddy message's options
("Foto machen / Später fotografieren") are sent with the thread only while she has not acted since
— a material created or a practice started after the message removes them (`home.ts` threadOf).

**Outages are not failures.** The Storage gateway tells an absent photo (`null`) from a provider
failure (`StorageError`): a failed download retries the run like a retryable model error (backoff
1, 2, 4 min); a failed existence check on submit answers 503 `storage_unavailable`, never
"photos missing". Runs refused for the daily budget or lost to an outage are marked `uncounted`
and do not use up the 3 runs. After the photo purge, retry answers 409 `photos_deleted`, and
`MaterialView.photos_deleted` hides "Nochmal lesen" (the card says to photograph it again). Each
photo in the reading request is preceded by a label ("Photo 2 of 3:"), so page numbers in the
report name real photos.

**Cut off at the token limit** (live finding 2: a 2-task homework sheet ran on for 40 s, the
reading line vanished and nothing was said). An answer stopped at the output limit
(`LlmError.truncated`, finish reason `MAX_TOKENS`) is a transient failure, not a refusal: the run
reads again at once with `LEAN_RULES` added (brief transcription, at most 10 questions, short
hints, "never repeat"); cut off again, the job retries with backoff and starts lean (its
`last_error` is `truncated`); after the last run the sheet fails as `model_error`, uncounted, so
"Nochmal lesen" stays offered. Homework asks for less in the first place (schema without
`worked_solution`, which she never sees there; at most 12 tasks; an 8 000-token limit instead of
12 000, so a run-on stops sooner). A reading that failed in the last 30 minutes is the home's
card above everything else (a result, prepared practice, an open session) — the "reading" line
never just disappears (rule 5); after that it falls back behind them for the rest of the day.

**PDFs** (`modules/materials/pdf.ts`, migration `0042_material_pdf.sql`; gaps.md #6): a worksheet
that came as a PDF (WhatsApp, IServ, Schul-Cloud, Dateien) is a file of the material next to
photos (`photo_mimes` takes `application/pdf`; stored as `…/<position>.pdf` in the same private
bucket). The model reads PDFs directly (Gemini accepts `application/pdf` inline), so nothing is
rendered to images, on the server or on the phone. Code only counts the pages (`pdf-lib`, on
submit): a photo is one page, a PDF as many as it has, and the material's `photo_count` becomes
that page total — **20 pages at most**, photos and PDF pages together, like 20 photos. The label
before a PDF says which page numbers its pages have ("PDF with pages 1–3 of 4 (one page report per
PDF page):"), so the page report names real pages; a foreign page is deleted at once only when its
whole file is foreign (a photo; a PDF with one foreign page among others keeps its retention).
Refused at submit with 422 and a reason — the material is set aside and its files purged at once,
the app keeps the files for another choice: `too_many_pages` (with `pages`, `max`),
`file_unreadable` (not a PDF that opens; `position`), `file_too_large` (all PDFs of one material
over 15 MB, the inline size the model call carries; `max_mb`). A Storage outage while counting is
503 `storage_unavailable` as for photos. PDFs are not photo-checked on the phone (the check is for
light, blur and tilt of a camera photo). Not verified live: how the Vertex model reads a real
scanned school PDF (the tests script the model).

**Files and sharing in the app** (`app/capture.tsx`, `lib/capture/files.ts`, `incoming.ts`,
`drop.web.ts`, `components/capture/ShareIntake.tsx`). One more quiet choice next to the camera:
"Aus Fotos" and "Aus Dateien" share one row under "Foto machen" (fits 360×740). "Aus Dateien" is
`expo-document-picker` for PDFs and images; images go through the same preparation and photo check
as camera photos, a PDF gets its own copy (`fileCopy.ts`: two shares called "Arbeitsblatt.pdf" stay
two files) and shows as a page tile with its name; PDFs together over 15 MB, and other file types,
are said in a toast, not dropped silently. In the browser the same button is a file input, and
files dragged onto the page show a drop hint and land in the capture. A refusal from submit
(`too_many_pages`, …) keeps the files on the screen and the send button waits until they change
(the same files cannot pass); the draft remembers which entry is a PDF, and a sent set with a PDF
has no page thumbnail (page numbers are not file positions there).

_Teilen an LearnBuddy_ (`expo-share-intent` 5.1 for SDK 54, its config plugin in `app.json`):
Android gets intent filters for `SEND` and `SEND_MULTIPLE` of `image/*` and `application/pdf`; iOS
a share extension (target `LearnBuddyShare`, shown as "LearnBuddy" — `plugins/withShareDisplayName.js`;
activation rule: images and PDFs; app group `group.com.learnbuddy.app`). `ShareIntake` (root
layout) hands the shared files to the capture screen (`incoming.ts`: the open capture takes them at
once, else it is opened with `shared=1`; files wait until a draft left from before is decided).
Signed out: a toast, nothing kept. Text or links shared: a toast. The iOS extension opens
`learnbuddy://dataUrl=learnbuddyShareKey`, which `app/+native-intent.tsx` keeps from the router.
The plugin needs pnpm's patch of `xcode@3.0.1` (`patches/`, as the package documents) or iOS
prebuild fails. Web and Expo Go: the native module is absent and nothing happens.

**Not verified — must be checked on devices (EAS build), in this order:** (1) `expo prebuild` ran
here for both platforms (the manifest has both filters, the Xcode project the `LearnBuddyShare`
target with display name "LearnBuddy"), but nothing native was compiled or run. (2) The app group
`group.com.learnbuddy.app` and the extension bundle id `com.learnbuddy.app.share-extension` must
exist for the Apple team (EAS credentials; one extension target only — see the package's FAQ). (3)
Android: share one photo, several photos, a PDF from WhatsApp, Files and Chrome — cold (app closed)
and warm; the capture opens with the files; a `content://` URI from a messenger is copied and
uploaded. (4) iOS: the same from Photos, Files, WhatsApp and Safari's PDF view; the share sheet
shows "LearnBuddy"; after sharing the app opens on the capture, not on "not found". (5) Signed out,
and during a running send: files are not lost silently. (6) "Aus Dateien" on both platforms: a PDF
from iCloud/Google Drive (download on pick), a HEIC photo. (7) A real scanned school PDF read by
the Vertex model: pages and page report right.

**Deleting** ("Blatt löschen", D-7) takes the sheet and its merged pages out of the library,
Buddy's picture, running sessions (open questions closed like "Frage passt nicht"), prepared
practice (a step left without questions goes back to planned) and its homework help session
(abandoned) in one transaction, and plans `purge_content`: the transcript, title and page report
are erased and the questions deleted with their answers, practice turns and memory state; sessions,
steps and events keep only ids and counts. "Frage löschen" erases that question the same way. A
reading still running for a deleted sheet ends without result: the final transaction re-checks
`archived_at` under the row lock (no questions, no ready, no wake-up).

**What counts as learning material** is said in the prompt: school or study content; everyday
papers (a recipe, a letter, a receipt, an advert) are not, unless printed as a school task (live:
the recipe photo was taken as material in 3 of 3 runs with the page prompt, 1 of 3 before;
rejected 5 of 5 after).

**Pages that could not be read** (migration `0009_material_pages.sql`). Several photos are read in
one model call; the model also reports each photo (`pages`: read `all` / `part` / `none`, with a
problem: cut off, blurry, dark, glare, covered, not material). A bad page no longer costs the sheet:
the readable pages become questions, and "not readable" with questions and a page that was read is
treated as ready (the model said so at times for one cut-off page; the prompt says `readable` is
false only when nothing can be read, and text that stops mid-sentence at the edge is cut off and is
never completed). A broken page report is dropped (`.catch([])`) without costing the questions.
Code keeps only real photo positions, each once, and stores them as `materials.page_problems`.
Buddy then says it at the end of the conversation (`BuddyHome.notice`, not a card on top: nothing on
home moves; the help session of a homework is ready meanwhile), while the sheet is
still at hand, for 24 hours, with the photo of that page while it is on the phone: "Seite 2: ein Stück ist abgeschnitten", the rest is ready, with
"Nochmal fotografieren" (capture opens with `completes` and the page numbers; the new material keeps
the old one's goal and purpose and ends the notice in the same transaction) and "Passt so"
(`POST /materials/:id/pages-ok`, idempotent). A photo of something else among the pages only offers
"Passt so". Buddy's context names the missing pages. Measured live (Lena eval `seite-kaputt`,
`seite-abgeschnitten`, `mehrere-seiten`): a blurred middle page and a page cut off at the bottom
are reported in 6 of 6 runs with the final prompt (the one before missed a cut once and completed
the cut-off sentence, hence the last rule), no false report on three good pages, no question about
what was not on the photo. Before, the blurred page was dropped without a word, and the cut-off page
failed the whole sheet in 4 of 14 runs.

**Pages added later** (migration `0011_material_parts.sql`). "Nochmal fotografieren" and "Seite
hinzufügen" (on the sheet's question list) send the photos as a material of their own with
`completes`, so upload, reading, retries and failures work exactly as for any photo. Once read, its
questions join the sheet (`merged_into`): same material, same subject; for homework the tasks are
appended to the sheet's help session while it is open (else a new help session). The part is hidden
from lists and Buddy's context (only its own missing pages still show). Its reading is its own
event (`material_ready` keyed on the part, the check looks at the sheet), so added pages wake
Buddy like the first ones did. A part that fails keeps the sheet's title and subject. If the sheet
was deleted meanwhile, the pages stay a sheet of their own; deleting a sheet also deletes the
pages merged into it. The page notice lasts 24 hours from the reading (`ready_at`), in the home
and in Buddy's context alike. A second school subject on one sheet
(`other_subject` with the topics of its questions) files those questions under that subject.
Pages keep the order they were taken in; there is no reordering — the notice about a missing page
shows that page's photo while it is on the phone (kept a day, below), so the number is never
ambiguous.

**Capture never loses photos by starting another one** (audit N-6): a fresh capture with photos
left from before first offers "Weiter" / "Verwerfen" instead of silently replacing them; a draft
being sent is never deleted, and a finished send only ends its own draft. A reservation for a photo
set she then changed is deleted if it was never submitted (no "unvollständig" leftover). On
Android the camera result survives the system killing the app: capture notes what the photo is
for before the camera opens, and the next start recovers it (`getPendingResultAsync`,
`lib/capture/pendingCamera.ts`; needs a device run). The failed-reading card names the sheet and
"Neues Foto" keeps its purpose (homework stays homework) and, for a page, the sheet it belongs to;
a sheet being read now comes before an older failure on the home.

**Photos survive the app being closed** (`apps/mobile/lib/capture/draft.ts`). Every photo is
copied where the system does not clean up (documents; data URLs in a browser) and the capture screen
keeps a draft (photos, what the check found, what they are for, and — once sending began — the
request id). Closed, killed or updated before the photos were sent, Buddy says "Deine Fotos sind
noch nicht gesendet" at the end of the conversation with "Weiter" (the same material: the API answers the request id with it, so
nothing is sent twice) or "Verwerfen" (undo until she leaves home; then the files are deleted). A
draft older than 7 days is deleted. Sent photos stay a day on the phone for the page notice.
Uploads on a phone use a native background upload session (`lib/capture/put.ts`, iOS background
URL session; Android always), so switching apps does not stop them; a browser uses a plain PUT.
Not verified on a real device yet (only in the browser walkthrough).

**Handwriting, answers written in, rotation** (live Lena eval): a handwritten notebook page on
lined paper (handwriting fonts), a printed sheet with the learner's own answers written in (one
wrong: the model uses the right solution and does not quiz her own answers — prompt rule), maths
and biology on one sheet (filed under both subjects) and a photo turned by 90° are read 3 of 3.
Rendered handwriting is tidier than a child's: real photos are still needed.

The learner sees the questions of one material (`GET /materials/:id/items`, screen
`app/material/[id].tsx`, in the order they were stored — `items.seq`, migration
`0006_item_flags.sql`): prompt, kind, topic, figure, choices and the latest result from her most
recent closed attempt in any session (`first_try`, `with_help`, `not_known`, `never_asked`) —
never the answer, accepted answers or the correct choice. She can delete a bad question
(`DELETE /materials/:materialId/items/:itemId`: archives it, idempotent, confirm sheet; practice
selection already skips archived items) and rename the material (`PATCH /materials/:id`,
1–120 characters, trimmed). Both bump the context version; another learner's ids are 404.

## Practice

`modules/practice/`. A session is a fixed set of questions chosen up front (due → new → rest,
focus topics). Answers are checked by rules where exactness is decidable (multiple choice,
written numbers, exact matches, and near misses on written answers — missing
accents, a missing first word such as the article, a slip within a length-scaled edit distance: a
fixed kind reply at once, a slip shows the spelling and stays open so she types it herself; never in
homework). See **Grading** below for what "decidable" means. Answers the model judges right that the rules did not know are added to the item's
accepted answers, so the rules know them next time; otherwise the tutor model judges with a
structured decision, and the server enforces invariants (a non-attempt is never graded, a
revealed answer never counts as right, a rule-checked wrong answer stays wrong). Without a model,
nothing is graded ("kann ich gerade nicht prüfen"). Each question feeds spaced repetition (FSRS,
no short-term steps) once per session: first try → Good, with help → Hard, revealed → Again.
Finishing records evidence on Buddy's step (only if something was answered) and wakes Buddy.

**Session lifecycle** (`practice/service.ts`, `practice/lifecycle.ts`, migration
`0024_session_lifecycle.sql`; audit I-3, I-4; decision D-5). Nothing answered is lost and
nothing stays open forever:

- _Finished on the server._ The transaction that closes the last open question (answer, hint
  fallback, reveal, "Frage passt nicht", a recording) finishes the session and gives Buddy's
  step its evidence (`finishIfComplete`); a lost `/finish` call changes nothing, and a late one
  is a no-op. Every writer locks the session row first, so an answer to a session that ended
  meanwhile is refused (409) behind the same lock. Buddy's follow-up check is queued by the
  `session_finished` event and runs on the next scheduler tick.
- _"Beenden"._ In a test it hands the test in (the review shows questions she never got to as
  "nicht bearbeitet", with their solution). Everywhere else it is a pause: the app goes back to
  Buddy without finishing; `POST …/finish` on homework help with open tasks only touches its
  last activity.
- _Resuming_ is keyed on `last_activity_at`: a session used in the last 12 h is the first now
  card; an older open one (homework help up to 14 days, any other session up to 3 days) comes
  after Buddy's prepared practice. Every open session is loaded into Buddy's state, however old.
  A homework sheet leads to its help session (`POST /practice/sessions {material_id}` returns
  it; after an abandoned one, a new session with the tasks not solved yet; `MaterialView.
session_status`; "Weiter mit der Hausaufgabe" in "Mein Stoff").
- _Idle sessions_ are closed by the scheduler (`closeIdleSessions`): help after 14 days, other
  sessions after 3 days without activity are `abandoned` and their step goes back to `prepared`
  (Buddy can offer it again); a session with nothing open left is finished instead.
- _Summary_ (`practice/summary.ts`): one computation for the result screen and the home card —
  a topic "sits" only when every closed question of it was right at once, otherwise it is shaky;
  never both. The app says it in words (`apps/mobile/lib/practice/summaryLine.ts`): homework
  "Du hast N Aufgaben selbst gelöst", otherwise "Du hast N Fragen beantwortet" and only a whole
  round right at once is named — never a hit rate, never a zero (user feedback #1, #3).
- _"Lösung zeigen"_ only after a try or a hint (`reveal_available`, 409 `try_first`; a spoken
  sentence can always be skipped), user feedback #8. A wrong choice that leaves a single untried
  option closes the question with the worked solution — shown, never right (feedback #9).

**Grading** (`evaluate.ts` + `packages/shared-math`; audit C-1–C-7, H-1–H-6; decisions D-1–D-3;
migration `0012_item_answer_rules.sql`). A rule "correct" is final — no model sees the answer —
so the rules only say it when it is certain; everything else goes to the tutor (`unknown`).

- _One key format._ Keys are written with a decimal point and no thousands separators (0.125,
  1250), a fraction or mixed number only when the task asks for that form, the unit apart ("%"
  for percent): `NUMERIC_KEY_RULES` in both prompts. Code reads a key with `parseCanonicalKey`,
  never with the learner's parser, so "0.125" is 0.125 for every learner. LaTeX keys are read
  as written (`$3\frac{1}{2}$` is 3½, never 31/2).
- _Learner numbers, locale-independent._ `parseNumericInput` reads the separator from the text:
  "0,125", "2,5", "1.234,5" mean the same in every locale. One separator before exactly three
  digits ("1.000", "2,375") is ambiguous → no value → the tutor, unless the whole part is 0.
  "3 1/2" is a mixed number; "%" (also said: "Prozent", "percent", …) is a unit, never ÷ 100.
  Calculations from the math keys (17·23, √144) are evaluated by the bounded parser of
  `expression.ts` (at most 64 characters, digits and + − · : / ^ √ π only) — never a general
  evaluator — and marked as a calculation.
- _Tolerance (D-1)._ An integer, fraction or mixed-number key must match exactly; a decimal key
  accepts less than half a unit of its last written decimal (key 3.14: 3,1416 yes, 3,1 no); a
  wider tolerance only when the item declares one (`items.tolerance`, zod-validated, kept only for
  numeric items and at most a tenth of the key). No percentage rule.
- _Form (D-3)._ The key's value in the key's form is correct (0,125 for 0.125; 4,0 for 4; the
  same fraction as written). The same value in another form (1/8 for 0.125, 6/8 for 3/4, 7/2
  for 3 1/2) or a calculation that gives it is for the tutor. A written number with another value
  is wrong for sure (outside homework).
- _Math_ (a digit, an operator or LaTeX in the key or the answer, and every formula): compared
  with every operator, sign, relation and decimal separator kept (`canonicalMath`): x=5 is not
  x=-5, 3,4 is not 3/4, x^2-2x is not x^2+2x. No near miss (no "typo" for 15:35 against 14:35,
  no "missing word" for 5 against x = 5).
- _Words._ Correct only when equal after NFC and collapsing spaces — case, ß and punctuation
  count. A difference only there is, per item (`items.spelling`) or by default for vocabulary and
  language subjects (German, English, French, Spanish, Latin, other language), a near miss "Fast
  richtig – schau nochmal genau auf Groß- und Kleinschreibung, ß und Satzzeichen" (D-2, strict);
  elsewhere the tutor judges it gently (rule verdict `folded`).
- _Choices._ An option is named by its text (however written; words fold case) or by its badge
  letter — but a letter that is also another option's text ("A" with the, a, an) and an option
  followed by more words ("Richtig ist das nicht") go to the tutor.
- The value comparison is shared: `compareWithKeys` (answer and accepted answers, any form) for
  every caller that asks "does she state the right number?" — homework help included.
- Proven by a truth table and property tests (fast-check) over generated values in de/fr/es/it/en:
  a right value written as a learner in that locale writes it is never `incorrect`; the last
  place ± 1, a flipped sign or a swapped operator is never `correct`
  (`practice/__tests__/evaluate.test.ts`, `shared-math/src/__tests__/numeric-input.test.ts`).

**Hint ladder** (migration `0008_item_hints.sql`, practice and explanations only). Each question gets
2–3 hints (what is asked → which rule → the first step) and the solution explained step by step:
questions from a photo in the (background) reading call, questions on a topic in a separate
background call right after the session starts (`hints.ts`, purpose `hints`) — writing them in the
start call made her wait 8–11 s instead of 5–6 s. A hint that states the result in any form
(also another notation: 31/20 for 1 11/20, `valuesIn`) is dropped by code. The ladder counts only
hints she was really shown as hints (migration `0043_prepared_hints_used.sql`: `hints_used` = every
hint shown, prepared or written by the tutor; `prepared_hints_used` = which prepared one is next).
While practising: a rule-decided wrong answer gets kind feedback at once ("Noch nicht ganz –
probier's nochmal. Mit „Tipp“ …", no model) and uses up no hint (live finding 1: the feedback used
to consume the only prepared hint, so the first "Tipp" showed the solution); the "Tipp" button
(`POST /practice/sessions/:id/hint`, idempotent, `hint_available` in the view — never the hints
themselves) gives the next prepared hint at once, or, with none left, lets the tutor write one: a
request for help, never graded (`not_an_attempt`), and the tutor's own hint is shown and counted as a
hint. The tutor model, when it must judge, sees the prepared hints; a reply that gives the solution
away before the second hint is replaced by the next prepared hint (or a first-step question), without
a second call. The solution is explained after the third wrong try (`REVEAL_AFTER_MISSES`), or when
she asks for help again once every prepared hint and at least `HINTS_BEFORE_SOLUTION` (2) hints were
shown — never on the first "Tipp"; the question then counts as
revealed (FSRS brings it back soon). Tests give no hints; homework keeps its own rules (never the
solution).

"Frage passt nicht" (`POST /practice/sessions/:id/items/:itemId/flag`, a quiet button and a
confirm sheet): the question is archived for future practice and, if still open, closed here as
`skipped` with `session_items.flagged_at` (migration `0006_item_flags.sql`) — no FSRS review,
and it counts neither as answered nor as shaky in the summary or the step's evidence. Only for
questions from a photo or from Buddy in an active session; homework help and a running test get
409 `flag_not_allowed`. Idempotent; bumps the context version.

**"Anders erklären"** (gaps.md #3; `POST /practice/sessions/:id/reexplain`, `practice/reexplain.ts`,
purpose `reexplain`, migration `0036_reexplain.sql`). After the session's explanation (explain
mode, `item_id` null) and after a closed question's solution, three chips ("Einfacher bitte",
"Mit Beispiel", "Warum ist das so?") ask the model for a NEW explanation that way — the way is an
explicit tap (`ReexplainWay`), the model decides how to explain, the output is validated with
zod. It sees what she already read, so it does not repeat it. Her request and the explanation are
stored as turns (`verdict = not_an_attempt`, no attempts or hints counted; a turn about the intro
has no `item_id`), idempotent per `client_turn_id`. Code decides where it is allowed: never in a
running test (409 `reexplain_not_allowed`), a question only once closed (409 `try_first`), in
homework only for a task she solved herself (409 `reveal_not_allowed`), and a homework explanation
that states an open task's answer (`mentionsSolution`, any notation) gets one repair, then nothing
is stored (503 `reexplain_unavailable`). A model outage stores nothing (503 `model_unavailable`).
Also after the last question closed and the session finished.

### Learning modes (migration `0003_learning_modes.sql`)

Questions come from a photo (`material`), from Buddy on a topic the learner named (`buddy`,
shown as "Frage von Buddy"), from a typed list (`typed`) or from homework (`homework`). All
share one validated shape (`practice/items.ts`: `ItemDraft`, `usableItems`, `insertItems`).
A practice or practice test for a planned test stays within the sheets she photographed for it
(live finding 6: a test "for the worksheet" asked to multiply and divide fractions, which the sheet
never did). Buddy's `offer_learning` names the test (`goal`, or code takes the one active test
whose title the offer names exactly) and the offer carries `goal_id`; `POST /practice/topic` with
`goal_id` (the learner's own goal, else 404) gives the model the sheets' topics (from the
questions read from them) and text, the schema lets each question's `topic` be only one of those
topics, and a question on any other topic is dropped; the session belongs to the goal. A test
with no read sheet is built from the topic she named, as before.
Every prompt that writes questions, hints or explanations carries `LANGUAGE_RULES` (correct,
natural language, real words, no "A/B" alternatives, reread and fix before answering — live
finding 5: "gekürt", "echtdarstellbar", "echtere/größer als 1"). Code drops what it can recognise by
structure: a numeric question that names the number it asks for with a placeholder
(`placeholderQuestion`: a fraction with a number on one side and a letter, `\text{…}` or "?" on
the other — $\frac{a}{8}$, a/8 — with no relation sign and the letter nowhere else in the
question). Algebra (formula items) keeps its letters. Spelling itself cannot be checked without a
word list, so it stays a prompt rule.

- **help** — homework, from a photo (`materials.purpose = 'homework'`: the tasks as printed, a
  help session is created when they are read) or typed (`POST /practice/topic` kind `help`; tasks
  the model adds are dropped — `fromLearnerText`). The stored solution only guides hints. The
  server enforces "never the solution": no reveal endpoint (409 `reveal_not_allowed`), closed
  items carry no answer, and a tutor reply that contains the solution in any notation
  (`givesAwayHomework`: the key, accepted answers, the right choice) gets one repair round, then
  is replaced by a safe hint. Order matters (audit H-9, M-28): code first decides whether the
  task is solved (`homeworkSolved`: her value equals a key in any form via `compareWithKeys`,
  "5" for "x = 5", or a key in her words with no other numbers than the task's — a list of
  guesses is no solution); a "correct" it cannot confirm becomes "Fast" with a fixed nudge for
  the final result; only then the leak check runs on the final verdict and reply, and only the
  task text (never her message) may state a value. Confirming what code confirmed is allowed.
  "Tipp" works here too (a prepared hint only if it does not state the solution, else the tutor
  under the same check); "Später" (`POST …/items/:itemId/defer`, `session_items.deferred_at`)
  sets a task aside — still open, it comes back after the others. No FSRS for homework.
- **explain** — `POST /practice/topic` kind `explain`: a short explanation (`session.intro`) at
  the learner's grade, then 3–5 check questions; the tutor sees the explanation. "Kurz erklärt"
  means short (live finding 7: ~200 words, bare example sentences, "Wem?."): the prompt asks for
  at most 70 words in 1–2 paragraphs with example sentences in quotation marks; code
  (`practice/brief.ts`) removes doubled punctuation ("?." → "?") and, over `INTRO_MAX_WORDS`
  (80), asks the model once to shorten it (a small call, purpose `explain`), then cuts after the
  last whole sentence within the limit. "Anders erklären" gets the same clean-up and limit
  (`REEXPLAIN_MAX_WORDS`, prompt: 2–4 sentences, at most 60 words).
- **practice on a topic** — kind `practice`: Buddy's own questions, marked as such.
- **test** (migration `0005_test_mode.sql`) — kind `test` (start tile "Probetest", or Buddy's
  `offer_learning` shortly before an exam): 8–12 questions like a class test. Code enforces:
  one try per question (a wrong answer closes it as `missed`), every reply is a fixed neutral
  text whatever the model wrote (no hint, no solution, no verdict), "Überspringen" instead of
  "Lösung zeigen", no answers in the view while it runs (`reveal_allowed = false`), no FSRS.
  At the end: every question with its solution, and one tap "Die wackligen nochmal üben"
  (kind `practice` on the shaky topics; also after ordinary practice).
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
  renders fractions, powers, roots, periods and segments (`\overline`), vectors, geometry and set
  symbols, and a fill-in blank inside math as a gap; `apps/mobile/components/math/`, parser in
  `apps/mobile/lib/math/`). An unknown command shows its name set apart by spaces. A `$` right
  before a digit never closes math and one followed by a space never opens it, so prices
  ("$5 and $3") stay text. LaTeX the model forgot to wrap is wrapped server-side — in a sentence
  only the math runs (`practice/dollarMath.ts`), a math field as a whole — and rule checks
  compare \\frac{3}{4} and 3/4 as equal. Function plots widen their left margin for the y labels
  when the y-axis runs along the edge (`lib/math/plotLayout.ts`). A question
  may carry a `figure` (fraction, number line, function plot, bar chart, geometry, table) as data
  (`contracts/figure.ts`); the server drops figures it cannot draw (e.g. an expression that does
  not compile with `@learnbuddy/shared-math` `compileExpression`) without dropping the question.

## Voice

Talking instead of typing, everywhere she would otherwise type (chat, answers):

- **Speech to text** — on the device first, strictly on-device (`expo-speech-recognition` with
  `requiresOnDeviceRecognition`; the words appear while she speaks, nothing leaves the phone).
  `lib/speech/engine.ts` decides per tap (unit-tested): iOS when on-device is supported and the
  language is exactly the phone's own locale (iOS checks on-device support for that locale only
  and would send any other language to Apple, D-11); Android
  only with the language's offline model installed; never the browser's Web Speech (server-side)
  and never the system's server mode. If the recogniser fails for the language, the same tap
  continues as a recording and that language goes straight to the server for the rest of the
  app run; a refused speech-recognition permission also falls back (only the mic is needed).
  The device path needs verification on a real iPhone/Android phone. Otherwise:
  `POST /voice/transcribe` (`modules/voice/`): the model writes down the recording
  (answer mode writes numbers and fractions as such, and gets the question as context so short
  answers like "drei Viertel" are heard as 3/4). Live checks with espeak-ng recordings
  (`evals/voice/run.ts`): 5/6 with context; the lite model invented words and is not used. The
  recording is never stored.
- **Buddy's natural voice** (ADR 0008): everything read aloud goes sentence by sentence through
  `POST /voice/speech` (`modules/voice/speech.ts` → `speech/` seam → Google Cloud TTS, Chirp 3:
  HD voices, EU endpoint; `SPEECH_BACKEND=google`, default off until verified live). Voice and
  speed come from her settings (`buddy_settings.voice`, `voice_speed`, tool `set_voice`); audio is
  cached per learner for 24 h (`speech_cache`, keyed by a hash, purged by the tick). The app
  (`lib/speech/listen.ts`) fetches the next sentence while one plays (`expo-audio`) and reads a
  sentence with the phone's voice (`expo-speech`) when the server says no (off, budget, language,
  error) or is unreachable — never silence. `useBuddyVoice()` (`lib/speech/voiceState.ts`)
  exposes `idle | loading | speaking`, the sentences and the one being played with its progress:
  conversation mode highlights the sentence being read (no word timings from Chirp 3 HD).
  Dev stack: `LB_DEV_SPEECH=fake` answers with silent WAV audio of the sentence's length.
- **Voice mode** (app): Buddy's replies, questions, an explanation and feedback are read aloud
  (natural voice above, else the device's voices); she answers with the mic — in the chat, in every
  practice mode, and in the sheet where she names a topic (`TopicSheet`, which starts at once in
  voice mode). **Practice is hands-free** after her first tap on a mic there
  (`lib/speech/handsFree.ts`): question read → the mic listens (ends by itself when she pauses, on
  the phone) → her answer or question is checked → the feedback is read → the mic listens again,
  or, once the question is closed, the next one comes. Typing, switching voice mode off or leaving
  ends the loop; the microphone never starts before her own tap on that screen. One listening
  belongs to one turn (`lib/speech/turnGuard.ts`): answering another way (a tap, typing, the
  screen locking while it checks), Buddy starting to speak or the next question cancels a
  running mic and drops its late text. Questions carry the language they are written in
  (`prompt_lang`, also for ordinary questions): voice mode reads them and listens in that
  language, not the app's. The switch sits in the practice header and on Buddy's home (speaker
  icon; the headphones open conversation mode). The home reads a late reply only while it is
  on screen. Pronunciation
  recordings stay tap by tap. Buddy's chat replies stream on screen and are read once stored
  (§Speed). A realtime audio API (speech in, speech out) is not built.
- **Conversation mode** (`app/talk.tsx`, headphones on the home): hands-free, in the same
  conversation as the chat. She speaks → written down → Buddy answers (a normal turn) → the answer
  is read aloud → Buddy listens again. On the phone listening ends by itself when she pauses
  (on-device recogniser, `untilPause`); on the recording path (browser) she taps the mic when done.
  Tapping the mic while Buddy speaks interrupts it. When the answer carries a button
  (`offer_learning`, `open_area`) the loop pauses so she can tap it. The mic is only on while this
  screen — opened by her — is open; "Beenden" or the keyboard ends it. With a screen reader on
  the mic never opens by itself (it would record VoiceOver): she taps it or uses Magic Tap, and
  every phase is announced. Buddy's orb shows the phase (`components/voice/TalkOrb.tsx`)
  through his moon (docs/DESIGN-BRIEF.md §Buddy's moon, `lib/buddy/moon.ts` `talkMode`): idle it
  circles, listening it parks at the upper right and glows with her voice level (the glass stays
  clear), thinking it races round with a trail, paused without trouble it waits (bobs with a
  ping: her turn), speaking it sways in a speech rhythm (there is no level of Buddy's voice to
  follow); states blend, and with reduce motion the moon only cross-fades between still poses.
  The moon runs on the UI thread: one Reanimated frame callback per moving orb writes a pose that
  a few animated views read (moon in front and behind the glass, trail dots, ping, reflection) —
  no JS re-render per frame. Tapping Buddy while he
  speaks stops him ("Tipp auf Buddy, um ihn zu unterbrechen."). Two quiet synthesised tones
  (`scripts/make-talk-tones.mjs`, `lib/speech/cues.ts`) mark listening starting and ending; on
  iOS they play in a session that obeys the silent switch, then talk mode's session is restored
  (needs live verification on a phone); the web plays none. The camera next to "Tastatur"
  opens capture (`from=talk`): the photo goes into the same conversation and she comes back to
  talk mode, which says while it is being read. Walkthrough: one full turn
  with Chromium's fake microphone and a scripted transcript.
- **Pronunciation** — see Learning modes (`speak`). A judgement that lands after "Beenden" is
  refused (the write locks the session first, 409). Offline, the recording waits for the
  connection with "Neu aufnehmen" / "Diesmal überspringen" available, which cancel the wait.
- **Screen readers** — `lib/announce.ts`: Android reads live regions by itself, iOS has none,
  so toasts, capture and dictation status, what the mic understood, the PIN error (again after
  each attempt), Buddy's reply ("Buddy: …", when voice mode is off), practice feedback with its
  verdict word and math in words, the revealed solution and the conversation phases are
  announced explicitly (`announcePlan` decides, unit-tested). Button labels follow the system
  text size up to 1.6× (`Btn` grows with `minHeight` instead of clipping), "Prüfen" wraps onto
  its own line rather than shrink, and toasts sit above the iOS keyboard. Not yet checked on a
  device at AX3/AX5.

## Home

`modules/buddy/home.ts`. Everything is derived from stored state: **now** (practice used in the
last 12 h › result of the last practice › prepared practice › an older paused session (see
Session lifecycle) › material failed › material being read, or
photos still being sent for up to 10 minutes › photo needed), **working** (Buddy is acting on
the learner's own photos or just-finished practice: her photos still being read — also homework,
also behind another card, so the app keeps following the home — or a due or running check they
caused),
A result carries the prepared practice that is next (`next`), so a short round never hides
the practice for a test (user feedback #2).
**decision** (how did the test go › enable contact — with the stored rules it would allow,
`rules`: at most n a day, never after the quiet hour, so the card and the parents' PIN screen
say exactly that), **done** (Buddy's actions of the last 72 h
with status and undo), **next** (tests and planned steps), the **thread** (with the action cards
and delivery status of each message), **system** status (model, push, contact, scheduler) and
**practiced_today** (she answered, tried or looked at a practice question today in her zone:
the quiet "Heute geübt ✓" beside the greeting — never a count, never missed days).
The home is read in one repeatable-read transaction (one snapshot): a job that commits while
it is read (a page joining the homework session) shows either before or after, never an old
card next to "nothing working" — the app polls closely only while something is working
(`home-snapshot.int.test.ts`).

**The app shows it Buddy-first (simplicity is the first rule).** `app/buddy.tsx`, top to bottom:
**one** card on top: the **now** card, else the **decision** (with the system notes — no
model, background work stale — under it); with a now card the decision
is asked at the end of the conversation with quieter buttons, so there is one violet button
(`lib/homeLayout.ts`). The card **lies over** the greeting and the row of ways to start, directly
under the header, with a soft shadow (`components/buddy/TopOverlay.tsx`): the header, the
greeting, the row and the conversation stand in exactly the same place with or without it, so
nothing jumps when a card comes or goes (owner feedback: "Die Meldung sollte einfach über dem
Menü liegen. Kann man dann ja wegklicken."). Its close button (`<Btn>`, 44 pt, "Karte
ausblenden") or a swipe up hides it **on this phone only** (`lib/homeCard.ts`, kept in
AsyncStorage / localStorage) until what it says changes (`topKey`: a different card, or the same
card with new content, shows again); nothing is answered on the server — "Heute nicht" stays the
card's own button. A closed decision is asked at the end of the conversation instead. While the
card covers the row's buttons, the greeting and the row are left out in place (no edge peeking
out, nothing a screen reader finds behind it); the conversation keeps the room the card covers
at its top free (so its oldest shown message can be scrolled into view) and still stands at its
newest message. VoiceOver hears that a card came; Android and the web read its live region; "Buddy is working" is said once (inside "Ich lese dein Blatt …", with
the photo, or as a line at the end of the conversation); the greeting ("Hallo Lena" / "Was steht an?", full width — long names wrap);
the ring (`components/lb/OrbitMenu.tsx`) — only Buddy's orb in the middle, five ways to start
around it ("Arbeit" — with a test planned it prepares her for it; homework; pronunciation;
vocabulary; explain —
`docs/UX-PRINCIPLES.md` §6). Once there is a conversation the ring becomes one row of the same
five (`components/lb/StartRow.tsx`; each as wide as its label, so a word never breaks) and the conversation takes the rest of the screen, at
its newest message like any chat (a new message scrolls to it; when she scrolled up to read she
is not pulled down until she is back at the end or sends something; `lib/homeLayout.ts`
`followsEnd`; a jump of the offset because the content or the view changed size is not her
scrolling up) — the card on top covers only the top of the conversation, never its newest message; a
quiet line names the day where a new one starts (never how many days passed) — what Buddy did stands under its message with "Rückgängig"; no tiles, no
lists. Nothing on the home is found by scrolling (`docs/UX-PRINCIPLES.md` §32). Anything else she simply says
(Buddy answers with an `offer_learning` button). The composer is one floating bar: camera,
field, mic ("Senden" once there is text); in voice mode it is voice-first — keyboard · big mic ·
camera. Settings for the learner are closed groups, each with what is set now, one open at a
time (`components/settings/Group.tsx`): contact (on/off, a one-line summary, "Zeiten anpassen"
for the rare loosening), the language, about; the parents' area is closed until opened, and
for a minor's profile it opens only with the parents' PIN ("PIN vergessen?" opens just the PIN
card, where a new PIN needs the account's password; `lib/parentsGate.ts`).
Setting up a child's profile is two short steps (the child, then consent and the parents' PIN),
then a hand-over: what is set (consent, PIN, messages to the phone off) and "Gib Lena jetzt das
Handy". Someone under 16 choosing "Ich selbst" gets no dead end: "Eine erwachsene Person ist
hier" keeps name and birth date and goes to the parents' step on the same phone, naming the
account's e-mail (DESIGN-BRIEF §Onboarding); there is no age check beyond the birth date.
The practice screen pins the question (with its drawing scaled to fit) on top and the way to
answer at the bottom; only the conversation about the question scrolls between them; short
options sit two by two.
Level and grade are learned in the conversation (the profile has no grade field: Buddy asks when
the level is unknown and it matters for the next step — `context.ts`, `set_level`).

Photos that never all arrive are set aside after a day and whatever did arrive is deleted at
once (`abandonStaleUploads`, run by the scheduler).

## App: account and connection

- **Sign-in details** go from the app straight to Supabase Auth (`lib/auth/supabase.ts`); the
  API never sees passwords. The Supabase client keeps a session in memory only; the app's
  tokens live in `lib/auth/session.ts`, and tokens Supabase rotates on the way are saved back.
- **Password reset**: the e-mail link leads to `/reset-password` (`learnbuddy://reset-password`
  on a phone, `<origin>/reset-password` on the web; both must be in the Supabase project's
  redirect URLs). The screen reads the implicit-flow tokens, a PKCE `code` or a `token_hash`
  (`lib/auth/recovery.ts`), asks for the new password twice (sign-up rule, ≥ 8 characters) and
  then saves the session. Expired or used links get a calm "ask for a new one".
- **Changing e-mail or password** is in the parents' area (`AccountAccessCard`); for a minor's
  profile the parents' PIN comes first. A new password goes through the API
  (`PUT /account/password`, Supabase admin), which checks the admin token itself, so the gate
  holds on the server. An e-mail change is only requested: it counts once the confirmation links
  to the old and the new address are opened (`double_confirm_changes`), and the app says exactly
  that. `secure_password_change` is on, so a password change straight against Supabase Auth
  with a device token needs a recent sign-in or a nonce sent to the account's e-mail.
- **Offline**: on phones NetInfo feeds TanStack Query's `onlineManager` (only `isConnected`;
  NetInfo's own reachability ping is off); on the web the browser's `online`/`offline` events do
  (NetInfo on Chromium misses the connection coming back). Queries pause instead of failing, a calm line says so at the top
  (`components/lb/OfflineFrame.tsx`), and practice answers and recordings wait and are sent once
  the device is back, with the same `client_turn_id` (`lib/api/whenOnline.ts`). Typed answers are
  also kept on the device until the API has them (`lib/api/outbox.ts`, AsyncStorage /
  localStorage): after the app was closed they are sent on the next start or when back online;
  only answers the API clearly refuses (4xx: question closed, session ended) are dropped, and
  the app says so once — server trouble, an expired login or a proxy page keep them for later.
  Trouble with one answer does not hold back the next ones (a pass stops only without a
  connection or after three troubles in a row, `lib/api/flush.ts`). An answer being sent live is
  skipped by the outbox, and one flush runs at a time (a request meanwhile gets one more pass),
  so an answer never goes out twice at once. A "Tipp" whose answer was lost is asked again with
  the same `client_turn_id` (`lib/api/turnIds.ts`).
  (`tests/web/offline.spec.ts`: app open → exactly one request; app closed → sent on the next
  start). **Sessions and unsent work** (`lib/auth/refresh.ts`, `lib/localWork.ts`): only a
  definite "this session is over" from Supabase Auth (a 4xx such as `refresh_token_not_found`)
  ends the session; no connection, 5xx, 408 and 429 keep the tokens and retry after a backoff
  (2 s … 60 s), and a request meanwhile fails as `unavailable`, not "sign in again". A session
  that ends by itself (password changed on another device, revoked) keeps the outbox and the photo
  draft for her next sign-in and says so in a toast; they are deleted only when a different user
  signs in on the device (the owner is recorded per device), or when an adult signs out on purpose
  — the sign-out sheet first sends what it can and says when unsent answers or photos would be
  deleted. Sign-out revokes only this device's refresh token at Supabase (scope `local`, also after
  a cold start, at most 4 s), resets the navigation stack and clears the query cache. Recordings (pronunciation) are not kept — too large; closing the
  app while one waits drops it.
- **Instant start** (gaps.md #2, `lib/api/persist.ts`, `lib/api/deviceCache.ts`): the home and
  `/me` are kept on the device (AsyncStorage / localStorage, per user) and shown at once on the
  next start as stale data that refreshes in the background. Only settled data is kept — no card
  on top, notice, decision, work in progress or message still being answered (CLAUDE.md rule 5);
  they come with the first refresh. Any end of the session removes every kept copy. A practice to
  go on with is loaded while its card is on screen (loaded, never started; `lib/api/sessionCache.ts`):
  when the card changes for the same session (a re-photographed page joined the homework help)
  or the kept copy has fewer open questions than the card says, the copy is dropped and loaded
  again — never shown as current (rule 5). Starting a
  prepared step returns the session with its id (`StartStepResponse.session`), so the first
  question needs no second request.
- **About**: version from the app config; privacy, imprint and support rows only when
  `EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_IMPRINT_URL`, `EXPO_PUBLIC_SUPPORT_EMAIL` are set
  (`apps/mobile/.env.example`).

## Testing

- Unit: time and DST (`lib/__tests__`), contact policy, i18n parity.
- Integration against a real Postgres (`src/__tests__/*.int.test.ts`, harness in
  `src/testing/`): every test file gets its own database created from a template with the real
  migrations. Only the outside world is replaced: a scripted model (every call must be scripted;
  scripts can assert on the context the model sees), fake push provider, fake auth, in-memory
  storage, and a single test clock. Rows made at the same moment of that clock are ordered by an
  insertion number (`seq`, migration `0010_stable_order.sql`): goals, steps and memories get their
  aliases in that order, and jobs due together run in it. Before, ties were broken by however the
  table happened to hold the rows — the most likely cause of one failed run of the core-loop test
  in about 40 (its log was lost and it did not come back in 36 further runs, so this is not proven).
  A template is built under a temporary name and marked complete, so a killed build is never
  copied; test databases and templates that interrupted runs left behind are dropped after a
  day, never those a concurrent run may still use. Closing a test environment waits for the
  background work it started. Every file under `src/testing` and `evals` carries the rule-8
  banner (`testing/__tests__/banner.test.ts`).
- Locally: a Postgres 16 on `127.0.0.1:5432` (`LB_TEST_DATABASE_URL` to change). The pre-commit
  hook and CI set `LB_REQUIRE_TEST_DB=1`, so a missing database fails the gate; only a plain
  `pnpm test` outside them skips the database tests.
- The app keys (anon, authenticated) reach nothing in the database: the test shim grants what a
  hosted Supabase project grants by default, and `database-exposure.int.test.ts` fails for any
  public function they can execute or any table without row level security.
- Deploy checks: `scripts/deploy-check.sh` (CI job `deploy-check`, and before promoting) runs
  `vercel.json` through Vercel's own builder detector and, when given `DATABASE_URL` /
  `LB_DEPLOY_URL`, checks TLS, region, the app keys' grants and `/v1/health` of a deploy. A
  real preview deploy answering `/v1/health` has not been recorded yet.
- The scheduler trigger chain up to the network (`scheduler-trigger.int.test.ts`): the
  `lb-tick` cron entry, `lb_invoke_tick()` reading Vault and posting to `{lb_api_url}/internal/tick`
  with the secret (the shim's `net.http_post` records the request), and that request replayed
  against the app turning `/v1/health` healthy. Streaming is read chunk by chunk
  (`stream.int.test.ts`), so a buffered response fails.
- Not covered by automated tests: the live model's judgement quality, real push delivery to
  devices, Supabase Auth/Storage themselves, pg_cron firing and pg_net sending on a hosted
  project.
- Browser walkthrough: `pnpm --filter @learnbuddy/api dev:stack` starts the real API and
  scheduler on a throwaway copy of the schema with stand-ins for Supabase Auth, photo storage and
  a scripted model (`src/testing/dev-stack.ts`, scenario in `src/testing/scenarios/`). The app's
  web build talks to it like to production, through the same CORS as the API
  (`src/http/cors.ts`): the allowed request headers are the app's own list
  (`APP_REQUEST_HEADERS` in `shared-types`, which the client's header type is built from), so a
  header the app starts sending cannot be missing from a preflight (`cors.int.test.ts`; a missing
  `x-app-version` once made every browser call fail as "Keine Verbindung"). Test tooling only;
  never deployed.
  `tests/web/layout.spec.ts` checks the home under stress (a long name on a 390 and a 320 px
  phone): nothing overlaps the ring's buttons, no two buttons share touch area, no sideways scroll.
  Every screenshot in the walkthroughs (`tests/web/fit.ts`) is taken at 390×844 and 360×740 and
  fails when anything has to be scrolled to be seen; only a conversation (`testID="scroll-thread"`)
  and a browsed list (`"scroll-list"`) may grow. Measurements go to `test-results/web/fit.jsonl`.
  Before each screenshot the walkthrough waits until the screen stops changing (at most 1.6 s,
  `settle`), so no entrance or celebration is caught half-faded; endless loops (the breathing
  orb) only cost the wait. Product timing is not changed for the tests.
  `tests/web/tour.spec.ts` taps every control the other walkthroughs don't (undo, resend, earlier
  messages, changing and removing what Buddy knows, contact with the parents' PIN, times,
  language, a pause, a new PIN, the export, scheduling and cancelling a deletion, a dark photo
  kept anyway, photos that wait on home after a reload (discarded, brought back, resumed), a
  sheet that could not be read and is read again, homework of two pages with the second cut off
  and taken again (it joins the same help session), "Seite hinzufügen", an
  explanation read again, pronunciation with a fake microphone, sign-out that survives a
  reload, an expired password link). `apps/mobile/lib/__tests__/wiring.test.ts` checks from the source that every
  app call has a server route and every route is used, every endpoint function is used, every
  screen is reachable and every German text exists.
