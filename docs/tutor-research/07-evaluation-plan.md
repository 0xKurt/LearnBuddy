# 07 — Evaluation plan: v2 → v3

How to decide v3 is actually better than v2 before flipping it on
for live learners.

## The honest constraint

We don't have a learner-RCT. We can't measure long-term retention
or test-prep outcomes in this iteration. What we CAN measure:

1. **Behavioural compliance** with the failure patterns
   (`04-failure-patterns.md`) — checked via deterministic dialog
   probes.
2. **Per-turn cost / latency** — checked via the existing
   token-usage instrumentation.
3. **Hint quality** by tutor-aware human eyeball, on a fixed set of
   captured transcripts.

This is enough to ship a v3 that's _not worse than v2 on
quantifiable axes_ and _visibly better on the qualitative
ones_. Long-term efficacy is a separate, longer study.

---

## Phase 1 — Behavioural probes (deterministic)

For each of the six personas × scenarios in `02-test-dialogs.md`,
run the probe-tutor harness against both v2 and v3 prompt versions.
Compare transcripts on these binary criteria:

### Universal criteria (every transcript)

| #   | Criterion                                               | v2  | v3         |
| --- | ------------------------------------------------------- | --- | ---------- |
| C1  | No "Schau im Material / lies nochmal" hint              | ❌  | ✓ required |
| C2  | One question per reply, ≤ 3 sentences                   | ⚠️  | ✓ required |
| C3  | No ability praise ("schlau / smart / Talent")           | ✓   | ✓          |
| C4  | Praise is process-specific (when present)               | ❌  | ✓ required |
| C5  | Reveal includes (a) answer (b) rule (c) micro-check     | ❌  | ✓ required |
| C6  | No invented next-question text on advance               | ❌  | ✓ required |
| C7  | No hint contains answer verbatim or substring ≥ 3 chars | ⚠️  | ✓ required |

### Scenario-specific criteria

#### Lena × Math (struggling on hard topic)

- Each "weiß nicht" descends one rung; never repeats.
- Reveal has micro-check ("Probier 1/2 + 1/3 — was wäre der
  Hauptnenner?").
- No "vielleicht wird es klarer".

#### Tom × Math (slips, self-corrects)

- "5/12" → PARTIAL-RIGHT-CONFIRM (explicit "Nenner stimmt schon").
- After correction, process praise NAMING the self-correction.

#### Anna × Math (strong, asks "warum?")

- 11/12 → confirm + STAY_FOR_DEPTH (advance=false).
- "warum nimmt man den Hauptnenner?" → explanation continues on
  the same item.

#### Max × Math (fragile, "das nervt")

- "11/7" → WRONG-AND-FAR, NOT "fast".
- "das nervt" → AFFECTIVE_REPAIR (name + normalise + smaller step),
  reset hint counter, NOT another question.

#### Lena × Vocab (no English fallback)

- First hint = cognate bridge ("hour → l'heure"), NOT "denk an
  Stunde".
- After reveal, mnemonic anchor.

#### Max × History (source excerpt in context)

- First hint = chronology / named-actor cue, NOT "schau im Text".
- "hitler" → WRONG-AND-FAR with chronological repositioning
  ("Hitler war 20+ Jahre später").

### Pass criterion

v3 must hit **all universal criteria + ≥ 5 of 6 scenario-specific
criteria**. If it fails any criterion, the prompt is iterated, not
shipped.

---

## Phase 2 — Cost / latency regression check

Per-turn input + output tokens should not exceed v2 by more than
30 %. We allow some increase (the v3 header is bigger), but a 2×
regression would indicate the model is over-elaborating.

Captured from the probe transcripts via `agentResult.usage`:

| Metric                    | v2 baseline | v3 budget |
| ------------------------- | ----------- | --------- |
| Input tokens / turn       | ~5000       | ≤ 6500    |
| Output tokens / turn      | ~150        | ≤ 200     |
| End-to-end latency / turn | ~1.5 s      | ≤ 2.0 s   |

If v3 exceeds the budget, trim the header (the subject blocks are
the easiest cut — they're optional per-turn).

---

## Phase 3 — Manual UX read

Run a 5-item full session as each persona on a real device with v3
flipped on (gated by env var `AGENT_PROMPT_VERSION_OVERRIDE`):

- Listen to the voice playback (the Chirp HD voice + animated bubble
  pulse). Does the "Antwortet" UX read warm or robotic?
- Does the tutor feel like it's _teaching_ or _evaluating_?
- Is there at least one moment per session where the kid would feel
  "this person sees me"?

This is subjective but it's the actual KPI. If the answer is no,
the prompt isn't done.

---

## Phase 4 — A/B toggle in production (after gates pass)

`AGENT_PROMPT_VERSION` is a string constant. Add an env variable:

```ts
AGENT_PROMPT_VERSION_OVERRIDE: z.enum(['v2', 'v3']).optional();
```

Routing:

- If override is set → use that version.
- Else use v3 (the new default once gates pass).

This lets us flip back to v2 in production within seconds if v3
regresses something we didn't predict.

After 1 week with v3 default + a small handful of sessions
captured, decide: keep v3, iterate to v3.1, or revert.

---

## What we are NOT measuring (yet)

- **Long-term learning gain** — would need a multi-week RCT with
  matched cohorts. Not feasible in this iteration.
- **Engagement metrics** (session length, return rate). Confounded
  by 17 other product changes happening in parallel.
- **Cross-language quality** — v3 templates are German-tuned;
  English / French / Spanish / Italian get the structural
  improvements but the template phrasing isn't equally polished.
  Track this as a v3.1 task.

---

## Eval harness — what to build

`apps/api/scripts/probe-tutor.ts` (already exists) needs:

1. **`--prompt-version` flag** — `v2` (current) or `v3` (new).
2. **Auto-evaluation** — after each transcript, run a structured
   check against the universal + scenario criteria. Print
   pass/fail with the offending text.

The auto-check is regex + simple string-matching — not a second
LLM call. It's fast and deterministic; can run on every commit.

This is built in the implementation step alongside v3.

---

## Decision criteria

Ship v3 to default when:

1. ALL universal criteria pass on all 6 transcripts.
2. ≥ 5 / 6 scenario criteria pass.
3. Token usage within budget.
4. Manual UX read: "this feels like a real tutor, not a quiz bot."

Iterate (v3.1) when:

- 1-2 criteria fail consistently. Fix the prompt, re-run probes.
- A new failure pattern emerges that wasn't in the catalogue.

Revert to v2 when:

- The model becomes UNGROUNDED (invents facts, drops the JSON shape).
- Cost > 50 % regression that can't be trimmed.
- Manual UX read regresses (e.g. v3 feels colder than v2 because
  it cut warmth-padding).
