# 01 — Current tutor prompt analysis (v2.0)

Source: `apps/api/src/lib/agent/prompt.ts`,
`apps/api/src/lib/agent/types.ts`,
`apps/api/src/lib/agent/parse.ts`. Identifier:
`AGENT_PROMPT_VERSION = 'agent.v2.0'`. Used by `routes/agent.ts` →
`llm.agentTurn()` →
`VertexLlmGateway.agentTurn` (`@learnbuddy/api/lib/llm/vertex.ts`).

## What the prompt is

A ~60-line system instruction telling Gemini 2.5-flash to behave as
"LearnBuddy, a warm, patient tutor for a school student" and emit one
JSON object per learner turn:

```json
{
  "reply": "1-3 sentence text shown to the learner",
  "verdict": "correct | partially_correct | incorrect | skipped | null",
  "advance": true | false,
  "reveal": true | false,
  "hint_given": true | false,
  "intent": "evaluate | hint | reveal | praise_and_advance | introduce_next |
             give_up_scaffold | explain | redirect | break_suggest"
}
```

The runtime composes the system instruction at call time, appending:

- Target language, learner display name, grade level, session progress.
- The current question + expected answer + acceptable variants +
  answer kind + topic + units + (for MC) options + correct index +
  source excerpt.
- `Hints already given: N / 2`, `Prior wrong or skipped attempts: N`.
- Optional `Material context` block — clamped to 4 000 chars of the
  worksheet's `extracted_markdown`.

Per-call generation config:
`temperature=0.4`, `topP=0.9`, `maxOutputTokens=800`, JSON mime.

## What it does _well_

- **Verdict pinning.** Forces a single classification per turn so the
  server-side FSRS update and "advance" pop are deterministic. The
  hard constraint that `reveal=true` ⇒ `verdict ∈ {skipped, incorrect}`
  is checked twice (in the prompt and in `parseAgentJson` post-hoc).
- **Tone rails.** Explicit ban on "Falsch!", on ability praise
  ("schlau / smart / clever"), and on emotional labelling
  ("Du bist frustriert"). This is real, opinionated guidance that
  produces consistently warm replies in the happy path.
- **Hint budget.** Hard cap at 2 hints per item before the reveal lever
  unlocks. Prevents the model from looping hints forever — a known
  failure mode of "infinite Socratic" tutors that frustrate students.
- **Grounding clamp.** The worksheet excerpt is named explicitly as the
  source of truth for hints; reduces the rate of hallucinated facts in
  the hint text.
- **Compact session bookkeeping.** Items elapsed, minutes elapsed, and a
  "session has been going a while" hint at 25 + minutes nudge the
  model toward break-suggest when warranted. Good signal, cheap to
  carry.
- **Schema discipline.** `parseAgentJson` is defensive: malformed or
  partial responses fall back to a safe `verdict='incorrect',
advance=false, reveal=false`. The conversation can't die from one
  bad JSON.

## What it doesn't do (the quiz-bot symptoms)

### A. The hint cascade is named but not actually defined

The prompt says:

> Hint 1: broad, directs attention to the gap.
> Hint 2: specific, names the missing piece.

That's **two adjectives, not a process**. The model has no guidance on
_how_ to construct a hint, what makes one "broad" vs "specific", and
nothing about the cognitive operation the hint should provoke. So in
practice Gemini falls back to a familiar pattern from its training
data: _"Schau noch mal genau ins Material"_ or _"Denk an Y"_. Those
read like a teacher dodging the question.

A good hint is a tightly chosen sub-problem ("Was passiert mit der
Endung von _aller_ in der ersten Person?") or a worked-example bridge
("Wenn _je_ = ich und _vais_ = gehe, was muss _je vais_ heißen?"). The
v2 prompt never tells the model to construct hints this way.

### B. No subject-specific tutoring strategy

The current prompt is one-shape-fits-all. But:

- **Math** — good hints decompose: identify the operation, name a
  rule, point at units, ask "what would happen if you simplified
  first?". Worked-example fading is the canonical scaffold (cf.
  Anderson & Sweller, ACT-R, Cognitive Tutor).
- **Foreign language vocabulary** — good hints are phonetic prompts
  ("ähnlich wie das Wort _bicycle_"), semantic-field cues, or first-
  letter reveals. "Lies noch mal" is useless when the kid doesn't have
  the word.
- **History / civics** — good hints anchor on chronology ("Was
  passierte VOR diesem Ereignis?"), cause-effect chains, or the
  named actors.
- **Conjugation / grammar drill** — good hints invoke the _rule_ by
  name and ask the kid to apply it.

The v2 prompt has access to `subjectKind` in the item context but
doesn't change strategy on it.

### C. Help-on-request collapses to "lies nochmal"

The most common observed pattern (and the user's stated complaint):

> Learner: ich weiß es nicht
> Tutor: Schau noch mal genau in den Text, da steht die Seitenzahl drin.

That's a **vague redirect to the source**, not scaffolding. The prompt
says "scaffold gently" on give-up but provides no template. Without a
concrete instruction, the model picks the most frequent training-data
behaviour: deflect back to the material.

A real tutor on a give-up:

1. Acknowledges briefly ("OK, das ist auch knifflig.")
2. Decomposes the question ("Lass uns das in zwei Schritten machen —
   erst X, dann Y.")
3. Asks a smaller question they CAN answer ("Weißt du, was _je_ heißt?")
4. Uses the answer to that smaller question to scaffold up.

None of this is in v2.

### D. No model of the learner's competence

The prompt doesn't carry any signal about whether this learner is
struggling overall vs cruising:

- `priorWrongAttemptsOnItem` is only the count on the CURRENT item.
- `priorWrongAttempts` across the session, items-skipped rate,
  current streak (right/wrong/right/wrong), average hints needed —
  none of these are passed in.
- So the tutor can't dial intensity. A kid who has gotten 8/8 right
  doesn't need the same warmth-padding as one who's missed 5/6.

The user's complaint _"if I'm strong it feels condescending; if I'm
weak it feels abandoning"_ is structurally caused by this single
absent input.

### E. Reveal is binary, with no worked example

When hints exhaust and the kid still can't answer, the prompt allows
"reveal kindly" but doesn't specify the _form_ of a reveal:

- It should ideally include the answer **plus a 1-sentence
  explanation of why** so the next time the kid sees the same
  pattern, they have something to recall.
- Today it tends to be just: "Die Antwort ist X. Lass uns
  weitermachen."

That's an evaluation, not teaching.

### F. The grounding clamp is too literal

> Base your hints on THAT material. Do not invent facts.

In practice this becomes "only quote the material verbatim back". For
a vocabulary item ("was heißt 'Uhrzeit' auf Französisch?"), the
material says "l'heure". When the kid is stuck, the prompt's
grounding constraint pushes the model toward "schau im Material nach"
(literally repeating that the answer is somewhere in the worksheet)
instead of bridging from what the kid already knows.

Good grounding ≠ verbatim. It means: don't hallucinate facts outside
the lesson. The model needs explicit permission to use teaching
techniques (semantic bridges, mnemonics, analogies) that are _not in
the worksheet_ as long as they don't invent new factual content.

### G. Voice-mode amplifies G

Voice answers come back without "Was hast du gesagt?" turn structure.
A kid who mumbles "ähm, je vais à la maison ähm" gets transcribed
roughly. The current prompt has no special handling for low-
confidence, half-formed, or filler-laden answers — it evaluates them
as if they were typed.

### H. The model is given the expected answer in plain text

The prompt literally says:

> Expected answer: l'heure
> Acceptable variants: l'heure | une heure

When a learner asks for help — and we're using a tutor model with
800 max tokens and `temperature=0.4` — the model occasionally leaks
the answer in a "hint" because it's right there in the prompt. The
v2 prompt's rule _"Never include the exact expected answer inside a
hint"_ is a fragile counter-instruction. A safer architecture would
not put the literal answer in the system instruction at all during
hint turns — or would mask it via a salt the model can't recover.

Tractable in v3 by moving the verdict-check to a second cheap LLM
call OR by structuring the prompt so the answer is in a separate
"grading" context the model uses only in the `evaluate` intent, not
in `hint` intents. Trade-off: 2 LLM calls vs 1.

### I. No metacognitive close-out

When the kid gets something right, v2 just acknowledges and
advances. It doesn't ask "Was hat dir geholfen, das zu lösen?" or
"Erinner dich an die Regel — wie hieß die nochmal?". Those questions
are how good tutors anchor learning. They're free turns from a
pedagogy perspective; the v2 prompt never invokes them.

### J. Static persona across age range

The prompt scales "tone" via `gradeLevel` only by implication
("warm, patient tutor for a school student"). A 4-grader and a
10-grader need very different language — but the prompt never tells
the model how to scale vocabulary, sentence length, or examples to
the grade.

## The intent enum is too small to do what we want

The `AgentIntent` enum currently covers:

```
evaluate | hint | reveal | praise_and_advance | introduce_next |
give_up_scaffold | explain | redirect | break_suggest
```

Missing intents that a real tutor uses:

- `decompose` — explicit sub-question scaffolding
- `bridge_from_known` — anchor on a previously correct fact
- `worked_example` — show one solved, ask the kid to mirror
- `metacognitive_close` — "what helped you here?"
- `confirm_partial` — "Du bist auf der richtigen Spur — was fehlt
  noch?" (different from `evaluate` because it doesn't advance)
- `name_misconception` — "Pass auf, hier verwechseln viele X mit Y"

Each of these has a different state-machine implication (advance?
reveal? hint count?), so they belong in the schema, not in free text.

## Token budget reality check

System instruction: ~600 tokens (currently). Each turn carries 6 prior
turns × ~80 tokens + item context ~150 tokens + material excerpt up to
4 000 tokens. **Average input ≈ 5 000 tokens, output ≤ 800 tokens.**
Per-turn cost at Gemini 2.5 Flash pricing (~$0.50/M output) is roughly
$0.002. A 20-item session = ~$0.05 if every turn fires.

There's budget for a richer prompt (3 000-5 000 tokens system
instruction is feasible without breaking cost targets). What's
missing is the _content_, not the budget.

## Summary

The v2 prompt:

- Gets tone, JSON shape, and basic state machine right.
- **Treats "tutoring" as evaluate + give a vague hint + reveal.**
- Has no concrete hint construction strategy.
- Doesn't adapt to subject or to learner competence.
- Lets the model leak answers through "hints".
- Produces a "quiz-bot" feel for exactly these reasons.

The fix is not "make the prompt nicer". The fix is a structural
rewrite that:

1. Names specific tutoring **moves** in the intent enum.
2. Defines each move with a **template + example**.
3. Branches strategy by **subject kind**.
4. Adds **per-session competence signal** to the input.
5. Restricts when the model **sees the expected answer** vs not.

That work happens in `06-new-prompt-draft.md`.
