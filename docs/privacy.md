# Privacy (Buddy rebuild)

Status: describes what the rebuilt system does (2026-09-25). It is an engineering description,
not legal advice; items marked **legal review** must be cleared before production use.
Architecture: [architecture.md](architecture.md). Previous specification: [legacy/09-privacy.md](legacy/09-privacy.md).

## Accounts and minors

- The **account holder** signs up with Supabase Auth (e-mail/password; the API never sees
  passwords) and accepts the current privacy text: `accounts.consent_version` must equal the
  API's `CONSENT_VERSION`, otherwise the account is not created. The text lives in the app
  (`auth:consent.*`); any change to it ships together with a new `CONSENT_VERSION`, so every
  account agrees again (2026-09-27: the consent points were reworded).
- Each account has exactly one **learner profile**: the adult themselves (`relation = self`,
  only from 16 years) or a child (`relation = child`). **The age of consent is 16** (DSGVO
  Art. 8 with the German age, ADR 0006): under 16 the parents give explicit consent when they
  create the profile, and the profile is behind their PIN; from 16 she consents and decides
  herself, also on a profile her parents created — no consent box, no PIN gate. Every child
  profile records the privacy text its account holder agreed to (`minor_consent_version` /
  `minor_consent_at`), renewed when the account holder agrees to a new text. After a
  privacy-text change the API serves nothing learner-facing until the account holder agreed
  again, and the scheduler reads no photos, runs no Buddy check and sends no message for it
  meanwhile; for a profile under 16 that needs the PIN. Export and
  deletion keep working, also for an account that never finished its profile.
- Name and birth date can be corrected (GDPR Art. 16) in the parents' area; for a profile under
  16 a birth-date correction needs the PIN and is checked against the same age rules.
- The birth date is stored to know whether the learner is under 16 and to pitch the language;
  the display name can be a nickname.
- **PIN gate** under 16: data export, deletion, anything that increases contact, a new
  password, a birth-date correction and agreeing to a new privacy text need a short-lived admin
  token obtained with the account holder's PIN (scrypt hash; 5 wrong attempts across every
  route that takes the PIN lock it for 15 minutes — every time the same, no escalation — counted
  atomically; token valid 5 minutes, HMAC-signed, bound to the account; the app drops it as soon
  as the one step it was asked for is done, when the app goes to the background and when the
  parents leave the settings, so the child holding the phone afterwards cannot use it). The
  parents' area itself (their e-mail, sign-out, export, deletion) opens for a profile under 16
  only with the PIN, and closes when the app goes to the background. A
  forgotten PIN is replaced after signing in again with the password (at most 5 times an hour,
  never while the PIN is locked). Reducing
  contact (pause, quieter) never needs the PIN. Buddy's own tools can never increase contact.

## What is stored

| Data                                                                                                         | Where                                                             | Retention                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account, consent, PIN hash                                                                                   | `accounts`                                                        | until deletion                                                                                                                                                                                                                                                                                                                                 |
| Wrong-PIN and request counters (counts and times only)                                                       | `attempt_counters`                                                | until deletion                                                                                                                                                                                                                                                                                                                                 |
| Learner profile (name, birth date, level, grade, language)                                                   | `learners`                                                        | until deletion                                                                                                                                                                                                                                                                                                                                 |
| Conversation with Buddy                                                                                      | `buddy_messages`                                                  | until deletion                                                                                                                                                                                                                                                                                                                                 |
| What Buddy knows, with the learner's own words as source                                                     | `buddy_memories`                                                  | until deletion; a removed or corrected item is erased (with its quote and its copies in Buddy's audit trail) 7 days after the removal — the undo window; temporary situations end by themselves (≤ 60 days) and are erased 7 days later                                                                                                        |
| Goals, steps, decisions, actions (audit of what Buddy did and why)                                           | `buddy_goals`, `buddy_steps`, `buddy_decisions`, `buddy_actions`  | until deletion                                                                                                                                                                                                                                                                                                                                 |
| Contact settings, push tokens, messages outside the app and their delivery status                            | `buddy_settings`, `push_tokens`, `buddy_outreach`                 | until deletion                                                                                                                                                                                                                                                                                                                                 |
| A random install id (never derived from the hardware) binding push tokens to one learner per device          | `push_tokens.device_id`; on the device `lb.install_id`            | until deletion (server); on the device until the app is removed                                                                                                                                                                                                                                                                                |
| Photos of study material                                                                                     | Supabase Storage, private bucket `material-photos`                | **7 days after reading** (also when unreadable); at once when it is not learning material (also a single such photo among the pages of a sheet); immediately when the learner deletes the material (and again 2 hours later for photos that were still on their way). A Storage outage delays this: the deletion is retried until it succeeded |
| Photos not yet sent, and sent photos on the phone                                                            | the app's own storage on the device (browser: its local storage)  | unsent: until sent or discarded, at most 7 days; sent: 1 day (for the notice about a page that could not be read)                                                                                                                                                                                                                              |
| Voice recordings (speaking practice; spoken messages/answers when the device cannot recognise speech itself) | not stored — sent once to the model (Vertex AI, EU) and discarded | never stored; only the written result (judgement or text) is kept where it is used                                                                                                                                                                                                                                                             |
| Transcribed text and questions from the material                                                             | `materials`, `items`                                              | until the material (or the question) or the account is deleted: deleting erases the text, the questions and the answers given to them within minutes; what remains is a row with ids, dates and counts                                                                                                                                         |
| Practice sessions, answers, spaced-repetition state                                                          | `practice_sessions`, `practice_turns`, `item_states`              | until deletion (answers and state of a deleted question: with the question)                                                                                                                                                                                                                                                                    |
| What happened, for Buddy to react to (material read, practice finished; ids and counts only)                 | `buddy_events`                                                    | until deletion                                                                                                                                                                                                                                                                                                                                 |
| Model usage (tokens, cost, outcome — no content)                                                             | `llm_calls`, `usage_daily`                                        | until deletion                                                                                                                                                                                                                                                                                                                                 |
| Background work planned or done for the learner (kind, time, ids, outcome)                                   | `jobs`                                                            | until deletion                                                                                                                                                                                                                                                                                                                                 |
| Photo paths whose deletion Storage still owes after an account deletion (account/material ids only)          | `storage_deletions`                                               | until Storage confirmed the deletion                                                                                                                                                                                                                                                                                                           |

Logs contain route names and error classes only — no request bodies, messages or answers.

## Access control

- The app only talks to the API. The API connects to Postgres with a privileged role and scopes
  every query by the learner derived from the verified token; model output can only reference
  the learner's own rows through aliases.
- Row level security is enabled on every table **without policies**, and no database function
  is executable by the anon/authenticated roles (`0022_revoke_app_key_access.sql`): the keys
  that ship in the app can read, write or call nothing directly.
- The API reaches a non-local database only over TLS with certificate verification
  (`apps/api/src/lib/db.ts`); a connection string asking for less is refused at startup.
- Photos are uploaded with short-lived signed URLs to paths under the account id; the bucket is
  private.

## Distress and sensitive disclosures

- What Buddy remembers is for planning (tests, preferences, temporary situations). Health,
  family trouble, being hurt, abuse and self-harm are **never** stored as knowledge: the prompt
  forbids it, and in a turn the model marks as a `concern` the memory tools are refused in code
  (`modules/buddy/tools.ts`), so such a disclosure cannot reach the memory screen, the export,
  later prompts or a lock screen.
- A child's distress message is answered with a fixed text per language that points to a
  trusted adult and a free helpline (docs/architecture.md §Turns, Safeguarding). Buddy does
  **not** notify the parents: the helpline, not the app, is the right place for a child who may
  be hurt at home (decision D-10). The message itself stays in the conversation like any other
  and is deleted with it. **Pedagogical and legal review** of the text and of this policy is
  required before production use.
- A message the provider's safety filter blocked is kept (her conversation, her data), marked
  `blocked`, and never sent to the model again.

## Export and deletion (DSGVO Art. 15, 17, 20)

- `GET /account/export` returns everything stored about the learner as JSON, immediately —
  including model usage (`llm_calls`) and background jobs (`jobs`).
- `POST /account/deletion` schedules deletion after a **7-day hold** (cancellable with
  `DELETE /account/deletion`). During the hold the app works as before; nothing else changes.
  When the hold is over the scheduler carries it out as a resumable job (docs/architecture.md
  §Background work): from its start it cannot be cancelled (409 `deletion_running`) and the
  account takes no more changes (the app then shows only "Dein Konto wird gerade gelöscht" with
  a sign-out, `app/deleting.tsx`); it deletes the learner's rows table by table, then the auth user
  and the account. It is never given up: failures are retried with backoff, and `GET /health`
  reports a deletion more than a day overdue. The photos go to a Storage deletion queue first:
  the account deletion does **not** wait for Storage (D-9); the queue removes them in chunks of
  at most 1 000 and retries until they are gone (monitored the same way). A repeated request
  while a deletion is scheduled keeps the date and makes sure a job is planned.
- Deleting a sheet or a question in the app deletes its content (D-7), see the table above. The
  conversation with Buddy is not changed by it: what she wrote there stays until the account is
  deleted.

## Processors

- **Supabase** (database, auth, storage): EU region of the project.
- **Google Vertex AI** (model): EU only — the EU multi-region endpoint `eu` (Gemini 3.6 Flash; Google
  states ML processing and storage stay in EU member states, seen as a snippet of its data-residency
  page, to be confirmed) or `europe-west4`; `global` and non-EU regions are refused at startup
  (`apps/api/src/config.ts`). **Before launch:** confirm the model is GA (Google's preview terms
  exclude services likely used by under-18s) and switch off abuse-monitoring prompt logging. Prompts contain the learner's display name and age in
  years (never the birth date), her messages, memory, goals and material text needed for the answer. **legal review:** confirm the data
  processing terms (no training on customer data) for the configured project.
- **Speech recognition of the device** (Apple / Google) — also in conversation mode, where the
  mic reopens after each answer only while the conversation screen she opened is open: used first for talking instead of typing,
  **only on-device** (`requiresOnDeviceRecognition`; on Android only when the language's offline
  model is installed) — the audio does not leave the phone. Where the phone could only recognise
  on Apple's/Google's servers, and always in the browser (Chrome's Web Speech is server-side), the
  app records instead and uses our own EU path (`/voice/transcribe`, Vertex AI). The decision is
  code (`apps/mobile/lib/speech/engine.ts`), not a setting. On iPhone the on-device check only
  covers the phone's own language, and iOS would silently send any other language to Apple's
  servers; so the system recogniser is used only when the language she speaks is exactly the
  phone's language (with region), every other language goes the recording path (EU). **Not yet
  verified on a real iPhone**; until it is, treat the iOS on-device promise as unproven.
- **Expo push service** (optional): off unless `PUSH_BACKEND=expo`. It adds a US subprocessor and
  sends notification titles and bodies via Apple/Google. Texts are written without scores or
  personal details, but they are about the learner's tests. **legal review required before
  enabling.** Without push, Buddy shows everything in the app.

## Contact outside the app

Off by default (opt-in: the setting and the phone's permission). Under 16 only the account
holder can enable or increase it (PIN); from 16 she decides herself. Quiet hours, preferred
window, days without messages and pause are hers and are enforced by code at planning and again
at send time. Messages in the app are not counted or limited, and nothing to the phone is capped
by a number either (ADR 0006); the same topic is not raised twice within 72 hours. Details: [architecture.md §Delivery](architecture.md#delivery).
