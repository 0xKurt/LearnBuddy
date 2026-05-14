# 05 — Mobile App

The mobile app is built with Expo and React Native. This document is the canonical spec for screens, components, behaviors, and offline/sync semantics.

Cross-references: doc 03 for the local DB schema, doc 04 for API contracts, doc 07 for content types and the MathLite spec, doc 08 for credit-driven UX thresholds.

## Surfaces

The app has two surfaces:

- **Learner surface** — the everyday experience: capturing material, studying, getting feedback. This is what most of the app looks like, and most time is spent here.
- **Admin surface** — anything that affects account, subscription, profile management, settings, or data. Always gated by biometric or PIN.

The admin surface is **always** behind authentication, regardless of whether the account has any minor profiles. This is a deliberate choice: it's one frictionless biometric tap for the account holder, and it protects the account from anyone else picking up the phone.

A learner using a minor profile who tries to open admin sees a friendly redirect: "Dafür brauchen wir eine erwachsene Person. Gib das Handy bitte weiter." With a single button to invoke the biometric prompt.

## Modes vs profiles

There is no "kid mode" / "parent mode" toggle. Instead:

- The phone is in the **learner surface**. The single learner profile on the account is active.
- The active profile is shown in the header (avatar + name).
- Tapping the avatar header opens the admin unlock screen (biometric / PIN).
- Each account has exactly one learner profile. No profile picker, no switching.

## Navigation structure

`expo-router` file-based routes.

```
app/
├── _layout.tsx                              # root provider stack
├── (onboarding)/
│   ├── welcome.tsx                          # language picker
│   ├── age-check.tsx                        # "wie alt bist du?"
│   ├── hand-off-to-adult.tsx                # under-16 friendly redirect
│   ├── account-signup.tsx                   # email + password
│   ├── verify-email.tsx
│   ├── consent.tsx                          # DSGVO acceptance
│   ├── who-uses.tsx                         # ich / andere / beides
│   ├── add-profile.tsx                      # captures the single learner profile
│   ├── profile-minor-consent.tsx            # explicit consent if profile is a minor
│   ├── pin-setup.tsx                        # biometric + PIN
│   └── hand-off.tsx                         # final entry into the learner surface
├── (learner)/
│   ├── _layout.tsx                          # learner tab bar + active-profile header
│   ├── home.tsx                             # subjects grid
│   ├── subject/[subjectId].tsx              # folders + loose materials
│   ├── folder/[folderId].tsx
│   ├── material/[materialId].tsx
│   ├── capture.tsx
│   ├── session/[sessionId].tsx
│   ├── practice/[templateId].tsx
│   └── result.tsx
├── (admin)/
│   ├── _layout.tsx                          # admin tab bar
│   ├── unlock.tsx                           # biometric / PIN gate
│   ├── overview.tsx                         # per-profile progress overview
│   ├── profile/[profileId].tsx              # drill into one profile's data
│   ├── profile/[profileId]/material/[materialId].tsx
│   ├── profile/[profileId]/edit.tsx
│   ├── profile/[profileId]/notifications.tsx
│   ├── archived.tsx                         # restore archived subjects/folders/materials/profile
│   ├── settings/account.tsx                 # email, password, PIN, biometric
│   ├── settings/privacy.tsx                 # analytics opt-out, consent review
│   ├── subscription.tsx                     # tier, renewal, upgrade, cancel
│   ├── data.tsx                             # export, delete account, pending-deletion banner
│   └── about.tsx                            # legal, version, support
├── login.tsx                                # returning user
└── reset-password.tsx
```

## Onboarding

Order of screens varies by age and intent. The flow is data-driven from `who-uses` selection.

### 1. Welcome

Language picker (auto-detected from device locale). "Weiter" button.

### 2. Age check

A single question: "Wie alt bist du?" with a date-of-birth picker or a simple year picker. Used to:
- Branch the flow (under-16 vs. 16+)
- Pre-fill the account holder's own profile birth year if they're a learner

If under 16 → goes to `hand-off-to-adult`. Otherwise → `account-signup`.

### 3. Hand-off to adult (under-16 only)

A clear, friendly screen: "Wir brauchen eine erwachsene Person, die das Konto einrichtet. Gib das Handy bitte an einen Elternteil oder eine andere erwachsene Bezugsperson." A "Eine Mama / Papa / erwachsene Person hat das Handy jetzt" button restarts the flow at `age-check` (where the adult enters their own age).

### 4. Account signup

Email + password, or a "Per Magic-Link einloggen" button (sends an email with a deep link). Calls `POST /auth/account/signup` on submit.

### 5. Verify email

Polls Supabase auth state. Deep-link handling: tapping the verification link in the email returns the user here with the session ready.

### 6. Consent

DSGVO consent screen. Shows the German plain-language summary from doc 09 §11 prominently. Two unticked checkboxes:
- "Ich bin 16 Jahre oder älter."
- "Ich willige in die Verarbeitung meiner Daten ein."

If the account holder will be adding a minor profile, a third checkbox appears later, on the per-minor consent screen, not here.

Continue disabled until checked. On accept, calls `POST /auth/account/consent` with the current consent version constant from `apps/mobile/lib/legal/consent.ts`.

### 7. Who uses the app

"Wer wird die App benutzen?"
- "Ich selbst" → goes to `add-profile` pre-filled with the account holder's birth year, then to `pin-setup`
- "Mein Kind" → goes to `add-profile` for a minor profile (separate person from the account holder), then to `pin-setup`

Exactly one profile is created. To support multiple learners, separate accounts are required.

### 8. Add profile

Form:
- Display name (required, free text)
- Birth year (required, drives minor/adult classification)
- Grade / level (Grundschule 1–4, Mittelstufe 5–10, Oberstufe 11–13, Studium, Erwachsenenbildung)
- Avatar (a curated set of icons / colors — designer's pick)
- UI language (defaults to account locale)
- Preferred answer mode (default: voice)

If the entered birth year places the profile under 16, the next screen is `profile-minor-consent`. Otherwise the flow continues.

After saving (`POST /learners`), the user taps "Weiter." Only one profile is created during onboarding.

### 9. Minor consent

If the profile being created is a minor, an explicit consent screen appears: "Ich willige in die Verarbeitung der Daten von [Name] ein. [Name] ist unter 16 Jahre alt." Check, continue. Consent is recorded with profile id, version, timestamp via the `POST /learners` call's body.

### 10. PIN setup

Account holder sets up either biometric (Face ID / Touch ID / Android equivalent) or a 4-digit PIN, or both. Stored in `expo-secure-store`. Mandatory — cannot be skipped.

### 11. Hand-off

Final screen of onboarding. "Es kann losgehen!" with a single button. Tap drops directly into the learner surface.

## Learner surface

### Header

Avatar + first name of the active profile. Tap or long-press opens the admin unlock screen (biometric / PIN). For a minor profile, this is how the account holder reaches admin — the unlock still requires the account holder's biometric / PIN, so the minor cannot enter admin themselves.

### Home (`/(learner)/home`)

- Warm greeting line. No pending-task counter, no "X Fragen warten auf dich," no count of unfinished items anywhere on this screen.
- Grid of subject tiles. Each tile shows subject name, color, icon, and (only when a folder inside has a `scheduled_for` date in the next 7 days) a small "Test in 3 Tagen" chip. No question counts.
- Floating "+" button — adds a new subject. For minor profiles, this prompts admin unlock first.
- Pull-to-refresh runs an outbox drain + full pull of subjects, folders, recent materials.

### Subject (`/(learner)/subject/[subjectId]`)

- Tabs: "Ordner" and "Material". The "Ordner" tab lists the subject's folders (with their optional date chips). The "Material" tab lists materials not in any folder.
- Big "Üben" button at the bottom — starts a session over the subject's items. The repetition engine quietly picks which items to ask; the learner is never shown the queue size.
- Tapping a folder drills into the folder's materials. The folder screen has its own "Üben" button restricted to that folder's items.
- Each material row shows thumbnail (if a study asset exists, else a generic icon), title, and a small "Üben" affordance.
- Each material has a "Mehr Fragen" affordance.
- Long-press a material → context menu with: rename, move to folder, archive.

### Folder (`/(learner)/folder/[folderId]`)

- Header shows folder name and date chip if present.
- List of materials in this folder.
- "Üben" button at the bottom.
- "+ Material hinzufügen" button — opens capture flow pre-targeting this folder.

### Capture (`/(learner)/capture`)

Image quality thresholds (computed locally in `apps/mobile/lib/camera/quality.ts`):

- **Resolution** — captured photo must be ≥ 800 × 600 pre-resize. Lower-resolution cameras downgrade.
- **Blur** — Laplacian-variance score on a 256-px-wide grayscale downscale.
  - ≥ 100: green, "scharf"
  - 60–100: yellow, "ok"
  - < 60: red, "verschwommen — Versuch nochmal"
- **Brightness** — mean luminance in [50, 220].
  - < 50: red, "zu dunkel"
  - > 220: red, "zu hell"
  - 50–220: green
- **Tilt** — gyroscope reading. Warn at > 25° from horizontal but don't block.

Red state shows a non-blocking "Trotzdem behalten" button. Scores are sent to the API in `client_quality_scores`.

The learner can take 1 to 10 photos per material. Thumbnail strip below; long-press to delete. "Fertig" proceeds to the subject / folder picker (if not pre-targeted).

After upload, progress screen with phases mapped to SSE events from `POST /materials`: "Bilder werden gelesen," "Fragen werden erstellt," "Letzter Schliff." On `done`, the learner sees the generated items.

### Material (`/(learner)/material/[materialId]`)

- List of items.
- "Mehr Fragen" button → `POST /materials/:id/regenerate-items`. Style selector: "Einfacher" / "Schwieriger" / "Andere Art".
- Long-press an item → delete it (with confirmation; soft-archived for 30-day recovery via admin).
- "Diesen Stoff üben" button → session restricted to this material.
- Long-press material title in header → rename, move, archive.

### Session (`/(learner)/session/[sessionId]`)

Sequential item presentation. Header shows progress (e.g. "5 / 18"). Exit button confirms.

Item screen has:

- **Stimulus area** (top): renders the item's stimulus per doc 07 §2.
- **Question text**: renders LaTeX in `$...$` spans via `<LatexText>`.
- **Answer area**: depends on `answer_kind`:
  - `short`, `long`, `diagram_label`: `<TextInput>` + voice button.
  - `numeric`: `MathInput` numeric mode.
  - `formula`: `MathInput` formula mode with live KaTeX preview and MathLite keyboard.
  - `multiple_choice`: tappable options (possibly with mini-stimuli).
  - `fill_blank`: inline `<TextInput>` slots inside the template text.
- **Hint button** ("Tipp"): visible after a wrong/partial answer until two hints used.
- **"Erklär mir das" button**: calls `POST /explain`, streams into a modal.

Flow per attempt:

1. Learner submits an answer.
2. `localEvaluate` runs.
3. `correct` → brief positive feedback ("Stimmt!") for 600 ms, advance.
4. `unknown` → "Wird überprüft…" + stream `POST /attempts`. Render verdict, feedback, hint as they arrive.
5. Up to two retries with hints. After third try, the model reveals the answer kindly via the `done` event.

In **Test-Modus**:
- No hints, no explain button.
- Feedback hidden until session ends.
- Result screen shows correct vs. incorrect summary and missed questions.

### Practice (`/(learner)/practice/[templateId]`)

Generated variants from one problem template. See doc 07 §6.3.

- Header shows topic and "Übung 3 / 10".
- Each variant uses `MathInput`/numeric flow.
- Local evaluator handles all grading.
- After 10 variants (or quit), result screen shows correct count, avg time, next-run difficulty adjustment. Calls `PATCH /templates/:id/practice-run/:run_id`.

### Result (`/(learner)/result`)

Summary at session end:
- Items practiced
- Items now mastered
- Items still uncertain
- Streak update (no shaming if streak broken — just "Heute geübt!")
- "Nochmal mit den schwierigen" button → focused session on items wrong/partial this run

## Admin surface

Always entered through `unlock.tsx` — biometric prompt, with PIN fallback if biometric fails or is disabled.

### Unlock (`/(admin)/unlock`)

Biometric prompt fires automatically. PIN entry shown as a numeric pad below. After 5 wrong PIN attempts in 5 minutes, PIN is locked for 15 minutes; biometric (if enabled) still works. If both are unavailable for any reason, "Passwort verwenden" falls back to re-entering the account password.

### Overview (`/(admin)/overview`)

Shows the account's single learner profile directly — no list. Profile card at the top (avatar, name, streak, this-week minutes), with drill-in below.

- Calls `GET /learners/:learnerId/schedule-summary` for the account's profile on mount.
- "Profil bearbeiten" → `profile/[profileId]/edit`.
- "Benachrichtigungen" → `profile/[profileId]/notifications`.
- Bottom-tab links to subscription, settings, data.

Below the profile card: the same drill-in content as the profile screen (streak, mastered topics, struggling topics, subjects). One screen, no extra hop.

### Profile drill-in (`/(admin)/profile/[profileId]`)

(Reachable from the Overview as an explicit screen for direct deep-linking; in practice the Overview already shows this content inline.)

- Streak, weekly minutes chart.
- Mastered vs. struggling topics list.
- Subject list with material counts.
- Tap a subject → list of materials; tap a material → read-only item list.

### Profile edit (`/(admin)/profile/[profileId]/edit`)

Form: display name, birth year (changeable; recomputes minor/adult), grade level, avatar, UI language, preferred answer mode. "Archivieren" button at the bottom — moves the profile to archived state (recoverable for 30 days). Note: archiving the only profile effectively retires the account's data. The account holder can either restore from archive within 30 days, or proceed to a fresh signup with the same email (after the archived profile is hard-deleted by cron).

### Profile notifications (`/(admin)/profile/[profileId]/notifications`)

Toggles for the profile:
- Practice nudge: on/off + time picker
- Test heads-up: on/off
- All off by default.

### Archived items (`/(admin)/archived`)

Tabbed list of archived subjects, folders, materials, items, and (if applicable) the profile itself. Each shows date archived and a "Wiederherstellen" button. After 30 days, items disappear from this list (hard-deleted by `pg_cron`).

### Account settings (`/(admin)/settings/account`)

- Change email (verifies new email before applying)
- Change password
- Change / reset PIN
- Toggle biometric

### Privacy settings (`/(admin)/settings/privacy`)

- Analytics opt-out toggle (disables PostHog SDK on next launch)
- Consent review: shows what was consented to, when, version
- "Datenschutz lesen" link to the full policy (web view to the legal URL)

### Subscription (`/(admin)/subscription`)

- Current tier, status, expiry / trial end
- "Auf Plus upgraden" / "Auf Standard downgraden" buttons (RevenueCat purchase flow)
- "Verwalten" deep link to App Store / Google Play subscription management
- "Abo kündigen" → confirms, kicks off cancellation via RevenueCat

### Data (`/(admin)/data`)

- "Alle Daten exportieren" → `POST /dsgvo/export`. Shows pending state ("Wird vorbereitet — du bekommst eine E-Mail").
- "Konto löschen" → `POST /dsgvo/delete-account` after re-typed email confirmation. Shows the 7-day pending state with "Doch nicht löschen" until the deadline.

## Key components

### `<LatexText>`

Parses string for `$...$` and `$$...$$`. Renders text as `<Text>` and math as `<KatexView>`. Caches rendered HTML keyed by content + size.

### `<MathInput>`

Single-line math input with live preview.

```ts
type MathInputProps = {
  value: string;
  onChange: (next: string) => void;
  onSubmit?: () => void;
  expectedKind: 'numeric' | 'formula';
  units?: string;
  placeholder?: string;
  voiceEnabled?: boolean;
};
```

- `<TextInput>` row at top.
- Live MathLite-to-LaTeX parse on each keystroke, debounced 80 ms. Successful parse → KaTeX render below. Parse failure → raw text in muted style with a small tooltip.
- Toggle to switch keyboard from native to `MathKeyboard`.
- Toggle to start voice input.
- If `units` set, non-editable suffix chip.

### `<MathKeyboard>`

Custom soft keyboard. Buttons emit MathLite syntax.

- Rows of one-handed-touch buttons. Layout adapts to portrait/landscape and answer kind.
- Operators: `+ − × ÷ = ( )`.
- Special: `x²`, `xⁿ`, `√`, `π`, `Δ`, `≤`, `≥`, fraction template `▢/▢`, subscript template.
- "MEHR" key for subject-specific symbols (`°`, reaction arrow, vector arrow, etc.).
- Shows above the system keyboard area; toggleable.

### `<FunctionPlot>`, `<SvgStimulus>`, `<DiagramQuestion>`, `<VoiceButton>`, `<FillBlank>`

Per doc 07 specs. Behavior:
- `<FunctionPlot>` — `victory-native`, evaluates expression with `mathjs` at 200 points, pinch-zoom enabled.
- `<SvgStimulus>` — `react-native-svg`, runtime element/attribute whitelist as defense in depth.
- `<DiagramQuestion>` — study-asset PNG with pinch-zoom, animated highlight ring on asked marker.
- `<VoiceButton>` — `expo-speech-recognition`, tap to start, auto-stop on 1500 ms silence, live transcript above input.
- `<FillBlank>` — inline `<TextInput>` slots, auto-advances focus on submit.

## Voice input

- `expo-speech-recognition` everywhere voice answers happen.
- Recognizer's locale follows the learner's `ui_locale` (or the material's `language` for foreign-language subjects).
- Audio never leaves the device.
- VAD-driven auto-stop at 1500 ms silence.
- iOS: `NSSpeechRecognitionUsageDescription` + `NSMicrophoneUsageDescription` with copy adapted to age (defaults to German formal "Sie" — the OS prompt is shown to whoever is using the phone, including the account holder during onboarding).
- Android: `RECORD_AUDIO` with rationale at first use.

## Voice output

- `expo-speech` reads questions aloud when learner taps the speaker icon.
- Default voice: best native voice in learner's `ui_locale`. Falls back to system default.
- Auto-read on item display is a per-profile preference, off by default.

## Local DB

Drizzle ORM over `expo-sqlite`. Schema mirrors server (doc 03) with mobile-only additions:

```ts
export const outboxLocal = sqliteTable('outbox_local', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  payload: text('payload', { mode: 'json' }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  runAfter: integer('run_after', { mode: 'timestamp' }).notNull(),
  doneAt: integer('done_at', { mode: 'timestamp' }),
});

export const syncState = sqliteTable('sync_state', {
  id: integer('id').primaryKey(),
  lastFullPullAt: integer('last_full_pull_at', { mode: 'timestamp' }),
  lastOutboxDrainAt: integer('last_outbox_drain_at', { mode: 'timestamp' }),
  activeLearnerId: text('active_learner_id'),
});
```

Tables NOT mirrored locally: `credit_buckets`, `credit_events`, `subscriptions`, `outbox`, `dsgvo_requests`, `material_photos`, `subscription_history`.

## Offline-first behavior

- Screen mount: query loads from SQLite first, returns instantly. Background fetch revalidates against the API.
- Writes always SQLite first, then enqueue an `outbox_local` row.
- Sync engine runs: on app foreground, on network reconnect (NetInfo), every 60 s while foregrounded.

## Sync engine

### Drain

Reads `outbox_local` rows ordered by `created_at`:

| Kind | API call |
|---|---|
| `attempts_batch` | `POST /attempts/batch` |
| `pending_attempt_eval` | `POST /attempts` (streaming concatenated) |
| `practice_run_summary` | `PATCH /templates/:id/practice-run/:run_id` |
| `practice_run_start` | `POST /templates/:id/practice-run` |
| `subject_create` | `POST /learners/:learnerId/subjects` |
| `subject_update` / `subject_archive` | corresponding endpoints |
| `folder_create` | `POST /subjects/:subjectId/folders` |
| `folder_update` / `folder_archive` | corresponding endpoints |
| `material_archive` / `material_update` | corresponding endpoints |
| `item_archive` | `DELETE /items/:id` |
| `learner_settings_update` | `PATCH /learners/:id` |

2xx → mark `done_at`, delete row after 24 h.

4xx (validation/conflict) → mark failed with `last_error`. Surfaced in admin "Synchronisierungsproblem" banner only. Learner surface never shows sync errors.

5xx / network failure → increment `attempts`, set `run_after = now() + min(2^attempts, 300) seconds`, retry later.

### Pull

After drain succeeds:
- `GET /account` to refresh account + profiles + subscription
- For active profile: `GET /learners/:learnerId/subjects`, then `GET /materials/:id` for recent materials
- `GET /learners/:learnerId/schedule-summary` to refresh notifications schedule

Pulls update SQLite via Drizzle transactions. TanStack Query cache invalidated for affected keys.

## Conflict resolution

Server is authoritative.

- `attempts` append-only; client uses `client_id` for idempotency.
- `item_states` server-recomputed from replayed attempts. Mobile discards local state and re-fetches.
- `subjects`, `folders`, `materials`, `items`, `learners`: LWW by `updated_at`. Pull replaces local rows wholesale.
- `problem_templates` server-created only; mobile only archives.
- `practice_runs`: client creates with `client_id`. Server upserts.

## Notifications

`expo-notifications` schedules local notifications only. Scheduler in `apps/mobile/lib/notifications/`.

### Categories

All notifications are **off by default**. The account holder enables them for the profile in the admin surface. Framing always informational, never demand-y.

1. **Practice nudge** — opt-in. Fires at the account-holder-set time (default 16:30) at most once per day, only on days the profile hasn't opened the app. Body: "Lust auf eine kleine Übungsrunde?" No item counts, no missed-day references.
2. **Test heads-up** — opt-in (default on if the account holder has set folder dates). Fires at 09:00 on:
   - 3 days before `scheduled_for` ("In 3 Tagen ist dein Bio-Test.")
   - 1 day before
   - Morning of ("Heute ist dein Bio-Test. Viel Erfolg!")

The streak counter is shown only on the post-session result screen and on the admin overview. **No** notification triggered by streaks or missed days. The learner never receives a message warning them they will "lose" anything.

Permission requested from the account holder in admin when first enabling any category — never asked from the learner in the learner surface.

The scheduler cancels and re-schedules on every refresh — no orphan notifications remain after a folder is archived.

## Error states UX

| Error | Learner sees | Recovery |
|---|---|---|
| Network down at session start | Banner "Offline — du kannst weiter üben" | Continue with local items |
| Network down mid-attempt with `unknown` local verdict | "Antwort gespeichert — wird später überprüft" | Outbox enqueues for finalize |
| `POST /materials` 402 insufficient_credits | "Heute habt ihr schon viel geübt — versucht es morgen wieder!" + admin banner | Soft-cap UX per doc 08 |
| Vision fails (`extraction_failed`) | "Hmm, die Bilder sind nicht gut genug. Versuchen wir's nochmal?" | Returns to capture; credit refunded |
| Vision returns `not_educational` | "Das sieht nicht nach Lernstoff aus. Magst du was anderes fotografieren?" | Returns to subject |
| Vision returns `unreadable` | "Wir konnten den Text nicht lesen. Vielleicht mit mehr Licht?" | Returns to capture; credit refunded |
| Unhandled crash | "Etwas ist schiefgelaufen" + "Neu starten" button + Sentry report | App restart |
| Subscription expired | Admin: "Dein Probemonat ist vorbei — jetzt abonnieren". Learner: existing items + practice runs work; "Mehr Fragen" / "Erklär mir das" disabled with a message. | Account holder renews |
| Subscription expiring soon | Admin only: small banner 7 days before trial / subscription end | Account holder reviews |
| Empty subject (no materials yet) | "Hier ist noch nichts. Fotografier dein erstes Material!" + camera button | Capture flow |
| First-ever launch, no profile data | Onboarding | — |
| Login on new device | Login screen → after auth, full pull populates local DB | Standard login |
| Admin PIN locked (5 wrong attempts) | "Bitte 15 Minuten warten oder mit dem Konto-Passwort entsperren" | Wait or use password |
| Long absence return | Plain warm welcome; no "you missed N days" framing | — |

## Edit and delete patterns

A consistent pattern across the app:

- **Rename**: tap title or long-press → context menu → "Umbenennen" → text field → save.
- **Move** (material): long-press → "Verschieben" → picker showing other folders / "Ohne Ordner."
- **Archive** (subject, folder, material, item, profile): long-press / context menu → "Archivieren" → confirm. Soft delete with 30-day recovery via `(admin)/archived`. Minor profiles cannot archive subjects/folders/materials — admin unlock required. They can archive (delete) bad individual questions during a session.
- **Restore**: admin → archived → tap "Wiederherstellen."
- **Hard delete**: only happens automatically after 30 days, or via the DSGVO account-deletion flow.

For long-press menus on the learner surface where the profile is a minor:
- Available actions: delete an individual question, request more questions for a material
- Locked actions (admin unlock prompted): archive subject/folder/material, edit subject/folder/material metadata, change profile settings

## Internationalization

`i18next` with `i18next-icu` for pluralization and gender.

- One JSON file per language per namespace: `locales/{lang}/{namespace}.json`.
- Namespaces: `common`, `onboarding`, `learner`, `admin`, `errors`, `legal`.
- All keys live in code; no remote loading.
- Active language: learner's `ui_locale` in learner surface, account's `locale` in admin.
- Date / number / time formatting via `Intl.*` with the active locale.

Legal namespace contains DSGVO consent text and privacy summary, versioned in code. All five languages ship complete at launch; fr/es/it have human-reviewed legal namespace, machine-translated + human-reviewed for the rest.

## Performance budgets

- Cold start to home screen: < 2 s on a 2022-era mid-range Android.
- Camera open → first photo: < 1.5 s.
- Local answer evaluation: < 50 ms.
- LLM evaluation round-trip (network excluded): < 2 s.
- Practice variant generation (10 variants): < 200 ms.

## Permissions and platform

- iOS minimum: 15.1.
  - `NSCameraUsageDescription`: "Damit du Lernmaterial fotografieren kannst."
  - `NSMicrophoneUsageDescription`: "Damit du Antworten sprechen kannst."
  - `NSSpeechRecognitionUsageDescription`: "Damit deine gesprochenen Antworten in Text umgewandelt werden können — die Aufnahme verlässt nie dein Gerät."
- Android minimum: API 26.
  - `CAMERA`, `RECORD_AUDIO`.
- Both: notifications permission requested just-in-time when the account holder enables a notification category.
- No `READ_MEDIA_IMAGES` unless album-pick is used.
