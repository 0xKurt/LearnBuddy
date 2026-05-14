# Design Brief — Learning Companion

A document for the designer. Engineering details live elsewhere; you don't need them. This brief tells you what the product is, who uses it, what it must do, and what it must feel like. **How** the interface looks and flows is up to you.

---

## What we're building

A mobile learning companion. Anyone — a school child, a teenager, a university student, an adult learning a new subject — photographs their learning material (a worksheet, a textbook page, a notebook entry) and the app turns it into a personal practice session. The learner is asked questions, answers by voice or by typing, gets gentle feedback and hints, and the app remembers what they got wrong so it can ask again at the right time.

It is not a flashcard app, not a quiz game, not a homework-doer. It is a calm, patient tutor in someone's pocket.

---

## Who uses it

The single word for the user is **learner**. A learner is anyone using the app to study. We do not assume the learner is a child. We do not assume they need supervision. We design for the full age range.

The app has two distinct concepts:

### Learner profile
The thing that does the actual studying. A profile has:
- A name (real, nickname, whatever the learner wants)
- A birth year (used to determine if minor; drives tone, content level, AI prompting)
- A grade or level (Klasse 4 through "Erwachsenenbildung")
- Settings (preferred answer mode, language, etc.)

A profile is either an **adult profile** (the person is 16+) or a **minor profile** (the person is under 16, the German age of digital consent).

### Account holder
The adult (16+) who legally owns the account and pays for it. The account holder authenticates with email + password (or magic link) and biometric. Profiles are children of the account.

The account holder can be the **same person** as the learner profile, or a **different person**:

- **Solo adult learner.** A 22-year-old studying for university exams. The account holder *is* the learner. One profile.
- **Account holder managing a minor.** A parent setting up the app for their 10-year-old. The account holder is the parent. The minor is the single profile on the account. The parent does not have their own learner profile on this account; if they want to use the app for themselves, they create a separate account.

**Crucial:** the language of the app must work for both cases. Never assume the learner is a child. Never default to "parent" framing. There are no "kid mode" and "parent mode" labels. There is a **learner experience** (studying) and an **admin surface** (managing the account).

**One account, one learner profile.** A household with two children who both want to use the app needs two separate accounts. A parent who wants the app for themselves *and* their child needs two separate accounts. This is a deliberate simplification.

### The admin surface

Anything that is not studying — adding profiles, changing subscription, adjusting settings, exporting data, deleting the account, editing material, configuring notifications — lives on the admin surface. The admin surface is always reached through the account holder's authentication (biometric or PIN). This protects minors from messing with settings, and it protects adult learners from a friend who picks up their unlocked phone.

For a solo adult learner, the admin surface is essentially "Settings" with subscription, profile, and data controls. For a guardian, it's the same surface — with profile management for their minors as a key area.

The admin surface is not called "for parents." It's just **Einstellungen** or **Konto**. The same surface, gated the same way, regardless of who's behind it.

---

## What the app does

Capabilities, not flows. Design the flows however makes them feel best.

### Capturing material
The learner points the camera at one or more pages of learning material. They can take several photos for one piece (front + back, multi-page chapter, an open book). The app should help them know whether a photo will be good enough — blurry, dark, too small need to be obvious. After capture, the photos are sent off and the learner sees generated questions.

The learner organizes material into **subjects** (Mathe, Bio, Englisch, Quantenmechanik, whatever). Inside a subject, they can create **folders** to group related materials — a chapter, a topic, an upcoming test. Folders are optional; material can sit loose in a subject. A folder can have a date, which is how upcoming tests are surfaced (gently).

### Studying
The learner practices answering questions one at a time. Questions can be:
- a short text answer
- a longer written answer
- a number (often with a unit like "m/s")
- multiple choice
- a formula
- a fill-in-the-blank sentence
- a label on a diagram ("Was ist Nummer 3?")

The learner answers by speaking (the app turns voice into text on the device), by typing, by tapping a choice, or — for formulas — by typing on a custom on-screen keyboard with math symbols. The app shows mathematical expressions, graphs, and labeled scientific diagrams alongside the question when relevant.

The app evaluates the answer. Right → move on. Partly right or wrong → a short encouraging hint, try again. After two hints, the app reveals the answer kindly. **Never harsh.** "Fast richtig — fehlt nur noch …" not "Falsch!"

### Practicing math
For math (and similar), the learner can ask for "more like this" and the app generates a stream of fresh variants of the same problem type. Unlimited. The learner can keep going as long as they want.

### Coming back at the right time
The app keeps track of what the learner found easy and what they struggled with. The next time they open the app and decide to practice, the right questions come up. The learner doesn't need to think about this — and importantly, the learner is never told "you have 14 questions due" or "you need to practice today." The repetition engine works quietly under the surface, only kicking in when the learner taps "Üben."

### Studying for a test
The learner attaches a date to a folder, marking it as a test to prepare for. The app surfaces this gently — "Bio-Test in 3 Tagen" as a small heads-up on the relevant subject, not as an alarm — and biases practice toward that folder's material. There's a quiet sense of "you're working on it" without becoming alarming, and without "you must study X today" framing.

### Working offline
On a train, in the car, anywhere without internet: previously generated questions, practice runs, voice and text answering — all still work. The learner never sees an error because the connection dropped. When the connection comes back, things sync silently.

### Account management (admin surface)
Behind biometric/PIN, the account holder can:
- Add a new learner profile (their own, a partner's, a child's)
- Edit an existing profile (name, avatar, grade level, language, preferences)
- Archive a profile (soft delete; recoverable for 30 days)
- Edit or delete subjects, folders, materials, and individual questions
- Manage notifications for the profile
- Manage the subscription (upgrade, downgrade, cancel)
- Export all data as a ZIP
- Delete the account (with a 7-day grace period)
- Change account email and password
- Set up or change the PIN / biometric

### Settings each learner controls
Without entering the admin surface, the learner themselves can change:
- Their preferred answer mode (voice, text, multiple choice as default)
- Whether questions are read aloud automatically
- Their avatar (a contained set of choices)

That's it. Anything more impactful is admin-side.

---

## How it should feel

### For every learner
- **Self-led, not app-driven.** The learner opens the app because they choose to, not because the app is telling them they have to. The home screen does **not** show "20 questions due" or "you haven't studied in 3 days" or anything that creates obligation. The app is a learning companion that's available when wanted, quiet when not.
- **Calm.** Not noisy, not flashy, not over-stimulating. Someone who is anxious about a test feels less anxious here, not more.
- **Patient.** No timers ticking down. No "Hurry!" Nothing punishing a slow response.
- **Encouraging without being fake.** "Stimmt!" when they're right. Real acknowledgment of what's hard. No constant clapping crowds.
- **Quick.** From opening the app to answering the first question: a couple of taps. From taking a photo to seeing the first question: under twenty seconds, ideally feeling like ten.
- **Theirs.** The learner picks their avatar, picks their subjects, picks how they answer. The app does what they say.
- **Confidential.** Voice and answers belong to them. The account holder sees aggregates, not transcripts. An adult learner is the account holder, so they see everything about themselves — no surprise.

### For the account holder (when distinct from the learner)
- **Trustworthy.** The privacy story is on the surface, in plain language. The account holder never has to read a long policy to know what's happening.
- **Calm.** Not "this learner has only studied 12 minutes today!!" anywhere. Information, not alarm.
- **Out of the way.** An account holder who hasn't opened the admin surface in two weeks should be able to find what they need in fifteen seconds.

### What we are NOT
- We are not a game. No XP bars, no levels, no virtual currency, no leaderboards, no characters with personalities. No "streaks you'll lose if you miss a day" pressure. A small "you studied today" mark is fine; a quiet streak count is fine; **anything that creates panic about missing a day is not**.
- We are not an obligation tracker. The home screen does not greet the learner with a pending-task count. There is no morning push notification saying "12 questions waiting for you." If reminders exist at all, they are gentle, opt-in, off by default, and the account holder controls them.
- We are not "for kids." We are for learners. Visuals must work for a 9-year-old AND a 35-year-old. Avoid mascots, bubble fonts, or kindergarten color schemes. Equally, avoid clinical edtech grey — find something warm and unfussy that respects both ends of the age range.
- We are not a school app. No classrooms, no teachers, no assignments to turn in, no grades to record.
- We are not a homework-cheat app. We don't answer the learner's homework. We help them learn so they can answer it themselves.

The mental model is **"my learning companion is here when I want to practice"** — not "the app is keeping score of what I owe it."

---

## Hard constraints that affect design

### Age range
Klasse 4 (~9 years old) through Studium and adult continuing education. The visual language and copy tone work across the entire range. Younger profiles see fewer questions per screen, larger touch targets, more whitespace, more reassurance. Older profiles tolerate (and want) more density and less hand-holding. **The personality stays consistent**; only density and tone scale. Treat this as a fluid spectrum, not two distinct modes.

### Languages
The app ships in German first, then English, French, Spanish, Italian. The German version is the lead. Design copy in German first. Some German words are noticeably longer than their English equivalents — leave room.

### Math, formulas, science notation
Questions and answers regularly contain mathematical expressions ($y = 2x + 3$), chemical formulas ($H_2O$), and physics units (m/s, kg, °C). These have to look beautiful and natural on a phone screen — not like an afterthought. They appear inline in question text and as bigger displayed equations above questions. The age range matters here too: a Klasse 5 student writes $2x + 3$; a physics undergraduate writes $\nabla \cdot \vec{E} = \rho / \varepsilon_0$. Both must look good.

### Pictures with the question
Many questions come with a visual:
- A graph of a mathematical function to read
- A simple geometric figure
- A labeled diagram (a plant cell, a map, a machine) with numbered markers, where the question asks "What is part 3?"

The learner needs to see these comfortably, often zoom in, sometimes have them above their answer area without losing the question.

### Voice
Voice is a first-class input, not an accessibility afterthought. A learner should be able to take a photo, see a question, and just speak. They should know when the app is listening and when it isn't. They should be able to interrupt and try again easily.

The app also reads questions aloud on request. Some learners will prefer this; some won't. It must be toggleable in profile settings. Note: an adult learner may want voice off entirely; design must not assume voice is "fun" — it's a feature like any other.

### Photo capture
The camera flow needs to coach the learner into a good photo without being annoying. A photo that's blurry, too dark, too far away, or not actually learning material needs gentle correction. "Versuch nochmal etwas schärfer" / "Versuch es nochmal mit etwas mehr Licht." Not "REJECTED."

### Offline-ness
The app may be offline at any moment. Show that it's offline without making it feel something is broken. Don't show error states for what the learner is trying to do offline if the action will work offline — most things do.

### Single profile per account
Each account has exactly one learner profile. There is no profile picker at launch — the app drops the learner straight into their experience. The active profile's avatar + name in the header is for identity and for the path into the admin surface (tap → biometric/PIN unlock).

### Admin surface is always gated
Entering the admin surface always requires biometric or PIN — for solo adults too. This is a deliberate choice for consistency and safety (lost phone, kid grabs the device, etc.). The biometric prompt should feel like one frictionless tap, not a security gauntlet.

### No pressure on the home screen
This is a non-negotiable design rule. The learner's home screen, and every learner-facing surface, must never:

- Show a count of pending questions ("12 Fragen warten auf dich")
- Show a count of items due today
- Show a number that implies an obligation
- Greet the learner with what they haven't done
- Warn that a streak will be lost

It may show:

- A warm greeting
- The learner's subjects as visual tiles
- A small, optional "Test in 3 Tagen" chip on subjects whose folder has a date approaching
- A clear, friendly entry point to start practicing

The repetition engine still picks the right questions when the learner opens a session — but it does so silently. They see their first question; they never see the queue size.

---

## Onboarding (the structure, not the screens)

1. **Welcome.** Language picker (defaults to device locale). One question: "Wie alt bist du?" / "Wie alt sind Sie?" (date of birth or simple age picker).
2. **Branch by age.**
   - **Under 16:** Friendly message that an adult must set up the account. "Frag bitte eine erwachsene Person — wir richten das Konto gemeinsam mit ihr ein." A "Erwachsene Person ist hier" button hands the phone over. The under-16 learner does not enter their own email; the adult does.
   - **16+:** Continues as the prospective account holder.
3. **Account creation.** Email + password, or magic link. Verification email. Privacy consent (adult version of the legal text).
4. **Profile setup.** "Wer wird die App benutzen?" with two options: "Ich selbst" or "Mein Kind" (i.e. one minor profile under the account holder's supervision).
5. **Profile fields.** Name, birth year, grade/level, avatar, language. For a *minor* profile, the account holder explicitly consents to the processing of that minor's data on the spot.
6. **PIN / biometric setup.** The account holder sets up biometric or a 4-digit PIN that gates the admin surface.
7. **Direct entry to the learner's experience.** No profile picker — there is only one profile.

**Designer's challenge:** make this feel like 90 seconds, not a wizard. Use progressive disclosure. Defer non-essentials.

---

## Flows the design must cover

Not in priority order. Every flow needs screens.

### Onboarding & recovery
- Adult signs up solo (themselves as the learner)
- Adult signs up to manage one minor profile
- Under-16 hits the welcome screen, hands phone to an adult
- Returning user logs in on a new device
- Returning user resets a forgotten password
- Returning user opens app after long absence (welcome back, no shaming)

### Capturing material
- Open camera, take photos, accept quality coaching, finish capture
- Pick an album photo instead of using the camera
- Add photos to an existing material (later forgot a page)
- Choose where the captured material lives (subject, optionally folder)
- See the AI work, watch questions appear
- Get a "not learning material" response and recover gracefully
- Get a "couldn't read this" response and recover gracefully

### Organizing
- Create a subject
- Edit a subject (rename, change color, change icon, archive, restore from archive)
- Create a folder inside a subject, optionally with a test date
- Edit a folder (rename, change/remove date, archive, restore)
- Move a material between folders (or out of a folder)
- Edit a material's title
- Delete an individual generated question (a bad one) — should feel like a small "Nein, weg damit"
- Request more questions for a material (with simpler/harder/different style)
- Delete a material entirely (with confirm, with undo option for 30 days)
- Restore an archived subject/folder/material

### Studying
- Start practicing a subject
- Start practicing a specific folder (e.g. test prep)
- Start a focused session on one material
- Answer each kind of question (short, long, numeric, multiple choice, formula, fill-blank, diagram label)
- Use the voice input
- Use the math keyboard for formulas
- Ask for a hint
- Ask for an explanation ("erklär mir das")
- See a result screen at end of session
- Practice fresh math variants from a problem template
- Use Test-Modus (no hints, no feedback during) before a real test
- Quit mid-session (no penalty, state preserved)

### Profile management (admin surface)
- Edit the profile (name, avatar, grade level, language, preferences)
- Archive the profile (soft delete with 30-day recovery) — note this effectively retires the account's data; the account holder would need to create a new account afterward, or restore from archive within the window
- Restore an archived profile

### Subscription (admin surface)
- See current plan and renewal date
- See trial countdown if still in trial
- Upgrade from Standard to Plus
- Downgrade from Plus to Standard (effective next cycle)
- Cancel subscription (stays usable until end of period)
- Restore purchase (e.g. after device change)

### Account (admin surface)
- Change email
- Change password
- Change PIN
- Toggle biometric
- Manage notifications for the profile
- Toggle analytics opt-out

### Data and privacy (admin surface)
- Export all data as a ZIP (triggers an email when ready)
- Delete the entire account (with 7-day cancellable grace)
- Cancel a pending account deletion
- Review what consent was given and when

### Edge cases the design must address
- Network drops mid-session
- Subscription lapsed (kind, not alarmist; can still review, can't generate new material)
- Trial about to expire (gentle, not pressure)
- Vision API failed on a photo
- Photo was not learning material
- Photo was unreadable
- Subject has zero materials (empty state)
- Profile has never studied yet (empty state for home, for stats, for the account holder's view)
- Returning to the app after weeks away
- A learner using a minor profile tries to access something admin-only (friendly redirect, not a scary lock)
- A user enters wrong PIN multiple times (graceful lockout with biometric fallback or email reset)
- App is freshly installed on a new device, no local data

---

## Sample questions the design has to answer

Land an opinion on these.

1. **What does the home screen show?** No counts allowed. What does it greet the learner with? How does it feel on day one (no history) and on day fifty?
2. **What does the AI generating questions look like during those ~15 seconds?** Not a generic spinner. Something that makes the wait feel like part of the experience.
3. **How does a learner know they got it right vs. partly right vs. wrong?** Without it feeling like a graded test. Color is too crude. Words alone are too slow.
4. **What does the math keyboard look like?** It has to fit on a phone, cover the symbols a Klasse 7 student needs AND the symbols a physics undergrad needs, and be discoverable.
5. **How does voice input feel?** When the learner taps the mic, what tells them it's listening? What tells them it's done? What if they want to redo?
6. **How do you show a labeled diagram with numbered markers, with a question and an answer area, on a phone screen?**
7. **How does the account holder get a sense of "is the learner actually learning" in five seconds?** Without it being a dashboard with twelve charts. Note: when the account holder IS the learner, this view is "looking at my own progress" — feels different than "looking at my child's progress." Design for both.
8. **What's the personality?** Friendly, unfussy, age-spanning. Not Duolingo's manic owl. Not a cold edtech sans-serif. Not a kindergarten color palette. Find something warm that a 10-year-old and a 30-year-old both feel addressed by.
9. **How does the active profile show in the header?** Avatar + name is the identity cue, and the path into the admin surface (long-press or tap). What does this feel like?
10. **What's the admin lock experience?** Biometric is one tap — but how does it transition? What does failure look like? What does setting up the PIN feel like?
11. **How do edits work?** Most edit flows are similar (rename a thing, change a setting). Design a consistent pattern. Long-press? Edit icon? Swipe? Pick one and apply it everywhere.

---

## What we want from you

1. **Concept direction.** Two or three visual directions for the app's personality. Show a home screen for a young learner profile, a home screen for an adult learner profile, and the admin surface in each direction. Help us pick.
2. **A full flow** in the chosen direction covering every section in "Flows the design must cover."
3. **A design system.** Colors, typography, spacing, icons, components. Pixel-implementable.
4. **Every edge case handled visually.** Don't leave error states unspecified.
5. **A few moments of delight.** Not gamification. Small, calm moments — the way a session ends, the way a photo turns into questions, the way the learner is welcomed on day one.

You have full latitude on layout, navigation, typography, color, animation, illustration style, and visual personality. The product specification (engineering) is fully written and waiting — once your design exists, building it is straightforward.

---

## One last thing

The app's first real user is the developer's own daughter, currently in Klasse 7. The app's second real user is the developer himself, brushing up on something. Same app, same experience, two different humans. If the design serves both of them without compromising for either, it's working.
