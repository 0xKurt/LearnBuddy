# LearnBuddy — Deep Behavioral Flows

Companion to `USER-FLOWS.md` (the flat v1 inventory of ~371 flows). Where v1 enumerates "what surfaces exist," this doc enumerates **what humans actually do** — the messy stuff: tip-of-tongue voice fumbles, parents handing the phone over, accidental recipe scans, bus rides that drop service, kids who *swear* they got it right. The product principle is "as simple and understandable as humanly possible, but **nothing is forgotten**." This file is the inventory of the things you'd otherwise forget.

Conventions:
- **Bold actor verbs** (e.g. **Lena taps**) anchor every story step so a designer can wireframe directly.
- `[implied — needs design]` marks anything not provable from the existing docs (same convention as v1).
- Where v1 already covers something, this doc references the v1 section and adds the missing texture.
- "Account holder" = the 16+ owner of the account. "Learner" = the single profile. They may be the same person (solo adult) or different people (parent + minor). The doc surfaces both framings wherever a flow diverges.

---

## 1. End-to-end named journeys

Story-form journeys covering an entire lived experience, not a single surface. These are designed to be wireframed front-to-back without missing a beat.

### 1.1 "Klassenarbeit in 2 Wochen" — focused test prep over multiple days

The flagship multi-day journey. A 12-year-old, **Lena (Klasse 6)**, has a Bio-Test on Mitose und Meiose in 14 days. Her mother (account holder) is logged in. The flow spans about a dozen sessions over two weeks.

**Day 14 — Setup (the day the worksheet comes home).**

1. **Mom unlocks admin**, **taps "Profil bearbeiten"** to confirm Lena's grade (already Klasse 6), **closes admin.** _[The act of opening admin is one biometric tap; no friction.]_
2. **Lena opens the app**, lands on home. **She taps the "Biologie" subject tile** (already exists from a previous chapter).
3. **She taps "Ordner"** tab, **taps "+ Neuer Ordner"**, **types "Klassenarbeit Mitose 14.06."**, **taps the date chip**, **picks 14. Juni.** "Test in 14 Tagen" chip appears immediately on the folder card. _[implied — needs design: folder creation form, date picker affordance.]_
4. **She taps "+ Material hinzufügen"** inside the folder. **Camera opens.** _[Pre-targets folder_id, per v1 §4.]_
5. **She photographs three worksheet pages.** Live blur/brightness chips guide her — first photo "verschwommen", she retakes; second and third "scharf". **She taps "Fertig".**
6. AI extracts. Phases stream: "Bilder werden gelesen … Fragen werden erstellt … Letzter Schliff." Within ~18 s, 14 items appear. **Lena scrolls them**, **taps the menu on one item that's clearly weird** ("Welche Farbe hat das Diagramm?"), **taps "Diese Frage entfernen"**, confirms.
7. **She taps "Diesen Stoff üben"**, runs through 14 items. Mixed verdicts. Session result: "8 sitzen, 6 noch unsicher." **She taps "Nochmal mit den schwierigen"**, does a focused 6-item re-session. **She closes the app.**

**Days 13–8 — Daily light touches.**

8. Each evening, **Lena opens the app**, **taps Bio → Üben**. The FSRS scheduler quietly biases toward Mitose folder items (per v1 §8 "test-folder bias"). She never sees this bias.
9. The day's session is short (~8 items) because FSRS has only that many due. She finishes in 4 minutes. Result screen: "Heute geübt!" + quiet streak chip.
10. On day 11, **she taps "Mehr Fragen"** on one material, **picks "Andere Art"** for variety. 6 new items generated. _[Account-holder banner shows credits used if soft cap reached; learner sees nothing.]_

**Days 7–4 — Heads-up.**

11. Notification at 09:00 on day 11 (3 days before — wait, this is day 7… let's reset): on day 11, the test-heads-up category fires the first push: **"In 3 Tagen ist dein Bio-Test."** _[Per v1 §14. Default-off, but mom enabled it during setup; flow needs an admin-side switch with sane default-on behavior when test folder exists — `[implied — needs design: should test heads-up default on when account holder creates a date-bearing folder?]`]_
12. **Lena taps the notification**, app deep-links to the Mitose folder. **She taps Üben**. Practice now strongly weighted to this folder.

**Days 3–1 — Test-Modus rehearsal.**

13. Day 3 morning: another notification, "In 1 Tag ist dein Bio-Test."
14. **Lena opens the folder**, **scrolls down**, **taps "Test-Modus" toggle near "Üben"** _[implied — needs design: where is the Test-Modus entry point exposed? v1 §7 mentions it but the trigger is unclear. Recommend a small "Test-Modus üben" link on the folder screen, below the main Üben button, only when the folder has a `scheduled_for` in the next 7 days.]_
15. **She picks length: 10 / 20 / alle.** Picks 20.
16. Test-Modus session: no hints, no Erklär-mir-das, no per-item feedback. Progress bar only. **She answers all 20** in ~9 minutes.
17. Result screen — different from normal: shows score (e.g. "16/20"), lists the 4 missed questions with correct answers revealed, offers "Diese 4 nochmal üben" (not in Test-Modus). **She taps it**, drills the misses normally.

**Day 0 — Morning of.**

18. 07:00 notification: "Heute ist dein Bio-Test. Viel Erfolg!" No further app interaction expected; the design should not encourage panicked last-minute studying. _[Subtle: the morning-of notification is a "vibes-up," not "open the app." Copy must not link into a session.]_

**Day 0 evening — After-test reflection.** `[implied — needs design]`

19. **Lena opens the app**, sees Bio tile. No special "how did the test go?" prompt — the docs are quiet here.
20. **Proposed design:** the folder screen shows a small post-test card: "Test war heute. Wie ist es gelaufen?" with three quiet options: "Gut", "Ok", "Schwierig". This optionally archives or keeps the folder open. _[implied — needs design: this is a brand-new lifecycle moment not in docs. See §8 lifecycle moments below.]_
21. **If Lena taps "Gut":** small celebration moment (a check, no confetti), folder gets an "Abgeschlossen" badge, materials remain available for review but no longer FSRS-biased.
22. **If she taps "Schwierig":** the folder stays active and FSRS keeps biasing toward it for one more week, in case there's a retest. No nagging.
23. **Mom checks admin overview** — sees this week's minutes spike, "Bio: Mitose – stark verbessert" topic surfaces in mastered-topics list.

**Edge cases inside the journey:**
- **Test date moved.** Mom edits the folder date in admin (or learner long-presses folder, taps "Datum ändern" — `[implied — needs design]`). Scheduled notifications cancel and re-schedule (per v1 §14).
- **Test cancelled / folder no longer relevant.** Long-press folder → "Datum entfernen" or "Archivieren".
- **Lena adds a worksheet to the wrong folder.** Long-press the material → "Verschieben" → picker (per v1 §5).
- **Lena tries to add a new subject mid-prep ("Mathe Klassenarbeit Mittwoch").** Two simultaneous test folders show two chips on home; the design must lay these out without becoming a list of demands. Recommend: chips stack inside the relevant subject tile, not on home root.

---

### 1.2 "Ich vergesse das Wort mitten in der Antwort" — voice tip-of-tongue help

**Maxi (Klasse 5)** is doing voice answers in Bio. The question (with diagram): "Was ist Nummer 3 auf dem Bild?" Expected: "Mitochondrium."

**The fluent path (no help needed):**
1. **Maxi taps mic.** VoiceButton enters listening state — pulsing ring, "Hört zu …" label, live transcript field becomes active.
2. **Maxi says "Mitochondrium."**
3. 1500ms silence → VAD auto-stops, transcript locks, local evaluator runs → correct, "Stimmt!" advances.

**The tip-of-tongue path (this section's core):**

4. **Maxi taps mic.** "Ähm … das ist das … Mito… wie heißt das nochmal?"
5. ASR transcript: `"Ähm das ist das Mito wie heißt das nochmal"`.
6. **Tip-of-tongue detection [implied — needs design]:** A lightweight client-side classifier flags the transcript as a help-request rather than a final answer. Heuristics:
   - Contains `"wie heißt"`, `"wie sagt man"`, `"das ding"`, `"das wort"`, `"ich weiß nicht mehr"`, `"hilf mir"`, `"kannst du mir helfen"`, `"Tipp"`.
   - Trailing or embedded fillers: 3+ instances of `"äh"`/`"ähm"`/`"hmm"` per sentence.
   - Partial word followed by ellipsis pattern: `"Mito… Mito…"` (same prefix ≥ 2 times, no completion within 4 syllables).
   - Long pause (> 2.5 s) of silence inside a recording without VAD stopping (configurable — extending the silence threshold for kids).
7. When flagged → **the app does NOT send the answer for evaluation.** Instead, the VoiceButton transitions to "Hilfe-Modus":
   - The transcript stays visible (so the learner knows the app understood the stutter).
   - A small assistive card appears: "Du suchst ein Wort? Ich helfe Schritt für Schritt." with one button: **"Stufe 1: Kategorie"**.

**Hint escalation chain (designed to NEVER reveal the answer too fast):**

8. **Stufe 1 — Category hint.** Tap reveals: "Es gehört zu den Bestandteilen einer Zelle." (Or for a vocabulary answer: "Es ist ein Verb." For a fact answer: "Es ist eine Zahl.") Card now shows **"Stufe 2: Anfangsbuchstabe"**.
9. **Stufe 2 — First letter or syllable.** Tap: "Es fängt mit **Mit-** an." Or for proper nouns: "Es fängt mit M an."
10. **Stufe 3 — Definition without the word.** Tap: "Es ist der Teil der Zelle, der Energie erzeugt — das 'Kraftwerk'." (The LLM crafts a definition that intentionally omits the target word and all synonyms.)
11. **Stufe 4 — Reveal kindly.** "Das Wort ist **Mitochondrium**." Then the attempt is recorded as incorrect (with hint-chain count for FSRS bookkeeping) and the next item appears. _[Same flow as the existing two-hints-then-reveal pattern (v1 §7), but with finer-grained voice-specific staircase.]_

**Voice-specific micro-flows in this journey:**

- **Mid-sentence self-correction.** Transcript: `"Das ist … nein, halt, das ist das Mitochondrium."` Detection: presence of `"nein"`, `"halt"`, `"warte"`, `"stopp"`, `"neu"` followed by new content. The app should keep only the post-correction phrase before evaluation. **Visual:** the corrected-out text greys out briefly with a strikethrough before disappearing — confirms to the learner that the app heard the correction. _[implied — needs design]_
- **Stutter / restart.** Transcript: `"Das ist das Mit Mit Mit … äh."` After 2.5 s of no progress, app gently prompts: "Magst du nochmal anfangen?" with two buttons: "Nochmal sprechen" and "Stattdessen tippen." _[implied — needs design]_
- **User says "warte, neu" mid-answer.** Same as self-correction; treat as full restart. Mic stays open, transcript clears. _[implied — needs design]_
- **User says "ich weiß es nicht."** Detect this exact phrase + variants ("keine Ahnung", "weiß ich nicht", "ich hab's vergessen"). App offers: "Magst du einen Tipp?" with two buttons "Tipp" / "Überspringen." _[implied — needs design]_
- **User says "kannst du mir helfen" mid-answer.** Stops listening, jumps directly to Stufe 1 of the hint chain. _[implied — needs design]_
- **User answers in the wrong language.** Question is in German (Bio), learner answers "powerhouse of the cell." Local evaluator returns unknown because token overlap with German expected is 0. LLM evaluator (P3) should recognize the equivalence — it's instructed to evaluate the *concept*, not the language. Recommend: if the response language ≠ question language, the LLM feedback should gently note: "Stimmt inhaltlich. Magst du es nochmal auf Deutsch versuchen?" _[implied — needs design: explicit prompt-level instruction.]_
- **Long pause without any audio.** No transcript after 8 s → mic auto-closes, "Habe nichts gehört. Magst du nochmal versuchen oder lieber tippen?" _[implied — needs design]_
- **Background noise / unintelligible result.** ASR returns very low confidence or empty string. Fallback card: "Konnte dich gerade nicht verstehen — vielleicht ist es zu laut? Du kannst auch tippen." with mic-retry + keyboard buttons. _[implied — needs design]_
- **Two voices speaking.** ASR has no native diarization on-device; the app must accept whatever transcript came back. If transcript contains contradictions ("ist es … nein das ist falsch … oder doch"), trigger help-mode instead of evaluating. _[implied — needs design]_
- **Phone-call audio quality (e.g. wired earbuds with a mic).** No special handling needed — ASR runs at device-mic quality. If accuracy degrades, the hint chain kicks in naturally.
- **Heavy accent / child voice.** ASR confidence may stay low. The app must not punish — fall back to text suggestion after 2 failed mic attempts on the same item. _[implied — needs design]_
- **Stuck on a word more than 3 sessions in a row.** Surface to admin overview: "Maxi hat 'Mitochondrium' diese Woche dreimal nicht gewusst." _[implied — needs design: pattern-level surfacing]_

**Confidence-low transcript decision tree:**

```
ASR returns transcript with confidence < 0.5:
  ├── transcript is empty or 1 word → "Konnte dich nicht gut verstehen. Nochmal?"
  ├── transcript has 2+ words but unclear → show transcript greyed out, 
  │      ask "Hast du das gemeint?" with confirm/redo buttons
  └── transcript looks like help-request (heuristics above) → tip-of-tongue flow
```

---

### 1.3 "Erste Lern-Session überhaupt" — solo adult novice, zero-to-first-answer

**Tom (25, Anatomie student)** has finished onboarding (per v1 §1 — adult solo path). He's on home for the first time. No subjects, no materials, no history.

1. **Tom sees empty home.** A warm illustration (calm, not clinical), a single sentence: "Wie wollen wir anfangen?", and one prominent button: "Fach hinzufügen."
2. **He taps "Fach hinzufügen."** Modal: name field ("Anatomie"), color swatches, icon grid (curated). _[Color/icon picker per v1 §5; the order of fields and grouping needs explicit design.]_
3. **He taps "Anatomie" tile** on home. Empty subject screen: "Hier ist noch nichts. Fotografier dein erstes Material!" + big camera button (per v1 §5).
4. **He taps the camera button.** iOS permission prompt — first ever, copy from `NSCameraUsageDescription`: "Damit du Lernmaterial fotografieren kannst." **He taps Allow.**
5. Camera opens. **First-photo coaching overlay [implied — needs design]:** a one-time tooltip overlay points to the quality-feedback chip area: "Wir sagen dir kurz, ob das Foto reicht." Dismiss with tap-anywhere. Stored as `firstPhotoCoachingSeen: true` per profile.
6. **He frames a textbook page**, sees "scharf" chip turn green. **He taps the shutter**, thumbnail appears in strip. **He taps "Fertig."**
7. Subject/folder picker appears (since pre-targeting wasn't set from a folder context). **He picks "Anatomie" → "Ohne Ordner."**
8. Upload → AI phases stream. He sees the illustrated progress sequence (per DESIGN-BRIEF Q2). ~18 s.
9. **First items appear.** 10 questions. He doesn't know what to do — needs a one-time orientation. **First-session coaching [implied — needs design]:** a soft tooltip below the first question: "Tippen, sprechen oder antworten — wir helfen dir." Dismiss after first answer submission.
10. First item is `short`. **He types "Skelettmuskel."** Submits.
11. Local evaluator marks correct. Brief "Stimmt!" + advance.
12. Second item is `numeric`. **He sees MathInput, types "206."** Voice button next to input — never used yet, no coaching.
13. Third item is `formula` (rare for anatomy, but suppose one slipped in for biomechanics). MathKeyboard appears below. **Math-keyboard coaching [implied — needs design]:** first-time tooltip: "Spezial-Tasten — hier findest du Wurzeln, Brüche, π." Dismiss after first formula submission. _[See §10 below for full power-feature onboarding.]_
14. Fourth item is `multiple_choice`. He taps an option. Locally evaluated. Wrong.
15. **First wrong answer hint chain.** Feedback card: "Nicht ganz — fast richtig." + "Tipp" button + "Erklär mir das" button. **He taps "Tipp."** LLM streams. Hint 1 arrives. He tries again. Wrong again. **He taps "Tipp" again.** Hint 2. Tries. Wrong. **Third attempt:** the LLM reveals the answer in the feedback ("Die richtige Antwort ist Latissimus dorsi — er ist…"). Item marked wrong, but with revealed-after-hints flag.
16. **First "Erklär mir das."** He taps it on the next confusing item. Modal opens with style picker chips: **"Einfacher" / "Schritt für Schritt" / "Analogie."** He picks "Analogie." Streams 4–8 sentences. **He scrolls, reads.** Closes modal with X. _[Modal should preserve session state — when closed, the original question remains where it was.]_
17. He continues through 10 items. **Session result.** "8 sitzen, 2 noch unsicher." Streak: 1 (no fanfare, just "Heute geübt!"). _[First-streak moment: see §8 lifecycle.]_

**Things that must not happen during the first session:**
- No "tutorial overlay" sequence at start. Coaching is contextual and one-time per feature.
- No "well done!" overlay after the first correct answer. The correct-feedback is the same as always: "Stimmt!" 600 ms.
- No prompt to enable notifications. (Notifications are admin-side only, off by default; the learner never sees a notification permission prompt at all.)
- No "tell us how it went" survey.

---

### 1.4 "Eltern setzen Kind auf" — parent setup, then kid's first solo interaction

**Anna (45)** has bought the app for **Mira (10, Klasse 4)**. Anna installs on her own phone. Anna is the account holder; Mira's profile is on Anna's account.

**Anna's onboarding (per v1 J2):**

1. **Anna installs**, opens app. Welcome → language (de auto-detected). Age check → 45. Account signup (email + password) → verify email → consent (adult version).
2. **Who uses? → "Mein Kind."** Profile fields: name "Mira", birth year 2015 (Klasse 4), avatar (Anna picks a friendly star icon — actually she lets Mira come over to pick).
3. Minor consent screen. **Anna reads, ticks**, "Ich willige in die Verarbeitung der Daten von Mira ein."
4. PIN + biometric setup. Anna sets 4-digit PIN, enables Face ID.
5. Hand-off screen: "Möchtest du Mira das Gerät jetzt geben?" Two buttons: "Ja, jetzt" / "Erst später." **Anna taps "Ja, jetzt."**
6. App drops into the learner surface (Mira's). Header shows Mira's avatar + name.

**Mira's first solo interaction — design opportunity often missed:**

7. **Anna sits next to Mira** during the very first moment. Mira sees a screen that says her name. Soft greeting: "Hallo Mira! Wir können dir helfen zu üben." [implied — needs design: first-time learner welcome card that's distinct from a regular returning-user home]. One CTA: "Lass uns ein Bild von einem Schulheft machen."
8. **Mira taps it.** Camera permission prompt with kid-friendly copy variant if the active profile is a minor. _[implied — needs design: kid-friendly copy variants of permission rationale screens. Currently the docs only spec one copy. Recommend per-age copy keys in i18n.]_ The iOS/Android system prompt is, however, fixed-system text.
9. Mira takes a photo of a Mathe worksheet. Quality chip stays green. Anna might guide once.
10. AI generates items. Mira gets her first question. She's 10, she's never used the app — she needs the same first-session coaching as Tom but with younger copy: "Tippen oder sprechen — was magst du lieber?" with **two illustrated cards** (a mic icon, a keyboard icon) instead of a tooltip. _[implied — needs design: first-answer-mode choice card for new minor profiles. Persists per profile as `preferredAnswerMode` once chosen, overrideable in self-controllable settings.]_

**Specific kid-on-parent-phone considerations:**

- **Mira accidentally taps the header avatar (which opens admin).** Friendly redirect: "Dafür brauchen wir eine erwachsene Person. Gib das Handy bitte weiter." Button: "Mama/Papa holen" (which just dismisses, returning Mira to where she was). _[v1 §13 has this; the design should be **inviting**, not blocking — a gentle "this is for grown-ups," not a red lock icon.]_
- **Mira tries to long-press a subject to archive it.** Same redirect copy (per v1 §5 — admin-gated for minors).
- **Mira leaves the app, opens it later.** No re-onboarding. She lands on home with her single subject and material visible.
- **Notification copy uses Mira's name.** "Lust auf eine kleine Übungsrunde, Mira?" — opt-in, off by default.
- **Voice prompts use du, not Sie.** Tone scales per profile age (v1 §16). Mira's profile gets the warmer/slower tone.
- **The first time Mira gets a wrong answer:** the hint chain copy is gentler. "Nicht ganz — versuch's nochmal" rather than the more terse adult variant. _[implied — needs design: per-age tonal variants of feedback strings.]_

**Anna's check-in (a week later):**

11. **Anna long-presses her own phone's home avatar.** Biometric unlocks. Admin overview. She sees Mira's profile card with streak, weekly minutes, mastered/struggling topics.
12. **She drills in**, sees Mira has been doing 10–15 min/day, "Mathe – Bruchrechnen" in struggling. Anna doesn't need to do anything; just being informed is the value.
13. **She closes admin.** Single tap "Zurück zur Lern-Ansicht." Hands phone back to Mira.

---

### 1.5 "Ich war 3 Wochen weg" — returning user, gentle re-entry

**Lena** has not opened the app in 22 days. Mother's account, minor profile. Has 4 subjects, 30+ materials, FSRS state has aged.

1. **Lena opens the app.** Cold launch. SQLite local data still present.
2. **Consent version check** — assume unchanged, no re-consent.
3. **App drops directly into home.** Same warm greeting. **No banner, no "Welcome back!", no "You missed 22 days," no count of stale items.** This is non-negotiable per DESIGN-BRIEF.
4. **Home shows same subject grid.** Tiles are unchanged. No "Test in N Tagen" chip — assume no folder dates are within the next 7 days. _[If a test date is now in the past — i.e. the test happened while she was away — the chip simply doesn't show. The folder lingers but no longer pulses; see §1.1 step 19 "after-test reflection" idea.]_
5. **Lena taps "Mathe" → "Üben".** FSRS picks 20 items quietly — these are heavily-due ones from before her absence, plus some "less due" ones that got more due by aging. She just sees the first question.
6. First answer wrong. Hint. Second answer right. The session is harder than her last session because everything's gotten "more due" — but the UI says nothing about that.
7. **Session result.** "Heute geübt!" Streak chip shows 1 (the streak counter restarts on first new day of activity — see §8). _[implied — needs design: how does streak handle gaps? Recommend: streak counts consecutive days; gap > 1 day resets to 1. No "you lost your streak" copy ever. The result just shows "1" again as a fact.]_

**Admin-side counterpart:**

8. **Mom opens admin.** Profile card shows last-active "Vor 22 Tagen" — informational, not alarming.
9. **Drill in.** "Diese Woche: 8 Min." Mastered/struggling topics unchanged from 22 days ago.
10. Admin sees nothing accusatory either. _[implied — needs design: design rule that admin labels never use shaming language like "Mira hat lange nicht geübt." Use neutral "Vor X Tagen aktiv."]_

**Edge cases:**
- **Subscription expired during the 22 days.** On open: existing items + practice runs work; admin banner shows "Probemonat vorbei — jetzt abonnieren." Learner-side: "Mehr Fragen" and "Erklär mir das" disabled with a kind message: "Dafür braucht es ein Abo — frag eine erwachsene Person." (For solo adults the copy is just "Abo nötig — jetzt verwalten.")
- **Consent version changed during the 22 days.** Cold launch triggers re-consent screen (v1 §1). Once accepted, normal flow.
- **App version is significantly behind store version.** See §1.12 "App-Update bricht was."

---

### 1.6 "Ich kapier die Frage selbst nicht" — confusion recovery

A subtle case: the learner isn't wrong about the *answer*, they're wrong about *what's being asked*. Distinct from "I don't know the answer."

**Setup:** Item question: "Berechne die Steigung der Geraden y = 3x − 4." A learner who's never seen "Steigung" might not parse the word.

1. **Lena reads the question, frowns.** She doesn't know what "Steigung" means. She has options:
   - **Tap the speaker icon** to hear it read aloud — doesn't help; she just hears the word.
   - **Tap "Erklär mir das"** — opens explain modal (per v1 §7).
2. **Critical design decision: "Erklär mir das" is ambiguous.** Does she want the concept explained (Steigung) or the *question itself* explained? Currently the docs treat it as one modal with style picker.
3. **Recommendation [implied — needs design]:** the "Erklär mir das" modal should show **two tabs or two cards at top:**
   - **"Was bedeutet die Frage?"** → LLM gets prompt P4 with a special style "decompose-question": breaks down what the question is asking, without giving the answer. Example output: "Du sollst die Steigung herausfinden. Die Steigung ist die Zahl vor dem x. Schau dir y = 3x − 4 an."
   - **"Erklär das Konzept"** → standard P4 with simpler/step-by-step/analogy styles.
4. **She taps "Was bedeutet die Frage?"** Reads. Now she knows: she's looking for "3." Closes modal. Types 3. Correct.

**Alternative recovery paths:**
- **"Überspringen" button [implied — needs design].** Inside a session, a small "Überspringen" or "Später" option marks the item `verdict='skipped'` (per v1 §7) and moves on. Skipped items come back in a future session, not punitively. **Critical:** this should be small/secondary so it doesn't become the default escape. Placement: behind a "Mehr Optionen" disclosure that also contains "Erklär mir das" — so skipping requires one extra tap.
- **"Diese Frage ist unklar" feedback.** Learner can flag a question as confusing/wrong (see §1.7 below).

**Edge cases:**
- **Question reads correctly but contains a typo from vision** (e.g. "Berechne die Steigugng"). Learner is confused but the answer is still computable. Flag-as-bad path (§1.7) recovers.
- **Question depends on a stimulus that didn't render** (e.g. SVG sanitization stripped it). The question text alone is meaningless. The app should detect: if stimulus_kind ≠ none in the source data but rendering failed, fall back to text-only with an inline note "Bild konnte nicht angezeigt werden — du kannst die Frage trotzdem beantworten." _[implied — needs design]_

---

### 1.7 "AI macht Fehler in der Bewertung" — kid swears they got it right, app said wrong

**The hardest social interaction in the app.** Mira typed "Photosynthese ist wenn Pflanzen Licht in Energie umwandeln" and got `partially_correct` with feedback "fast richtig, aber was passiert mit dem CO₂?" Mira is convinced she nailed it.

**Current docs:** No appeal flow exists. This is a v1 gap.

**Proposed design [implied — needs design]:**

1. **Below the verdict card, after a `partially_correct` or `incorrect` verdict**, a small text link: "Stimmt das nicht?" (NOT a button, NOT prominent — secondary affordance).
2. **Mira taps it.** Sheet: "Was meinst du?" with three options:
   - **"Meine Antwort war richtig"** — recorded as a learner-reported false-negative.
   - **"Die Frage ist falsch oder unklar"** — flagged for admin/dev review.
   - **"Egal, weiter"** — dismiss, return to session.
3. **If "Meine Antwort war richtig":**
   - The attempt is **not re-evaluated** — verdict stays for FSRS purposes (otherwise kids gaming the system trivially).
   - A small message: "Danke! Wir schauen uns das an. Du kannst trotzdem weitermachen."
   - Internally: writes a `learner_appeal` event with item_id, attempt_id, kid_answer, server_verdict. Account holder sees these on the admin overview (a quiet list, not a count badge).
4. **Account holder review on admin:**
   - New section: "Antworten, bei denen Mira einsprach (3)" — list of items, each shows question, kid's answer, app verdict, and **two buttons: "Antwort war richtig" / "App lag richtig."**
   - "Antwort war richtig" → flips the attempt's verdict to `correct`, recomputes FSRS state, updates mastered/struggling topics. The item itself is also flagged for review (could trigger a regeneration suggestion in admin).
   - "App lag richtig" → dismisses the appeal.
   - **Critical:** the account holder's decision should NOT be visible to Mira; she just sees, over time, that the disputed items show up in practice with corrected behavior. _[implied — needs design]_
5. **For solo adults:** same flow but admin reviews their own appeals — self-correction loop, useful for spotting bad questions in own material.
6. **Aggregate signal:** if a single item has been appealed by 3+ different attempts (the same item, generated once, replayed multiple times by FSRS), surface to admin "Diese Frage scheint problematisch" with a "Frage entfernen" shortcut.

**Distinct from:** "Diese Frage ist falsch generiert" — that's a question-quality issue, not a grading issue. Both flow into admin review but with different buttons.

---

### 1.8 "Ich hab Quatsch fotografiert" — accidentally scanned a recipe

**Tom (the adult solo learner)** was about to scan an anatomy textbook but his phone was open to the camera roll and he tapped a photo of his grandmother's lasagna recipe.

1. **He taps the gallery icon in capture** (per v1 §4 — album-pick is an option). Picks the recipe by mistake.
2. Thumbnail strip shows recipe. He doesn't notice. **Taps "Fertig."**
3. Subject/folder picker. He puts it in "Anatomie."
4. Upload happens.
5. AI runs P1 vision. Returns `error: "not_educational"` (per v1 §6).
6. **UI shows:** "Das sieht nicht nach Lernstoff aus. Magst du was anderes fotografieren?" with two buttons: **"Nochmal versuchen"** (returns to capture) / **"Zurück zur Übersicht"** (back to subject). Credit refunded.
7. **The half-created material is cleaned up:** no orphan row, no thumbnail in the subject. _[implied — needs design: ensure not_educational rejections do NOT leave material rows in `extraction_status='failed'`. Per v1 docs the material exists with failed status; the UI must hide failed `not_educational` materials from the subject list by default — they're a dead end.]_
8. **Tom laughs**, taps "Zurück zur Übersicht."

**Variants:**
- **Mixed accidentally:** he scanned 4 textbook pages + 1 recipe. Vision might return valid items but the safety guard triggers on the whole batch. Recommend: vision could be prompted to *skip* clearly non-educational pages but still process the rest. _[implied — needs design: P1 prompt currently rejects the whole batch on first non-educational signal. A finer-grained "skip this page" path would be more forgiving.]_
- **Sensitive content scanned by accident** (a personal letter, a medical receipt). Vision returns `not_educational`. Photos are still stored on Supabase Storage until the T+7 days raw photo wipe (per v1 §12). **Recommendation:** if `not_educational`, trigger an immediate photo deletion rather than waiting 7 days. _[implied — needs design: faster wipe for rejected content.]_
- **What if the recipe IS educational** ("Mein Sohn lernt mit Mama-Omas Lasagne, Bruchrechnen über Mengen")? The not_educational threshold is heuristic — there's no appeal currently. Recommend the rejection screen has a small "Doch verwenden" link that re-submits with an explicit `educational_override = true` flag. Uses one more credit. _[implied — needs design]_

---

### 1.9 "Vor dem Schlafen nochmal kurz" — the 5-minute micro-session

**Lena, 21:30, school night.** She wants to do 5 minutes and stop. Not a full session.

**Today's flow (per docs):** She taps "Üben," gets 20 items, has to quit manually after 5 minutes via the exit button. No length picker.

**Recommended design [implied — needs design]:**

1. **On the "Üben" CTA on subject or folder screen**, a small "5 Min / 10 Min / Alles" chip row below the primary button. Default to the user's preferred session length (a new self-controllable setting; see §9).
2. **She taps "5 Min."** FSRS picks ~8 items (heuristic: 5 min / 35 s per item average = 8–9). Session runs.
3. **Inside session, a small countdown** — but not a stress-inducing one. Just a faint progress bar at top labeled "5 Min." that fills as time elapses. No tick-tick-tick, no flashing.
4. **At 5 min, the next item completes**, then a soft "Das war's für heute. Schlaf gut!" — same result screen design, but with night-mode-friendly copy if the time is late. _[implied — needs design: time-of-day-aware result copy is a tiny delight moment.]_
5. **If she wants to keep going:** "Noch eine Runde" button.
6. **If she wants to bail early:** existing exit button works fine.

**Edge cases:**
- **Last item runs past the 5-minute mark.** Always let the current item finish — never cut off mid-answer.
- **5 Min picked but FSRS has no due items.** Show fewer items than estimated; ending naturally. The label might say "5 Min." but the session might end at 2 min — that's fine, "Alles geübt!" is the framing.
- **Quit button mid-5-min.** Same as regular quit — state preserved.

---

### 1.10 "Mathe-Übungs-Marathon" — locked into one problem type, 30 variants

**Tom, weekend afternoon.** He's drilling linear equations from a problem template. Wants to do many in a row.

1. **He's on a material item with a linked template** (per v1 §7 "More like this"). Result screen showed "10 ähnliche Aufgaben üben →." He's now done two runs of 10.
2. **After the second run's result screen**, "Nochmal 10 üben" and "Schwieriger 10" buttons. _[implied — needs design: the adjusted difficulty (per v1 §7) is automatic, but the user might want explicit "schwieriger jetzt" too.]_
3. **He taps "Schwieriger 10."** New run, parameters drawn from upper half of range (per v1 §7 `difficulty_adjustment`).
4. **Variant generation reaches 200 failures** on a tough constraint — UI shows "Aufgabe variiert nicht weit genug" (per v1 §7). Run ends early at variant 7. He doesn't lose progress.
5. **He taps back, picks another template** from a different material. Different topic, fresh start.

**Marathon-specific design considerations [implied — needs design]:**
- **Fatigue protection:** after 30+ items in a session (regardless of practice runs or normal sessions), suggest a break: "Du machst das super. Magst du eine kleine Pause?" Two buttons "Weiter" / "Pause." Non-blocking.
- **Streak-on-correct mini-celebration.** After 5 / 10 / 20 in a row correct, a quiet inline marker — a small "+5" or a check streak — at the top of the next item. NOT a celebration screen. _[See §8 lifecycle: first positive streak.]_
- **Auto-saved practice run state.** If Tom quits mid-marathon, returning to the same template shows "Du warst bei Übung 7/10. Weitermachen?" _[implied — needs design.]_
- **No "you've done X today" counter ever surfaces on home.** The marathon is its own world; home stays calm.

---

### 1.11 "Bus / Bahn / Offline" — full offline journey

**Mira, on the bus home from school. No service.**

1. **She opens the app.** SQLite cached. Subjects, folders, materials, items all available.
2. **App detects no network** via HEAD probe (per v1 §15). Soft offline banner appears at top of home: "Offline — du kannst weiter üben." Non-alarming, dismissible (but reappears on next route change).
3. **She taps Mathe → Üben.** FSRS picks from local DB. Same UX.
4. **She answers items via voice.** Voice runs entirely on-device (per v1 §9). Transcripts displayed.
5. **First item: local evaluator returns correct.** Silent advance.
6. **Second item: long-answer.** Local evaluator always returns unknown for `long` (per v1 §7). Without network, the LLM can't grade. **Per docs**, the attempt is queued as `pending` with "wartet auf Internet" message. The next item is shown.
7. **Third item: numeric with parse failure.** Same — pending.
8. **She finishes 12 items, 4 of which are pending.** Session result still shows: "Items geübt: 12. Sicher: 6. Warten noch auf Bewertung: 4. Noch unsicher: 2." _[implied — needs design: the result screen has to gracefully include the "pending" bucket without making it feel like incomplete work. Recommend three-bucket layout: sicher / wartet noch / unsicher.]_
9. **She quits.** Closes app.
10. **30 minutes later, on home wifi.** App opens, NetInfo detects reconnect. Sync engine fires. Outbox drains:
    - 12 attempts batched to `/attempts/batch`.
    - 4 pending evaluations sent one-by-one to `/attempts` (streaming finalize per v1 §15 outbox table).
    - Each finalized attempt updates verdict locally.
11. **Mira opens the app later that evening.** She doesn't see the sync happen. But on the subject screen, the previously-pending items have now been graded — and the FSRS state has updated. She just sees her next practice session.
12. **Admin (mom)** sees same data with no special banner unless something failed.

**Edge cases inside offline:**
- **Photo capture offline.** Per docs (v1 §4) photo capture "requires network" but the design says capture can happen offline with deferred upload. **Resolution [implied — needs design]:** capture works offline, photos buffered in local storage, upload + extraction kicks off on reconnect. UI: thumbnail shows in subject with a small "Wartet auf Internet" overlay; tapping it shows "Wird verarbeitet, sobald du wieder online bist." No error.
- **Trying to tap "Mehr Fragen" offline.** Disabled state with copy: "Geht nur online." _[implied — needs design.]_
- **Trying to tap "Erklär mir das" offline.** Same — disabled, "Geht nur online."
- **Offline subscription check.** App doesn't ping subscription state offline. Cached state used. Trial expiry: if cached subscription says trial is active but the trial actually expired during offline period, the LLM calls will fail on reconnect and the result will appear after — handled in §4 below.
- **Outbox 4xx (validation error) for a pending attempt.** Item stays as "pending — Probleme bei der Bewertung." Surfaces only to admin (per v1 §15).
- **Multi-day offline.** Outbox grows. No size limit currently. Recommend a soft cap of e.g. 500 outbox rows, with the oldest non-attempt entries (e.g. archive ops) coalescing. _[implied — needs design.]_

**Captive portal special case:** see §4.

---

### 1.12 "App-Update bricht was" — force-update, migration, data preservation

**Mira's mom has auto-updates enabled. A new version ships with a breaking schema change.**

1. **App launches.** A bootstrap check compares the local DB migration version with the bundled migrations. Drizzle migrates schema (per v1 §1). Migration completes silently if non-breaking.
2. **If migration fails** (e.g. SQLite corruption), app shows: "Ein kleines Problem beim Vorbereiten. Wir laden deine Daten neu vom Server." App pulls fresh from server, populates local DB. **Critical:** outbox entries pending sync must be preserved or surfaced to the user.
3. **If outbox can't be replayed against new schema:** "Einige deiner letzten Antworten konnten leider nicht gespeichert werden. Wir starten neu." _[implied — needs design: this is a non-trivial loss; offer a "Export-Backup" option before purge if outbox is non-empty.]_

**Force-update path:**

4. **App version is 2 major versions behind.** Cold launch hits a small endpoint `GET /version-info` (or compares against a stored constant in the JS bundle). If outdated, full-screen modal: "Es gibt eine wichtige Aktualisierung. Bitte aktualisiere die App, damit alles wieder funktioniert." Single button: "Im Store öffnen." Deep link to App Store / Play Store. _[implied — needs design: force-update endpoint and UI not in current docs.]_
5. **No "skip" option** on force-update for breaking changes. Soft-update banners (non-blocking) for minor changes.

**Migration of in-flight data:**

6. **Capture-in-progress when update happened:** if user was mid-capture (photos taken but not uploaded), the local photo blobs should persist across app updates. On relaunch, show: "Wir haben deine Fotos vorhin gefunden. Magst du weitermachen?" with "Ja" / "Verwerfen" buttons. _[implied — needs design.]_
7. **Active session when killed for update:** session state preserved (per v1 §7), can resume on next launch. _[implied — needs design: explicit "Möchtest du fortsetzen?" prompt on relaunch.]_

---

## 2. Voice-answer help patterns — full ASR + LLM hint logic

The user's explicit request: "AI hilft wenn man ein Wort vergessen hat." Section §1.2 covered the headline case in journey form; this section is the complete decision tree and pattern library.

### 2.1 Tip-of-tongue detection (client-side)

Heuristics that flag a transcript as a help-request rather than an answer. Runs before sending to LLM evaluator:

- **Filler density.** ≥ 3 fillers per 10 words → flag. Fillers (per locale):
  - de: `äh`, `ähm`, `hmm`, `also`, `halt`, `naja`, `irgendwie`
  - en: `uh`, `um`, `like`, `you know`, `sort of`
  - fr: `euh`, `ben`, `quoi`, `genre`
  - es: `eh`, `bueno`, `o sea`, `pues`
  - it: `eh`, `cioè`, `tipo`
- **Help-phrase regex.** Per locale, e.g. de: `/wie heißt|weiß ich nicht|hilf|kannst du|das ding|das wort|tipp|hinweis/i`.
- **Stuck-prefix.** Same 2–4 character prefix repeated ≥ 2 times within the transcript (e.g. `Mito… Mito… Mit…`).
- **Trailing rising intonation** — not detectable from text alone; ASR doesn't return pitch. Skip.
- **Self-referential negation.** `nicht mehr`, `vergessen`, `weiß nicht`.

If any of these fire, **do not evaluate** — enter help mode.

### 2.2 Help-mode UI states

A small assistive card replaces the verdict area:

- **State: Hilfe-Modus aktiv** — "Magst du einen Tipp? Ich helfe Schritt für Schritt."
- Buttons: **"Stufe 1"** / **"Nein, ich versuch's nochmal"** / **"Antwort tippen"**.

State progresses with each tap. Each Stufe button reveals incrementally more information (see §1.2 staircase).

### 2.3 Confidence-low transcript decision

```
ASR returns transcript:
  ├── confidence > 0.7 → evaluate normally
  ├── confidence 0.5–0.7 → show greyed transcript with "Hast du das gemeint?"
  │      ├── confirm → evaluate
  │      └── redo → mic re-opens
  └── confidence < 0.5 OR empty → "Konnte dich nicht verstehen — nochmal?"
```

### 2.4 Re-prompt vs guess

If transcript has high confidence but the local evaluator says "unknown" (i.e. probably wrong), do NOT re-prompt — go to LLM. The user said what they said. Re-prompting frustrates.

If transcript has low confidence, re-prompt. Don't make the user defend a transcript the app isn't sure it captured.

### 2.5 Mid-sentence self-correction

Detect `nein`, `halt`, `warte`, `stopp`, `neu`, `Moment` followed by new content.

- **Visual:** old text greys out with strikethrough briefly (300 ms), then disappears.
- **Evaluation:** only the post-correction portion is sent.
- **Edge:** if "nein" appears mid-content but no new content follows ("nein, das war's"), treat as cancel — don't evaluate, return to mic prompt.

### 2.6 Stuttering, restart, "warte, neu"

- **Stutter:** same prefix repeated. Detect and silently consolidate: `"Foto… Foto… Photosynthese"` → evaluate as `"Photosynthese"`.
- **Explicit restart:** `"warte, neu"`, `"nochmal"`, `"von vorne"`. Cancel current transcript, re-enter listening state.
- **Visual:** brief shake animation on the transcript field to acknowledge the restart. _[implied — needs design.]_

### 2.7 "Ich weiß es nicht"

Detect: `"ich weiß es nicht"`, `"keine Ahnung"`, `"weiß ich nicht"`, `"ich hab's vergessen"`, exact + variants.

- **App responds:** "Kein Problem. Magst du einen Tipp oder lieber überspringen?"
- Two buttons: **"Tipp"** / **"Überspringen"**.
- Tip → enters help-mode staircase at Stufe 1.
- Skip → `verdict='skipped'`, item returns later. _[Per v1 §7.]_

### 2.8 "Kannst du mir helfen"

Detect: `"hilf"`, `"hilfe"`, `"kannst du helfen"`. Enter help-mode directly at Stufe 1 (skip the "magst du einen Tipp?" gating step — they already asked).

### 2.9 Ambient noise / unclear

- ASR confidence < 0.3 or zero text → "Konnte dich gerade nicht verstehen — vielleicht ist es zu laut?" Two buttons: **"Nochmal sprechen"** / **"Tippen"**.
- 2 consecutive failed mic attempts on the same item → auto-switch to keyboard with copy: "Lieber tippen heute?"

### 2.10 Wrong-language answer

User answers German question in English (or vice versa). Local evaluator never matches. LLM (P3) recognizes the equivalence.

- **LLM feedback:** "Stimmt inhaltlich. Magst du es nochmal auf Deutsch versuchen?" _[implied — needs design: explicit P3 prompt instruction to flag and gently re-prompt.]_
- **Counted:** as correct for FSRS (you knew the concept), but the second attempt in the target language is encouraged.

### 2.11 Long pause without any answer

- After 8 s of silence (no transcript started), mic auto-closes.
- UI: "Habe nichts gehört. Magst du es nochmal versuchen oder lieber tippen?"
- _[implied — needs design: explicit auto-timeout threshold.]_

### 2.12 Voice retry / redo affordance

After a transcript is captured but before submission, learner can:

- **Tap a "Nochmal sprechen" button** → discards transcript, re-opens mic.
- **Tap "Tippen"** → switches to keyboard, transcript prefilled (editable).
- **Tap submit** → evaluate.

The redo affordance must be visible after the mic stops, not hidden in a menu. _[implied — needs design: explicit redo button placement.]_

### 2.13 Voice + long-answer mode

For `long` answer kind, the user may speak for 30+ seconds. VAD must extend silence threshold — recommend a "Continue speaking?" mode where a longer pause (e.g. 3 s) is the trigger, with a soft "Noch was?" cue and another 5 s window. _[implied — needs design: per-answer-kind silence thresholds.]_

### 2.14 Voice + math input

For `numeric` and `formula`, voice transcript is parsed through the MathLite normalizer. Spoken `"zwei x hoch drei"` → `"2x^3"`. Spoken `"einundzwanzig Komma fünf"` → `"21.5"`. The MathLite parser handles common spoken patterns. _[v1 §10 covers voice → math input; the spec for spoken-formula vocabulary needs to be enumerated. See §8 below.]_

### 2.15 Voice + multiple choice

Spoken: `"die zweite"`, `"B"`, `"Mitochondrium"` (the answer text). Match priority: explicit option label > option index > content match. _[implied — needs design.]_

### 2.16 Voice + diagram label

Standard short answer; same flow as §1.2.

---

## 3. Full edit / delete / undo matrix

For every editable entity, the complete inventory of operations. This is the table that ensures no operation is forgotten.

### 3.1 Entities

| Entity | Owner | Edit | Long-press affordance | v1 reference |
|---|---|---|---|---|
| Account | Account holder | Admin only | n/a | v1 §2 |
| Profile (the single learner) | Account holder | Admin only | n/a | v1 §3 |
| Subject | Account holder; learner if adult; minor → admin gate | Yes | Yes | v1 §5 |
| Folder | Same as subject | Yes | Yes | v1 §5 |
| Material | Same as subject | Yes | Yes | v1 §5 |
| Item (question) | Learner allowed (delete only); admin for restore | Delete only | Yes | v1 §5 / §6 |
| Attempt | Append-only | Never | n/a | v1 §15 |
| Practice run | Append-only summary | Never | n/a | v1 §7 |
| Avatar | Self-controllable | Yes | n/a | DESIGN-BRIEF |
| Notification settings | Admin | Yes | n/a | v1 §14 |

### 3.2 Operation matrix

For each entity-operation pair: who can do it, what UI element, what confirm, what undo, what sync.

#### Subject

- **View** — tap tile on home. Free.
- **Edit metadata (name, color, icon)** — long-press → "Bearbeiten." Admin gate for minor. Modal form. Save: LWW write, sync via outbox.
- **Rename only (quick path)** — tap title in subject header → inline edit. _[implied — needs design: in addition to context menu, allow inline edit on title tap. Matches DESIGN-BRIEF "consistent edit pattern" call.]_
- **Reorder** — long-press → drag, or admin reorder screen. _[implied — needs design: drag-reorder on home grid; sort_order field exists per v1 §5.]_
- **Move** — n/a (subjects are top-level).
- **Archive** — long-press → "Archivieren" → confirm "Soll dieses Fach archiviert werden? Du kannst es 30 Tage lang wiederherstellen." Soft-delete, 30-day window.
- **Restore** — admin → archived → "Wiederherstellen."
- **Hard delete** — auto after 30 days, or via account deletion.
- **Bulk operations** — multi-select on home? _[implied — needs design: not in docs. Recommend: long-press one tile enters multi-select mode; tap others to add; bar at bottom: "Archivieren (3)."]_
- **Undo (snackbar)** — after archive: "Fach archiviert. Rückgängig." (5 s). _[implied — needs design: snackbar pattern not explicit in docs.]_
- **Confirm dialog** — only for archive (because 30-day recovery exists).
- **Cross-device sync** — write goes to outbox → server → other devices pull. Within ~60 s of foreground.
- **Edit while offline** — local write + outbox enqueue. Subject appears archived immediately on this device.
- **Conflict** — LWW by `updated_at` (per v1 §15). If another device archived first with same `updated_at`, server-side last-write wins by row version.

#### Folder

Same as subject, plus:

- **Edit date / remove date** — folder edit form has date chip with "Entfernen" button.
- **Move** — n/a (folders belong to one subject). _[implied — needs design: doc doesn't allow moving folder between subjects. Confirm this is intentional or needs design.]_

#### Material

- **View** — tap row.
- **Rename** — long-press → "Umbenennen" → text field → save.
- **Move (between folders or out)** — long-press → "Verschieben" → picker including "Ohne Ordner."
- **Move (between subjects)** — `[implied — needs design]`. Not in current docs. Recommend: picker shows all subjects, when subject changes, folder list updates.
- **Add more photos** — long-press → "Mehr Fotos hinzufügen" (per v1 §4 — needs explicit trigger).
- **Archive** — long-press → "Archivieren." 30-day recovery.
- **Restore** — admin → archived.
- **Bulk archive** — multi-select. _[implied — needs design.]_
- **Undo snackbar** — yes.
- **Edit metadata (e.g. subject_kind change?)** — `[implied — needs design]`. Materials inherit subject_kind from subject. If subject is changed via "move between subjects," does subject_kind re-evaluate? Recommend: subject_kind is per-subject; moving a material doesn't change its items, but new items would be generated under the new subject_kind. **Confirm dialog needed for cross-subject move:** "Verschieben in ein anderes Fach? Die bestehenden Fragen bleiben so, neue Fragen folgen den Einstellungen des Fachs."

#### Item (question)

- **View** — within session, or read-only in admin material drill-in.
- **Edit content** — **not supported** per v1 §6 (only deletion). _[Confirm: the docs explicitly say no rewrite. Design must not show an "Edit question" affordance.]_
- **Delete** — long-press → "Diese Frage entfernen" → confirm. Soft-archive. **Learner can do this without admin** (per v1 §16).
- **Restore** — admin → archived → items tab.
- **Bulk delete** — multi-select questions in admin? _[implied — needs design.]_
- **Undo snackbar** — yes, immediately after delete.
- **Flag as wrong/bad** — see §1.7 appeal flow.

#### Attempts and practice runs

- **View** — admin can see in the read-only material item list (per v1 §13). _[implied — needs design: is per-attempt history visible? Recommend: no — too much detail; only aggregated topic mastery.]_
- **Edit / delete** — never. Append-only.
- **Reset profile data** — `[implied — needs design]`. If account holder wants to wipe FSRS state without deleting the account, is there a "Reset all progress" option? Recommend yes, in admin → profile → "Lernfortschritt zurücksetzen," with strong confirm. Useful when changing grade level dramatically.

#### Avatar (self-controllable)

- **Change** — small avatar icon on learner home → opens picker → save. No admin gate. _[implied — needs design: where the avatar picker lives on the learner surface. Recommend a quiet settings sheet accessible from the header avatar tap-and-hold (but tap = admin, so maybe a separate gesture or a small "Profil anpassen" link inside hello-banner).]_

### 3.3 Bulk operations

Currently the docs imply only single-entity operations. Adding bulk:

- **Multi-select trigger:** long-press one item, secondary long-press / tap toggles others.
- **Bottom action bar:** "Archivieren (N)" / "Verschieben" / "Abbrechen."
- **Confirm:** "Sollen 4 Materialien archiviert werden?"
- **Snackbar:** "4 Materialien archiviert. Rückgängig."

Apply to subjects, folders, materials, items.

### 3.4 Undo patterns

- **Inline snackbar:** appears bottom, 5 s timeout. Tap "Rückgängig" → re-creates entity, removes from archive, re-syncs.
- **Explicit undo via admin → archived:** always available within 30 days regardless of whether snackbar timed out.
- **Hard delete (after 30 days):** no undo. The 30-day archived screen is the user's safety net.

### 3.5 Confirm dialogs (when, when not)

- **No confirm for:** rename, change color, change icon, move between folders, attaching/removing folder date.
- **Confirm for:** archive (anything), delete question, archive profile, archive subject containing materials.
- **Strong confirm (re-type or hold-to-confirm) for:** account deletion (per v1 §12 — re-type email). _[implied — needs design: should subject archive show count of contained materials in the confirm dialog? Recommend yes: "Dieses Fach enthält 12 Materialien. Sollen alle mit archiviert werden?"]_

### 3.6 Cross-device sync of edits

- **Phone is the primary device.** iPad (or another phone) is secondary. Both run the same outbox-and-pull machinery.
- **Edit on phone, iPad has stale data:** iPad pulls within 60 s of next foreground. UI updates silently.
- **Concurrent edits:** LWW by updated_at. The "loser" device pulls and overwrites local with server.
- **Concurrent archive / restore:** if device A archives and device B restores simultaneously, server picks the later updated_at. _[implied — needs design: edge case where both ops land in same second.]_

### 3.7 Edit while offline → outbox

- All writes go to outbox.
- Local DB updated immediately.
- Outbox drains on reconnect.
- If a write fails (4xx), the local state is the user's expected state, but admin sees a sync banner. The next pull may overwrite the local state.

### 3.8 Conflict resolution

Per v1 §15, server is authoritative:
- **attempts:** append-only by client_id. No conflict.
- **item_states:** server-recomputed. Mobile discards local.
- **subjects, folders, materials, items:** LWW by `updated_at`.
- **practice_runs:** upsert by client_id.

**[implied — needs design]:** what does the user see when their local state diverges from server (because of a 4xx or because another device wrote)? Currently the docs say no visible learner-side error; admin sees a banner. Consider a small "Synchronisiert" subtle indicator when sync happens, but **only on first reconnect after offline period** so it doesn't become noise.

---

## 4. Real-world edge cases (beyond docs)

Exhaustive list. Organized by category.

### 4.1 Network

- **Captive portal (hotel wifi).** App appears online (NetInfo says yes) but HTTPS fails. HEAD probe (v1 §15) catches this — banner becomes "Verbindung wird geprüft …" then "Offline — du kannst weiter üben." _[implied — needs design: distinct copy for "fake online" vs. true offline.]_
- **VPN active.** Some corporate VPNs block Vertex / Supabase domains. App sees rejected fetches. Treat as offline. Surface diagnostic option in admin → about: "Verbindung testen" button.
- **Slow 3G (e.g. < 50 kbps).** Uploads timeout. Show "Upload dauert länger als gewohnt — möchtest du es später versuchen?" with "Warten" / "Später" buttons. "Später" queues upload.
- **Intermittent connection.** Outbox retries with exponential backoff (per v1 §15). User sees nothing unusual.
- **Data saver mode (Android system setting).** App should respect — recommend a "Datensparmodus" toggle in admin that lowers upload image quality (see §9 settings).
- **Roaming.** Roaming flag (iOS/Android API) can trigger a settings hint: "Du bist im Ausland — soll die App weiter Daten nutzen?" Toggle off → offline mode forced until back home. _[implied — needs design.]_
- **No data, only wifi available.** Same as offline when no wifi.
- **DNS hijack / corporate proxy:** uploads succeed but vision call returns weird errors. Surface generic "Hmm, das hat nicht geklappt. Versuchen wir's nochmal?"

### 4.2 Permissions

- **Camera revoked after granted.** On capture screen open, check permission. If revoked: full-screen card "Wir brauchen die Kamera-Erlaubnis. Öffne die Einstellungen." button "Einstellungen öffnen" deep-links to app settings. After return, re-check.
- **Mic revoked after granted.** Same pattern, on voice button tap.
- **Speech recognition revoked (iOS).** On voice button tap, same pattern.
- **Notification permission revoked.** On admin → notifications, show "Aktuell nicht erlaubt — Einstellungen öffnen." Toggles are visually-disabled until re-granted.
- **iOS Limited Photos (partial album access).** When picking from album, only show selected photos. No special handling needed.
- **Background mic** — app does not record in background. Foreground only.
- **First-launch permissions stack:** never prompt before context. Camera at first capture, mic at first voice. Notifications at first admin-side enable.

### 4.3 Device

- **Low battery (< 10%, Battery Saver mode on Android).** Reduce animations (respect Reduce Motion implicitly). _[implied — needs design.]_
- **Low storage.** SQLite writes may fail. Catch and show "Speicher fast voll — bitte schaffe etwas Platz." with a guide. _[implied — needs design.]_
- **RAM-killed app mid-action.** On relaunch:
  - **Mid-capture:** see §1.12 — recover photos.
  - **Mid-upload:** outbox already queued or upload in progress; check material `extraction_status` on relaunch.
  - **Mid-session:** session state preserved per v1 §7. Show "Möchtest du fortsetzen?" prompt. _[implied — needs design: explicit resume affordance.]_
  - **Mid-AI-extraction:** material has `extraction_status='pending'`. Poll on next foreground (per v1 §17).
- **OS-level interruption: incoming call mid-voice.** Mic interrupts. App should detect AVAudioSession interruption and pause the mic gracefully. Show "Anruf hat dich kurz unterbrochen — magst du nochmal sprechen?" _[implied — needs design.]_
- **Alarm fires mid-session.** Same handling. Session state preserved.
- **System notification (banner) fires mid-session.** No app action; user dismisses banner, returns to session naturally.
- **Phone falls asleep mid-voice recording.** Mic stops on screen-off. Transcript so far retained. On resume: "Magst du es nochmal versuchen oder das hier abschicken?" with transcript shown.

### 4.4 Time

- **Timezone change (travel).** FSRS state is server-recomputed; not affected by local time. Notification scheduling: respect new local time. _[implied — needs design: re-schedule notifications on timezone change detection.]_
- **DST transition.** Local notifications scheduled by clock time: 16:30 stays 16:30. expo-notifications handles this.
- **System clock manually changed.** Don't trust local clock for streak counting; use server-stamped events. _[implied — needs design: streak computation source-of-truth.]_
- **Leap day (Feb 29).** Date pickers must allow it. Notifications scheduled for Feb 29 should fall back gracefully on non-leap years. _[implied — needs design.]_
- **Midnight rollover mid-session.** Streak counter: does today's session count for today or tomorrow? Use session start time. _[implied — needs design.]_

### 4.5 Locale

- **Phone language ≠ profile UI language.** Profile language wins for learner surface. OS-level prompts (camera permission) follow phone language. _[implied — needs design: this can produce mixed-language screens at permission moments. Accept as inevitable.]_
- **Switching mid-flow.** Changing profile UI language reloads all i18n. Pending streams (LLM evaluation, explain) may have started in old language — let them complete, new requests use new language.
- **Material language ≠ profile language.** Question is in English (foreign language subject), profile UI is German. Question text stays English; chrome (buttons, etc.) stays German. Voice recognizer follows material language for that item.

### 4.6 Storage

- **Local DB corruption.** Drizzle detects on open. Re-create DB, pull full data from server (per v1 §1). If user is offline → "Wir konnten deine Daten nicht laden. Sobald du wieder Internet hast, machen wir das."
- **SD card removed (Android).** SQLite is internal storage — not affected. If user moved app data to SD: re-prompt.
- **Photo gallery cleared.** App-internal cache cleared if user does "Clear cache." Cached items reload from server. No data loss.
- **Cache filled.** Image cache (study assets) is purged LRU-style. _[implied — needs design: explicit cache management.]_

### 4.7 Account

- **Same email already used.** Signup returns 409. UI: "Diese E-Mail hat schon ein Konto. Magst du dich einloggen?" Login link.
- **Weak password.** Supabase enforces minimum 6 chars; recommend stricter UI (min 8, hint: "ruhig länger"). _[implied — needs design.]_
- **Expired session.** Supabase JWT expired, refresh token rotated. App silently refreshes (per v1 §2). If refresh token revoked → forced re-login. Show: "Bitte melde dich nochmal an" without alarm.
- **Refresh token revoked (e.g. password changed on another device).** Same as above — forced re-login.
- **Account locked by Supabase** (e.g. brute-force protection). Show "Konto vorübergehend gesperrt — bitte 15 Minuten warten." _[implied — needs design.]_
- **Email change without verifying new address.** Per v1 §17 — currently `[implied — needs design]`. Recommend: change-email flow sends verification to new address; old email remains active until new is verified; if new not verified within 7 days, change is reverted. Show pending banner in admin.
- **Account holder forgets PIN AND password AND biometric unavailable.** Standard password reset via email (per v1 J9). If email also lost, contact support — no in-app recovery. _[implied — needs design: a "Support kontaktieren" path in the unlock screen after N failed attempts.]_

### 4.8 Subscription

- **Trial expired while offline.** On reconnect, subscription status updates. Existing items still work; "Mehr Fragen" / "Erklär mir das" disabled. Admin sees banner. Learner sees disabled state.
- **RevenueCat down.** Purchase sheet won't open. Show "Konnten den Store gerade nicht erreichen. Versuch's gleich nochmal." _[implied — needs design.]_
- **Store receipt pending (Apple "Ask to Buy").** Subscription created with `status='pending'` (or whatever RevenueCat maps to). Treat as trial-equivalent until resolved. Admin shows "Wir warten auf die Bestätigung des Stores." _[implied — needs design.]_
- **Refund after purchase.** RevenueCat webhook updates status. App detects on next sync. Treat as cancelled — usable until period end, then disabled.
- **Family Sharing edge cases.** If a parent subscribes via Apple Family Sharing and shares with a child's account, RevenueCat receipts vary. Document that family-sharing is supported per Apple's mechanism (not LearnBuddy-side family). _[implied — needs design.]_
- **Subscription expires mid-session.** Continue session (per v1 §17). On next "Mehr Fragen" tap, show disabled state.
- **Restore purchase on reinstall.** Admin → subscription → "Käufe wiederherstellen" button (per v1 §11). RevenueCat restore flow runs.

### 4.9 DSGVO

- **Export download URL expired (24 h).** User taps link in email after 24 h. Server returns 410. User comes back to app → admin shows "Letzter Export ist abgelaufen. Neuer Export?" button. _[implied — needs design.]_
- **Multiple export requests in flight.** Reject second `POST /dsgvo/export` while one is `pending`: "Du hast schon einen Export angefordert — wir schicken dir die E-Mail in ein paar Minuten."
- **Deletion request while subscription active.** Submit deletion. Subscription continues to charge until period end OR user cancels separately. Show in deletion confirm: "Dein Abo läuft noch bis [Datum]. Bitte kündige es im Store, wenn du das möchtest." Deep link to manage subscription. _[implied — needs design: combine deletion + auto-cancel subscription prompt.]_
- **Cancel deletion within 7 days.** Per v1 §12 — works.
- **Reverify identity on deletion request:** re-type email confirms (per v1).

### 4.10 Multi-device

- **Same account on iPad and phone.** Both sync via outbox/pull. Edits on phone propagate.
- **Stale data on iPad.** iPad pulls on foreground; sync engine timer runs.
- **Cross-device session conflict.** Both devices try to start a session for the same items. Attempts are append-only by client_id, so both succeed; the LWW state is per-item, server-computed.
- **iPad signed in, phone signed in, mom on phone wants to look at child's data — but child is on iPad.** Same account, single profile. Both see the same data; iPad usage updates phone's view within ~60 s.

### 4.11 Email

- **Verification email undeliverable.** Hard bounce on Supabase side. App polls auth state; if not verified after 5 min, show "E-Mail nicht angekommen? E-Mail nochmal senden" + "E-Mail-Adresse korrigieren." _[implied — needs design: re-send and edit-email affordances on verify-email screen.]_
- **Email in spam.** Same recovery — re-send button after a delay.
- **Second consent request after first ignored.** If user signs up, ignores the verify email, comes back the next day: re-show verify-email screen with "Wir haben dir am [Datum] eine E-Mail geschickt. Nochmal?" _[implied — needs design.]_
- **Magic-link expired.** Tapping a 24-h-old magic link: error. App opens to login with "Dieser Link ist abgelaufen — neuen anfordern?"

### 4.12 Onboarding

- **User installs, never finishes setup.** App killed mid-onboarding. On relaunch: resume at last completed step. Don't re-show welcome. _[implied — needs design: explicit onboarding-resume.]_
- **Returns 30 days after starting onboarding.** Same. The account-signup partial state lives on Supabase; if email was created but not verified, the unverified user can re-verify or start over. _[implied — needs design: stale incomplete-onboarding cleanup policy.]_

### 4.13 Photo / vision

- **Rotated 90° / 180° / 270°.** Vision model handles arbitrary rotations. No special handling client-side.
- **Mirrored.** Selfie camera by default doesn't mirror in saved photo (iOS behaves this way). If user opens an actually-mirrored image from gallery, vision still works (text is just reversed-looking but model handles it).
- **Glare.** Quality scoring (per v1 §4) doesn't detect glare specifically. Recommend extending brightness check to detect localized bright spots. _[implied — needs design.]_
- **Finger over text.** Vision may return partial extraction. Recommend: post-process check — if `extracted_markdown` is suspiciously short, surface "Manche Stellen waren verdeckt — alles dran?" with retry. _[implied — needs design.]_
- **Multiple subjects on one page.** Vision extracts; items may cover both. Account holder can move material between subjects (per §3.2 above). _[implied — needs design: warn during capture or extraction "Erkenntlich Mathe + Bio — soll alles zu Mathe gehören?"]_
- **Handwriting unreadable.** Vision returns `unreadable` (per v1 §6). Standard refund + retry copy.
- **Mixed languages on one page** (German chemistry vocab list with English translations). `detected_language` returns primary; items may mix. _[implied — needs design: items should have their own language field per v1 §6 already; respect that for voice recognizer.]_
- **Photo is upside down vs. text.** vision handles it.
- **Photo is partially occluded by camera UI** (shouldn't happen in custom UI but possible with album pick from screenshot). Same as finger-over.
- **Photo is too high resolution and upload times out.** Pre-resize on client to e.g. 2048 px max. _[implied — needs design.]_

### 4.14 Voice

- **Heavy accent.** ASR may struggle. After 2 failed attempts → suggest keyboard.
- **Child voice / high-pitched.** Most modern ASR is fine. If consistently failing, suggest keyboard.
- **Two voices speaking.** See §1.2.
- **Background TV / music.** ASR may pick up other words. Help-mode detection should kick in for incoherent transcripts.
- **Phone-call quality / earbuds.** Generally fine.

### 4.15 Math parsing

- **`x2` ambiguity.** Per docs (v1 §10, 07 §4.2): `x2` is treated as `x_2` only when subscript syntax explicit; otherwise rejected. UI should hint: "Meinst du x² oder x mit Index 2?" on parse failure. _[implied — needs design: explicit ambiguity prompt.]_
- **German "x hoch 2" spoken.** Voice parser maps to `x^2`. _[See §8 spoken-math vocabulary.]_
- **Unicode superscript / subscript pasted in (`x²`).** MathLite parser should accept Unicode superscripts and normalize. _[implied — needs design: Unicode normalization in MathLite.]_
- **Missing operator.** `2 3` (space between). MathLite parser rejects with position. UI underlines the offending token, prompt: "Fehlt da ein Mal- oder Plus-Zeichen?" _[implied — needs design: more specific parse-failure copy.]_

### 4.16 Display

- **Very small phone (iPhone SE).** Small viewport. MathInput, MathKeyboard, and DiagramQuestion need to be tested. Use single-column layout throughout.
- **Very large (Pro Max).** Larger viewport. Don't expand into "tablet layout" — same single-column experience.
- **Foldable.** Treat as tablet when unfolded. _[implied — needs design: explicit foldable layout.]_
- **Tablet.** Larger viewport but same single-column. _[The docs don't explicitly spec iPad layout; recommend matching phone with wider margins.]_
- **Landscape.** MathKeyboard adapts layout (per v1 §10). Other screens: single-column may stretch.
- **Dynamic font size (iOS) / system font scaling (Android).** Respect. Largest accessibility font sizes may overflow — design for 200% scaling. _[See §5 accessibility.]_

### 4.17 Charging / sleep

- **Phone plugged in during long session.** No special handling. Screen stays on naturally.
- **Screen-off mid-voice-record.** Mic stops; transcript so far retained; on resume offer "Magst du es nochmal versuchen oder das hier abschicken?"
- **Sleep timer triggers screen-off.** Voice stops. Session state preserved.

---

## 5. Accessibility flows

Explicit per the brief.

### 5.1 Screen reader (VoiceOver iOS, TalkBack Android)

- **Every screen has logical reading order.** Header (avatar + name) → main content → primary CTA.
- **Subject tiles:** label "Mathe, Fach, 4 Materialien, doppeltippen zum Öffnen." _[implied — needs design: accessibility labels for each component.]_
- **Question text:** read aloud as primary content. LaTeX rendered to readable form (e.g. "y gleich 2x plus 3").
- **MathKeyboard buttons:** each key has a screen-reader label.
- **Diagram items:** the visual marker number is the primary cue; for a screen reader, describe: "Diagramm mit nummerierten Beschriftungen, Marker 3 hervorgehoben."
- **Voice input button:** "Antwort sprechen, doppeltippen zum Starten."
- **Hints announce:** when a new hint appears, screen reader announces it via `accessibilityLiveRegion`.
- **Modals:** focus is captured on open, returns to trigger on close.

### 5.2 Dynamic Type / font scaling

- All text uses scalable units (sp/pt with font scaling). Test at 200%.
- **Math expressions** (KaTeX) need scaled rendering. Cache key includes font size.
- **MathKeyboard:** keys grow with font size; at maximum scale, the keyboard may need to scroll horizontally for special-symbol row. _[implied — needs design.]_

### 5.3 Color-blind safe palettes

- **Per-subject colors:** the curated set must include sufficient luminance contrast between subjects to be distinguishable in monochrome.
- **Verdict colors:** correct (green-ish), incorrect (warm red), partial (amber) — supplement with iconography and copy, NEVER color alone.
- **Chips ("Test in 3 Tagen"):** must be readable in deuteranopia / protanopia. _[implied — needs design: test palette in CB simulators.]_

### 5.4 Reduced motion

- Respect iOS `prefersReducedMotion` and Android equivalent.
- Disable: confetti, pulse animations (DiagramQuestion marker ring), screen transitions with motion. Replace with instant or fade.
- Voice button: pulsing ring becomes a static "Hört zu" label.
- _[implied — needs design: complete reduced-motion variants for every animated element.]_

### 5.5 High contrast

- iOS Smart Invert / Increase Contrast modes. Test all surfaces. _[implied — needs design.]_

### 5.6 Single-hand reach

- Primary CTAs should land in the bottom half of the screen.
- "Üben" button at the bottom (per v1 §21) — good.
- Long-press menus appear near the touch point, not at the top.
- _[implied — needs design: consistent one-handed reach audit.]_

### 5.7 Switch control / external keyboard

- All interactive elements focusable via tab/switch.
- MathInput accepts external keyboard naturally.
- _[implied — needs design: keyboard shortcuts for common actions, e.g. Cmd+Enter to submit answer.]_

### 5.8 Dyslexia-friendly font

- **Setting:** admin → profile → "Schriftart" with options: Standard / OpenDyslexic / Atkinson Hyperlegible. _[implied — needs design: not in docs; recommend adding.]_

### 5.9 Read-aloud everything (low-vision)

- Per-profile setting: "Alles vorlesen" (per v1 §7 — auto-read on item display already exists).
- Extend: read feedback, read hints, read explain modal content. _[implied — needs design: extend auto-read to all surfaces, not just questions.]_

### 5.10 Speech-to-text speed

- ASR is real-time; no speed setting needed for STT.
- TTS speed: setting in admin → profile → "Vorlesegeschwindigkeit" with slider (0.5x – 2x). _[implied — needs design.]_

### 5.11 Time-extended answer mode

- **Setting:** admin → profile → "Längere Zeit zum Antworten" toggle. When on:
  - Voice VAD silence threshold extended (1500 ms → 4000 ms).
  - No auto-stop on session items.
  - Hints not offered until learner explicitly asks (no nudge).
- _[implied — needs design: full time-extended mode spec.]_

---

## 6. Help & support flows

### 6.1 "Ich kapiere die App nicht" — discoverability of help

- **Where lives help?** Recommend: admin → about → "Hilfe & Support." Also a small "?" icon in the learner header next to avatar — opens a short FAQ inline. _[implied — needs design.]_

### 6.2 In-app tutorial / replay tutorial

- Onboarding is not a tutorial; coaching is contextual.
- **Replay tutorial:** admin → about → "Tutorial nochmal sehen" replays the first-time tooltips (camera coaching, voice button, math keyboard, "Erklär mir das"). _[implied — needs design: replay state.]_

### 6.3 Tooltips on first encounter

Per v1 §18 — each first-use moment shows a one-time tooltip:
- First photo
- First voice answer
- First wrong answer hint chain
- First "Erklär mir das"
- First MathKeyboard
- First Test-Modus
- First "mehr Aufgaben"
- First folder-with-test-date

Each is dismissible, stored per-profile (`coachingSeen.{feature}: true`). See §10 below for full list.

### 6.4 Contact support

- Admin → about → "Support kontaktieren." Pre-filled mail with subject "LearnBuddy Support — [Account ID]" and body with diagnostic info (app version, device, locale).
- In-app form alternative: a single-screen form with category dropdown ("Frage zur App", "Fehlermeldung", "Etwas anderes"), text area, submit. _[implied — needs design.]_

### 6.5 Bug report from crash dialog

- Crash → "Etwas ist schiefgelaufen" + "Neu starten" + "Bug melden."
- "Bug melden" opens a consent screen: "Magst du den Fehlerbericht mit uns teilen? Persönliche Inhalte sind nicht enthalten." with two buttons "Senden" / "Nicht senden."
- Consent gates Sentry upload. Default behavior (no explicit consent screen) is automatic upload with PII scrubbing (per v1 §12). _[implied — needs design: explicit consent for crash report uploads, beyond the global consent.]_

### 6.6 FAQ surfaces

- Admin → about → FAQ section with collapsibles. Common questions:
  - Wie funktioniert das Abo?
  - Wo sehe ich, was mein Kind gemacht hat?
  - Was passiert, wenn das Internet ausfällt?
  - Wie lösche ich mein Konto?
- _[implied — needs design: FAQ content.]_

### 6.7 Feature discovery

- **Power-user features that need discovery moments:**
  - Test-Modus (only discovered when on a folder with a date)
  - "Mehr Aufgaben üben" (only after answering a template-linked item)
  - "Erklär mir das" (visible on every item but not labeled obvious)
  - "Andere Art" regeneration (visible in "Mehr Fragen" sub-menu)
- _[implied — needs design: a "Tipps & Tricks" card in admin overview that surfaces 1 unused feature per week — opt-in, dismissible.]_

### 6.8 "Wie funktioniert XYZ" inline explainers

- Small "?" icons next to advanced features (Test-Modus, Mehr Aufgaben). Tap → short tooltip. _[implied — needs design.]_

### 6.9 Live status / outage banner

- When Vertex / Supabase is degraded, show a non-blocking banner on admin: "Wir haben gerade kleine technische Probleme — alles funktioniert, manche Antworten dauern länger." _[implied — needs design: server-driven banner from a status endpoint.]_

### 6.10 Onboarding-relaunch trigger

- Admin → about → "Tutorial nochmal sehen" (see §6.2).
- Also surfaces if a major feature is added in a version update.

---

## 7. Multi-actor real-life chaos

The messy social realities the docs gloss over.

### 7.1 Mom sets up daughter's account on her phone, then daughter borrows the phone

- **Mom installs on her phone**, sets up account for daughter (J2).
- **Daughter borrows mom's phone.** Opens app. Lands on home (mom is logged in, daughter's profile is active).
- **Daughter sees her own learner surface.** Works fine. Admin is biometric-locked to mom.
- **Edge case:** mom's phone biometric is mom's face. If daughter looks at the phone, biometric fails → PIN entry. Daughter doesn't know PIN. Friendly redirect copy on admin unlock for minor profile makes this clear: "Dafür brauchen wir eine erwachsene Person."

### 7.2 Two siblings share one tablet

**Problem:** one-profile-per-account constraint.

- **Workaround:** two separate accounts. Each child logs in with a different email.
- **Switching accounts:** logout from admin → settings → "Abmelden" (per v1 §2 `[implied — needs design]`). Other child logs in.
- **UX cost:** PIN entry, biometric fails (different face), login. Annoying.
- **Recommendation:** explicit "Account wechseln" in admin with biometric per account. Saves a re-login. _[implied — needs design: multi-account on one device, future consideration.]_
- Current docs explicitly forbid multi-profile per account (DESIGN-BRIEF). Honor this.

### 7.3 Grandparent helps kid study, no admin access

- Grandparent uses the kid's profile (the kid is logged in on the device).
- No admin needed for studying. Grandparent can do everything the kid does.
- If something goes wrong (bad question, wants to delete), the kid-level delete works (per v1 §16 — minor can delete bad questions).
- For anything admin-level (archive subject, change settings), grandparent can't. Calls parent or waits.

### 7.4 Kid hands phone back to parent mid-session

- Session state preserved. Parent (account holder) opens admin via header tap. Biometric. Sees admin overview.
- Parent closes admin. Returns to learner surface — session still paused at the same item.
- **Concern:** does the session re-start the timer for FSRS purposes? No — FSRS only cares about correct/wrong, not time-on-item.

### 7.5 Phone borrowed by friend — what data is visible?

- Friend opens app on borrowed phone. Lands on learner surface (whoever is logged in). They see the profile's subjects, materials, items.
- **No data is hidden from another person who has access to the unlocked phone.** This is by design — the learner surface is not private from a casual borrower.
- Admin is biometric/PIN-gated, so account details, subscription, settings are not exposed.
- **Privacy note:** export, deletion, profile edit are admin-only. A friend can't accidentally delete things.

### 7.6 Family meal — phone facedown — interrupted session

- Session paused (no action). State preserved.
- On next open, drop into where they were (per v1 §7 — currently `[implied — needs design]`).
- **Recommendation:** on app foreground after > 5 min inactivity mid-session, show "Möchtest du fortsetzen?" instead of auto-resuming. _[implied — needs design.]_

### 7.7 Lent phone returned 2 days later — in-flight upload

- The owner of the account opens app on their device after lending it back.
- The borrower may have done sessions. Attempts and edits sync via outbox.
- **Owner sees:** updated FSRS state, items the borrower interacted with marked as such.
- **No "what did you do while I was away" surface** — this is a privacy choice. Owner sees aggregates but not specific attempts.

### 7.8 In-flight material upload during phone-hand-back

- User A captures, hands phone to user B (still logged in as A) before upload completes.
- Upload completes in background. New items appear in A's subject.
- B might see the items appear — same logical user, so no harm.

---

## 8. Lifecycle moments not in the docs

These are emotional/temporal touchpoints that v1 misses.

### 8.1 First positive answer streak

- After 5 in a row correct in a session: a quiet inline marker (a small "🔥 5" or a check streak, but NO confetti). At top of the next item.
- After 10: same marker, slightly more visible.
- After 20: a session-end-style celebration moment (single check, "Heute richtig drauf!"). Not on every session.
- _[implied — needs design.]_

### 8.2 50th correct answer (or 100th, 500th, 1000th)

- Quiet milestone toast: "Das ist deine 50. richtige Antwort. Toll!"
- Only once per milestone, never repeated.
- _[implied — needs design: milestone tracking.]_

### 8.3 Anniversary of first signup

- 1 year: a soft inline "Du lernst seit einem Jahr mit uns — danke!" Once.
- _[implied — needs design.]_

### 8.4 Subject mastered (all items mastered)

- Subject tile gets a small star badge.
- Result screen mentions "Mathe ist erstmal durch — neue Materialien dazu?" with subtle CTA.
- _[implied — needs design.]_

### 8.5 Folder finished (all materials at mastery, test date passed)

- Folder shows "Abgeschlossen" badge.
- After test date passes, suggest archiving the folder: "Klassenarbeit ist vorbei — Ordner archivieren?" (see §1.1 day-0).
- _[implied — needs design.]_

### 8.6 "You haven't opened this material in 4 weeks"

- Surface where? **Not on learner home** (no pressure). Recommend: admin overview shows "Selten geöffnete Themen" as informational. _[implied — needs design.]_

### 8.7 End-of-school-year (Germany: June)

- Optional admin prompt in June: "Schuljahresende — magst du alte Fächer archivieren?" with a one-tap "Bio, Geo, Mathe (Klasse 6) archivieren" if subjects have clearly seasonal names.
- Heuristic for "old": no activity in 30 days + folder dates in past.
- _[implied — needs design: a seasonal cleanup affordance.]_

### 8.8 Grade-level transition

- When account holder edits the profile's grade level upward (Klasse 6 → 7), prompt: "Magst du die alten Fächer archivieren?"
- _[implied — needs design.]_

### 8.9 Profile turns 16

- The profile is no longer a minor by age. Per v1 §3 the doc says no in-product transfer; export + new signup workaround.
- Recommend: when birth year is edited to a year that puts the profile at 16+, show a one-time card: "Du wirst bald als Erwachsene/r geführt. Möchtest du ein eigenes Konto haben? [Erklärung + Export-Anleitung]." _[implied — needs design.]_

### 8.10 First time using the app from a new device

- After login on a new device: short "Wir laden deine Daten — gleich kann's losgehen" splash, then home.
- No "welcome to LearnBuddy" — this is a returning user, not a new one.

---

## 9. Settings the docs don't fully spec

Inventory of settings the product needs but docs don't fully specify. Each is a small surface; together they round out admin and self-controllable settings.

### 9.1 Sound on/off

- **Where:** self-controllable per profile (small audio icon in learner header or in a profile-settings sheet).
- **Affects:** session feedback sounds (the "Stimmt!" chime, the soft tick on advance), TTS playback.
- **Default:** on.
- _[implied — needs design: sound-effect inventory.]_

### 9.2 Haptic feedback on/off

- **Where:** self-controllable per profile.
- **Affects:** subtle haptic on correct/wrong, on advance, on submit.
- **Default:** on, with reduced intensity at first.

### 9.3 Practice session length default

- **Where:** self-controllable per profile (since §1.9 introduces it).
- **Options:** 5 Min / 10 Min / 20 Min / Alles.
- **Default:** Alles (current behavior).

### 9.4 Difficulty preference

- **Where:** admin → profile.
- **Options:** "Standard" / "Einfacher (für den Anfang)" / "Schwieriger."
- **Affects:** regeneration style defaults, optional default for FSRS picks.
- **Default:** Standard.
- _[implied — needs design: not in docs; useful for kids who get demoralized.]_

### 9.5 Answer timeout

- **Where:** admin → profile (accessibility).
- See §5.11 time-extended mode.

### 9.6 Photo retention

- **Where:** admin → privacy.
- **Options:** "Originale nach Verarbeitung löschen" / "30 Tage behalten" (current behavior).
- **Default:** Delete after extraction (more privacy-forward) — current behavior is T+7 days raw wipe (v1 §12).
- _[implied — needs design: shorter-retention option.]_

### 9.7 Auto-archive after N days unstudied

- **Where:** admin → profile.
- **Options:** off / 30 days / 90 days / 180 days.
- **Default:** off.
- _[implied — needs design.]_

### 9.8 Daily / weekly digest email opt-in for account holder

- **Where:** admin → notifications (or a new section).
- **Options:** off / weekly summary email / daily summary email.
- **Default:** off.
- **Useful for:** parents who want passive insight without opening admin.
- _[implied — needs design: server-side email scheduler.]_

### 9.9 Reduce data usage mode

- **Where:** admin → privacy or admin → about.
- **Affects:** lower image quality on upload (e.g. 1024 px max instead of 2048), no auto-prefetch of study assets on cellular.
- **Default:** off (or auto-enabled when system Data Saver detected).
- _[implied — needs design.]_

### 9.10 Beta features opt-in

- **Where:** admin → about → "Experimentelle Funktionen."
- **Default:** off.
- For future feature flag rollout.
- _[implied — needs design.]_

### 9.11 Spoken-math vocabulary toggle

- **Where:** admin → profile (under voice settings).
- **Options:** "Mathe-Vokabular im Spracherkenner" on/off.
- **Default:** on for math/physics subjects.
- See §1.2 / §2.14 for context.
- _[implied — needs design.]_

### 9.12 Theme (light / dark / system)

- **Where:** admin → about or admin → profile.
- **Default:** system.
- _[implied — needs design: not in docs.]_

### 9.13 First-day-of-week (for streak / weekly minutes display)

- **Where:** admin → about.
- **Default:** Monday (locale-aware).
- _[implied — needs design.]_

---

## 10. Onboarding for power features

Each power feature gets its own first-time moment. These are one-time, contextual, dismissible. Stored per-profile as `coachingSeen.{key}`.

### 10.1 "Erstes Mal die Mathe-Tastatur"

- **Trigger:** first time MathKeyboard appears (`formula` or `numeric` item).
- **Coaching:** small tooltip from the "MEHR" key: "Hier findest du Wurzeln, Brüche, π."
- **Duration:** dismisses on first key press.

### 10.2 "Erstes Mal Test-Modus"

- **Trigger:** first time learner opens a folder with a `scheduled_for` date within 7 days, AND has more than 10 items in that folder.
- **Coaching:** a card on the folder screen: "Bald ein Test? Probier mal den Test-Modus — wie eine echte Klassenarbeit."
- **Dismissible.** Stored once.

### 10.3 "Erstes Mal Sprachantwort"

- **Trigger:** first time voice button is tapped.
- **Coaching:** tooltip "Sprich einfach los — ich höre 1,5 Sek. Stille als 'fertig'."
- **Dismisses** on first successful transcript.

### 10.4 "Erstes Mal Diagramm-Frage"

- **Trigger:** first time a `diagram_label` item appears in a session.
- **Coaching:** tooltip "Schau dir das Bild an — was ist auf Nummer X?"
- **One-time.**

### 10.5 "Erstes Mal Erklär-mir-das"

- **Trigger:** first time the button is visible (always — it's on every item). Wait for the second wrong answer to suggest it.
- **Coaching:** "Verstehst du was nicht? Tippe 'Erklär mir das'."
- **Dismisses** on first tap or after 3 sessions.

### 10.6 "Erstes Mal 'mehr Aufgaben'"

- **Trigger:** first time a result screen offers "10 ähnliche Aufgaben üben →."
- **Coaching:** card "Bei dieser Aufgabe kann ich dir endlos viele ähnliche stellen — magst du?"
- **One-time.**

### 10.7 "Erstes Mal Ordner mit Klassenarbeitstermin"

- **Trigger:** first time the learner (or account holder) attempts to create a folder OR the second folder is created (heuristic: by then they've seen "Ordner" once).
- **Coaching:** small inline hint in the create-folder form: "Mit einem Datum erinnere ich dich an die Klassenarbeit."
- **Dismisses** on save.

### 10.8 "Erstes Mal Stimulus-Frage (function plot / SVG / coord grid)"

- **Trigger:** first time an item with a non-trivial stimulus appears.
- **Coaching:** "Tipp: doppeltippen oder pinch zum Reinzoomen."
- **One-time per stimulus_kind.**

### 10.9 "Erstes Mal Fill-in-the-blank"

- **Trigger:** first `fill_blank` item.
- **Coaching:** "Tippe in die Lücken — Tab oder 'Weiter' bringt dich zum nächsten Feld."

### 10.10 "Erstes Mal Album-Pick"

- **Trigger:** first time the gallery icon is tapped in capture.
- **Coaching:** "Du kannst auch Fotos aus deiner Galerie nehmen — z. B. ein altes Foto von einer Tafel."

### 10.11 "Erstes Mal Streak"

- **Trigger:** first session-end result screen.
- **Coaching:** "Heute geübt! Wenn du an mehreren Tagen hintereinander übst, sammelt sich ein Streak an. Aber: keine Sorge, wenn ein Tag dazwischen ist."
- **One-time.**

### 10.12 "Erstes Mal Admin-Surface"

- **Trigger:** first biometric unlock into admin (for any reason).
- **Coaching:** brief tour overlay: "Hier sind alle Einstellungen, Konto-Sachen, und du kannst dir den Fortschritt anschauen."
- **One-time.**

---

## 11. Additional surfaces and patterns not in v1

A grab-bag of things the deep-dive surfaced. Less storied, but enumerated so they aren't forgotten.

### 11.1 Drag-to-reorder

- Subject grid: long-press → drag (see §3.2). _[implied — needs design.]_
- Folder order within subject: same. _[implied — needs design.]_
- Material order within subject/folder: same.

### 11.2 Search

- Per v1 §19 — no global search.
- **Recommendation [implied — needs design]:** small search on home that scopes by name (subject names, folder names, material titles). NOT full-text on items — that crosses an over-engineering line and creates pressure ("you have 12 unanswered items containing 'Mitose'").

### 11.3 Pinning

- **Pin a subject to the top of home?** _[implied — needs design]_. Useful for "the test I'm prepping for."

### 11.4 Quick capture from home

- A "Foto schnell" floating button on home that skips subject picking until after capture. Same flow as "Fertig → picker."
- _[implied — needs design.]_

### 11.5 Material preview before AI extraction

- After capture, before "Fertig," learner sees a list of pages with thumbnails. Can tap to view full-size, can long-press to remove (per v1 §4).
- _[Adequate per docs.]_

### 11.6 Session pause / explicit pause button

- Currently exit = quit. No explicit pause.
- **Recommendation:** the quit button could be a "Pausieren" — same behavior, friendlier copy. _[implied — needs design.]_

### 11.7 Streak / progress visualizations

- Streak chip on result screen (per v1 §7).
- Weekly minutes chart in admin (per v1 §13).
- **For learner:** none on home. Recommend adding a small visible streak chip on the learner's profile-settings-sheet (the same place avatar live), so they can opt to see it but it's never on home. _[implied — needs design.]_

### 11.8 Sharing / export of a single material

- Per docs: no sharing between profiles (Non-goals).
- Account holder data export includes everything.
- **Single material export?** _[implied — needs design]_. Probably not needed.

### 11.9 Account holder digest in admin

- Currently: profile card + drill-in.
- Recommend a "Diese Woche" summary at top: "Mira hat diese Woche an 4 Tagen geübt. Schwerpunkt: Bio."
- _[implied — needs design.]_

### 11.10 Profile picture (real photo as avatar)

- Currently: curated icon set.
- **Hard constraint:** no camera-roll selfies (privacy concern for minors).
- _[Adequate per docs.]_

### 11.11 Notification settings: per-category test

- Admin → notifications → "Test-Benachrichtigung senden" button to verify it works.
- _[implied — needs design.]_

### 11.12 Session "Skip" button

- v1 §7 implies `verdict='skipped'` exists but no UI.
- **Recommendation:** behind a "Mehr Optionen" disclosure (with "Erklär mir das"), small "Überspringen" link. Skipped items return in future sessions, not penalized.
- _[implied — needs design.]_

### 11.13 Voice / text input toggle persistence

- Per item or per session?
- Recommend per session, with the profile's `preferredAnswerMode` as the default starting state.
- _[implied — needs design.]_

### 11.14 Empty admin states

- First admin entry (account just created): "Hier siehst du, wie es mit dem Lernen läuft. Sobald deine erste Sitzung läuft, gibt's hier was zu sehen."
- _[implied — needs design.]_

### 11.15 Empty profile drill-in (no activity yet)

- "Noch nichts geübt — gleich geht's los."
- _[implied — needs design.]_

### 11.16 Settings search

- In admin, a search bar across all settings. Useful as the settings tree grows.
- _[implied — needs design.]_

### 11.17 Quick toggle in header for "auto-read aloud"

- Self-controllable from learner surface (per v1 §3 — `Learner-self-controllable settings`).
- Recommend a small speaker icon in header next to avatar that toggles auto-read.
- _[implied — needs design.]_

### 11.18 "Last session" recap on home

- After a session, on next home open within ~2 hours, show "Du hast gerade an Bio geübt — weiter so." subtle card.
- After 2 hours: gone, home is calm again.
- _[implied — needs design.]_

### 11.19 Cross-references between materials

- If two materials cover the same topic, surface "Diesen Stoff gibt's auch in [Material X]."
- Probably overkill for v1. _[implied — needs design.]_

### 11.20 Item-level metadata visible to learner

- Currently learner sees question + answer area only.
- Show "Topic" inline subtly? Maybe in a "Mehr Optionen" disclosure.
- _[implied — needs design.]_

---

## 12. Wireframe-ready summary

Counts, gaps, anything notable.

### Counts

- **12 named end-to-end journeys** in §1, each broken into 5–25 micro-steps.
- **16 voice-help patterns** in §2, covering detection through fallback.
- **8 entity types** in §3 with full operation matrix; ~40 distinct operations.
- **17 edge-case categories** in §4 with 60+ specific cases.
- **11 accessibility flows** in §5.
- **10 help & support patterns** in §6.
- **8 multi-actor real-life scenarios** in §7.
- **10 lifecycle moments** in §8 not previously enumerated.
- **13 settings** in §9 the docs don't fully spec.
- **12 power-feature onboarding moments** in §10.
- **20 additional patterns** in §11.

### Things the docs don't address at all (new design requests)

- **Appeal flow** ("AI macht Fehler in der Bewertung") — §1.7. There's currently no mechanism for a learner to flag a verdict as incorrect. Recommended as a quiet secondary affordance with admin-side review.
- **Tip-of-tongue hint chain** — §1.2, §2. The user explicitly requested this; full specification provided. No client-side detection logic exists in docs.
- **After-test reflection** — §1.1 day 0 evening. The product has folder-with-date but nothing surfaces the test's completion.
- **Session length picker** — §1.9. No way to bound a session to 5 min today.
- **First-time learner welcome (kid solo on parent-set-up phone)** — §1.4. The hand-off moment is documented; the first-second-of-the-app-as-Mira moment is not.
- **Bulk operations** — §3.3. Long-press multi-select is implied by good UX but not in docs.
- **Spoken-math vocabulary** — §2.14, §9.11. Voice → MathInput parsing isn't spec'd in detail.
- **Force-update endpoint & UI** — §1.12.
- **Migration of in-flight data** (capture, session) across app updates — §1.12.
- **Captive portal handling** — §4.1.
- **Photo-quality glare and finger-occlusion detection** — §4.13.
- **Math parser ambiguity prompts** — §4.15.
- **Reduced-motion variants for every animated element** — §5.4.
- **Dyslexia-friendly font option** — §5.8.
- **Single-material export** — §11.8 (probably not needed).
- **Pinning, search, drag-reorder** — §11.1, §11.2, §11.3.
- **Onboarding-resume** — §4.12.
- **"You can come back" prompt on hand-back** — §7.6.
- **Empty admin / empty profile drill-in states** — §11.14, §11.15.
- **Aggregate appeal review on admin** — §1.7.
- **Profile-turns-16 transition copy** — §8.9.
- **Photo retention setting (shorter than T+7)** — §9.6.
- **Daily/weekly digest email opt-in** — §9.8.
- **Reduce data usage mode** — §9.9.
- **Theme (light/dark)** — §9.12.
- **Outage banner from server** — §6.9.
- **In-app FAQ content** — §6.6.

### Things v1 explicitly marks as `[implied — needs design]` that this doc gives a concrete recommendation for

- Logout flow — §3.1 (admin → settings → "Abmelden").
- Profile-settings discoverability for learner-controlled settings — §11.17 (avatar quick-toggle).
- Email verification re-send / edit-email recovery — §4.11.
- Resume previous session — §4.3 & §7.6.
- Voice redo affordance — §2.12.
- Voice "I don't know" handling — §2.7.
- Replay sound when ASR mishears — §2.3.
- Session "skip" button — §11.12.
- Snackbar undo for archive operations — §3.4.

### Things explicitly out of scope per docs that this doc does NOT add

- Multi-profile per account (DESIGN-BRIEF non-goal).
- Web app (Non-goals).
- Real-time multi-user / leaderboards / sharing (Non-goals).
- Doing the homework (Non-goals).
- Teacher integration (Non-goals).
- Voice cloning / premium voices (Non-goals).
- Symbolic algebra / CAS (Non-goals).

### Reading order for designers

1. Start with v1 (`USER-FLOWS.md`) for the breadth catalog.
2. Read §1 of this doc front-to-back to understand the lived-experience texture.
3. Use §2–§11 as reference while wireframing — each section is self-contained.
4. The §12 list is the design-debt backlog: every line here is a "you-must-decide-something" moment.

The product principle stands: **as simple as humanly possible, but nothing forgotten**. A designer who has read both docs end-to-end should be able to build the app without asking "what about X" — and if a "what about X" surfaces, it belongs here, in a future revision.
