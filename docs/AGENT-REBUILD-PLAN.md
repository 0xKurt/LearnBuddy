# Agent rebuild — completion plan

> Status as of commit `ff78e51`: backend + mobile chat shell exist. Plan
> below tracks what's still needed to call this a real, working,
> end-to-end conversational tutor. Phases are sequential; each phase is
> shippable on its own.

---

## Phase 1 — Make it reachable & functional end-to-end

The agent route works. The chat screen exists. But the kid can't
actually reach the chat from the home screen, and the verdicts the
agent emits don't update FSRS or trigger the reflective summary. Fix
that first.

- **1.1 Entry point** — home → `/(learner)/chat/[sessionId]`. The
  "Üben starten" tap on a subject tile (or the home CTA) should route
  to chat, not the legacy session screen.
- **1.2 FSRS update on every verdict** — when the agent returns a
  non-null verdict, call `applyAttempt()` so `item_states` advances.
  Verdict → rating mapping per spec §25:
  - correct, 0 hints → Good (4)
  - correct, 1 hint → Hard (3)
  - correct, 2 hints → Hard (2)
  - partially_correct → Hard (2)
  - incorrect → Again (1)
  - skipped → Again (1)
- **1.3 Reflective summary on /finish** — wire
  `reflectAndPersistSession` into `PATCH /agent/sessions/:id/finish`.
  Fire-and-forget. Writes a `learner_episodes` row + bumps
  `recurring_misconceptions`.
- **1.4 Cross-session memory in agent prompt** — when the session
  starts, load the most recent `learner_episodes` row + top 3 active
  `recurring_misconceptions` rows. Inject into the system prompt for
  the first ~5 turns. Same L1 rules: describe the work, never the
  learner.

**Acceptance for Phase 1:** kid taps subject tile → chat opens with
opener + first question → answers in text → verdict + FSRS row
updates → finish session → next session opens with an opener that
references the prior arc.

---

## Phase 2 — Voice as good as ChatGPT/Claude Voice

Current voice is tap-to-record, tap-to-stop. ChatGPT/Whisper voice
auto-stops on silence, supports interruption, and never burns
credits on "warte" or filler-only audio.

- **2.1 VAD auto-stop** — amplitude polling at 200ms intervals via
  `expo-audio`'s recorder status. When 1500ms of below-threshold
  amplitude has elapsed since the last loud sample, auto-stop and
  upload. Visual hint while recording: live amplitude waveform.
- **2.2 Voice intent classifier (client-side, rule-based)** — runs
  on the transcript BEFORE the SSE call. Catches `retry_request`,
  `pause`, `repeat_question`, `switch_to_typing`, `give_up`,
  `swear`, `playful_garbage`. Each intent has a defined client
  action (re-listen, scroll back, switch to keyboard, etc.) — zero
  Vertex calls.
- **2.3 Cancel button while recording** — tap-and-hold variant +
  visible X to discard mid-recording without uploading.
- **2.4 Tip-of-tongue heuristics** — detect filler-heavy transcripts
  ("äh… mit… mito…") and treat as a help request, not an answer.
- **2.5 Long-answer VAD extension** — `long` answer_kind uses 3000ms
  silence threshold instead of 1500ms.

**Acceptance for Phase 2:** kid taps mic, speaks naturally, mic
auto-stops after they pause. "Warte, nochmal" cancels and re-opens
the mic. "Ich weiß nicht" enters the give-up flow without burning a
Vertex call.

---

## Phase 3 — Conversation polish

The conversation works but doesn't _feel_ alive. Token streaming and
TTS close that gap.

- **3.1 Streaming reply text** — `responseMimeType: application/json`
  buffers the whole response before parse. Either:
  - (a) Switch to a custom delimiter scheme ("REPLY: …\nMETA: {…}")
    so reply text streams as it arrives; meta parsed at end. OR
  - (b) Use incremental JSON parser (e.g. `streaming-json-parser`)
    to emit the `reply` field as it grows.
- **3.2 TTS playback toggle** — small speaker button on each tutor
  bubble plays the reply via `expo-speech`. Auto-play after a voice-
  in turn (optional setting).
- **3.3 Session resume** — `GET /agent/sessions/:id` returns the
  full thread; chat screen re-hydrates the bubbles. Today
  `bootstrapExisting` just creates a new session.
- **3.4 Long-answer composer** — when the current item is
  `answer_kind === 'long'`, the composer expands vertically and
  doesn't auto-submit on Enter.

**Acceptance for Phase 3:** reply tokens stream in as they arrive,
the screen feels alive. Voice-in answers auto-play the reply. Closing
and reopening the app drops back into the same session at the same
spot.

---

## Phase 4 — Robustness & live verification

The conversation must survive bad networks, expired tokens, partial
LLM responses, and ambiguous input. And we need to _verify_ the
whole thing against real Vertex.

- **4.1 Error UX with retry** — when the SSE stream errors mid-turn,
  show an in-line retry button on the agent's empty bubble instead
  of a banner.
- **4.2 SSE reconnect** — if the stream drops before `done`, mark
  the turn as pending and offer to retry. The route is already
  idempotent on `client_turn_id`.
- **4.3 Token-expiry handling in voice path** — currently only the
  text/no-audio path refreshes the token on 401; verify voice path
  too.
- **4.4 Live-verify checklist** — manual run-through of voice + text +
  give-up + reveal against the live API + Vertex; capture conversation
  traces. List the device-only paths (camera, biometric, push, voice)
  alongside the green-on-CI paths. Land the checklist inside this doc
  rather than spinning up a separate file.

**Acceptance for Phase 4:** a session survives switching off Wi-Fi
mid-turn (resumes when reconnected). A live trace shows verdicts +
FSRS updates landing in Supabase + a `learner_episodes` row on
finish.

---

## What we're explicitly NOT doing

- Concept graph (`concept_nodes`/`concept_edges`).
- Transfer test (Phase F in old plan).
- Curiosity-hook side-quest. (The agent's prompt can naturally
  produce these when the kid is sharp; we don't need a separate
  selector move for it in v1.)
- Probe assessments table. (The agent's structured output captures
  this implicitly via `intent` + `verdict`; we can re-add a
  dedicated table later if analytics demand it.)
- Practice runs and Test-Modus UI. Those exist on the legacy session
  screen and stay there for now.

---

## Working order

I'll do Phase 1 in one commit (each item ≤ 30 lines, end-to-end
visible). Phase 2's mic work is one commit. Phase 3 streaming + TTS
one commit. Phase 4 robustness one commit. After every commit:
`pnpm typecheck && pnpm lint && pnpm test`.
