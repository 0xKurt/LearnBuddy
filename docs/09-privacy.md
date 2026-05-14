# 09 — Privacy and DSGVO

This document is the privacy specification. It is concrete enough that an agent can implement the data flows correctly and an account holder can read the consent screen and trust it.

## 1. Principles

- **All durable data lives in the EU.** Database, storage, LLM inference, analytics, and error tracking are configured to EU regions. No US replicas. No requests leave the EU on the hot path.
- **Photos are deleted within seven days** of successful extraction. Only the derivative study assets and the extracted Markdown persist.
- **The account holder owns the account.** The learner is a profile, not an auth user.
- **No third-party advertising.** No ad networks, no advertising SDKs, no tracking pixels.
- **Minimum collection.** No real names of learners by default (display name can be a nickname). No email or phone for learners. No precise location.
- **Easy and complete exit.** An account holder can export everything and delete everything in two taps each.

## 2. Lawful basis (DSGVO Art. 6)

- **Art. 6(1)(b) — Contract performance** for processing strictly necessary to provide the app: storing the learner's materials, generating items, recording attempts, scheduling reviews, processing payments via RevenueCat.
- **Art. 6(1)(f) — Legitimate interest** for aggregate, non-PII operational metrics (PostHog event counts, Sentry error reports with content scrubbed). The legitimate interest is "running and improving a paid service used by paying accounts." A DPIA-style analysis is in the privacy policy.
- **Art. 6(1)(a) — Explicit consent** for processing a child's data, recorded at signup; required by Art. 8 for children under 16 in Germany.

No processing relies on Art. 6(1)(f) for content-bearing data (materials, items, attempts, transcripts). That category requires contract or explicit consent.

## 3. Children's data (DSGVO Art. 8)

Germany sets the age of digital consent at **16**. The app:

- Treats every learner profile as belonging to a child under 16 by default.
- Requires explicit parental consent at signup (the consent screen described in doc 05 §onboarding).
- Records `accounts.dsgvo_consent_version` and `accounts.dsgvo_consent_at`.
- Re-requires consent if the consent text changes (the mobile app compares the stored version to the current constant on every cold launch).

## 4. Data inventory

| Category | Where | Retention | Notes |
|---|---|---|---|
| Account holder email | Supabase Auth (EU) | Until account deletion or 7 days after deletion request | Required for login and DSGVO contact |
| Account holder password hash | Supabase Auth (EU) | Until account deletion | Argon2id via Supabase Auth |
| Account metadata (locale, country, consent version) | Postgres `accounts` | Until account deletion | |
| Learner profile (display name, grade, avatar, settings) | Postgres `learners` | Until learner archived or account deletion | No real name required; display name can be a nickname |
| Subjects, folders | Postgres | Until the account holder deletes or account deletion | |
| Material photos (raw) | Supabase Storage `materials-raw` | **7 days** after extraction | Deleted by `pg_cron` + Edge Function `photo-wipe` |
| Material extracted markdown | Postgres `materials.extracted_markdown` | Until the account holder deletes or account deletion | The persistent record of what was photographed |
| Study assets (derivative images) | Supabase Storage `study-assets` | Until the account holder deletes the material or account deletion | Numbered diagrams, cropped graphs |
| Items, problem templates, practice runs | Postgres | Until the account holder deletes or account deletion | |
| Attempts (incl. learner's text answers) | Postgres `attempts` | Until the account holder deletes or account deletion | Voice answers: ONLY the transcript is stored; audio never leaves the device |
| FSRS state | Postgres `item_states` | Until item deleted | |
| Subscription record | Postgres `subscriptions` | Until account deletion | RevenueCat app-user id stored; no card data |
| Credit ledger | Postgres `credit_buckets`, `credit_events` | 24 months | Required for billing dispute resolution |
| DSGVO requests | Postgres `dsgvo_requests` | 24 months | Required for accountability under Art. 30 |
| Sentry events | Sentry EU | 90 days | PII fields scrubbed (see §6) |
| PostHog events | PostHog EU | 12 months | No PII; per-account pseudonym only |
| Vertex AI request logs | GCP `europe-west3` | 30 days then auto-purged; paid-tier means content is NOT used for training | Configured via Vertex's data-residency commitments |
| Local SQLite on device | Device storage | Until app uninstalled or learner switched | Encrypted on iOS by default; Android relies on full-disk encryption |
| Local audio recordings | None | Never stored | Native speech recognition consumes audio in-process; only the transcript is read by the app |

## 5. Subprocessors

Each subprocessor handles only the listed data classes, in the listed regions, under a Data Processing Agreement signed before launch.

| Subprocessor | Role | Region | Data classes |
|---|---|---|---|
| Supabase | Database, auth, storage, edge functions | `eu-central-1` (Frankfurt) | All persistent app data |
| Vercel | API hosting | EU regions (Frankfurt primary) | API requests and responses in transit; access logs |
| Google Cloud / Vertex AI | LLM inference | `europe-west3` (Frankfurt) | Material photos and text passed to the LLM; LLM responses |
| RevenueCat | Subscription management | EU region (Ireland) | Account holder email (hashed user id), purchase events |
| Apple | App Store + StoreKit | EU | Subscription purchase data; the app does not see card data |
| Google | Play + Play Billing | EU | Same as Apple |
| PostHog | Aggregate analytics | EU Cloud (Frankfurt) | Anonymized event counts, per-account pseudonym |
| Sentry | Error monitoring | EU region | Scrubbed error events |
| Resend or Postmark | Transactional email (verification, DSGVO links) | EU region | Account holder email |

Vertex AI is enabled with the paid tier (`europe-west3`); per Google's terms, customer prompt and response data on the paid tier is not used to train Google's foundation models.

## 6. Sentry data scrubbing

The Sentry SDK is configured with a `beforeSend` hook that:

- Drops fields named: `kid_answer`, `extracted_markdown`, `expected_answer`, `acceptable_answers`, `kid_name`, `email`, `password`, `material_photo_url`.
- Drops request and response bodies on routes: `/attempts`, `/materials`, `/explain`, `/auth/account/signup`.
- Hashes `account_id` and `learner_id` into 8-char SHA-256 prefixes.
- Drops any string longer than 200 characters by default.

## 7. Account holder rights

The account holder has the following rights, served entirely through the app.

### Access and portability (Art. 15, 20)

`POST /dsgvo/export` triggers the export Edge Function. Within ~10 minutes the account holder receives an email with a signed download URL valid for 24 hours. The ZIP contains:

- `account.json` — account + learners profiles
- `subjects.json`, `folders.json`, `materials.json`, `items.json`, `attempts.json`, `practice_runs.json`, `problem_templates.json`
- `subscriptions.json` (excluding any sensitive RevenueCat IDs that aren't necessary)
- `credit_events.json`
- `study_assets/` — all derivative images for the account
- `consent.json` — consent record with version and timestamp
- `README.md` — index of the export

Format: JSON for tabular data (one row per object), PNG for images. No proprietary formats.

### Rectification (Art. 16)

The account holder edits learner profile, subject, folder, material title, and notification settings directly in the app via `PATCH` endpoints. Edits to a learner's attempts or items are not provided — the account holder can delete an item to remove a wrong question, but cannot rewrite past attempts (immutable history).

### Erasure (Art. 17)

`POST /dsgvo/delete-account` schedules the account for deletion in 7 days. During the holding period, the account holder can cancel via `POST /dsgvo/cancel-deletion`. After 7 days the Edge Function `dsgvo-delete`:

1. Cascades delete on `accounts`, removing every related row in Postgres.
2. Deletes all Supabase Storage objects under `materials-raw/{userId}/*` and `study-assets/{userId}/*`.
3. Deletes the Supabase Auth user.
4. Calls RevenueCat to delete the subscriber.
5. Asks Sentry to scrub events with the corresponding `account_id_hash`.
6. Asks PostHog to delete events with the corresponding pseudonym (PostHog's GDPR-deletion endpoint).
7. Records the completion in `dsgvo_requests` for accountability, retained 24 months with no content beyond the deletion timestamp and the request id.

Because each account has exactly one learner profile, full erasure of the learner's data and full erasure of the account are equivalent. The single `POST /dsgvo/delete-account` flow above covers both.

### Restriction (Art. 18) and Objection (Art. 21)

The account holder can archive subjects or folders (soft delete), which functions as restriction of processing for those topics. The legitimate-interest analytics path can be turned off entirely by the account holder in Settings → Datenschutz; the toggle disables the PostHog SDK on next launch.

### Automated decision-making (Art. 22)

The app does not perform decisions with legal or similarly significant effects. AI-generated items are reviewable by the account holder; the learner's grade is never reported to a school or used in any decision external to the app.

## 8. Security

- Transport: TLS 1.2+ everywhere. Certificate pinning is NOT used on mobile (rotation pain outweighs the marginal benefit at this scale).
- At rest: Supabase Postgres is encrypted at rest; Storage is encrypted at rest.
- Auth: Supabase Auth with rate-limited login and email verification.
- API tokens: short-lived (1 h) Supabase JWTs; refresh tokens are rotated.
- Service-role keys: never on the mobile; only in Vercel env vars and Supabase Edge Function secrets.
- Admin endpoints (`/admin/*`) are protected by an email allowlist env var and require a fresh JWT from an account holder account that is in the allowlist.
- The mobile account holder PIN is stored in `expo-secure-store` (Keychain on iOS, EncryptedSharedPreferences on Android).
- Photo uploads use one-shot signed PUT URLs valid for 10 minutes.

## 9. Incident response

- An incident is "any unauthorized access to or loss of personal data of any account."
- The developer commits to investigating within 24 hours and, if confirmed:
  - Notify the BfDI (or the responsible Landesdatenschutzbeauftragter) within 72 hours per Art. 33.
  - Notify affected accounts per Art. 34 when the risk to rights and freedoms is high.
- A pre-written incident-response template lives in `infra/runbooks/incident.md` with the notification email skeleton in German and English.

## 10. App Store and Play Store posture

- The app is **not** registered under the App Store "Kids Category" or Play's "Designed for Families" program (those are the official program names regardless of our internal terminology). The DSGVO consent flow and PostHog analytics, even anonymized, are incompatible with those programs.
- Instead, the app's content rating is "for ages 9+" (Apple) and "PEGI 3" (Google), with a privacy label that mentions data collection and the account-holder consent flow.
- The Privacy Manifest (`PrivacyInfo.xcprivacy`) declares: name, email, user content (text and photos), purchases, crash data, performance data, and app interaction data, each with the data uses and tracking flags appropriate.
- The Play Data Safety section declares the same.

## 11. German plain-language privacy summary

This text appears verbatim on the consent screen and at the top of the full policy. The full policy is the long-form German document at `/legal/privacy`, linked from the consent screen.

> **Was wir mit den Daten deines Kindes machen — kurz und ehrlich**
>
> - Wir speichern die Fotos vom Lernmaterial nur **7 Tage**. Danach bleiben nur die daraus erstellten Fragen und Bilder (z. B. nummerierte Skizzen).
> - Alle Daten liegen bei Anbietern in der **EU**. Sie verlassen die EU nicht.
> - Wir verkaufen keine Daten. Wir zeigen keine Werbung.
> - Du kannst jederzeit **alle Daten exportieren** oder **dein Konto löschen**. Eine Löschung wird nach 7 Tagen ausgeführt — solange kannst du sie zurücknehmen.
> - Wir erfassen **anonyme Nutzungszahlen** (z. B. wie viele Lerneinheiten heute waren), um die App zu verbessern. Inhalte oder Antworten deines Kindes sind dort nicht enthalten. Du kannst das in den Einstellungen ausschalten.
> - **Fehlerberichte** enthalten keine Inhalte oder Antworten — Felder wie das, was dein Kind getippt hat, werden vorher entfernt.
> - Sprachaufnahmen verlassen das Gerät **nicht**. Nur das, was die Spracherkennung daraus macht (der getippte Text), wird verarbeitet.

The same text is translated for en, fr, es, it in `apps/mobile/locales/{lang}/legal.json`.

## 12. Audit log

For the developer's own accountability, the following are logged forever (independent of the 30-day Vertex log retention):

- DSGVO export and delete requests with completion times (24 months in `dsgvo_requests`).
- Admin endpoint accesses (`/admin/*`) with timestamp, email hash, route, response code.
- Subscription state transitions (`subscriptions` history is captured via per-row triggers writing into an append-only `subscription_history` table — added below as a small extension to doc 03 that lives in privacy-side code).

```sql
create table subscription_history (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  from_tier text,
  to_tier text,
  from_status text,
  to_status text,
  reason text,
  at timestamptz not null default now()
);
create index subscription_history_account_idx on subscription_history(account_id, at desc);

alter table subscription_history enable row level security;
-- service role only.
```
