# ADR 0002 — Conversational tutor: grading, grounding, model tier

- Status: accepted
- Date: 2026-05-19
- Diverges from: docs/06-ai-pipeline.md §P3 (single-shot evaluator) and
  §provider-configuration (single pinned model).

## Context

Doc 06 §P3 specified a stateless single-shot answer evaluator returning
strict JSON `{verdict, feedback, next_hint}`. What shipped instead is a
multi-turn conversational tutor (`prompts/tutor.ts`, `converseTurn`): the
model sees the whole session thread and replies in natural language with a
trailing machine-readable control line. That product direction is
deliberate ("Das Üben ist ein Gespräch", docs/01) but it was never written
down, and three defects made it actively harmful to a learner:

1. The verdict was model-self-reported and trusted blindly — a student who
   typed "Weiss nicht" three times was graded "Genau!" (correct).
2. The only material the tutor/explain ever saw was a ≤200-char
   `source_excerpt`, so hints and "Erklär mir das" were generic and shallow.
3. Both ran on `gemini-2.5-flash-lite` (the weakest tier), which cannot
   teach well even with good context.

## Decision

- **Conversational tutor is the canonical design**, superseding the §P3
  single-shot evaluator. The spec-faithful `evaluateAnswer`/P3 path remains
  only as reference; it is not on the live path.
- **Grading is server-authoritative for the failure case.** A deterministic
  multilingual give-up detector (`lib/give-up.ts`) forces `skipped` for any
  non-answer/help-request/empty input regardless of what the model claims; a
  reveal turn may never be `correct`; an unparseable control line defaults to
  `incorrect` (not `partially_correct`). `skipped` is a first-class verdict
  (reusing the existing shared/DB enum — no migration). (Phase 1.)
- **FSRS runs on every online attempt.** `recordAttempt` updates
  `item_states` (Doc 03 §item_states); previously only the offline batch
  did, so spaced repetition never ran for normal practice.
- **The tutor and explain are grounded in the real worksheet.**
  `lib/material-context.ts` loads `materials.extracted_markdown` (clamped to
  ~4000 chars) from the item's material and passes it to both the tutor
  system instruction and the P4 explain prompt, with an explicit
  "stay within this material, don't invent facts" instruction.
- **Model tier split.** New env `VERTEX_TUTOR_MODEL_ID` (default
  `gemini-2.5-flash`) is used for the two learner-facing pedagogy calls
  (`converseTurn`, `explain`). Batch/extraction (vision, regenerate,
  transcribe) stays on the cheap `VERTEX_MODEL_ID` (`gemini-2.5-flash-lite`).

## Consequences

- Per-turn token cost rises (full material in context, stronger model) but
  is bounded by the 4000-char clamp and the existing credit settle path; the
  cheap tier still covers the high-volume extraction calls.
- Doc 06 §P3 / §provider-configuration are now out of date by intent; this
  ADR is the record. Prompt versions bumped (`tutor.3`, `p4.1`) so analytics
  can segment before/after.
- Structured-JSON verdicts (responseMimeType) remain future work; the
  deterministic give-up guard is the safety net until then.
