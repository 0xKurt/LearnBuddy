# IDEAS — Pile of feature concepts not (yet) in the build plan

A scratchpad for ideas the team has floated but not committed to. Each
entry is a _concept_, not a spec. If an idea graduates, it gets its own
section in `AGENT-REBUILD-PLAN.md` or a dedicated doc.

Two sections:

1. **Features** — new product capabilities the team has discussed.
2. **Mobile-polish backlog** — concrete pre-ship fixes from the last
   mobile audit (2026-05-17), kept here so we don't lose them.

- Status: **open** unless marked otherwise
- Owner: Kurt
- Last updated: 2026-05-21

---

# Part 1 — Feature ideas

## 1. Checklist-as-Roadmap — auto-Lernplan aus Themen-Checklisten

### Why

The current `p1.2` Vision prompt classifies pages and explicitly produces
**zero items** for `CHECKLIST_OR_META` regions ("Themen für die nächste
Klassenarbeit", GB-Seitenverweise, "diese Themen musst du können"-Listen,
etc.). That information is currently _thrown away_ — but it's gold: it's
literally the teacher's syllabus for the upcoming test.

### The idea

When the Vision pass detects a `CHECKLIST_OR_META` region, instead of
discarding it, extract a structured **topic list** and offer to turn it
into the Lernziel's roadmap:

> "Auf dieser Seite stehen 8 Themen für die nächste Arbeit. Du hast
> bisher Karten zu **3 davon** (Bruchrechnung, Prozentrechnung,
> Dreiecke). Es fehlen noch: Maßstab, Wahrscheinlichkeit, Diagramme,
> lineare Gleichungen, Flächeninhalte.
>
> [ Themen zur Lernziel hinzufügen ] [ Nur anzeigen ]"

### Sketch — pipeline

1. **Vision** (extend `p1.2`): in the JSON output, add an optional
   `roadmap_topics: string[]` field populated only when a
   `CHECKLIST_OR_META` region is detected. Topics in the learner's
   `ui_locale`, normalised (no leading bullets, no page numbers).
2. **API**: `materials.ts` post-process stores `roadmap_topics` on the
   `materials` row (new JSONB column) and, if the material has a
   `folder_id`, also flags `folders.roadmap_pending = true`.
3. **Mobile**: Lernziel-Detail surfaces a banner when `roadmap_pending`
   is true — "8 Themen erkannt, davon 3 mit Karten abgedeckt" — with
   one tap to (a) generate a starter card per uncovered topic via P2 or
   (b) just save the list as a reminder.

### Why not build it yet

Needs the Subject + Lernziel UI to be calm first. It's a v2 feature on
top of the existing Lernziel model — not a blocker for v1 ship.

### Open questions

- **Coverage detection**: "Dreiecke ist abgedeckt" — by what rule?
  String-similarity on `items.topic`? Fuzzy on the question text?
  Cheapest first pass: case-insensitive substring match against the
  topic labels P1 already generates.
- **Multi-language roadmap**: if the worksheet is French but the kid
  studies in German, do we translate the roadmap entries? (Probably yes,
  via a P3-style cheap LLM call.)
- **Per-topic ETA**: with `folder.scheduled_for` set, we can show "5
  Tage bis zur Arbeit, 5 Themen offen → ~1/Tag" — turns the roadmap
  into a study schedule.

---

## 2. Vorab-Dokument-Untersuchung (VDU) — preflight Lernstoff-Check

### Why

The current flow charges credits and runs full Vision extraction even
when the photos turn out not to be educational material at all (recipe,
chat screenshot, photo of a person, ad). The `not_educational` error
fires _inside_ the Vision JSON — which means the entire P1 call has
already been billed by the time we know it's garbage. See
`docs/USER-FLOWS-DEEP.md §1.8` (Quatsch fotografiert).

### The idea

A cheap _preflight_ pass that runs **before** the expensive P1 pipeline
and decides:

1. Is this _probably_ educational material? (book page, worksheet,
   notebook, whiteboard photo, etc.)
2. Is it readable? (not blurry, not 90°-rotated, not all-white)
3. Rough subject hint? (math vs language vs natural sciences vs other)

If preflight fails → reject **before** running P1, refund the credit
hold, and surface the friendly "Das sieht nicht nach Lernstoff aus."
copy that USER-FLOWS-DEEP §1.8 already documents.

### Sketch — implementation

- Model: same Gemini, but a much smaller image-only prompt asking only
  for {`is_educational`, `is_readable`, `language_hint`,
  `subject_hint`}. Inputs are the same uploaded photos. Token budget
  ~300 in/200 out per page → ~10x cheaper than P1.
- Trigger: between `POST /materials` (which writes the photos) and the
  enqueue of the extraction job. If preflight rejects, the job is never
  enqueued, the credit hold is reversed, and `extraction_status`
  becomes `rejected_preflight` (new enum value).
- UI: same Quatsch-fotografiert rejection screen but lands ~3-5 s after
  upload instead of ~25-40 s.

### Cost vs benefit

- Adds ~1 cheap LLM call per upload (~1/5 of a P1 call).
- Saves the full P1 call when the kid scans junk → break-even when
  ≥10 % of uploads would have failed `not_educational` anyway.
- Bonus: catches blurry/rotated/empty uploads with a kind, _fast_ error
  instead of grinding through 30 s of extraction first.

### Open questions

- Do we trust the preflight enough to ALSO let it set the subject
  guess and skip the user's manual subject picker? (Probably no — too
  failure-prone, and the picker is also a "is this for Mathe or
  Französisch?" mental commitment that matters.)
- Should the preflight also flag `contains_minors_other_than_owner` or
  similar safety signals? (Out of scope here, but a natural place to
  put it later.)

---

## 3. Multilingual "card sanity" filter — _not_ regex

### Why this is here

In the 2026-05-21 conversation we considered a regex post-process on
the server side to strip well-known meta-question leaks ("Welche Themen
…", "GB-Seite …", "Auf welcher Seite findet man …"). That idea was
killed: **regex doesn't survive multi-language**. The kid's worksheets
are German, English, French, Spanish, Italian, and the leaks read
differently in each. Maintaining per-language pattern lists is a
losing battle.

### What to do instead

- **Trust the hardened p1.2 prompt** plus the eventual VDU (idea #2).
- **Mobile gesture** to remove individual junk cards (long-press →
  delete). Already built in the current branch.
- **If quality is still not good enough**: upgrade the Vision model
  from `gemini-2.5-flash-lite` to `gemini-2.5-flash` (~3× cost, big
  quality jump). This is the cheapest _quality_ lever we have, much
  cheaper than adding a second LLM call.

### Don't reopen unless

- New quality regression data shows ≥ 5 % of items are meta-leaks
  after the model upgrade _and_ the new prompt iteration.

---

## 4. Local Voice Activity Detection (VAD)

### Problem

The voice composer uses a simple amplitude-threshold VAD
(`apps/mobile/lib/voice/use-voice-recorder.ts`). It fires `onSilence`
after `silenceMs` of audio below `silenceThresholdDb`. This works in a
quiet room but fails in real homes:

> "ich hab Fernseher im Hintergrund laufen und es erkennt nicht ob ich
> rede oder nicht. es hört einfach die ganze Zeit zu." — Kurt

Failure modes:

- TV playing in the background → amplitude is permanently above the
  silence threshold → mic never closes itself.
- Same for music, dishwasher, sibling talking, etc.

ChatGPT handles this transparently. We currently can't.

### Why amplitude VAD can never fix this

Amplitude VAD only knows "loud" vs "quiet". TV audio and the user's
speech often sit at the same dB level. You need **content-aware**
detection (formants, voiced/unvoiced ratio, spectral envelope) — which
requires either a neural net or proper DSP on raw samples.

### What we tried (and rolled back on 2026-05-20)

Native VAD via `expo-speech-recognition` — Apple's `SFSpeechRecognizer`
on iOS, Google's `SpeechRecognizer` on Android. Used as VAD-only, with
the transcript discarded and chirp_2 kept on the server. Crashed at
runtime in Expo Go:

```
Uncaught Error: Cannot find native module 'ExpoSpeechRecognition'
```

`expo-speech-recognition` is a native module; Expo Go ships with a
fixed prebuilt module set. Adding it requires a custom **Dev Client**.
Reverted to amplitude VAD to unblock Expo Go testing.

### "Pure JS VAD" is not actually an option

| Library                                         | Reality                                                                |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| `@ricky0123/vad`, `@ricky0123/vad-react`        | Browser-only. WASM + Web Audio. Hermes doesn't support either.         |
| `react-native-executorch` `useVAD`              | Docs say explicitly: requires Dev Client.                              |
| `react-native-vad`, `@siteed/audio-studio` etc. | Native modules — autolinking but require Dev Client.                   |
| Pure-JS VAD on top of `expo-audio`              | `expo-audio` exposes amplitude only (no PCM samples) — nothing to FFT. |

### Options, ranked

**A — Native VAD via Dev Client (recommended)** — `expo-speech-recognition`
used as VAD-only, server-side STT stays chirp_2. iOS supports
`requiresOnDeviceRecognition: true` (audio stays local). One EAS or local
build, then QR-scan dev workflow continues. Effort: ~half a day (code
already exists in git history).

**B — Server-side probe via chirp_2** (Expo-Go-compatible) — mobile keeps
amplitude VAD; every ~2 s during recording it sends audio-so-far to a new
`POST /agent/voice/vad-probe`. Empty transcript → silence. Effort: ~half a
day. Cost: ~$0.003 per noisy recording, ~1-2 s extra latency at close-mic.

**C — Push-to-talk** — drop VAD entirely. Effort: 1 hr. Trade-off: loses
the "just talk" feel.

**D — Smarter amplitude heuristics** (variance + ZCR proxies). ~2 hrs. ~30 %
better against constant TV hum, useless against TV dialogue.

### Recommendation

**A**, when the team is ready to live with one Dev Client build. Until
then, stay on amplitude VAD and accept the TV failure mode as a known
limitation. **B** is the right escape hatch only if a Dev Client is
permanently off the table.

### Pointers

- Last working native-VAD implementation: `apps/mobile/lib/voice/use-voice-recorder.ts`
  at the commit prior to the rollback on 2026-05-20.
- Server STT pipeline is independent of the VAD choice. chirp*2 at
  `projects/learnbuddy-496516/locations/europe-west4/recognizers/*`.
- `expo-speech-recognition` plugin permission strings ready in app.json
  history; iOS `NSSpeechRecognitionUsageDescription` already present.

---

## 5. Live streaming transcript while user speaks (ChatGPT-/Claude-style)

### Why

Currently the transcript only appears AFTER the user stops talking and
audio is uploaded. ChatGPT and Claude Voice show the words appearing
in real-time while you speak — immediate feedback that the system is
hearing you correctly, much less anxious UX. Kid-relevant because
they hesitate when they can't see what they're saying.

### Sketch — what'd change

1. **Mobile**: switch from "record-then-upload" to chunked streaming.
   `expo-audio` records → emit PCM chunks every ~200ms via a WebSocket
   connection to the server (Hono supports WS via `hono/ws` or via a
   sidecar Vercel function — needs investigation).
2. **Server**: open a `streamingRecognize` gRPC bi-directional stream
   to GCP Speech-to-Text v2 (chirp_2 supports streaming). Forward
   chunks as they arrive. GCP returns interim transcripts
   (`isFinal=false`) and one final (`isFinal=true`).
3. **Server → Mobile**: pipe interim transcripts back via the same WS
   so the bubble updates live.
4. **Mobile**: render the learner's bubble with the streaming text in
   place of the optimistic "…".
5. On final transcript: continue with the existing agent-turn
   pipeline (LLM + TTS) on top of the finalized text.

### Trade-offs

- **Cost**: chirp_2 streaming bills per second of audio, same rate as
  batch (~$0.024/min). Net cost similar, but the duplicated upload
  (chunked vs single) needs care to avoid double-billing if we still
  send the full audio for the LLM context.
- **Complexity**: WebSocket transport is a new protocol layer beyond
  the SSE we have. Vercel Hobby/Pro supports WS via `hono/ws` only on
  Node runtime, not Edge. Worth verifying before committing.
- **Failure mode**: WS drop mid-utterance is harder to recover from
  than the current "record fully then POST" pattern.

### When to build

After the conversational-tutor base (AGENT-REBUILD-PLAN phases 1-4)
is stable. This is a clear v2 feel-good polish, not a v1 blocker.

---

## 6. Lernziel + Material + Card management (sort, hide, delete)

### Why

Right now Lernziele / Materialien / Karten live in a flat list with no
power tools. Once a learner accumulates a school-year's worth, they
need:

- **Reorder** Lernziele (drag-to-sort within a subject)
- **Hide** Lernziele the learner doesn't want to see but doesn't want
  to delete (semester finished, exam passed)
- **Hard-delete** Lernziele
- Same trio on Materialien and on individual Karten

### Sketch

- Reuse the existing `archive_at` pattern (we already soft-archive
  some entities) for "hide". Add an explicit `hidden_at` if the
  semantics differ from "deleted".
- DB needs `sort_order` columns on the relevant tables, or use
  `created_at` desc by default and let users override via a manual
  position. Probably the latter — explicit sort field on user-curated
  rows.
- UI: long-press in the list opens the per-item menu (rename / hide /
  delete). Drag handle on the row when in "edit mode".

### Not yet started — backlog.

---

## 7. Karten-Modus (Flashcard quiz mode)

### Why

The conversational tutor is great for diagnose-and-scaffold work, but
when the learner just wants to drill cards before a test, the
conversation is overkill. A pure flashcard mode (question → reveal
answer → self-rated correct/hard/wrong) would complement the tutor:

- Cheaper (no LLM call per card unless the kid asks for an
  explanation)
- Faster (10 cards in 2 minutes)
- Better for last-night-before-the-test cramming

### Sketch

- New screen: `/(learner)/flashcards/[scope]` (subject / folder /
  material)
- Card flip animation; "Konnte ich / Halb / Wieder" rating maps to
  FSRS Good / Hard / Again
- Optional: tap a button to spin up a brief tutor session on the card
  the learner failed on

### Not yet started — backlog.

---

## 8. FSRS-aware item ordering inside a Lernziel session

### Why

When the tutor starts a session on a Lernziel with N cards, the order
currently is whatever the picker returns. Should be:

1. Cards the learner has **never seen** (or only opener-introduced) →
   first.
2. Cards the learner got **wrong / partially correct** in past
   sessions → next, with the worst ones first.
3. Cards the learner answered correctly **but with hints** → third.
4. Cards the learner has truly mastered (correct first-try multiple
   times) → last, used as warm-up if the budget allows.

Inside each tier, randomise so the kid doesn't drill the same item in
the same slot every time.

The FSRS state machine already tracks each item's stability; we just
need to add a tier-aware order on top of due-date for the
`pickItems()` selector that the agent route uses.

### Sketch

- `apps/api/src/lib/fsrs.ts` already has the per-item state.
- `apps/api/src/routes/agent.ts`'s `pickItems()` (or whichever queue
  builder) sorts by tier first, then by FSRS due, then randomise
  within tier with a seeded RNG so the kid doesn't get the exact same
  order twice.

### Not yet started — backlog.

---

## 9. Pages cap (shipped)

(Not really an idea anymore — landed on this branch.)

- Hard cap lowered from 20 → 10 pages per material.
- Reason: P1 token budget (8192 out) realistically caps useful items
  around 10 pages; beyond that the JSON truncates and we lean on
  `jsonrepair`.
- See `shared-types/material.ts` and `apps/mobile/app/(learner)/capture.tsx`.

---

# Part 2 — Mobile-polish backlog (from 2026-05-17 audit)

Sourced from the v2 mobile audit. Findings that haven't been ticked off
in code yet. Order = priority. Each entry is a one-liner with the file
and effort estimate.

### 🔴 Critical (store-readiness blockers)

1. **In-app rating prompt** — install `expo-store-review`; call
   `StoreReview.requestReview()` from `result.tsx` after the 3rd
   successful session (OS handles capping). Never gate on positive
   sentiment first (App Store §5.6.1). _Effort: 30 min._
2. **Support email + FAQ** — add `mailto:support@learnbuddy.app` row to
   `app/(admin)/about.tsx`, "Help & FAQ" row to `overview.tsx` ROWS.
   _Effort: 15 min._

### 🟡 Accessibility — custom interactive components missing ARIA

3. `accessibilityRole="tab"` + `accessibilityState.selected` on
   `welcome.tsx` Tab. _5 min._
4. `accessibilityRole="radio"` + `accessibilityState.selected` on year
   grid in `age-check.tsx`. _10 min._
5. `accessibilityRole="checkbox"` + `accessibilityState.checked` on
   `consent.tsx` Checkbox. _10 min._
6. `accessibilityRole="radio"` + `accessibilityState.selected` on
   language picker in `account-settings.tsx`. _10 min._
7. `accessibilityLabel` on cold-launch `ActivityIndicator` in
   `app/index.tsx`. _5 min._
8. `accessibilityRole="menuitem"` on admin overview rows in
   `overview.tsx`. _10 min._

### 🟡 UX / flow

9. `result.tsx` dual-CTA ambiguity + silent error state — point "Review
   hard topics" to `/(learner)/practice`; add `if (summaryQ.error)`
   branch with retry. _30 min._
10. Migrate `reset-password.tsx` phase-2 password field to
    `LbTextInput` for parity with the rest of the app. _20 min._
11. App-switcher privacy overlay (`absoluteFillObject` on backgrounded
    state) in `_layout.tsx` — minor data leak via OS screenshot.
    _20 min._
12. Verify subscription price display uses `Purchases.getOfferings()`
    instead of i18n strings. _1 hr._
13. Swap `Image` → `expo-image` for material thumbnails (LRU cache +
    blurhash). _1 hr._
14. "What's New" modal gated by stored app version. _2 hrs._
15. "Practice now" action button on test-reminder push notifications.
    _1 hr._

### 🔵 Nice-to-have

16. Shake-to-report via Sentry user-feedback dialog. _30 min._

### What was already excellent (no work needed)

Toast system, auth flows, force-update, notification scheduling,
permission rationale banners, capture-quality scoring, i18n coverage,
DSGVO + SecureStore + PostHog EU privacy posture. (Per the 2026-05-17
audit. If any of these regress, fix immediately.)

---

# Part 3 — Salvaged design questions from deleted USER-FLOWS docs

These are the `[implied — needs design]` markers from the deleted
`USER-FLOWS.md` and `USER-FLOWS-DEEP.md` — 49 unresolved product-design
questions worth keeping around. One-liners; full context in git
history (last commit on those files before deletion).

### Voice / ASR

- Visible "redo / nochmal" affordance after the mic stops
- Per-answer-kind silence timeouts (long answers need longer thresholds)
- Match priority for spoken multiple-choice answers
- Explicit auto-timeout threshold for voice
- Fallback affordance when ASR fails (unintelligible / accent / confidence-low)
- Stutter / restart / "warte, neu" handling
- Skip-hint offers, help-requests, long pause timeout
- Diarization handling (other voices in room)
- Word-pattern surfacing: "Maxi got 'Mitochondrium' wrong three times"

### Math / formula input

- Math-keyboard first-use tooltip discovery
- `x2` vs `x²` vs `x_2` disambiguation prompt
- Unicode-superscript normalisation in MathLite parser
- Specific copy for parse-failure hints ("Operator fehlt")
- Coord-grid tap-to-answer with snap behaviour

### Capture / material source

- Trigger UI for album-pick (existing device photos)
- Text-paste flow for manual material entry
- File-pick flow for PDF material source
- Pre-resize photos to prevent upload timeout
- Glare detection in photo quality scoring
- Detect finger-over-text and ask to retry
- Warn when capture spans multiple subjects
- Mixed-language pages: language field per item

### Organization & discovery

- Reorder UI for subject tile `sort_order`
- Drag-reorder for subjects and folders
- Pin a subject to top of home for test prep
- Global search (materials, items, subjects)
- "Recent materials" view design
- Visual identity for subject color chip across tiles
- Empty home-state for first-day learner

### AI questions / sessions

- Edit UI for generated questions (today only delete, not rewrite)
- Stimulus-rendering failure with question still valid (fallback)
- Explicit skip button for items in session
- Surface to resume previously-quit session
- Replay-sound / tap-to-redo voice attempt
- How test-folder bias surfaces in UI (if at all)
- Three-bucket result layout including "pending" evaluations
- Auto-saved practice-run state resume prompt
- Night-mode-aware result copy for late-evening sessions
- "Pausieren" vs. "Quit" button copy variant

### Offline & sync

- Offline capture with deferred upload flow
- Disabled-state "Geht nur online" for Mehr-Fragen
- Soft cap for outbox growth on multi-day offline
- Subtle "Synchronisiert" indicator on first reconnect
- Distinct copy for captive-portal "fake online" vs. true offline
- Roaming-prompt for international data usage
- Edge case UI when both devices archive/restore simultaneously

### Subscription / billing

- Restore-purchase flow for new device / reinstall
- RevenueCat down / store unreachable fallback message
- "Ask to Buy" pending-subscription state messaging
- Family Sharing edge-case handling
- 24h-expired export download link recovery
- Prompt auto-cancel when deleting account mid-subscription
- Stricter weak-password UI (min 8, hints)

### Account / minor profiles

- Tone shift + consent when minor reclassified to adult at 16
- Surface location for learner-self-controllable settings
- Messaging when child reaches 16 and age-up transfer not supported
- Multi-child household: communicate that two accounts are required
- Email change blocking / revert if new address not verified
- Handling wrong email typed in account-deletion confirmation
- Login on new device while material upload still pending
- Per-age tonal variants of feedback strings

### Notifications

- In-app explanation of each notification type before permission request
- Should test-heads-up default on when account holder creates a dated folder
- Recovery path for undeliverable export/verification emails

### Coaching / first-run

- One-time tooltip pointing to quality-feedback after first photo
- Soft orientation tooltip for first answer submission
- Distinct welcome card for new learner vs. returning
- Kid-friendly permission rationale per age
- Illustrated card for minor's first answer-mode selection
- Replay-tutorial feature for first-time coach marks

### Quality / safety / errors

- Hide failed `not_educational` materials from subject list
- "Doch verwenden" override on not_educational with extra-credit cost
- Immediate photo deletion for rejected content (vs. T+7 days)
- Disputed-answer resolution: account-holder decision not visible to learner
- Warning during capture if recognized multiple subjects
- Server-status banner when Vertex/Supabase degraded

### App lifecycle / device

- Force-update modal and endpoint design
- Preserve in-progress capture photos across app updates
- Resume-session prompt after app update
- Resume-at-last-step behaviour when killed mid-onboarding
- Low-battery (< 10 %) animations and Reduce Motion variants
- Low-storage messaging and cleanup guide
- LRU image-cache purge indicator
- "Support kontaktieren" path after N unlock failures
- Foldable / tablet layouts when unfolded

### Accessibility extended

- Screen-reader labels per component
- MathKeyboard horizontal scroll at max font size
- Palette testing in deuteranopia / protanopia simulators
- Reduced-motion variants for all animations
- Smart Invert / Increase Contrast testing
- One-handed reach audit
- Keyboard shortcuts (Cmd+Enter to submit, …)
- OpenDyslexic / Atkinson Hyperlegible font option
- Extend TTS to feedback, hints, explain-modal content
- TTS speed slider (0.5×–2×)
- Time-extended-mode full spec

### Support / help

- Where "Help & Support" lives (recommend: admin → about)
- In-app feedback form for bug reports
- Explicit consent for Sentry crash upload beyond global consent
- FAQ content design
- Weekly "Tipps & Tricks" card in admin overview
- "?" tooltips on advanced features

### Future / nice-to-have

- Account switching without re-login
- "Möchtest du fortsetzen?" prompt after 5 min inactivity mid-session
