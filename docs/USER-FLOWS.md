# LearnBuddy — Complete User Flow Inventory

Exhaustive list of every user flow implied or specified across the product docs. Sourced from `01-product.md` through `10-implementation-order.md`, `DESIGN-BRIEF.md`, and `README.md`. Flows marked **[implied — needs design]** are presupposed by the docs but lack an explicit UI surface.

---

## 1. First-run / install

- **Install app from store** — User downloads from App Store / Play Store; app launches to welcome screen on first open (see 05 §Onboarding 1).
- **Detect device locale and prefill language** — Welcome screen auto-picks UI language from device locale, learner can override (05 §Welcome).
- **Cold-launch consent-version check** — App compares stored `dsgvo_consent_version` to constant on every cold start; re-requires consent if changed (09 §3).
- **Cold start to home (returning install)** — < 2 s to home for returning user with local data already migrated (05 §Performance budgets).
- **Local SQLite migration on first run** — Drizzle migrates schema on first install before any UI (10 Step 12).
- **First-ever launch, no profile data** — App routes directly into onboarding (05 §Error states).
- **App freshly installed on new device, no local data** — Routes to login; after auth, full pull populates local DB (05 §Error states; DESIGN-BRIEF §Edge cases).
- **Permission prompts (camera, mic, speech, notifications) just-in-time** — Each shown at the moment of first need with adapted copy (05 §Permissions).

## 2. Account creation & authentication

- **Age check (DOB / year picker)** — Single question gates onboarding; under-16 branches to hand-off (05 §Age check; 01 J1).
- **Under-16 hand-off to adult** — Friendly screen explaining an adult must set up the account; "Erwachsene Person ist hier" restarts at age-check (05 §Hand-off, DESIGN-BRIEF onboarding).
- **Adult account signup with email + password** — `POST /auth/account/signup` creates Supabase user, account row, trial subscription row (04 §Auth; 01 §Account features).
- **Adult account signup via magic link** — "Per Magic-Link einloggen" sends email with deep link, no password (05 §Account signup; 01 J1; 02 §Supabase).
- **Email verification (deep link return)** — Polls Supabase auth state; tapping verification link returns to app with session ready (05 §Verify email).
- **DSGVO adult consent acceptance** — Two unticked checkboxes; "Continue" disabled until checked; records version + timestamp via `POST /auth/account/consent` (05 §Consent; 04).
- **Login on returning device** — Existing Supabase credentials; no migration; data lives server-side; full pull populates local DB (01 §Account features; 05 §Error states).
- **Forgot-password reset via email** — Supabase password-reset email contains deep link to `/reset-password`; auto-login after new password set (01 J9; 05 navigation).
- **Magic-link login (returning user)** — Same magic-link mechanism, no password required (01 §Account features).
- **PIN setup during onboarding** — 4-digit PIN stored in `expo-secure-store`; mandatory (05 §PIN setup; 01 J1).
- **Biometric setup (Face ID / Touch ID / Android biometric)** — Toggle on during onboarding alongside PIN (05 §PIN setup; 01 J1).
- **Biometric prompt on every admin entry** — Single tap; auto-fires on `(admin)/unlock` mount (05 §Unlock).
- **PIN fallback when biometric fails or unavailable** — Numeric pad on unlock screen (05 §Unlock).
- **PIN lockout after 5 wrong attempts in 5 min** — 15-min lock; biometric still works during lock (05 §Unlock; DESIGN-BRIEF edge cases).
- **Account password fallback when both biometric + PIN unavailable** — "Passwort verwenden" re-prompts the account password (05 §Unlock).
- **Change account email (with verify on new address)** — Settings → account → change email; verifies new before applying (05 §Account settings).
- **Change account password** — Settings → account → change password (05 §Account settings).
- **Change / reset PIN** — Settings → account → change PIN (05 §Account settings; 01 J9).
- **Toggle biometric on/off** — Settings → account → biometric toggle (05 §Account settings).
- **Token refresh / short-lived JWT rotation** — Supabase JWTs 1 h, refresh rotated (09 §8). **[implied — needs design: silent UX, no user surface]**
- **Logout** — **[implied — needs design: doc does not explicitly describe a logout flow but settings imply one is needed.]**

## 3. Learner profile creation & management

- **Solo adult: who-uses → "Ich selbst"** — Profile pre-filled with account holder's age; one profile (05 §Who uses; 01 J1).
- **Account holder + minor: who-uses → "Mein Kind"** — Separate minor profile; triggers minor consent step (05 §Who uses; 01 J2).
- **Add-profile form** — Display name, birth year, grade (Grundschule 1–4 / Mittelstufe 5–10 / Oberstufe 11–13 / Studium / Erwachsenenbildung), avatar, UI language, preferred answer mode default voice (05 §Add profile).
- **Birth year drives minor/adult classification** — Under-16 birth year triggers conditional profile-minor-consent screen (05 §Add profile; 01 §Profile fields).
- **Per-minor explicit consent screen** — "Ich willige in die Verarbeitung der Daten von [Name] ein" recorded via `POST /learners` body with `minor_consent_version` (05 §Minor consent; 04; 01 J2).
- **One-profile-per-account enforcement** — Second `POST /learners` returns `409 learner_already_exists`; UI must explain (04 §Learners; 10 Step 13).
- **Edit learner profile (admin)** — Display name, birth year (recomputes minor/adult), grade level, avatar, UI language, preferred answer mode (05 §Profile edit; 04 PATCH).
- **Re-classification when birth year edited up to ≥16** — Profile changes from minor to adult **[implied — needs design: tone shift, consent record handling]**.
- **Archive learner profile (soft delete)** — From admin profile edit; 30-day recovery; effectively retires account data (05 §Profile edit; 01 §Profile archive).
- **Restore archived profile within 30 days** — From admin archived screen (05 §Archived; 01 §Profile archive).
- **Profile hard-deletion after 30 days** — `pg_cron` removes; account holder warned that archive is the only "switch back" mechanism (01 §Profile archive; 05 §Archived).
- **No profile picker / no profile switching** — App drops directly into the single profile's learner surface (05 §Modes vs profiles; DESIGN-BRIEF).
- **Learner-self-controllable settings** — Preferred answer mode, auto-read aloud toggle, avatar — without entering admin (DESIGN-BRIEF §Settings each learner controls). **[implied — needs design: where these live on learner surface]**
- **Profile orphan / archive-of-only-profile warning** — Edit warns archiving the only profile retires account data (05 §Profile edit; 10 Step 19).
- **Age-up at 16 not supported in-product** — No transfer of minor profile to own account; workaround is data export + new signup (01 §Non-goals). **[implied — needs design: messaging when child reaches 16]**

## 4. Capturing material

- **Tap "Neues Material" → camera opens** — From subject or folder context (01 J3; 05 §Capture).
- **Live quality scoring (resolution, blur, brightness, tilt)** — Continuous local scoring in `quality.ts` (05 §Capture; 02 F1).
- **Quality feedback chips (scharf / ok / verschwommen / zu dunkel / zu hell)** — Color-coded; non-blocking (05 §Capture).
- **"Trotzdem behalten" override on red state** — Learner can keep a flagged photo (05 §Capture).
- **Tilt warning above 25°** — Warn but do not block (05 §Capture).
- **Multi-photo capture (1–10 per material)** — Thumbnail strip below viewfinder (05 §Capture; 01 §Capturing material).
- **Long-press thumbnail to delete a captured photo before upload** — In-strip removal (05 §Capture).
- **"Fertig" → subject / folder picker (when not pre-targeted)** — After capture, choose where material lives (05 §Capture; DESIGN-BRIEF flows).
- **Pre-targeted capture from folder screen** — "+ Material hinzufügen" inside a folder pre-sets folder_id (05 §Folder).
- **Album-pick alternative (existing device photos)** — Alternative to live camera (01 §Capturing material; DESIGN-BRIEF). **[implied — needs design: trigger UI]**
- **Add more photos to an existing material later** — Append more pages after the fact (01 §Capturing material; DESIGN-BRIEF flows).
- **Upload via signed PUT URLs** — `POST /materials/upload-url` returns 10-min URLs; mobile PUTs directly to Storage (04; 02 F1).
- **Progress phases during AI extraction** — SSE events: "Bilder werden gelesen" → "Fragen werden erstellt" → "Letzter Schliff" → done (05 §Capture; 04; 01 J3).
- **Manual / text entry as material source** — `materials.source_kind = 'text'` supported in schema (03 materials). **[implied — needs design: text-paste flow]**
- **PDF as material source** — `source_kind='pdf'` (03 materials). **[implied — needs design: file pick flow]**
- **Camera permission request on first use** — iOS / Android permission flow with adapted copy (05 §Permissions).
- **Photo capture under network-down state** — Capture allowed, upload deferred **[implied — needs design; the doc says photo capture "requires network" in core principles]**.
- **Show "Versuch nochmal — etwas schärfer" when blur < 60** — Specific copy (05 §Capture; 01 J3).

## 5. Organizing material

- **Create a subject (with name, color, icon)** — From home "+" button; minor profile prompts admin unlock first (05 §Home; DESIGN-BRIEF flows).
- **Subject icon and color picker** — Curated set (01 §Organization; DESIGN-BRIEF flows).
- **Rename a subject** — Long-press → "Umbenennen" → text field (05 §Edit and delete patterns).
- **Edit subject color / icon** — From admin edit (DESIGN-BRIEF flows).
- **Archive a subject** — Soft-delete via long-press → context menu; 30-day recovery; minor profile requires admin unlock (05 §Edit and delete patterns).
- **Restore archived subject from admin** — Admin → archived → "Wiederherstellen" (05 §Archived).
- **Create a folder inside a subject** — From subject "Ordner" tab; optional `scheduled_for` date (05 §Subject; DESIGN-BRIEF).
- **Attach test date to folder** — "Klassenarbeit 14.06." date picker (05 §Subject; 01 §Organization).
- **Remove / change folder date** — Edit folder (DESIGN-BRIEF flows).
- **Rename folder** — Long-press → rename (05 §Edit patterns).
- **Archive folder** — Soft-delete; restorable 30 days (05 §Edit patterns).
- **Restore archived folder** — Admin archived (05 §Archived).
- **Move material between folders (or out of any folder)** — Long-press material → "Verschieben" → picker including "Ohne Ordner" (05 §Subject; §Edit patterns).
- **Rename a material's title** — Long-press material → rename (05 §Material; §Edit patterns).
- **Archive a material** — Soft-delete; schedules photo + study-asset deletion; 30-day recovery (05 §Material; 04 DELETE).
- **Restore archived material** — Admin archived (05 §Archived).
- **Delete a single bad question** — Long-press item → delete with confirmation; archived 30 days (01 J11; 05 §Edit patterns).
- **Restore deleted question** — Admin archived (05 §Archived).
- **Hard delete after 30 days** — Automatic via `pg_cron` (05 §Edit patterns; 01 §Organization).
- **Subject tab structure (Ordner / Material)** — Folders tab vs loose materials tab (05 §Subject).
- **Material list with thumbnails** — Thumbnail (study asset or generic icon), title, "Üben" affordance (05 §Subject).
- **Pull-to-refresh on home** — Triggers outbox drain + full pull (05 §Home).
- **Long-press material context menu** — Rename / move to folder / archive (05 §Subject).
- **Long-press material title in header (material screen)** — Rename / move / archive (05 §Material).
- **Sort order on subject tiles** — `sort_order` field; reorder UI **[implied — needs design]**.
- **Empty subject state** — "Hier ist noch nichts. Fotografier dein erstes Material!" + camera button (05 §Error states).
- **Empty home (no subjects yet)** — Empty state for first-day learner (DESIGN-BRIEF). **[implied — needs design]**

## 6. AI generation

- **Vision extraction + question generation** — `POST /materials`; single Vertex call returns Markdown + items + diagrams + templates (06 §P1; 02 F1).
- **Material language auto-detection** — Vision returns `detected_language` (06; 01 §AI processing).
- **Subject-aware generation (per `subject_kind` branch)** — Math / physics / chem / bio / geo / history / language_native / language_foreign / religion_ethics / art_music / general / other (06 §Subject guidance; 07 §1).
- **Subject-kind answer-kind mix defaults** — Each subject biases the mix (07 §1).
- **Regenerate more questions from cached text** — `POST /materials/:id/regenerate-items`; reuses `extracted_markdown` (04; 06 §P2).
- **"Einfacher" regenerate style** — Style hint adjusts to one grade below (05 §Material; 06 §P2).
- **"Schwieriger" regenerate style** — Transfer/application questions (05; 06 §P2).
- **"Andere Art" (more-variety) regenerate** — Forces mix of MC, numeric, long (05; 06 §P2).
- **Diagram detection & numbered-marker image generation** — sharp pipeline crops, masks labels, overlays 36-px numbered markers (06 §2; 07 §5).
- **Graph cropping (`cropped_graph`)** — Masking skipped; `graph_meta` preserved (06; 07 §5).
- **Function-plot stimulus generation** — `stimulus_kind='function_plot'` from readable graphs (06 §P1.3; 07 §2.3).
- **SVG stimulus generation for geometry** — Sanitized SVG fragments (07 §2.4).
- **Coord-grid stimulus generation** — `stimulus_kind='coord_grid'` for plot-the-point (07 §2.5).
- **Problem template extraction (math / physics only)** — Up to 3 per material; param + constraints + solution expression (06 §P1.4; 07 §6).
- **Server template validation (5-sample feasibility ≥ 60 %)** — Drops infeasible templates (06; 07 §6.2; 10 Step 5).
- **"Not educational" rejection with kind retry** — Vision returns `error: 'not_educational'`; UI: "Das sieht nicht nach Lernstoff aus" + retry; credit refunded (06 §SAFETY GUARD; 05 §Error states).
- **"Couldn't read this" / `unreadable` failure** — UI: "Wir konnten den Text nicht lesen. Vielleicht mit mehr Licht?"; credit refunded (05 §Error states).
- **Extraction failed (vision 5xx / safety block / invalid JSON x2)** — `extraction_failed`; refund estimate; UI: "Hmm, die Bilder sind nicht gut genug" (05; 06 §Failure modes).
- **Partial success (≥3 valid items kept)** — Persist valid items only; settle to actual cost (06 §Failure modes).
- **Fewer than 3 valid items after post-processing** — Treated as extraction_failed; refund (06).
- **Diagram mask-safety fallback** — If labels exceed 8% area, skip masking but still place markers; flag `fallback='no_masking'` (06 §Mask safety).
- **Diagram drop when < 2 valid labels after processing** — Items reference as study_asset instead of diagram_label (06).
- **Item rejection rules** — Question < 5 chars or expected_answer < 1 char rejected (06 §Vision result post-processing).
- **Hard cap targetCount = 25** — Regardless of caller request (06 §Caching and cost levers).
- **Manual edit of generated questions** — Account holder can delete bad questions but not rewrite past attempts (09 §Rectification). **[implied — needs design: doc says edits to items themselves not provided; only deletion]**
- **Material template extraction does not happen in non-math/physics subjects** — Chem/bio/geo/history etc. emit no templates (07 §1; 06 §P1.4).

## 7. Studying / practicing

- **Start subject-wide session** — "Üben" button on subject; FSRS picks items capped at 20 (05 §Subject; 01 J4).
- **Start folder-scoped session** — "Üben" inside a folder restricts to folder items (05 §Folder).
- **Start material-only session** — "Diesen Stoff üben" on material screen (05 §Material).
- **Session item presentation** — Sequential; header shows "5 / 18" progress (05 §Session).
- **Answer mode: short text** — TextInput + voice (05 §Session; 07 §3.1).
- **Answer mode: long explanation** — TextInput + voice; local evaluator always delegates to LLM (07 §3.2).
- **Answer mode: numeric** — `MathInput` numeric, unit suffix chip (07 §3.3; 05).
- **Answer mode: multiple choice** — Tappable cards; option-level mini-stimuli (07 §3.4; 05).
- **Answer mode: formula (LaTeX preview)** — `MathInput` formula mode with live KaTeX preview (07 §3.5; 05 §MathInput).
- **Answer mode: diagram_label** — Numbered diagram + "Was ist Nummer 3?" + TextInput/voice (07 §3.6).
- **Answer mode: fill_blank** — Inline TextInput slots, focus auto-advance on submit (07 §3.7; 05 §FillBlank).
- **Voice input flow** — Tap mic → live transcript → 1500 ms silence VAD auto-stop (05 §Voice input; §VoiceButton).
- **Voice retry / redo** — Learner can interrupt and try again (DESIGN-BRIEF §Voice). **[implied — needs design: redo affordance]**
- **Voice playback of question** — Tap speaker icon → `expo-speech` TTS in profile locale (05 §Voice output).
- **Auto-read on item display toggle** — Per-profile preference, off by default (05 §Voice output).
- **Local answer evaluation** — Per-kind rules in `eval/local.ts`; < 50 ms (05 §Performance; 02 F2; 07 §3).
- **Local correct → silent advance** — "Stimmt!" 600 ms, advance, no network, no credits (05 §Session; 02 F2).
- **Local unknown → LLM streaming evaluation** — `POST /attempts` SSE: verdict / feedback / hint / done (04; 05; 02 F2).
- **Verdict: correct** — Brief positive feedback, optionally one extra fact (06 §P3).
- **Verdict: partially_correct** — Name what's right, hint at what's missing without revealing (06 §P3).
- **Verdict: incorrect** — Gentle nudge (06 §P3).
- **Hint 1** — After wrong/partial; "Tipp" button (05 §Session; 06 §P3).
- **Hint 2** — Second hint, escalates focus on missing piece (06 §P3).
- **Third try reveals answer kindly** — `next_hint` becomes null and feedback contains the answer (06 §P3; 05; 01 J4).
- **"Erklär mir das" on demand** — `POST /explain` SSE modal (04; 05 §Session; 01 §Studying).
- **Explain style: "simpler"** — Simplest language, one everyday example (06 §P4).
- **Explain style: "step-by-step"** — Numbered steps (06 §P4).
- **Explain style: "analogy"** — Built around one everyday analogy (06 §P4).
- **Test-Modus** — No hints, no explain, feedback hidden until end; result shows misses (05 §Session; 01 §Studying).
- **Test-Modus offline** — Works fully offline (01 §Offline).
- **Quit mid-session** — Exit button with confirm; state preserved, no penalty (05 §Session; 01 §Studying).
- **Session result screen** — Items practiced / mastered / still uncertain + streak update; "Nochmal mit den schwierigen" → focused re-session (05 §Result; 01 §Studying).
- **"More like this" (math practice run) entry** — From an item with a linked template, button "10 ähnliche Aufgaben üben →" (07 §6; 01 J5).
- **Practice variant generation (client-side, no LLM)** — `mathjs` samples params honoring constraints (07 §6.3; 02 F3).
- **Adaptive difficulty after a run** — `difficulty_adjustment` ±1 within ±2 cap (07 §6.5).
- **Practice run summary** — Correct count, avg time, next-run difficulty (05 §Practice).
- **Variant generation failure ("Aufgabe variiert nicht weit genug")** — Shown after 200 attempts; further variants disabled for this run (07 §6.3).
- **Three consecutive variant failures flag template** — Template stops being offered until server validates again (07 §8).
- **Streak counter on result + admin overview only** — Never on learner home (05 §Notifications; 01 §Studying).
- **Skipping items inside a session** — `verdict='skipped'` supported by schema (03 attempts). **[implied — needs design: explicit skip button]**
- **Continue / resume previously quit session** — State preserved (01 §Studying; 05). **[implied — needs design: how resume surfaces]**
- **Replay sound when ASR mishears** — **[implied — needs design: tap-to-redo voice attempt]**

## 8. Adaptive review

- **FSRS schedule at session start** — Server picks due items quietly, cap 20 (01 J4; 04 `POST /sessions`).
- **Learner never sees "due" queue size** — Strict no-counts rule (DESIGN-BRIEF; 01; 05).
- **Returning user — no shaming after long absence** — Plain warm welcome, FSRS state ages internally (01 J10; 05 §Error states).
- **Mastered topics surfaced in admin overview** — Not learner-facing (01 §Account-holder overview; 05 §Overview).
- **Struggling topics surfaced in admin overview** — Not learner-facing (01 §Account-holder overview).
- **Test-folder bias** — Practice biases toward items whose folder has a near `scheduled_for` (DESIGN-BRIEF §Studying for a test). **[implied — needs design: how bias is surfaced if at all]**
- **FSRS server recomputation on batch replay** — Server is authoritative; mobile discards local state and re-pulls (02 F4; 05 §Conflict resolution).
- **"Test in N Tagen" gentle chip on subject tile** — Only when folder `scheduled_for` is within 7 days; max 7 days lookback (04 schedule-summary; 05 §Home).
- **Schedule-summary load on home + admin** — `GET /learners/:learnerId/schedule-summary` for chips and admin overview (04; 05).

## 9. Voice & ASR

- **Mic permission requested at first voice use** — `RECORD_AUDIO` rationale + iOS `NSMicrophoneUsageDescription` (05 §Permissions; §Voice input).
- **Speech recognition permission (iOS)** — `NSSpeechRecognitionUsageDescription` (05 §Permissions).
- **Tap-to-start voice** — Mic icon enters listening state (05 §VoiceButton).
- **Live transcript display above input** — Shown as the learner speaks (05 §VoiceButton).
- **VAD auto-stop after 1500 ms silence** — Recognizer auto-finishes (05 §VoiceButton).
- **Voice locale follows learner ui_locale (or material language for foreign subjects)** — (05 §Voice input).
- **Audio never leaves device** — Only transcript is processed (05 §Voice input; 09 §Data inventory).
- **Fallback to text when voice fails** — Switch to keyboard input (05). **[implied — needs design: explicit fallback affordance]**
- **Ambient noise / recognizer error** — **[implied — needs design: handling unintelligible result]**
- **Voice answer evaluated locally first** — Then LLM if unknown (02 F2).

## 10. Math & formula

- **MathLite input parsed live (debounced 80 ms)** — On each keystroke; KaTeX preview below (05 §MathInput).
- **Parse failure → muted raw text + tooltip** — "Wir verstehen es trotzdem — bitte abschicken" (07 §4.2; 05).
- **Toggle between native keyboard and MathKeyboard** — `<MathInput>` switch (05).
- **MathKeyboard core symbols** — `+ − × ÷ = ( )`, `x²`, `xⁿ`, `√`, `π`, `Δ`, `≤`, `≥`, fraction template, subscript template (05 §MathKeyboard).
- **MathKeyboard "MEHR" subject-specific symbols** — `°`, reaction arrow, vector arrow (05).
- **Voice → math input** — Voice toggle inside `<MathInput>` (05).
- **Unit suffix chip in numeric mode** — Non-editable, derived from item `units` (05).
- **Numeric tolerance ±1 % rel / ±0.01 abs** — Local evaluator (07 §3.3).
- **German decimal comma normalization** — Comma → dot (07 §4.3).
- **Unit alias recognition** — "Kilometer pro Stunde" → "km/h" (07 §4.3).
- **Render LaTeX with KaTeX in line and display modes** — `$...$` inline, `$$...$$` display (07 §4.1; 05 §LatexText).
- **Server-side LaTeX → SVG render endpoint** — `GET /render/latex?src=...` for many-formula screens (04).
- **Function plot stimulus rendering with `victory-native`** — Pinch-zoom (05 §FunctionPlot; 07 §2.3).
- **SVG stimulus rendering with `react-native-svg` (sanitized)** — Runtime element/attribute whitelist (05 §SvgStimulus; 07 §2.4).
- **Coord-grid tap → snapped coordinate answer** — Snap to `tick_step / 2` (07 §2.5). **[implied — needs design: explicit UI]**
- **Pinch / double-tap zoom on diagram question** — Animated 2-px ring on asked marker pulsing at 1 Hz (05 §DiagramQuestion; 07 §7).
- **Chemical equations in LaTeX** — `H_2O`, `\rightarrow`, `\rightleftharpoons` (07 §4.1).
- **Locale-aware display (decimal comma at display time)** — Renderer transforms dot → comma for de (07 §4.1).

## 11. Subscription & credits

- **14-day free trial of Standard via store mechanics** — Created at signup with `tier='trial'`, 1500 credits, 14 days (01 §Pricing; 08 §Trial bucket).
- **Trial expiry → must subscribe to use LLM features** — Existing items + practice runs still work; "Mehr Fragen" / "Erklär mir das" disabled (05 §Error states; 08).
- **Trial-end heads-up banner (admin only, 7 days before)** — Small banner on admin (05 §Error states).
- **Upgrade Standard → Plus** — RevenueCat purchase sheet; webhook updates tier and grants prorated credits (01 J8; 08).
- **Downgrade Plus → Standard** — Effective next cycle; higher allotment until then (08; 01 J8; DESIGN-BRIEF subscription flows).
- **Cancel subscription** — Stays usable until period end; afterward, vision and LLM grading disabled (01 J8; DESIGN-BRIEF).
- **Restore purchase (new device / reinstall)** — RevenueCat restore flow (DESIGN-BRIEF subscription flows). **[implied — needs design]**
- **Deep link to App Store / Play subscription management** — "Verwalten" button (05 §Subscription).
- **RevenueCat purchase sheet (in-app upgrade)** — From admin → subscription (05).
- **Billing issue → grace status** — `subscriptions.status='grace'`; next RENEWAL grants normally (08 §Grant logic).
- **Renewal → monthly credit grant** — Up to rollover cap (08).
- **Rollover cap enforcement (3× allotment)** — Excess dropped, logged as `rollover_capped` (08).
- **Reconciliation cron (daily 03:00 UTC)** — Catches missed webhooks; safety net (02 §Edge Functions; 08 Path B).
- **Insufficient credits at `POST /materials`** — 402; learner sees "Heute habt ihr schon viel geübt — versucht es morgen wieder!"; admin banner (05 §Error states; 08).
- **Soft cap UX: balance 10–25 %** — Admin sees "Credits werden knapp" banner; learner sees no change (08 §Soft caps).
- **Soft cap UX: balance < 10 %** — Admin banner "Heute noch wenige neue Fragen möglich" (08).
- **Soft cap UX: balance = 0** — Admin banner "Diesen Monat ist Schluss"; learner sees "Heute haben wir genug geübt" (08).
- **Abuse nudge — 1.5× estimate after 3 insufficient_credits in 24 h** — Same settle, but pre-debit larger (08 §Abuse prevention).
- **Refund on LLM failure** — Full estimate refunded; `credit_events.reason='refund_failure'` (08).
- **Refund on not_educational / unreadable** — Estimate refunded (06 §Failure modes; 08).
- **Settle larger-than-estimate without blocking** — Vision uses 28 instead of 20 → still goes through; capped by per-action cap (08 §Atomic debit).
- **Credits invisible to user** — Never shown; framing is "today's quota" not "credits left" (08).
- **Pricing reconciliation (when Vertex prices change)** — Only `cost.ts` updated (08 §Pricing reconciliation). _[internal]_

## 12. Privacy / DSGVO

- **Age gate at first launch** — Branches under-16 hand-off (05; 09 §3).
- **DSGVO consent screen with version + timestamp** — Adult version of legal text; checkboxes (05 §Consent; 09 §3).
- **Per-minor explicit consent at profile creation** — Stored with `learners` row (05 §Minor consent; 09 §3).
- **Re-consent on consent version change** — Cold-launch comparison triggers re-consent (09 §3).
- **Plain-language consent summary** — German privacy summary on consent screen (09 §11).
- **Link to full policy (web view)** — From consent and privacy settings (05 §Privacy settings).
- **Consent review screen** — Shows what was consented to, when, version (05 §Privacy settings; 09 §Restriction).
- **Analytics opt-out toggle** — Disables PostHog SDK on next launch (05 §Privacy settings; 09).
- **Data export request** — `POST /dsgvo/export` → pending state → email with signed URL (24 h validity) (05 §Data; 09 §Access).
- **Data export contents** — `account.json`, learners, subjects, folders, materials, items, attempts, practice_runs, problem_templates, subscriptions, credit_events, study_assets/, consent.json, README.md (09 §Access).
- **Data export polling** — `GET /dsgvo/requests/:id` (04).
- **Account deletion request** — `POST /dsgvo/delete-account` with re-typed email; 7-day hold (05 §Data; 09 §Erasure; 04).
- **7-day cancellable deletion banner** — Admin shows "Doch nicht löschen" (05 §Data; DESIGN-BRIEF).
- **Cancel pending deletion** — `POST /dsgvo/cancel-deletion` within window (04; 09).
- **Account deletion executes after 7 days** — Cascading delete in Postgres + storage + auth + RevenueCat + Sentry/PostHog deletion (09 §Erasure).
- **Raw photo wipe at T+7 days** — `pg_cron` + `photo-wipe` Edge Function (02; 09; 01 §AI processing).
- **Study assets persist past photo wipe** — Derivative images survive until material deletion (07 §5; 09).
- **No PII in Sentry events** — `beforeSend` hook drops sensitive fields; hashes ids (09 §6).
- **No PII in PostHog events** — Per-account pseudonym only (02; 09).
- **Vertex logs auto-purged at 30 days** — Paid tier; no training use (09 §Data inventory).
- **Account holder rights — rectification** — Edit profile / subject / folder / material title via PATCH (09 §Rectification).
- **Account holder rights — restriction (archive)** — Archiving subjects/folders functions as restriction (09 §Restriction).
- **Account holder rights — objection (analytics off)** — Toggle in privacy settings (09).
- **DSGVO request audit log retained 24 months** — `dsgvo_requests` table (09 §Audit log).
- **Minor profile protections** — Admin surface gated by account holder; minors cannot enter admin (05 §Surfaces; 01 §Minor profiles; 09).
- **Per-account audit log of admin endpoint accesses** — Forever (09 §12). _[internal]_

## 13. Admin surface

- **Enter admin via header avatar tap / long-press** — Always triggers biometric (05 §Header; §Surfaces).
- **Minor profile redirect when accessing admin** — "Dafür brauchen wir eine erwachsene Person" + invoke biometric button (05 §Surfaces).
- **Admin overview (single profile)** — Profile card (avatar, name, streak, weekly minutes) + drill-in inline (05 §Overview; 01 §Account-holder overview).
- **Profile drill-in (deep-linkable)** — Streak, weekly minutes chart, mastered/struggling topics, subject list (05 §Profile drill-in).
- **Read-only items list per material** — Admin can view generated questions (01 J7).
- **Admin: delete a bad question** — Drill into material → delete item (01 J7).
- **Admin: move material between folders** — (01 J7).
- **Admin: archive subject / folder / material from drill-in** — (05 §Edit and delete patterns).
- **Admin: edit subject / folder / material metadata** — Title, color, icon, date (DESIGN-BRIEF).
- **Profile edit screen** — Display name, birth year, grade level, avatar, UI language, preferred answer mode (05 §Profile edit).
- **Profile notifications screen** — Toggles for practice nudge + time, test heads-up; all off by default (05 §Profile notifications).
- **Archived items tabbed list** — Subjects / folders / materials / items / profile tabs; "Wiederherstellen" button each (05 §Archived).
- **Subscription screen** — Current tier, status, expiry / trial end; upgrade / downgrade / cancel / manage buttons (05 §Subscription).
- **Data screen** — Export, Delete account, pending-deletion banner (05 §Data).
- **About screen** — Legal, version, support (05 §About).
- **Sync error banner ("Synchronisierungsproblem")** — Admin only; never shown to learner (05 §Sync engine).
- **Admin spend dashboard** — `/admin/spend` allowlisted; not in app — internal (08; 04). _[internal — needs design only if surfaced]_

## 14. Notifications

- **All notifications off by default** — (05 §Notifications; 01 §Notifications).
- **Notification permission request just-in-time** — When account holder first enables any category (05).
- **Practice nudge: enable + time picker** — Per-profile, default 16:30 (05; 03 learners).
- **Practice nudge fires only on days the profile hasn't opened the app** — At most once per day; copy: "Lust auf eine kleine Übungsrunde?" (05 §Notifications).
- **Test heads-up enable** — Default off; admin enables (03 learners; 05).
- **Test heads-up: 3 days before** — "In 3 Tagen ist dein Bio-Test." (05 §Notifications).
- **Test heads-up: 1 day before** — (05).
- **Test heads-up: morning of** — "Heute ist dein Bio-Test. Viel Erfolg!" (05).
- **No streak-loss notifications ever** — Hard non-goal (05; 01 §Non-goals).
- **Mute notifications anytime** — Toggle off (01 §Notifications).
- **Scheduler cancels + re-schedules on every refresh** — Prevents orphan notifications after folder archive (05 §Notifications).
- **In-app explanation of what each notification does** — Before permission request **[implied — needs design]**.

## 15. Errors & offline

- **Offline detection (HEAD probe, not OS state)** — Connectivity probe (02 F4; 05).
- **Offline banner ("Offline — du kannst weiter üben")** — Non-alarming (05 §Error states).
- **Offline session start with locally-cached items** — FSRS picks from local DB (01 J6; 02 F4).
- **Offline voice and text answering** — Fully works (01 §Offline; 02 F4).
- **Offline local-uncertain attempts marked "wartet auf Internet"** — `verdict='pending'`; "Antwort gespeichert — wird später überprüft" (01 J6; 05 §Error states).
- **Offline practice runs (template variants)** — Fully works (01 §Offline; 02 F3).
- **Offline Test-Modus** — Fully works (01 §Offline).
- **Outbox enqueue on offline writes** — `attempts_batch`, `pending_attempt_eval`, `practice_run_summary`, subject/folder/material/item archives, learner settings (02 F4; 05 §Sync engine).
- **Outbox drain on reconnect** — In `created_at` order; 2xx → done; 4xx → admin banner; 5xx → exponential backoff (05 §Drain).
- **Full pull after drain succeeds** — `GET /account`, subjects, recent materials, schedule-summary (05 §Pull).
- **Conflict resolution: attempts append-only by client_id** — No conflict (02 F4; 05).
- **Conflict resolution: item_states server-recomputed** — Mobile discards and re-pulls (02 F4).
- **Conflict resolution: subject/folder/material/item LWW by updated_at** — (02 F4; 05).
- **Conflict resolution: practice_runs upserted by client_id** — (05).
- **Sync engine triggers** — App foreground, network reconnect, every 60 s while foregrounded (05 §Offline-first).
- **Idempotent POST via Idempotency-Key** — 24 h replay window (04 §Conventions).
- **Unhandled crash** — "Etwas ist schiefgelaufen" + "Neu starten" + Sentry report (05 §Error states).
- **Rate-limit 429 with Retry-After** — Per endpoint per learner/account (04 §Rate limits).
- **Vision extraction failure with retry** — Returns to capture; refund credit (05).
- **Sync 4xx error banner (admin-only)** — Never on learner surface (05 §Sync engine).
- **Sync 5xx → exponential backoff** — Up to 300 s (05).
- **Email delivery failure for export / verification** — **[implied — needs design: recovery path]**.
- **Signed URL expired during upload** — Re-fetch via `POST /materials/upload-url` **[implied — needs design]**.

## 16. Account holder + minor specific flows

- **Minor profile cannot enter admin** — Tap on header shows hand-the-phone redirect (05 §Surfaces).
- **Minor profile: most long-press actions gated** — Archive/edit metadata, change profile settings → admin unlock (05 §Edit patterns).
- **Minor profile: actions allowed without admin** — Delete a bad question, request more questions for a material (05 §Edit patterns).
- **Minor profile content filtering** — Vision safety thresholds tighter (`BLOCK_LOW_AND_ABOVE` for sexual) (02; 06). **[implied — needs design: surfacing this to user]**
- **Tone scales by profile age** — Warmer/slower for younger; denser for adults; same personality (01 §Brand and tone; DESIGN-BRIEF §Age range).
- **Account holder reviews progress (J7)** — Unlock → list-then-drill-into-profile → mastered/struggling/streak (01 J7; 05 §Overview).
- **Solo adult: admin view framed reflectively** — Same surface, different framing (01; DESIGN-BRIEF).
- **Parent: admin view framed supervisorily** — Same surface, different framing (01).
- **Hand-off-after-onboarding prompt** — "Möchtest du dem Kind das Gerät jetzt geben?" → drop into minor's experience (01 J2).
- **Adult-self-consent vs minor-consent text divergence** — Different legal text per case (01; 05; 09 §3).
- **Account holder is also a learner — separate accounts required** — Anna for herself, Anna for child = two accounts (01 §Users; DESIGN-BRIEF).
- **Two-children households need two accounts** — Explicit constraint communicated **[implied — needs design: where this is explained]**.
- **Account holder PIN reset from inside admin** — Once authenticated via biometric/password (01 J9).

## 17. Edge cases

- **Running out of credits mid-session** — Existing items + practice continue; new material capture blocked (05 §Error states; 08).
- **Insufficient credits soft cap progression** — 25 % / 10 % / 0 % thresholds (08).
- **AI fails after upload** — Refund + retry from capture (05; 06).
- **Blurry / dark photo accepted via "Trotzdem behalten"** — Quality scores still sent to API (05 §Capture).
- **Unsupported subject (custom "other")** — Balanced answer-kind mix (07 §1).
- **Profile orphan after archive of only profile** — Account holder warned; restore-or-new-signup path (05 §Profile edit; 01 §Profile archive).
- **Account closure with active minor profile** — Single deletion flow covers both (09 §Erasure).
- **Two simultaneous LLM debits on same account** — One succeeds, the other gets `insufficient_credits` (10 Step 8).
- **Concurrent edits to same row from two devices** — LWW by `updated_at`; mobile pulls canonical (02 F4).
- **Variant generation cannot produce new unique value after 200 attempts** — UI message "Aufgabe variiert nicht weit genug" (07 §6.3).
- **Diagram label index exceeds successfully placed markers** — Item dropped (06).
- **Photo upload exceeds 10-min signed URL window** — **[implied — needs design: re-acquire URL]**
- **Login on new device while material upload pending** — **[implied — needs design]**
- **Subscription expired during active session** — Session continues; new-material blocked (05 §Error states).
- **Subscription lapsed but local data still works** — Practice runs and existing items keep working (05; 08).
- **App killed during AI extraction** — On relaunch, `extraction_status='pending'` row needs re-poll **[implied — needs design]**.
- **Material with `extraction_status='failed'`** — UI surfaces error + retry path (03 materials).
- **Outbox entry stuck on 4xx** — Surfaces only in admin banner (05).
- **Long-press menu on minor profile attempts admin-locked action** — Admin unlock prompt mid-flow (05).
- **Email change without verifying new address** — Reverts / blocked **[implied — needs design]**.
- **Wrong email typed in delete-account confirmation** — `POST /dsgvo/delete-account` fails validation **[implied — needs design]**.
- **Sentry data scrubbing covers `kid_answer`, `extracted_markdown`, etc.** — Internal but visible in privacy (09 §6).

## 18. Onboarding tutorials / empty states

- **Welcome (language picker)** — Auto-detected (05 §Welcome).
- **Final hand-off "Es kann losgehen!"** — Single button drops into learner surface (05 §Hand-off).
- **Empty home (no subjects yet)** — **[implied — needs design: post-onboarding empty state]**
- **Empty subject (no materials)** — "Hier ist noch nichts. Fotografier dein erstes Material!" + camera button (05 §Error states).
- **Empty stats (never studied)** — **[implied — needs design: admin view empty state]**
- **First-photo coaching** — Live quality feedback IS the tutorial (05 §Capture).
- **First-session coaching** — Implicit through item presentation **[implied — needs design: any in-context tips]**
- **First-formula keyboard discovery** — Switch from native to MathKeyboard (05). **[implied — needs design]**
- **Tutorial for voice button first use** — **[implied — needs design]**
- **"You can come back anytime" framing on result screen** — (05 §Result; DESIGN-BRIEF).
- **Day-50 home vs day-one home** — Same calm structure; chips appear as folders gain dates (DESIGN-BRIEF Q1).

## 19. Search / discovery

- **No global search defined in docs** — **[implied — needs design: search within materials, items, subjects]**.
- **Subject grid as primary discovery** — Visual tiles on home (05 §Home; DESIGN-BRIEF).
- **Folder list within subject** — Tab structure (05 §Subject).
- **Recent materials surfacing** — Pull queries recent (05 §Pull). **[implied — needs design: is there a "recent" view]**

## 20. Cross-cutting micro-flows

- **Rename pattern: tap title / long-press → "Umbenennen" → field → save** — Applied to subjects, folders, materials (05 §Edit patterns).
- **Move pattern: long-press → "Verschieben" → picker** — Materials between folders / "Ohne Ordner" (05 §Edit patterns).
- **Archive pattern: long-press → "Archivieren" → confirm** — Soft delete with 30-day recovery (05 §Edit patterns).
- **Restore pattern: admin → archived → tap "Wiederherstellen"** — (05 §Archived).
- **Delete confirmation modal** — "Soll diese Frage gelöscht werden?" (01 J11).
- **30-day undo window** — Default for all archived entities (01 §Organization).
- **Hard-delete: only via 30-day cron or DSGVO account deletion** — (05).
- **Long-press as ubiquitous edit affordance** — DESIGN-BRIEF Q11 calls for consistent edit pattern.
- **Pull-to-refresh on home → outbox drain + pull** — (05 §Home).
- **Idempotency-Key on creates** — Replay safe for 24 h (04).
- **Streak update animation on result screen** — Confetti / check at session-end (01 §Brand and tone).
- **Subject color chip across tiles, headers, charts** — Visual identity per subject **[implied — needs design]**.

## 21. Header / chrome / navigation

- **Active profile chip in header (avatar + first name)** — Identity cue and path to admin (05 §Header; DESIGN-BRIEF Q9).
- **Bottom tab bar (learner)** — `(learner)/_layout.tsx` (05 navigation).
- **Bottom tab bar (admin)** — `(admin)/_layout.tsx` (05 navigation).
- **Exit admin back to learner** — Single button after biometric session (05; 10 Step 19).
- **Tab between Ordner / Material in subject** — (05 §Subject).
- **"Üben" CTA placement: subject bottom, folder bottom** — Two primary CTAs (05).

## 22. Internationalization

- **Switch UI to de / en / fr / es / it** — Per-profile UI locale (05 §Internationalization; 10 Step 20).
- **Date / number / time formatting per locale** — Intl APIs (05 §Internationalization).
- **German decimal comma display** — Locale-aware (07 §4.1; 05).
- **Legal namespace fully translated all five languages** — At launch (05).
- **Machine-translated namespaces flagged with missing-key handler** — fr/es/it for non-legal namespaces (05).

## 23. Observability touchpoints surfaced to user (none directly)

- **PostHog events captured (session_started, material_captured, item_answered, practice_run_completed)** — Aggregate, anonymized; user can opt out (02 §Observability).
- **Sentry crash reports with scrubbing** — User-invisible except crash recovery copy (02; 09 §6).
- **Opt-out toggle in privacy settings** — Disables PostHog on next launch (05 §Privacy settings).
