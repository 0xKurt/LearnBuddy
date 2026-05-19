# LearnBuddy — learner experience plan

A plan written for the learner, not the platform. Every phase ends with a concrete change the learner would _feel_ — not a metric improvement, not an architectural refactor. The architecture follows the experience, not the other way around.

---

## North star

> _Seven days after a concept is "mastered" by the system, the learner can solve a fresh problem from the same concept family — independently, with no scaffolding._

Everything else is instrumentation. We don't optimize for streaks, session length, FSRS hit rate, or correctness. We protect **transfer**.

---

## Three architectural laws (these don't change, ever)

These constrain every change below. Each phase has to keep all three intact.

### L1 — The wall

The diagnostic layer is allowed to know everything about the learner. It is never allowed to speak about the learner in first-person language.

- ❌ _"Ich merke, du bist frustriert."_
- ✅ _"Die Produktregel ist echt hinterhältig wenn man sie zum ersten Mal sieht — lass uns kurz was anderes machen."_

Both lines can come from the same internal inference. The first analyzes the child. The second externalizes the difficulty onto the material. **L1 is enforced by which module produces text**, not by post-hoc filtering of LLM output.

### L2 — Three tiers

| Tier           | Speed                            | What lives here                                                                                                                                                                        | When it runs                                      |
| -------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Runtime**    | sub-second                       | Warm conversational moves, intent detection, runtime signals (frustration, fatigue, ceiling), give-up handling, voice meta-commands. Only inferences that have to drive the NEXT turn. | Per turn, blocking the tutor reply.               |
| **Reflective** | minutes, async                   | Misconception classification, session episode summarization, mastery re-estimation, transfer test generation. Output: a state diff loaded by the _next_ session.                       | After session ends, off the user's critical path. |
| **Structural** | weeks, manual + offline LLM jobs | Concept graphs, curriculum maps, pedagogical move library, prompt templates, misconception taxonomies.                                                                                 | Rarely. The "lesson planning" tier.               |

If a piece of analysis can wait until after the session, it MUST wait. The runtime is for what informs the next turn. Nothing else.

### L3 — Invisible intelligence

Nothing the diagnostic layer infers should ever be visible as "the tutor analyzing the child." The only visible outputs of inference are:

1. The next problem the learner sees.
2. The next pedagogical move the tutor performs.
3. The opening of the next session.

The learner never reads an analytical sentence about herself.

---

## Roadmap summary

| Phase | Days | What the learner feels                                                                                     |
| ----- | ---- | ---------------------------------------------------------------------------------------------------------- |
| **A** | 5    | Praise stops being generic. Give-up loop terminates. Tutor pivots when struggling. Crutch starts breaking. |
| **B** | 5    | Tutor stops doing one thing. 10 named pedagogical moves selected by signal.                                |
| **C** | 5    | Tomorrow the tutor opens by referencing yesterday. Recurring mistakes get named (gently).                  |
| **D** | 4    | Fake understanding caught. Pattern-matching gets a different curriculum.                                   |
| **E** | 7    | Sharp kids find depth. Concept graph turns the curriculum into a network.                                  |
| **F** | 5    | Weekly transfer test — the one metric we trust.                                                            |
| **G** | 3    | Voice mode stops eating credits on "warte" / "banana" / mumbles.                                           |
| **H** | 5    | 50-turn sessions stay coherent. App tells the learner to stop when she should.                             |

The order matters. Phase B depends on signals from A3. Phase C's memory has nowhere to live without A's episode-summary substrate. Phase D's confidence probe is a selector move (B). Phase E's concept graph is the substrate Phase F queries. F can't begin before E ships.

---

## Phase A — The week-1 felt difference (≈ 5 working days)

Goal: by next Sunday, a learner sits down, uses the app for 30 minutes, and the four most jarring problems are gone. No new screens. No new migrations (until A3). The chat feels meaningfully warmer and smarter.

### A1 — Specific praise (½ day)

**Current state:** `pickPraise(locale)` returns one of 5 strings forever. Same `"Genau!"` whether the learner answered on the first try or after 3 hints.

**Files touched:**

- `apps/api/src/routes/sessions.ts` (around line 866)
- `apps/api/src/prompts/tutor.ts` (prompt extension)
- `apps/api/src/lib/praise/build-praise-context.ts` (new)
- `apps/api/src/lib/praise/__tests__/build-praise-context.test.ts` (new)
- All 5 `apps/mobile/locales/*/session.json` (verdict.correct stays, no new keys)

**Change:** delete `pickPraise`. Replace with `buildPraiseContext(ctx)` returning a discriminated union that the tutor's prompt renders:

```ts
type Praise =
  | { kind: 'first_try_easy'; difficulty: 1 | 2 }
  | { kind: 'first_try_hard'; difficulty: 3 | 4 | 5; topic: string | null }
  | { kind: 'effort_after_hints'; hints: number; topic: string | null }
  | { kind: 'self_corrected'; prior_attempt_summary: string }
  | { kind: 'reasoned_not_recalled'; topic: string | null };
```

Classification rules (pure, no LLM):

- `hints_used === 0 AND item.difficulty <= 2` → `first_try_easy`
- `hints_used === 0 AND item.difficulty >= 3` → `first_try_hard`
- `hints_used >= 1 AND verdict === 'correct'` → `effort_after_hints`
- prior wrong attempt by same learner on same item → `self_corrected`
- short answer + conceptual item kind → `reasoned_not_recalled`

The tutor's `SYSTEM_TUTOR` prompt is extended with a praise rubric block that maps each `Praise.kind` to a tone instruction. The model renders the praise; the system shapes it.

**Banned vocabulary lint:** new ESLint rule scans `locales/*/session.json` for ability-praise words: `smart`, `klever`, `Genie`, `Talent`, `intelligent`, `gifted`. None allowed. Effort/strategy/content praise only.

**Acceptance:**

- Unit test: 12 verdict scenarios, each produces a different `Praise.kind`.
- Manual: read 20 consecutive correct turns from a real session log. Praise lines must all be different. None mention ability.
- Typecheck + lint + tests green.

**What not to do:** generative praise via a Vertex call. The tutor's existing call already produces the natural-language praise; we just shape it via the prompt's praise rubric. No extra LLM calls.

---

### A2 — Progressive give-up (1 day)

**Current state:** `isNonAnswer` short-circuits to a stock string. Same string every time, regardless of how many give-ups in a row. After "Weiß nicht" three times, the learner sees the same canned response three times. This is the "agent loop" feel.

**Files touched:**

- `apps/api/src/routes/sessions.ts` (the give-up block at step 5.5)
- `apps/api/src/lib/give-up.ts` (add helper for `trailingSkipsOnItem`)
- `apps/api/src/prompts/tutor.ts` (new `gentle_scaffold` and `gentle_reveal` prompt fragments)
- `apps/api/src/routes/__tests__/conversation.test.ts` (extend)

**Change:** count `trailing_skips_on_item` from `conversation_turns`. Branch:

| trailing_skips            | server move                                                                                                                                                                                                                              | credits  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 0 (first give-up on item) | stock encouragement (current behavior)                                                                                                                                                                                                   | 0        |
| 1 (second give-up)        | tutor with `mode: 'gentle_scaffold'` — model gets material context + prior hints + a directive: "pick one concrete entry point from the material, ask about THAT specifically. Do not ask another open question. Reduce cognitive load." | ≈ actual |
| 2 (third give-up)         | tutor with `mode: 'gentle_reveal'` — model reveals gently grounded in material, then offers two choices (try once more / move on)                                                                                                        | ≈ actual |
| 3+                        | item is **paused** for this session. Server pulls a different item. Subject of paused item becomes a recovery hook for the reflective layer.                                                                                             | 0        |

The 4th give-up is a **pivot, not a continuation**. The most important pedagogical move in the system is the willingness to stop.

**Verdict:** all four still produce `verdict: 'skipped'` for the safety net. FSRS treats them differently downstream (Phase D will hook in here).

**Acceptance:**

- `__tests__/give-up-progression.test.ts`: 4 consecutive "weiß nicht" turns produce 4 different server behaviors. No repetition.
- Live test: against the dev API + Vertex, exercise the full 4-step progression on a real item.

**What not to do:** reveal the answer on the second give-up. That's too fast and trains the learner to give up to get the answer. The scaffold move at strike 2 is what breaks the dependency cycle.

---

### A3 — Runtime signal (1½ days)

**Current state:** none. The tutor sees the current turn and the bounded transcript. It does not see the emotional arc of the session.

**Files created:**

- `apps/api/src/lib/learner-state/runtime-signal.ts`
- `apps/api/src/lib/learner-state/__tests__/runtime-signal.test.ts`

**Files touched:**

- `apps/api/src/routes/sessions.ts` (compute + wire into tutor prompt + FSRS picker)
- `apps/api/src/prompts/tutor.ts` (recent rhythm section)
- `apps/api/src/lib/session-pick.ts` (signal-aware override)
- Migration 0022: add `runtime_signal jsonb` column to `sessions` (transient — overwritten per turn)

**The signal shape** (purely derived from `conversation_turns`, no LLM call):

```ts
type RuntimeSignal = {
  consecutive_wrong: number; // 'incorrect' + 'skipped' streak across items
  consecutive_give_ups: number;
  consecutive_correct: number;
  scaffolded_correct_on_concept: Record<string, number>; // for A5 fading
  avg_response_latency_ms: number; // rolling 5
  latency_trend: 'faster' | 'slower' | 'stable';
  message_length_trend: 'growing' | 'shrinking' | 'stable';
  turns_in_session: number;
  minutes_in_session: number;
  fatigue: number; // 0..1, sigmoid of (turns, minutes)

  // Aggregate states — DERIVED, never inferred via LLM.
  emotional_temperature: 'engaged' | 'pressured' | 'flat' | 'curious' | 'cratering';
  cognitive_load: 'low' | 'medium' | 'high';
  ceiling_signal: number; // 0..1, fraction of fast+correct on hard items
};
```

**Runtime overrides:**

- `consecutive_wrong >= 3 AND fatigue > 0.5` → FSRS picker forbids harder items, pulls from recently-mastered set.
- `consecutive_correct >= 4 AND ceiling_signal > 0.6 AND latency_trend === 'faster'` → FSRS picker unlocks harder items.
- `fatigue > 0.8 AND emotional_temperature === 'cratering'` → server inserts `break_suggested` SSE event (UI: dismissible card "Magst du kurz Pause? Wir machen später weiter." once per session).

**Prompt injection** — surfaces observations, not labels:

```
— Recent rhythm —
Last 5 turns: incorrect, incorrect, skipped, skipped, ?
Response latency trend: slower
Time in session: 23 minutes
Hints given on THIS item: 2
```

Never `"The student is frustrated."` — that invites first-person empathy from the model and breaks L1.

**Acceptance:**

- Unit test: synthetic 5-turn conversations produce the right signal values.
- Override test: after 3 wrong+wrong+skip turns, FSRS picker selects from `recently_mastered` instead of `due`.
- Override test: after 5 fast+correct on hard items, ceiling unlocks harder.
- L1 audit: read the prompt diff. No analytical labels in the prompt body.

**What not to do:** generate the signal via LLM. It's rule-based on transcript metadata. Adding an LLM call here breaks L2 (this is runtime — must be fast).

---

### A4 — Wiring praise + give-up + signal into the tutor prompt (½ day)

**Current state:** `buildTutorSystemInstruction` takes item + locale + hints. After A1–A3 it needs to take praise context, runtime signal, and give-up mode.

**Files touched:**

- `apps/api/src/prompts/tutor.ts`
- `apps/api/src/routes/sessions.ts`

**The new system prompt** layout:

```
[SYSTEM_TUTOR — unchanged base]

— Current question context — (unchanged)

— Recent rhythm —
[signal observations, never labels]

— Pedagogical guard — (conditional)
[from give-up mode + signal-driven constraints]

— Praise rubric — (only when verdict will be correct)
[from Praise discriminated union]

— Mode for this turn — (new for A2, expanded in Phase B)
[gentle_scaffold | gentle_reveal | normal]
```

**Acceptance:**

- Prompt-diff review: no label words in the prompt body that the model could echo back.
- Live test: 20 sample turns against real Vertex, manually read replies. No first-person analytical lines.

---

### A5 — Dependency fading: silent retry (1 day)

The pedagogical move that breaks the "tutor as crutch" trap.

**The move:** when the same learner has answered correctly _with scaffolding_ on the same concept ≥ 2 times in the same session, the next item from that concept is presented **silently** — the tutor shows the question and waits. No preamble.

- Learner answers correctly within 30s → strong FSRS Good ("durable" signal).
- Learner waits / asks for help → tutor responds normally, but FSRS records Hard (not Good).

**Files touched:**

- `apps/api/src/routes/sessions.ts` (turn handler — `silent_present` flag)
- `apps/api/src/lib/learner-state/runtime-signal.ts` (already tracks `scaffolded_correct_on_concept`)
- Mobile `apps/mobile/app/(learner)/session/[sessionId].tsx` (suppress the tutor preamble bubble when item arrives with `silent: true`)

**Acceptance:**

- Synthetic 6-turn fraction session: 3 scaffolded corrects, 3 silent items. Silent items show no tutor preamble. Correct-within-30s on silent → FSRS Good. Asked-for-help on silent → FSRS Hard.
- Live test: run a real session with a synthetic learner that gets 3 scaffolded corrects, observe the 4th item arrives bare.

**What not to do:** make the silent retry feel like a test. The UI must not flag "this is a silent retry — no help available." The question just appears. Help is still available if the learner asks for it; the _cost_ is the FSRS signal, not the UX.

---

**End of Phase A.** Five working days. What changed for the learner:

- Praise stops feeling generic.
- The give-up loop terminates after two strikes — and then _pivots_.
- When she's clearly struggling, the system stops pushing.
- When she's becoming dependent on hints, the system starts withholding them — and credits her when she stands on her own.

No new screens. One small migration (signal column).

---

## Phase B — The strategy library (≈ 5 working days)

Goal: the tutor stops doing one thing. It chooses.

10 named pedagogical moves: `socratic_question`, `direct_hint_broad`, `direct_hint_specific`, `worked_example`, `analogy`, `predict_then_check`, `wrong_example_probe`, `self_explanation_prompt`, `recovery_pivot_easier`, `recovery_pivot_familiar`, `silent_retry` (A5), `gentle_reveal` (A2), `curiosity_hook` (Phase E), `misconception_confrontation` (Phase C).

Each move has preconditions / forbidden-when / prompt fragment / expected cost. A pure-function selector picks one per turn from the moves whose preconditions hold. Decisions logged to `strategy_decisions` table for later tuning.

---

## Phase C — Cross-session memory, with the wall intact (≈ 5 working days)

Goal: when the learner comes back tomorrow, the tutor's _opening_ shows it remembers. Nothing else changes. The learner never reads an analytical sentence about herself.

- `session-reflect` Edge Function: 1 LLM call per ended session → `LearnerEpisode` row.
- Session-opener move: template-driven, references _the material_, never the learner's state.
- Tutor system prompt first-5-turns includes a compact "from last time" block.
- `recurring_misconceptions` table. Tutor's prompt includes top-3 active misconceptions to listen for. When detected → `misconception_confrontation` move.
- Resolution: misconception correctly handled without scaffold in a later session → `resolved_at`.

---

## Phase D — Catching fake understanding (≈ 4 working days)

Goal: stop mistaking memorization for learning.

- `confidence_probe` selector move: short correct first-try answers to conceptual items trigger "kannst du in einem Satz sagen, WARUM das so ist?"
- Probe verdict scoring (separate from item verdict): substantive reasoning → Good. Rephrasing → Hard + `pattern_match_signal++`. Give-up → Again + concept escalated to conceptual reframing next time.
- `wrong_example_probe` selector move: occasional "wenn jemand X gesagt hätte, wäre das richtig?" — pattern-matchers fail.

---

## Phase E — Concept graph and curiosity layer (≈ 7 working days)

Goal: when the learner is sharp, the tutor finds something _interesting_ — not just another FSRS item.

- One-shot LLM concept extraction per `subject_kind` (curated by hand after).
- `concept_nodes` + `concept_edges` tables.
- Each item linked to a concept node.
- `curiosity_hook` move fires when ceiling signal high + concept mastery deep.
- Prerequisite-aware FSRS pickup: if a concept's prerequisites are shaky, insert a quick retrieval-practice item first.

---

## Phase F — Transfer test (≈ 5 working days)

Goal: the one metric that means something.

- Weekly Sunday-night transfer session for each learner.
- Fresh items generated per concept marked "mastered" — different surface form, never reused.
- No hints, no staircase. Pass/fail.
- One visible line of feedback after the session: "Du hast 7 von 10 unabhängig gelöst."
- Transfer pass → concept promoted to `durable`, exits FSRS rotation.
- Transfer fail → concept de-mastered, re-enters FSRS pool with adjusted difficulty.

---

## Phase G — Voice fixes for daily use (≈ 3 working days)

- Voice intent classifier — rule-based first, tiny-model fallback. Handles `retry_request`, `switch_to_typing`, `pause`, `repeat_question`, `confused_meta`, `swear`, `playful_garbage`. Zero Vertex cost.
- STT confidence surfaced: < 0.6 → "hab ich richtig gehört: 'X'?" UI with two buttons.
- Adversarial / playful detector: two strikes → gentle redirect, three strikes → session ends, no credit burn.

---

## Phase H — Long-session robustness (≈ 5 working days)

- Rolling within-session digest: every 5 items, a 2-sentence summary replaces those turns in the bounded history. Token cost stays sane on 60-turn sessions.
- Re-entry from digest after pause.
- Fatigue-driven natural session-end: at `fatigue > 0.85`, next "Weiter" tap is intercepted with a "lass uns morgen weiter" message. The app actively pushes the learner to stop using it.

---

## What we're deliberately not doing

Tempting and wrong:

- **Praise streaks / badges / XP.** Externalizes motivation. Phase A's specific praise is the limit.
- **Avatars / mascots.** The tutor is a voice and a chat. Adding a mascot makes the analytical layer leak through aesthetic.
- **Comparative metrics ("you got X% — better than yesterday").** Shifts motivation toward performance and away from understanding. Never expose to the learner.
- **Difficulty selectors.** The system picks. The learner has tools to slow down (pause, easier pivot) but not a "make it easier" toggle. That turns the learner into the curriculum designer.
- **Daily streaks for opening the app.** Manipulative; rewards opening, not learning.
- **Any first-person analytical line from the tutor about the learner.** L1 forever.

---

## Implementation rules

1. **Every slice must ship with tests.** Unit tests minimum. End-to-end tests for anything that crosses the runtime/reflective boundary.
2. **Every slice must keep `pnpm typecheck && pnpm lint && pnpm test` green.** No exceptions.
3. **Every slice that touches the tutor prompt must be reviewed against L1 before merging.** Any first-person language about the learner ("ich merke, du …") is an automatic reject.
4. **Live-verify slices that touch the model.** A prompt change is not "done" until exercised against real Vertex with a real session.
5. **Every slice has an acceptance check the user could verify on a device.** "Tests pass" is necessary but not sufficient. The criterion is "would this feel different to a kid using the app?"
