# Tutor Research

Investigation into why the current LearnBuddy tutor prompt produces a
"quiz-bot" feel instead of a real tutor. Goal: ship a prompt that
behaves like a good Nachhilfelehrer — scaffolds, motivates, fades
support — across math / language / history / sciences.

## Reading order

1. **`01-current-prompt-analysis.md`** — what the v2.0 prompt actually
   tells the model, and the structural choices that produce the
   quiz-bot symptom.
2. **`02-test-dialogs.md`** — live transcripts of four student personas
   (struggling / average / strong / fragile) interacting with the
   v2 tutor. Concrete failure examples.
3. **`03-research-findings.md`** — what real tutoring research +
   leading AI tutors (Khanmigo, Cognitive Tutor, AutoTutor) actually
   do that we don't.
4. **`04-failure-patterns.md`** — distilled list of recurring tutor
   anti-patterns observed in the test dialogs + research.
5. **`05-improvement-strategies.md`** — concrete prompt-engineering
   levers to fix each pattern, with trade-offs.
6. **`06-new-prompt-draft.md`** — v3.0 system prompt, designed against
   the findings.
7. **`07-evaluation-plan.md`** — how to A/B v2 vs v3 without shipping a
   regression.
8. **`08-v3-results.md`** — live v3 transcripts + concrete v2 vs v3
   side-by-side comparison.
9. **`09-v3_1-results.md`** — v3.1 (compressed v3) results: ~48 %
   input-token reduction, no quality regression.

## Status

- v2 prompt analysed: ✓
- Live dialogs captured: ✓ (in `_transcripts/`)
- Research synthesised: ✓
- v3 prompt drafted: ✓
- v3 implemented in code: ✓
- v3 live-verified: ✓ on 6 scenarios; ~30/32 criteria pass
  (vs ~12/30 for v2). See `08-v3-results.md`.
- v3.1 (compressed) shipped: ✓ — **default**; v3 and v2 reachable
  via `AGENT_PROMPT_VERSION_OVERRIDE` for fast rollback. ~48 %
  input-token reduction, no quality regression.
  See `09-v3_1-results.md`.

## Owner

Kurt (commissioned 2026-05-21).

## How to re-run the test dialogs

```bash
pnpm -F @learnbuddy/api probe:tutor
```

Prompts you for a persona and a subject, then runs a multi-turn
dialog against the live Vertex Gemini tutor model with whichever prompt
version is currently exported as `AGENT_PROMPT_VERSION`. Transcripts
print to stdout — pipe to a file if you want to keep one.
