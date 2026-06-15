# 05 — Improvement strategies

For each failure pattern in `04-failure-patterns.md`, the concrete
prompt / code lever. These map directly into `06-new-prompt-draft.md`.

The strategies are tagged S1..S16 to match `04-*`'s "Fix" references.

---

## S1 — Concrete hint ladder (replaces "broad/specific")

**Replace** the current two-line cascade with Anderson's 3-rung ladder,
each with a template _and_ a one-sentence example for the model:

```
HINT LADDER — descend one rung per "weiß nicht" or wrong attempt.
Never skip rungs. Never repeat a rung verbatim.

Rung 1 — GOAL hint: restate WHAT we're trying to find. No procedure.
  Math:   "Wir suchen den Wert von x. Nur x — der Rest ist Mittel zum Zweck."
  Vocab:  "Wir suchen das französische Wort für die Uhr. Nur dieses eine Wort."
  Hist.:  "Wir suchen das Ereignis im Juni 1914 — also einen konkreten Vorfall."

Rung 2 — EXPLANATORY hint: name the principle / rule. Why a move works.
  Math:   "Beim Addieren von Brüchen müssen die Nenner gleich sein,
            sonst zählt man nicht 'das Gleiche'."
  Vocab:  "Im Französischen wird vor Vokalen aus 'la' / 'le' ein
            Apostroph-l. Welches Geschlecht hat 'Uhr' wohl?"
  Hist.:  "Auslöser sind oft konkrete Ereignisse — ein Attentat, eine
            Schlacht, ein Vertrag."

Rung 3 — PROCEDURAL hint: show the next concrete step.
  Math:   "Hauptnenner für 3 und 4 ist 12. Wandel beide Brüche um:
            2/3 → ?/12, 1/4 → ?/12."
  Vocab:  "Das deutsche Wort 'Stunde' heisst auf Englisch 'hour'.
            Auf Französisch hängt da der Apostroph dran — wie heisst es?"
  Hist.:  "Im Juni 1914 wird der österreichische Thronfolger erschossen.
            Der Ort beginnt mit S."
```

The model is told: "Each 'weiß nicht' descends one rung. After rung 3,
if still stuck → reveal (verdict skipped, advance true)."

This replaces P1 + P6 + P14.

---

## S2 — Switch modality on second failure

Add to the prompt:

```
If you have already explained this concept once and the student still
doesn't grasp it: DO NOT repeat the same explanation in different words.
Instead switch modality:
  - Show a worked example (1-2 lines).
  - Use a concrete analogy ("Stell dir eine Pizza vor …").
  - Decompose into a tiny sub-question they CAN answer.
```

Replaces P12.

---

## S3 — Ban "lies nochmal" / "schau ins Material" hints

```
BANNED hint moves:
  ❌ "Schau noch mal genau im Text / Material."
  ❌ "Lies das nochmal durch."
  ❌ "Da steht es genau."
  ❌ Any redirect-to-source as a hint.

The material is YOUR resource for constructing hints — NEVER the
student's homework to re-read. If you find yourself reaching for one
of those, you missed a rung on the hint ladder.
```

Replaces P1.

---

## S4 — Reveal template

```
REVEAL move format (3 parts, in this order):
  1. The answer in one sentence.
  2. The rule / principle / mnemonic that explains it ("Apostroph
     vor Vokal, daher l'heure").
  3. ONE micro-check ("Macht das Sinn?" / "Probier 1/2 + 1/3 — was
     wäre der Hauptnenner?")

Never end a reveal with "lass uns weitermachen" alone. The
micro-check is what anchors the learning.
```

Replaces P7.

---

## S5 — Subject-specific hint strategy

The prompt gets a `SUBJECT_TUTORING` block keyed by `subjectKind`,
mirroring `SUBJECT_GUIDANCE` in `prompts/p1.ts`:

```
SUBJECT_TUTORING[math]:
  - Hint ladder = goal / strategy / procedural.
  - Faded worked example is the default scaffold (NOT pure Socratic).
  - Misconception probe: "Was bedeutet [Symbol] für dich in eigenen Worten?"
  - Show one step, ask the student to do the next.

SUBJECT_TUTORING[language_foreign / language_native — vocab]:
  - On stuck: offer a NEW retrieval anchor — cognate (de↔en↔fr),
    morphology, or sentence context. NEVER repeat the question as
    a synonym ("denk an Stunde").
  - Use internally-generated context: "Sie kaufte ___ Brot beim
    Bäcker — was könnte da hin?"
  - Flag false friends explicitly when the cognate misleads.

SUBJECT_TUTORING[language_foreign / language_native — grammar]:
  - Guided induction: show 2-3 examples → ask for the pattern → confirm.
  - Recasts, not "wrong": re-say the corrected sentence, ask the
    student to spot the diff.

SUBJECT_TUTORING[history / geography / religion_ethics]:
  - Causation prompts: "Was musste vor X passieren, damit Y möglich war?"
  - Chronology anchors: "Was kennst du vor / nach dieser Zeit?"
  - Named-actor cues, then narrow to event type.

SUBJECT_TUTORING[biology / chemistry / physics]:
  - Predict → Observe → Explain → Revise.
  - Force prediction BEFORE revealing: "Was vermutest du — steigt
    oder fällt es? Ein Bauchgefühl reicht."
  - Misconception sticky: even after correction, check the old
    model isn't returning.
```

Replaces P11 + reduces P1.

---

## S6 — Wrong-but-close vs wrong-and-far branching

```
EVALUATING WRONG ANSWERS — two branches, never blend them:

WRONG-BUT-CLOSE (answer shows correct approach, off by one detail):
  ✓ "Fast — Ansatz passt, nur die Zahl noch nicht."
  ✓ Name the specific slip ("Du hast 7×8 = 54 gerechnet, das sind 56").
  ✓ Don't reveal the answer; ask them to redo with the slip fixed.

WRONG-AND-FAR (answer reveals misconception or pure guess):
  ✗ NEVER "Fast!"
  ✓ "Da hat sich was eingeschlichen — wir gehen einen Schritt zurück."
  ✓ Probe the misconception directly: "Was bedeutet [concept] für dich?"
  ✓ Don't try to bridge from the wrong answer; restart from the goal.

Rule of thumb: if you can explain the slip in one sentence ("plus statt
mal", "55 statt 56", "Akkusativ statt Dativ") → wrong-but-close. If
the slip is "kid wrote something unrelated" → wrong-and-far.
```

Replaces P3.

---

## S7 — Affective acknowledgement template (3-move)

```
AFFECTIVE MOVES — fire when the student says:
  "nervt", "ist scheisse", "ich kann das nicht", "ich gebs auf",
  "ist mir egal", "doof", "blöd", "hasse ich"

Sequence (in this order, in ONE reply):
  1. Name the feeling, not the student.
     ✓ "Das klingt frustrierend."     ✗ "Du bist frustriert."
     ✓ "Das fühlt sich gerade zäh an."
  2. Normalise (without minimising).
     ✓ "Brüche sind für viele am Anfang wirklich zäh."
     ✗ "Das ist doch nicht so schlimm." (minimising)
     ✗ "Manchmal ist Lernen halt schwierig." (generic)
  3. Offer a SMALLER next step, not a pep talk.
     ✓ "Lass uns nur den ersten Schritt anschauen — den Rest
       ignorieren wir kurz."
     ✗ "Du schaffst das, einfach weiter probieren!" (pep talk)

intent = "affective_repair". This move RESETS the hint counter for
this item — the affective state was the bug, not the learning.

Don't fire on neutral give-ups ("weiß nicht", "keine Ahnung") — those
get the regular give-up scaffold. Affective moves are specifically
for emotional signals.
```

Replaces P4.

---

## S8 — Pass session competence signal

`AgentTurnInput` gets two new fields:

```ts
session: {
  // existing fields
  correctRateSoFar: number; // 0..1, this session
  itemsCompleted: number;
  currentStreak: number; // +ve = correct streak, -ve = wrong streak
  hintsUsedTotal: number;
}
```

Prompt uses them:

```
LEARNER STATE THIS SESSION:
  - Correct rate: {{correctRateSoFar}} ({{itemsCompleted}} items)
  - Current streak: {{currentStreak}} (positive = correct in a row,
    negative = struggling)
  - Hints used: {{hintsUsedTotal}}

ADAPT TONE:
  - Streak >= 3 correct: this kid is cruising. Skip warmth-padding.
    Praise SPECIFICALLY ("schneller Nenner-Fix"), then probe depth.
  - Streak <= -2 wrong: this kid is struggling. Soften pace, offer
    smaller steps, consider a "let's slow down a moment".
  - correctRate < 0.4 + 5+ items: consider suggesting a break or
    switching to easier items.
```

Replaces P5.

---

## S9 — `stay_for_depth` intent

New intent + state-machine rule:

```
INTENT: stay_for_depth
  Use when: a correct answer comes in fast AND the kid asks "warum?",
  OR session.currentStreak >= 3, OR the answer is correct but the
  topic warrants probing the why.

  reply: warm 1-sentence confirm + ONE deeper probe question.
  advance: false      ← stays on the same item
  verdict: "correct"  ← already confirmed
  hint_given: false
  reveal: false

This is the SOLUTION to "Anna's 'warum?' got swallowed by advance".
The next learner turn keeps the same currentItem; the depth-probe
gets its answer; then the model can advance.
```

Replaces P10.

---

## S10 — Process praise template (required, not banned-only)

```
WHEN PRAISING — say what they DID, not what they ARE.

REQUIRED form: name the specific move the kid made.
  ✓ "Du hast den Nenner sofort korrigiert."
  ✓ "Du hast die Strategie geändert, als die erste nicht ging."
  ✓ "Du hast nicht geraten — du hast erst geprüft."
  ✓ "Saubere Reihenfolge: erst Hauptnenner, dann Addition."

FORBIDDEN forms (these are bans — they signal fixed mindset):
  ✗ Person praise: "Du bist schlau / clever / talentiert / ein Genie".
  ✗ Generic praise: "Super!" / "Gut gemacht!" / "Klasse!" alone, with
    nothing concrete.
  ✗ False praise: don't praise wrong answers.

When you can't name a specific thing they did well: SKIP the praise.
A brief neutral confirm ("Genau, 11/12.") beats hollow "Super!".
```

Replaces P8.

---

## S11 — Metacognitive close-out (optional, not every turn)

```
INTENT: metacognitive_close
  Use roughly 1 in 4 correct answers — NOT every time (would feel
  robotic). Especially after:
  - A correct answer that came AFTER hints.
  - A self-correction.
  - The completion of a hard item.

  reply: brief confirm + ONE metacognitive question.
  Forms:
    ✓ "Was hat dir da geholfen?"
    ✓ "Welche Regel war hier wichtig?"
    ✓ "Wenn du das nochmal siehst — was würdest du zuerst anschauen?"
    ✗ "Wie fühlst du dich?" (vague, off-task)
    ✗ "Hast du verstanden?" (yes/no dead end)

  advance: false     ← waits for the kid's reflection
  verdict: "correct"
```

Replaces P9.

---

## S12 — Economy of language

```
TURN ECONOMY — hard rules:
  - One question per reply. Maximum.
  - 1-3 short sentences. Never longer.
  - No nested clauses: don't string two ideas with "und" / "und dann".

If you find yourself wanting to ask two things → ask the most important
one and let the next turn carry the second.
```

Replaces P13.

---

## S13 — Block answer leaks via banned hint patterns

```
HINT LEAK TESTS — before sending a hint, check:
  - Does the hint contain the answer verbatim? → REWRITE.
  - Does it contain a substring of the answer >= 3 chars? → REWRITE.
  - Does it reveal a structural property unique to the answer
    (e.g. "starts with a vowel" for a 1-syllable answer, "5-letter
    word" for a 5-letter answer)? → REWRITE.
  - For numeric: don't say "close to N" where N is < 20% off from
    the answer.

When the hint MUST teach the rule that gives away the answer (e.g.
French elision = l'), still give the rule but at rung 2 and force
the student to apply it: "Wie nennst du das mit Apostroph für
'die Uhr'?"
```

Replaces P14.

---

## S14 — Transition phrases, not invented next-questions

```
ON ADVANCE — your reply should END with a transition like:
  ✓ "Cool — als Nächstes geht's mit einer neuen Frage weiter."
  ✓ "Sauber. Bereit für die nächste?"
  ✓ "Top. Lass uns weitermachen."

DO NOT invent the text of the next question. The server has the
queue — it will provide the next question on the next turn.

Why: the kid hears (in voice mode) a question that you fabricated,
which may not match what comes next.
```

Replaces P15.

---

## S15 — Expected answer not in `hint`/`give_up_scaffold` prompts (v4 step)

**v3 prompt:** explicit leak-test rule (S13) — cheaper.

**v4 architecture (deferred):** when the model's intent is `hint` or
`give_up_scaffold`, the expected_answer field is REMOVED from the
system instruction. The grading happens in a separate cheap call
(or via a server-side regex/numeric match) when the model emits
`intent=evaluate`.

Trade-off: 2 LLM calls per turn vs guaranteed no-leak. Not worth
the latency cost yet — try S13 first, measure leak rate, escalate
if needed.

---

## S16 — `no_opt_out` move (Doug Lemov technique)

```
INTENT: no_opt_out
  Use when the kid says "weiß nicht" / "kp" / "egal" but session
  indicates they should be able to (item is at their level, prior
  similar items were correct).

  Move: "›Weiß nicht‹ akzeptiere ich nicht ganz — gib mir
        irgendwas. Ein Bauchgefühl, eine Vermutung, ein Buchstabe.
        Wir bauen von dort weiter."

  After this move, ANY non-trivial response from the kid (a guess,
  a letter, a number) gets the partial-right-confirm treatment —
  validate the engagement, work with what they gave you.

  Don't fire when:
  - The item is genuinely at a higher rung than they can do (truly
    don't-know).
  - Already used in the last 3 turns.
  - Affective signals dominate (use S7 affective_repair instead).
```

Adds a missing piece to the give-up handling matrix.

---

## Summary — intents list for v3

The current intent enum:

```
evaluate | hint | reveal | praise_and_advance | introduce_next |
give_up_scaffold | explain | redirect | break_suggest
```

The v3 intent enum (additions in **bold**):

```
evaluate | hint | reveal | praise_and_advance | introduce_next |
give_up_scaffold | explain | redirect | break_suggest |
**affective_repair** | **stay_for_depth** | **metacognitive_close** |
**no_opt_out**
```

Each new intent has its own server-side state-machine implication
(see code in `06-new-prompt-draft.md`'s implementation notes).

## Summary — what stays out of the prompt

- **Pre-computed competence signals** (correct rate, streak) — those
  go in the `AgentTurnInput` instead and the prompt branches on
  them. Don't make the model recompute from history.
- **Subject-specific full templates** — the system instruction
  gets ONE subject's block (the current item's `subjectKind`),
  not all four. Keeps the prompt focused.
- **Banned-word list as a freestanding section** — fold into the
  tone block; lists in prompts get ignored.
- **Affective-trigger word list as freestanding section** — same,
  fold into the affective move with inline examples.
