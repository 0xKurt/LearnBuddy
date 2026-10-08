# Privacy (Buddy rebuild)

Status: describes what the rebuilt system does (2026-09-25). It is an engineering description,
not legal advice; items marked **legal review** must be cleared before production use.
Architecture: [architecture.md](architecture.md). Previous specification: [legacy/09-privacy.md](legacy/09-privacy.md).

## Accounts and minors

- The **account holder** signs up with Supabase Auth (e-mail/password; the API never sees
  passwords) and accepts the current privacy text: `accounts.consent_version` must equal the
  API's `CONSENT_VERSION`, otherwise the account is not created. The text lives in the app
  (`auth:consent.*`); any change to it ships together with a new `CONSENT_VERSION`, so every
  account agrees again (2026-09-27: the consent points were reworded). Signing up is only
  complete once the account holder clicked the link in the confirmation e-mail — Supabase Auth
  enforces that, there is no session before it — and the mail says in as many words that the
  click confirms the consent just given (`docs/consent-email-templates.md`), so the e-mail loop
  is the verifiable step the EDPB describes for a parent's consent (Guidelines 05/2020 on
  consent, Example 23; issue #30). It is recorded as `accounts.consent_confirmed_at` — the
  instant Supabase recorded for the click, written by the first request that carries it and
  never overwritten — and nothing is gated on it: a mail that was slow, filtered or lost never
  locks the learner out of her own learning.
- Each account has exactly one **learner profile**: the adult themselves (`relation = self`,
  only from 16 years) or a child (`relation = child`). **The age of consent is 16** (DSGVO
  Art. 8 with the German age, ADR 0006): under 16 the parents give explicit consent when they
  create the profile, and the profile is behind their PIN; from 16 she consents and decides
  herself, also on a profile her parents created — no consent box, no PIN gate. **On her 16th
  birthday the app asks her once** (issue #31, EDPB §147–149): the same privacy text, with the
  words that it is hers to decide now; agreeing is recorded as `self_consent_version` /
  `self_consent_at` (POST `/learner/consent`, no PIN, no adult). Nothing is taken from her
  while she has not answered — she is not locked out of her own learning — and the parents'
  record stays as it was: it says what carried her until then. Every child
  profile records the privacy text its account holder agreed to (`minor_consent_version` /
  `minor_consent_at`), renewed when the account holder agrees to a new text. After a
  privacy-text change the API serves nothing learner-facing until the account holder agreed
  again, and the scheduler reads no photos, runs no Buddy check, writes no conversation summary and sends no message for it
  meanwhile; for a profile under 16 that needs the PIN. Export and
  deletion keep working, also for an account that never finished its profile.
- Name and birth date can be corrected (GDPR Art. 16) in the parents' area; for a profile under
  16 a birth-date correction needs the PIN and is checked against the same age rules.
- The birth date is stored to know whether the learner is under 16 and to pitch the language;
  the display name can be a nickname.
- **The Bundesland of her school** (`learners.curriculum_region`, issue #199) is asked once, as a
  required field during registration, and stored as one of sixteen fixed codes (the ISO 3166-2:DE
  codes in lower case) or `other` for a school outside Germany. **Purpose:** the curriculum is a
  matter for the states, and at twelve verified places in
  [lehrplan-und-uebungsformen.md](lehrplan-und-uebungsformen.md) the same answer is right in one
  state and wrong in another — so without it Buddy can practise something with her that counts as
  a mistake in her own class test. **Was der Wert heute tatsächlich bewirkt** (Issue #214, seit
  02.10.2026 — und das ist die Liste der Stellen, die ihn lesen, nicht die der geplanten): das
  Fachwissen dazu liegt als Tabelle im Code (`apps/api/src/modules/curriculum/points.ts`) — zwölf
  Stellen, je Bundesland eine Regel mit Lehrplanquelle. Gelesen wird der Wert an drei Stellen:
  (1) beim **Schreiben** von Aufgaben (aus einem Thema und aus einem fotografierten Blatt) steht
  die Regel ihres Landes im Modell-Auftrag; (2) beim **Beurteilen** einer Antwort steht sie vor dem
  Urteil; (3) in einem **Übungstest** lässt der Code eine Frage weg, die ihr Land in ihrem Jahrgang
  nicht unterrichtet (in freier Übung nie — dort fragt sie, was sie will). Mehr wird mit dem Wert
  nicht getan: er steuert keine Inhalte, keine Werbung, keine Zielgruppe, kein Modell-Training.
  **Wenn das Land unbekannt ist** — `other`, kein Wert, oder eines der zehn Länder, für die noch
  kein Lehrplan gelesen wurde — wird **keine** Landesregel angewandt; das Urteil fällt dann
  zurückhaltender aus (nie „falsch" allein wegen der Wortwahl), statt sicher falsch zu liegen.
  Diese drei Fälle sind im Code derselbe Pfad und derselbe Text. **Berichtigung (Art. 16):** der Wert ist
  in den Einstellungen unter „Bundesland" jederzeit änderbar, über dasselbe Auswahlfeld wie bei
  der Registrierung und ohne PIN — eine Hürde würde genau die Korrektur verhindern, für die der
  Weg da ist, und ein falscher Wert hier schadet niemandem (Issue #216). It is not an address and not a location: it is a choice from a
  list of sixteen, it is never derived from the device, the IP address or any position, and it is
  not used for anything but which curriculum rules apply. **Retention:** until deletion, with the
  rest of the profile (`learners`); it is in `GET /account/export` with the other profile fields
  and is removed by the account deletion with the learner row. It can be corrected like the name
  (GDPR Art. 16; for a profile under 16 in the parents' area). **Null is a valid state:** every
  profile created before this was introduced has no value, nothing in the app blocks or fails on
  it, and Buddy then applies no state-specific rule at all rather than guessing one.
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

| Data                                                                                                                      | Where                                                                                     | Retention                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account, consent, PIN hash                                                                                                | `accounts`                                                                                | until deletion                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Wrong-PIN and request counters (counts and times only)                                                                    | `attempt_counters`                                                                        | until deletion                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Learner profile (name, birth date, level, grade, language, the Bundesland of her school)                                  | `learners`                                                                                | until deletion                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Conversation with Buddy                                                                                                   | `buddy_messages`                                                                          | until deletion                                                                                                                                                                                                                                                                                                                                                                                                                    |
| What Buddy knows, with the learner's own words as source                                                                  | `buddy_memories`                                                                          | until deletion; a removed or corrected item is erased (with its quote and its copies in Buddy's audit trail) 7 days after the removal — the undo window; temporary situations end by themselves (≤ 60 days) and are erased 7 days later; an item the nightly consolidation said once together with others (`merged_into`) or that a newer one contradicted is closed the same way and erased after the same 7 days (issue #20)    |
| What was talked about on earlier days (two to four sentences the model wrote about a conversation that ended, issue #22)  | `buddy_session_summaries`                                                                 | until deletion (with the learner); an account deletion removes them with the cascade                                                                                                                                                                                                                                                                                                                                              |
| Her own consent from her 16th birthday (version and time; the parents' record stays as it was, issue #31)                 | `learners.self_consent_version`, `self_consent_at`                                        | until deletion                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Goals, steps, decisions, actions (audit of what Buddy did and why)                                                        | `buddy_goals`, `buddy_steps`, `buddy_decisions`, `buddy_actions`                          | until deletion — **what the model wrote while deciding** (`buddy_decisions.output`, `errors`, `triggers`: the reply, what it quoted from her) is erased after **90 days**; the shape of the decision (disposition, model, prompt version, time) stays for the audit (issue #78)                                                                                                                                                   |
| Contact settings, push tokens, messages outside the app and their delivery status                                         | `buddy_settings`, `push_tokens`, `buddy_outreach`                                         | until deletion                                                                                                                                                                                                                                                                                                                                                                                                                    |
| A random install id (never derived from the hardware) binding push tokens to one learner per device                       | `push_tokens.device_id`; on the device `lb.install_id`                                    | until deletion (server); on the device until the app is removed                                                                                                                                                                                                                                                                                                                                                                   |
| Photos and PDFs of study material                                                                                         | Supabase Storage, private bucket `material-photos`                                        | **7 days after reading** (also when unreadable); at once when it is not learning material (also a single such photo among the pages of a sheet); right after the reading for a corrected class test (it shows a grade, issue #259); immediately when the learner deletes the material (and again 2 hours later for photos that were still on their way). A Storage outage delays this: the deletion is retried until it succeeded |
| Concept-image crops: small real crops of teaching figures, cut from the photos and shown beside the questions (issue #50) | Supabase Storage, private bucket `material-photos`; one row per crop in `material_images` | derived learning content like the transcription — until the material (or the last question showing the crop) or the account is deleted, **not** the 7-day photo retention. Deleting queues the Storage paths durably (`storage_deletions`, retried until Storage confirmed)                                                                                                                                                       |
| Photos not yet sent, and sent photos on the phone                                                                         | the app's own storage on the device (browser: its local storage)                          | unsent: until sent or discarded, at most 7 days; sent: 1 day (for the notice about a page that could not be read)                                                                                                                                                                                                                                                                                                                 |
| The last conversation with Buddy and the profile, kept for an instant start                                               | the app's own storage on the device (browser: its local storage)                          | only settled data (no card, notice or message still being answered); replaced by each newer copy; removed at sign-out and whenever the session ends, together with every other copy on that device (`lib/api/persist.ts`)                                                                                                                                                                                                         |
| Voice recordings (speaking practice; spoken messages/answers when the device cannot recognise speech itself)              | not stored — sent once to the model (Vertex AI, EU) and discarded                         | never stored; only the written result (judgement or text) is kept where it is used                                                                                                                                                                                                                                                                                                                                                |
| A photo of her own working for one question, and the lines copied from it (issue #444)                                    | not stored — sent once to the model (Vertex AI, EU) and discarded                         | never stored, neither the photo nor the copy (no Storage); the copy goes into her answer field on the phone, and only what she then sends herself is kept, like any typed answer (`practice_turns`)                                                                                                                                                                                                                               |
| Buddy's spoken audio (natural voice, ADR 0008)                                                                            | `speech_cache` (key = hash of voice, rate and text; the text itself is not stored)        | **24 hours**, deleted by the scheduler; with the learner on deletion                                                                                                                                                                                                                                                                                                                                                              |
| Voice-picker sample audio (fixed app sentences, no learner content)                                                       | `speech_cache_shared` (key = hash of voice, rate and text)                                | **90 days**, deleted by the scheduler; not learner data — shared by all accounts                                                                                                                                                                                                                                                                                                                                                  |
| Which kind of page it was: a worksheet, a corrected class test or a notebook entry (issue #259) — never a grade or points | `materials.source`                                                                        | with the material                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Transcribed text and questions from the material                                                                          | `materials`, `items`                                                                      | until the material (or the question) or the account is deleted: deleting erases the text, the questions and the answers given to them within minutes; what remains is a row with ids, dates and counts                                                                                                                                                                                                                            |
| Search passages of the transcription and their embedding vectors (hybrid material search, issue #23)                      | `material_passages`                                                                       | derived learning content like the transcription — deleted with the material (cascade) and in the account deletion's content stage; the embedding is computed on Vertex AI (EU region) and stored only here                                                                                                                                                                                                                        |
| Spots of a page the reading could not decide, the readings offered and the one she picked (issue #164)                    | `material_unclear_spots`                                                                  | content of the sheet — deleted with the material (`purgeContent`) and with the account                                                                                                                                                                                                                                                                                                                                            |
| Practice sessions, answers, spaced-repetition state                                                                       | `practice_sessions`, `practice_turns`, `item_states`                                      | until deletion (answers and state of a deleted question: with the question)                                                                                                                                                                                                                                                                                                                                                       |
| What happened, for Buddy to react to (material read, practice finished; ids and counts only)                              | `buddy_events`                                                                            | until deletion                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Which progress Buddy named in the chat ("was shaky, now sits": topic, when, the message)                                  | `buddy_lookbacks`                                                                         | until deletion                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Model usage (tokens, cost, outcome — no content)                                                                          | `llm_calls`, `usage_daily`                                                                | `llm_calls` rows are deleted after **180 days** (bookkeeping, never content); `usage_daily` until deletion                                                                                                                                                                                                                                                                                                                        |
| Background work planned or done for the learner (kind, time, ids, outcome)                                                | `jobs`                                                                                    | until deletion                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Photo paths whose deletion Storage still owes after an account deletion (account/material ids only)                       | `storage_deletions`                                                                       | until Storage confirmed the deletion                                                                                                                                                                                                                                                                                                                                                                                              |

Logs contain route names and error classes only — no request bodies, messages or answers.

A concept-image crop is cleaned up in greyscale, or **in colour** where the colour is part of what
the figure shows — a map, a chart with a colour key, an indicator strip, a stained specimen (issue
#223 point 1). It is the same data either way: a small real crop of her own page, in the row and
with the retention above. Nothing else is kept because of it, and no new kind of thing is read out
of a photo.

**A corrected class test** (issue #259) carries more than a worksheet: a grade, points, the
teacher's remarks, often her name — about a minor, judged by her school. What the app needs from
it is only which tasks were marked wrong, so that is all it keeps, and code enforces it, not the
prompt: the reading's schema has no field for a grade or points; the stored transcript is built
by code from the marked tasks as printed, never the model's faithful transcript; the questions
are new tasks of the same kind; no unclear spot and no figure crop is kept from it; and its
photos are deleted right after the reading instead of after a week (a test with nothing marked:
at once, like a photo that is not learning material). The grade is never shown back to her and
Buddy is told never to ask for it. Two free-text fields remain that the model writes — the
sheet's title and a question's topic — and the prompt forbids a grade or name in them; a test
that scans every stored row for one is in `material-sources.int.test.ts`, but on real photos
that is a prompt rule and is measured by the eval #259 asks for, not proven. A failed reading
(blurry, an outage) keeps the photos for the normal week, because "Nochmal lesen" needs them; a
notebook entry is her own notes and is kept like any page.

These retention rules are not just promised, they are watched (issue #78): every completed
sweep records when it ran and how many rows it removed — counts only, never content — and
`GET /health` reports it (`scheduler.retention`). A monitoring check
(`.github/workflows/health.yml`) turns red when the sweeps have not completed for 24 hours.

## Access control

- The app only talks to the API. The API connects to Postgres with its own role — versioned in
  `infra/supabase/templates/api-role.sql` and tested by running the API as it
  (`api-role.int.test.ts`): no superuser, no DDL, nothing in `auth` — and scopes
  every query by the learner derived from the verified token; model output can only reference
  the learner's own rows through aliases.
- Row level security is enabled on every table **without policies**, and no database function
  is executable by the anon/authenticated roles (`0022_revoke_app_key_access.sql`): the keys
  that ship in the app can read, write or call nothing directly.
- The API reaches a non-local database only over TLS with certificate verification
  (`apps/api/src/lib/db.ts`); a connection string asking for less is refused at startup.
- Photos are uploaded with short-lived signed URLs to paths under the account id; the bucket is
  private.
  PDFs of worksheets are handled exactly like photos (same bucket, same 7-day retention and
  deletion); a PDF refused at submit (too many pages, too large, not readable) is deleted at once.
- **The app does not block screenshots** (owner's decision, 30.09.2026, issue #128). It used to:
  Buddy's home, the talk screen, the history and a practice asked Android for `FLAG_SECURE`.
  Two things settled it. A child who wants to share "10 out of 10!" is doing something right,
  and the app should not stand in the way. And the protection guarded against the wrong person
  anyway — the one holding the phone _is_ the learner.
  Verified on a device on 30.09. before removing it, which also showed the block was wider than
  this document ever claimed: `FLAG_SECURE` is a _window_ flag and expo-router runs the whole
  app in one activity, so with the home mounted underneath, **every** screen was uncapturable
  once signed in — settings, library, the adults' area included. What a learner shares from her
  own screen is hers to decide; nothing else changes about what leaves the phone.

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
- **One rule decides what a model may be told about a past message**, not one rule per path
  (`modules/buddy/recall.ts`, `buddy_messages.recall_block`, issue #149). Until 30.09. the turn
  swapped a blocked message for a fixed line while the session summariser, reading the same
  table, had none — so the one text the code swore never to resend went to the summary model,
  and a summary of a distress disclosure could come back as context while `buddy_memories`
  stayed empty as promised. A blocked message now shows the model a fixed "held back" line in a
  live dialogue and nothing at all anywhere else; a distress disclosure shows nothing to any
  model after its own turn, because a summary is stored, derived knowledge. Both stay in her
  conversation, in her export, and are deleted with it — this decides only what a model is
  told.

- **A question she keeps „für nachher" during practice** (issue #391) is not copied anywhere: it
  is her own turn in `practice_turns`, and the tutor turn after it carries `later = 'kept'` with
  the time of her tap. Only with that tap, and only once the practice is over, does Buddy's
  context show her question — her words, never the tutor's reply — for a day. It is part of her
  export and deleted with the session and the account like every practice turn. Distress is never
  offered „für nachher": it gets the fixed help answer.

- **Deleting something of hers needs her own tap**, never the model's reading of a sentence
  (`buddy_pending_actions`, issue #151). Buddy can propose; the app shows her what would go and
  she decides. Her answer, and what was proposed, are part of her export and are deleted with
  the account.

- **A roleplay sees nothing personal** (`buddy_roleplays`, issue #244, docs/architecture.md
  §Roleplay). An in-role turn sends the model only the stored frame (language, scene, role, the
  key points), her school level and the scene's own lines — no name, no memories, no STATE — and
  it has no tools, so nothing said in a scene is remembered or changed. The frame, the turn count
  and the checked feedback are stored in `buddy_roleplays`, part of her export and deleted with the
  account; the lines themselves are ordinary messages of her conversation.

## Export and deletion (DSGVO Art. 15, 17, 20)

- `GET /account/export` returns everything stored about the learner as JSON, immediately —
  including model usage (`llm_calls`), background jobs (`jobs`), the wrong-PIN and request
  counters (`attempt_counters`) and which spoken audio is cached (`speech_cache`: key, size and
  times, not the audio). **Completeness is checked against the database catalogue, not a list**
  (`apps/api/src/__tests__/export-completeness.int.test.ts`, issue #32): every column naming a
  learner or an account cascades from it on deletion, and every such table is in the export — a
  new table without an export entry fails the test. On 02.10.2026 it found three tables the
  export had missed (`material_unclear_spots`, `speech_cache`, `attempt_counters`); all three are
  exported now. For a minor the export sits behind the parents' PIN and contains the whole
  conversation; Buddy tells her so when she asks (`docs/dpia.md` R7).
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

## Folgenabschätzung

Die Datenschutz-Folgenabschätzung (Art. 35) steht in `docs/dpia.md`: Systembeschreibung,
Rechtsgrundlagen, zwölf Risiken mit den Maßnahmen, die sie tragen, die Abwägung der
Alterssicherung (EDPB Statement 1/2025 §13) und die offenen Punkte vor einem Start über den
Familienkreis hinaus.

## Processors

- **Supabase** (database, auth, storage): EU region of the project.
- **Google Vertex AI** (model): EU only — the EU multi-region endpoint `eu` (Gemini 3.6 Flash; Google
  states ML processing and storage stay in EU member states, seen as a snippet of its data-residency
  page, to be confirmed) or `europe-west4`; `global` and non-EU regions are refused at startup
  (`apps/api/src/config.ts`). **Before launch:** confirm the model is GA (Google's preview terms
  exclude services likely used by under-18s) and switch off abuse-monitoring prompt logging. Prompts contain the learner's display name and age in
  years (never the birth date), her messages, memory, goals and material text needed for the answer. **legal review:** confirm the data
  processing terms (no training on customer data) for the configured project. **Provider-side cache:** the
  prompt is layered for Gemini's implicit prefix cache (`docs/architecture.md` §Speed); for the
  same learner the reused beginning reaches into the state block and so contains her display
  name, age in years, level and language. Google documents this cache as in-memory with a 24-hour
  lifetime (its zero-data-retention page, retrieved 2026-10-02, issue #279) — the provider's
  statement, not verified by us. Whether to keep it or switch it off for the project is open
  (`docs/dpia.md` R11, §7).
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
  **While Buddy speaks in conversation mode** (barge-in, issue #35; browser and Android) the
  mic is open too, but only its **level** is read — how loud, in dBFS, every 50 ms — to notice
  that she is talking over him (`apps/mobile/lib/speech/bargeIn.ts`). Nothing of it is written
  down, sent or kept: in the browser it is an analyser on the stream (no recorder at all); on
  Android a recorder must run to meter, and its cache file is deleted the moment Buddy stops.
  Only when her voice is detected does Buddy stop and the normal listening above begin. Not on
  iOS, not with a screen reader on, and only on the conversation screen she opened.
- **Google Cloud Text-to-Speech** (Buddy's natural voice, ADR 0008): off unless
  `SPEECH_BACKEND=google`; only the EU endpoint `eu-texttospeech.googleapis.com` is accepted
  (`apps/api/src/config.ts`). **What is sent:** one sentence at a time of what the app reads
  aloud — Buddy's reply, a question, an explanation, feedback, a vocabulary word — as spoken
  words, with the language, voice and speed. Nothing else: no name field, id, age or account
  data (a sentence can still contain what Buddy said, e.g. her first name in "Super, Lena!").
  **Kept:** the audio for 24 hours in `speech_cache` (per learner, keyed by a hash). **Legal
  review:** confirm from Google's data processing terms for Cloud TTS that the text is neither
  kept nor used for training, and that the `eu` endpoint processes in EU member states (not yet
  verified live). Without it (off, offline, error), the phone's own voice reads on the device as
  before.
- **Sentry** (crash reports, optional): off unless the app is built with
  `EXPO_PUBLIC_SENTRY_DSN`; without it the SDK is never started and nothing is sent
  (`apps/mobile/lib/observability/sentry.ts`, issue #36). **EU only:** the DSN must belong to a
  Sentry organisation in the EU region — its host ends in `.ingest.de.sentry.io`, and any other
  host stops the app while it starts (`apps/mobile/lib/env.ts`), the same stance the API takes on
  a non-EU model region. An EU organisation cannot ingest via `sentry.io` at all, and source maps
  are uploaded to `de.sentry.io` (`app.config.ts`, only when `SENTRY_ORG`/`SENTRY_PROJECT` are set
  at build time). **What is sent:** only what a crash is — the error and its stack, the app
  version and build, the device model and OS version, and breadcrumbs reduced to which screen she
  came from and went to. **What is removed before sending**
  (`apps/mobile/lib/observability/scrub.ts`, unit-tested): user object (id, e-mail, IP address),
  the running request with its URL, headers and body, all free-form extra data and framework
  state, console and network breadcrumbs — the ones that would carry message text — and any
  e-mail address left in an error message. Screenshots, view hierarchies, session replay and
  performance tracing are switched off explicitly, not left to a default: a screenshot of this
  app _is_ the conversation. No learner id is set, so a report cannot be tied to an account.
  **Residual risk, named:** an exception message is written by our own code, so a future message
  could quote something the learner typed; the scrubber cannot see the difference. **Legal
  review before enabling:** the data processing agreement with Functional Software Inc. (Sentry)
  and confirmation that the EU region keeps processing and storage in EU member states.
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
