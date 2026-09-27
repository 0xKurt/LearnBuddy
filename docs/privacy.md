# Privacy (Buddy rebuild)

Status: describes what the rebuilt system does (2026-09-25). It is an engineering description,
not legal advice; items marked **legal review** must be cleared before production use.
Architecture: [architecture.md](architecture.md). Previous specification: [legacy/09-privacy.md](legacy/09-privacy.md).

## Accounts and minors

- The **account holder** signs up with Supabase Auth (e-mail/password; the API never sees
  passwords) and accepts the current privacy text: `accounts.consent_version` must equal the
  API's `CONSENT_VERSION`, otherwise the account is not created.
- Each account has exactly one **learner profile**: the adult themselves (`relation = self`,
  only from 16 years) or a child (`relation = child`). A child profile records the account
  holder's consent (DSGVO Art. 8 under 16; recorded for 16- and 17-year-olds too), stored as
  `minor_consent_version` / `minor_consent_at` and renewed when the parents agree to a new
  privacy text. A child profile stays behind the parents' PIN gate until 18 (D-8); at 18 it
  becomes the learner's own. After a privacy-text change the API serves nothing learner-facing
  until the account holder agreed again; for a minor's profile that needs the PIN. Export and
  deletion keep working, also for an account that never finished its profile.
- Name and birth date can be corrected (GDPR Art. 16) in the parents' area; for a minor's
  profile a birth-date correction needs the PIN and is checked against the same age rules.
- The birth date is stored to know whether the learner is a minor and to pitch the language;
  the display name can be a nickname.
- **PIN gate** for minors: data export, deletion, anything that increases contact, a new
  password, a birth-date correction and agreeing to a new privacy text need a short-lived admin
  token obtained with the account holder's PIN (scrypt hash; 5 wrong attempts across every
  route that takes the PIN lock it for 15 minutes, then 30 minutes, 1 hour and so on, counted
  atomically; token valid 5 minutes, HMAC-signed, bound to the account; the app drops it as soon
  as the one step it was asked for is done, when the app goes to the background and when the
  parents leave the settings, so the child holding the phone afterwards cannot use it). A
  forgotten PIN is replaced after signing in again with the password (at most 5 times an hour,
  never while the PIN is locked). Reducing
  contact (pause, quieter) never needs the PIN. Buddy's own tools can never increase contact.

## What is stored

| Data                                                                                                         | Where                                                             | Retention                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Account, consent, PIN hash                                                                                   | `accounts`                                                        | until deletion                                                                                                                               |
| Wrong-PIN and request counters (counts and times only)                                                       | `attempt_counters`                                                | until deletion                                                                                                                               |
| Learner profile (name, birth date, level, grade, language)                                                   | `learners`                                                        | until deletion                                                                                                                               |
| Conversation with Buddy                                                                                      | `buddy_messages`                                                  | until deletion                                                                                                                               |
| What Buddy knows, with the learner's own words as source                                                     | `buddy_memories`                                                  | until corrected/removed or deletion; temporary situations end by themselves (≤ 60 days)                                                      |
| Goals, steps, decisions, actions (audit of what Buddy did and why)                                           | `buddy_goals`, `buddy_steps`, `buddy_decisions`, `buddy_actions`  | until deletion                                                                                                                               |
| Contact settings, push tokens, messages outside the app and their delivery status                            | `buddy_settings`, `push_tokens`, `buddy_outreach`                 | until deletion                                                                                                                               |
| Photos of study material                                                                                     | Supabase Storage, private bucket `material-photos`                | **7 days after reading** (also when unreadable); at once when it is not learning material; immediately when the learner deletes the material |
| Photos not yet sent, and sent photos on the phone                                                            | the app's own storage on the device (browser: its local storage)  | unsent: until sent or discarded, at most 7 days; sent: 1 day (for the notice about a page that could not be read)                            |
| Voice recordings (speaking practice; spoken messages/answers when the device cannot recognise speech itself) | not stored — sent once to the model (Vertex AI, EU) and discarded | never stored; only the written result (judgement or text) is kept where it is used                                                           |
| Transcribed text and questions from the material                                                             | `materials`, `items`                                              | until the material or the account is deleted                                                                                                 |
| Practice sessions, answers, spaced-repetition state                                                          | `practice_sessions`, `practice_turns`, `item_states`              | until deletion                                                                                                                               |
| What happened, for Buddy to react to (material read, practice finished; ids and counts only)                 | `buddy_events`                                                    | until deletion                                                                                                                               |
| Model usage (tokens, cost, outcome — no content)                                                             | `llm_calls`, `usage_daily`                                        | until deletion                                                                                                                               |

Logs contain route names and error classes only — no request bodies, messages or answers.

## Access control

- The app only talks to the API. The API connects to Postgres with a privileged role and scopes
  every query by the learner derived from the verified token; model output can only reference
  the learner's own rows through aliases.
- Row level security is enabled on every table **without policies**: the anon/authenticated
  keys that ship in the app can read or write nothing directly.
- Photos are uploaded with short-lived signed URLs to paths under the account id; the bucket is
  private.

## Export and deletion (DSGVO Art. 15, 17, 20)

- `GET /account/export` returns everything stored about the learner as JSON, immediately.
- `POST /account/deletion` schedules deletion after a **7-day hold** (cancellable with
  `DELETE /account/deletion`). The scheduler then removes the photos from storage, deletes the
  auth user and the account; every learner-scoped row is removed by `ON DELETE CASCADE`.

## Processors

- **Supabase** (database, auth, storage): EU region of the project.
- **Google Vertex AI** (model): EU only — the EU multi-region endpoint `eu` (Gemini 3.6 Flash; Google
  states ML processing and storage stay in EU member states, seen as a snippet of its data-residency
  page, to be confirmed) or `europe-west4`; `global` and non-EU regions are refused at startup
  (`apps/api/src/config.ts`). **Before launch:** confirm the model is GA (Google's preview terms
  exclude services likely used by under-18s) and switch off abuse-monitoring prompt logging. Prompts contain the learner's messages,
  memory, goals and material text needed for the answer. **legal review:** confirm the data
  processing terms (no training on customer data) for the configured project.
- **Speech recognition of the device** (Apple / Google) — also in conversation mode, where the
  mic reopens after each answer only while the conversation screen she opened is open: used first for talking instead of typing,
  **only on-device** (`requiresOnDeviceRecognition`; on Android only when the language's offline
  model is installed) — the audio does not leave the phone. Where the phone could only recognise
  on Apple's/Google's servers, and always in the browser (Chrome's Web Speech is server-side), the
  app records instead and uses our own EU path (`/voice/transcribe`, Vertex AI). The decision is
  code (`apps/mobile/lib/speech/engine.ts`), not a setting.
- **Expo push service** (optional): off unless `PUSH_BACKEND=expo`. It adds a US subprocessor and
  sends notification titles and bodies via Apple/Google. Texts are written without scores or
  personal details, but they are about the learner's tests. **legal review required before
  enabling.** Without push, Buddy shows everything in the app.

## Contact outside the app

Off by default (opt-in). For a minor only the account holder can enable or increase it (PIN).
Quiet hours, preferred window, limits and pause are enforced by code at planning and again at
send time. Details: [architecture.md §Delivery](architecture.md#delivery).
