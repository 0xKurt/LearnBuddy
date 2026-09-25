# Privacy (Buddy rebuild)

Status: describes what the rebuilt system does (2026-09-25). It is an engineering description,
not legal advice; items marked **legal review** must be cleared before production use.
Architecture: [architecture.md](architecture.md). Previous specification: [legacy/09-privacy.md](legacy/09-privacy.md).

## Accounts and minors

- The **account holder** signs up with Supabase Auth (e-mail/password; the API never sees
  passwords) and accepts the current privacy text: `accounts.consent_version` must equal the
  API's `CONSENT_VERSION`, otherwise the account is not created.
- Each account has exactly one **learner profile**: the adult themselves (`relation = self`,
  only from 16 years) or a child (`relation = child`). A profile under 16 requires the account
  holder's consent (DSGVO Art. 8), stored as `minor_consent_version` / `minor_consent_at`.
- The birth date is stored to know whether the learner is a minor and to pitch the language;
  the display name can be a nickname.
- **PIN gate** for minors: data export, deletion and anything that increases contact need a
  short-lived admin token obtained with the account holder's PIN (scrypt hash; 5 wrong attempts
  lock for 15 minutes; token valid 10 minutes, HMAC-signed, bound to the account). Reducing
  contact (pause, quieter) never needs the PIN. Buddy's own tools can never increase contact.

## What is stored

| Data                                                                              | Where                                                            | Retention                                                                                          |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Account, consent, PIN hash                                                        | `accounts`                                                       | until deletion                                                                                     |
| Learner profile (name, birth date, level, grade, language)                        | `learners`                                                       | until deletion                                                                                     |
| Conversation with Buddy                                                           | `buddy_messages`                                                 | until deletion                                                                                     |
| What Buddy knows, with the learner's own words as source                          | `buddy_memories`                                                 | until corrected/removed or deletion; temporary situations end by themselves (≤ 60 days)            |
| Goals, steps, decisions, actions (audit of what Buddy did and why)                | `buddy_goals`, `buddy_steps`, `buddy_decisions`, `buddy_actions` | until deletion                                                                                     |
| Contact settings, push tokens, messages outside the app and their delivery status | `buddy_settings`, `push_tokens`, `buddy_outreach`                | until deletion                                                                                     |
| Photos of study material                                                          | Supabase Storage, private bucket `material-photos`               | **7 days after reading** (also when unreadable); immediately when the learner deletes the material |
| Transcribed text and questions from the material                                  | `materials`, `items`                                             | until the material or the account is deleted                                                       |
| Practice sessions, answers, spaced-repetition state                               | `practice_sessions`, `practice_turns`, `item_states`             | until deletion                                                                                     |
| Model usage (tokens, cost, outcome — no content)                                  | `llm_calls`, `usage_daily`                                       | until deletion                                                                                     |

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
- **Google Vertex AI** (model): region `europe-west4`; prompts contain the learner's messages,
  memory, goals and material text needed for the answer. **legal review:** confirm the data
  processing terms (no training on customer data) for the configured project.
- **Expo push service** (optional): off unless `PUSH_BACKEND=expo`. It adds a US subprocessor and
  sends notification titles and bodies via Apple/Google. Texts are written without scores or
  personal details, but they are about the learner's tests. **legal review required before
  enabling.** Without push, Buddy shows everything in the app.

## Contact outside the app

Off by default (opt-in). For a minor only the account holder can enable or increase it (PIN).
Quiet hours, preferred window, limits and pause are enforced by code at planning and again at
send time. Details: [architecture.md §Delivery](architecture.md#delivery).
