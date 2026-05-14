# 01 — Product

## Vision

A learning companion that feels like a patient tutor sitting next to the learner. Not a flashcard app, not a quiz game. The learner feeds in their actual study material — a worksheet, a textbook page, lecture notes — and the app helps them rehearse in a conversational way: it accepts paraphrased answers, gives hints instead of marking "wrong," and revisits weak spots automatically.

The app is for **anyone learning**. A nine-year-old in Klasse 4. A teenager preparing for the Abitur. A university student grinding through Anatomie. An adult studying a new language. The same product, scaled by content and tone, not split into separate apps.

## Users

### The learner
The person using the app to study. Could be 9 or 35. They have:
- A profile on an account (their own, or one managed by a guardian if they're under 16)
- A name, a birth year, a grade or level
- A language preference, an answer-mode preference
- Their own study material, subjects, folders, items, progress

The app's primary experience is "the learner's experience" — capturing material, practicing, getting feedback. Everything else is secondary.

### The account holder
The adult who legally owns the account, pays for the subscription, and authenticates with email + password (or magic link) and biometric / PIN. By DSGVO Art. 8, the account holder must be 16+ in Germany.

The account holder can be:
- The same person as a learner profile (adult learning solo)
- A different person (a guardian managing a minor's account)
- A different person who is also their own learner (a guardian who studies too)

The admin surface — subscription, profile management, settings, data export, account deletion — is always behind the account holder's biometric / PIN.

### Minor profiles
A learner profile is a **minor profile** if its birth year places the person under 16. Minor profiles trigger:
- Explicit DSGVO Art. 8 consent at profile creation (the account holder consents to processing the minor's data)
- Reading and writing aspects of the admin surface are unavailable to anyone using the minor profile directly — they have to authenticate as the account holder

An account has exactly one learner profile. If a household has two children both wanting to use the app, they need two separate accounts.

## Pricing

Two tiers via the App Store / Google Play through RevenueCat.

| Tier | Price (EU, incl. VAT) | Credits per month |
|---|---|---|
| Standard | €4.99/mo or €39.99/yr | 4,000 |
| Plus | €7.99/mo or €64.99/yr | 10,000 |

Both tiers cover one learner profile per account. The two tiers differ only by monthly credit allotment. Most learners are fine on Standard; Plus is for users who process a lot of new material per month (lots of vision calls).

A 14-day free trial of Standard is offered through Apple/Google trial mechanics on first subscription. Credits are internal accounting only and never shown to the learner or the account holder. See doc 08.

## Features

Everything below is built. No tiers within features, no labels for "later." Rough grouping, not priority.

### Account, profile, onboarding
- Age check at first launch (under-16 hands off to an adult to set up the account)
- Account holder signup with email + password and email verification, or magic link
- DSGVO consent recorded with version and timestamp
- Account setup (locale, country)
- Exactly one learner profile per account (either the account holder themselves, or a single minor profile they supervise)
- Profile fields: display name, birth year, grade/level, avatar, ui language, preferred answer mode
- Profile is marked minor or adult based on birth year; consent flow differs
- 14-day free trial via store mechanics
- Admin surface gated by biometric / PIN, set up during onboarding
- Profile archive (soft delete, 30-day recovery; restoring is the only way to "switch back" to a previous setup)
- Account deletion with 7-day cancellable hold
- Full data export as a ZIP
- Forgot-password reset via email
- Login on a new device using existing credentials (no migration needed; data lives server-side)

### Capturing material
- Camera capture with live quality feedback (resolution, blur, brightness)
- Photo retake suggestion when quality is below threshold
- Multi-photo per material (front, back, multiple pages)
- Album-pick alternative (for material already on the device)
- Add more photos to an existing material later
- Material attached to a subject; optionally placed in a folder
- Material list with regenerate-more-questions / delete / edit title / move to different folder

### Organization
- Subjects (Mathe, Bio, Englisch, Quantenmechanik, …) with custom names, colors, icons
- Folders inside a subject for grouping (chapter, topic, test prep)
- Optional date on a folder for upcoming tests, surfaced gently as "Test in N Tagen"
- Edit / archive / restore for subjects, folders, and materials
- Move material between folders or out to subject root
- Delete an individual bad question from a material
- Restore an archived item within 30 days; hard-delete after

### AI processing
- Automatic detection of material language
- Extraction of printed and handwritten text
- Subject-aware question generation (math, physics, chemistry, biology, geography, history, languages — see doc 07)
- Diagram recognition with numbered-marker study image generation
- Graph recognition for math and physics
- Problem template extraction for parameterizable math/physics problems
- Re-generation of more questions from cached extracted text without re-uploading photos
- "Easier" / "harder" / "more variety" regeneration styles
- "Not educational material" rejection with kind retry prompt
- "Couldn't read this" failure with credit refund and retry option

### Studying
- Three answer modes per item: voice, text, multiple choice
- Math input with live KaTeX preview as the learner types
- Custom on-screen math keyboard for typing formulas
- Voice answers using native on-device speech recognition
- Local-first answer evaluation with LLM fallback for uncertain cases
- Hint-based feedback that never reveals the answer until the third try
- "Explain this differently" on demand (simpler / step-by-step / analogy)
- Practice runs: generate N fresh variants of any math problem template
- Adaptive difficulty within practice runs based on rolling success rate
- Test-Modus: no hints, no explanations, simulates the real test
- Spaced repetition using the FSRS algorithm
- Quiet streak counter visible only on session result and the account holder's overview — never as pressure to "not break" it
- Quit mid-session at any time without penalty; state is preserved

### Offline
- All previously generated items available offline
- Voice and text answering offline
- Local answer evaluation runs offline
- Items the local evaluator cannot decide are queued and shown as "wartet auf Internet"
- Practice runs from problem templates work offline
- Test-Modus works offline
- Sync resumes automatically when network returns

### Notifications
- Local notifications only — no push servers, no remote scheduling
- All notifications **off by default**. The account holder enables them for the profile in settings
- Practice nudge (opt-in): gentle reminder at an account-holder-set time, only on days the learner hasn't opened the app, never with item counts, never referencing missed days
- Test heads-up (opt-in): for folders with a date, friendly heads-up 3 days before, 1 day before, and the morning of
- No streak-risk notifications. No "you'll lose your streak" messaging anywhere
- All notifications can be muted at any time

### Account-holder overview (admin surface)
- Profile view: consistency (days studied this week), weekly minutes, mastered topics, struggling topics, current streak (informational, not gamified)
- View (read-only) of generated questions per material
- Material control: edit title, move, delete, archive a subject or folder, restore from archive
- Notification settings for the profile
- Profile editing (name, avatar, grade level, etc.) and archival
- Subscription management entry point (deep link to App Store / Google Play, plus in-app upgrade)
- Data export and account deletion flows
- Change account email, password, PIN
- Manage analytics opt-out

When the account holder *is* the learner (solo adult), this view is "looking at my own progress" and "managing my own account" — the same surface, but the framing is reflective rather than supervisory.

## User journeys

### J1 — Onboarding, solo adult learner

1. Tom (25, university student) installs the app. Welcome screen, language picker. "Wie alt bist du / sind Sie?" — he enters his age.
2. Age ≥ 16 — proceeds to account creation. Email + password, verifies email.
3. DSGVO consent screen (adult self-consent version of the legal text). Accepts.
4. "Wer wird die App benutzen?" → "Ich selbst."
5. Profile setup: name, birth year (auto-set from age step), grade level (Tom picks "Universität"), avatar, language.
6. PIN / biometric setup — Tom enables Face ID.
7. Land directly in the learner experience.

### J2 — Onboarding, account holder + minor profile

1. Anna (mother of a 10-year-old) installs the app. Enters her age (45).
2. Proceeds to account creation. Email, password, verify, accept adult consent.
3. "Wer wird die App benutzen?" → "Mein Kind."
4. Minor profile setup: child's name (or nickname), birth year (10), grade (Klasse 4), avatar, ui language.
5. Minor profile triggers a small additional consent step: "Ich willige in die Verarbeitung der Daten dieser minderjährigen Person ein." Anna checks, accepts.
6. PIN / biometric setup for the admin surface.
7. "Möchtest du dem Kind das Gerät jetzt geben?" → Anna says yes. The app drops into the minor's learner experience.

If Anna wants the app for herself too, she signs up separately with a different email. One account, one learner.

### J3 — Capturing material (learner, online)

1. Learner opens the app, picks a subject (e.g. "Mathe"), optionally picks a folder ("Klassenarbeit 14.06." or "Kapitel 3").
2. Taps "Neues Material" — camera opens.
3. Takes one or more photos. Each photo is scored locally for resolution, blur, brightness. Below threshold → "Versuch nochmal — etwas schärfer." Bad photos are not blocked but are discouraged.
4. Photos uploaded to Supabase Storage via signed URLs.
5. `POST /materials` with metadata.
6. Progress screen with phases: "Bilder werden gelesen … Fragen werden erstellt …"
7. Within ~15 seconds for a typical 1–2 page material, items appear. Learner can swipe to dismiss bad ones, request "mehr Fragen," or change to "einfacher" / "schwieriger."

### J4 — Study session (learner, online)

1. Learner taps a subject → "Üben". (Or taps a folder → "Üben" to focus on that folder's material.)
2. The FSRS scheduler quietly picks items the learner would benefit from practicing right now, capped at 20 by default. The learner never sees this number or a "due" queue size — they just see the first question.
3. App shows the first item in the learner's preferred answer mode.
4. Learner answers. Local evaluator decides:
   - Clear correct → silently mark correct, advance.
   - Clear wrong / partial → call LLM for grading and a hint.
5. Up to two hints per item. After the second hint, the next "wrong" reveals the answer kindly.
6. Session ends when the queue is empty or the learner quits. Summary: items practiced, mastered, still uncertain. No "you still have X to do" framing.

### J5 — Math practice run (learner, online or offline)

1. After answering a math item with a linked problem template, the result screen shows "10 ähnliche Aufgaben üben →."
2. Learner taps. The app generates 10 fresh variants client-side using `mathjs` (zero LLM cost).
3. Each variant is answered. Local evaluator handles all grading. No LLM calls.
4. Result screen shows correct count and adjusts effective difficulty for the next run.

### J6 — Offline review (learner, no network)

1. Learner opens the app on a train. App detects no network.
2. FSRS picks items from the local DB. Learner just sees the first question.
3. Voice and text answering work fully.
4. Items the local evaluator cannot decide are marked "noch nicht bewertet — wartet auf Internet."
5. Attempts queue in the local outbox.
6. On reconnect, the outbox drains.

### J7 — Account holder reviews progress

1. Account holder unlocks the admin surface with biometric.
2. Sees the list of profiles on the account. Picks one.
3. Profile detail: this week's chart, top topics mastered, topics still struggling, streak.
4. Taps a subject → its materials → read-only items list. Sees the generated questions.
5. Optionally deletes a bad question, moves a material between folders, or archives a subject.

### J8 — Subscription change

1. Account holder enters admin surface → "Abo."
2. Sees current tier, status, expiry / trial end.
3. Taps "Auf Plus upgraden" → RevenueCat purchase sheet.
4. After successful purchase: webhook updates `subscriptions`, grants prorated credits, returns to the subscription screen.
5. Downgrade or cancel similarly. Cancel keeps the account usable until period end; afterward, new-material capture and LLM grading are disabled (existing items + practice runs still work offline).

### J9 — Forgot password

1. On login screen, "Passwort vergessen?" sends a Supabase password-reset email.
2. The email contains a deep link back into the app on the reset screen.
3. New password set; auto-login.
4. The 4-digit admin PIN is independent; if forgotten, the account holder can reset it from within the admin surface (which they got into via password / biometric reset). If both biometric AND PIN AND password are lost, the support escape hatch is account recovery via email — which boils down to the standard Supabase auth flow.

### J10 — Returning after long absence

1. Learner / account holder hasn't opened the app in 4 weeks.
2. App opens to a warm welcome — no "you missed 28 days!", no count of stale items, no nagging.
3. FSRS state has aged; items are "more due" internally, but the UI says nothing about it.
4. Account holder may need to re-authenticate biometric / re-enter PIN; learner needs nothing.

### J11 — Editing or deleting content

1. Learner spots a badly-generated question in the session. Taps "menu" on the item → "Diese Frage entfernen."
2. Confirmation: "Soll diese Frage gelöscht werden?" Confirm.
3. Item archived. Next FSRS pick skips it. Learner can restore from the admin surface within 30 days.

For subjects/folders/materials: similar long-press / context-menu pattern. Edits (rename, change color, change date) go through small forms. Archive vs. delete: archiving is the default, hard delete only via 30-day cleanup or DSGVO account deletion.

## Non-goals

Explicitly out of scope. Do not build them.

- Web app or any browser-accessible UI. Mobile only.
- Real-time multi-user features. No leaderboards, no classmate sharing.
- Teacher or school integration.
- Gamification or pressure mechanics. No XP, no levels, no virtual currency, no leaderboards, no "you'll lose your streak" notifications, no pending-task counters, no "you have X questions waiting." The streak is a quiet positive marker; nothing alarms the learner into studying.
- AI-generated illustrations or animations.
- Doing the homework. The app quizzes; it does not produce answers to assigned exercises.
- Voice cloning, premium voice packs, or third-party TTS providers. Native TTS only.
- Handwriting recognition for learner input (learners type or speak).
- Symbolic algebra equivalence (a computer algebra system). LLM grades formula equivalence; local evaluator does string canonicalization.
- Specialized models or per-subject model routing. One model handles everything.
- In-app advertising of any kind.
- Sharing material or progress between profiles (each profile is independent).
- Transferring a minor profile to its own account when the child turns 16 (out of scope; data export + new signup is the workaround).
- Collaborative editing or multi-account access (e.g. two divorced parents).

## Success metrics

- The developer's own child uses the app at least three days per week through a full test-prep cycle (~ 2 weeks) without intervention.
- The developer himself uses the app for a non-school subject for at least one month.
- ≥ 80 % of generated items are rated "useful" by account-holder review on the eval fixture set.
- Average LLM cost per active account per month ≤ €0.40 at the Standard tier.
- Crash-free session rate ≥ 99.5 % over a rolling 30-day window.

## Brand and tone

- Friendly, calm, never punishing. "Fast richtig — fehlt nur noch …" not "Falsch!"
- Tone scales with the profile's age: warmer and slower for younger learners; more direct and dense for adults. Same personality throughout — never two distinct UIs.
- No emojis in core UI. A small set of celebration animations (confetti, a check) at session-end is fine.
- The voice persona is a patient older sibling / friendly tutor, not a teacher. Default TTS voice is a warm neutral voice from the native synthesizer.
- No infantilizing colors or animations. Clean, slightly playful, age-appropriate for the full age range.
- All user-facing copy is short. Questions are one line if possible. Feedback is one or two sentences.
