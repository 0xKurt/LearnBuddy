# 04 — Failure pattern catalogue

Cross-cut between the observed v2 transcripts (`02-test-dialogs.md`)
and the LLM-tutor literature (`03-research-findings.md`). Each
pattern has: what it looks like, why it happens, the cost, and a
pointer to the fix in `05-improvement-strategies.md`.

The patterns are ordered by how badly they hurt the learner
experience.

---

## P1 — "Lies nochmal nach"

**Looks like:** Tutor responds to a hint request with "Schau noch
mal genau im Material" / "Da steht es" — even when the material is
literally inline in the question (the WW1 Sarajevo case).

**Why:** The prompt explicitly tells the model "Stay grounded in
THIS material." With no other hint-construction guidance, the model
collapses to the most literal interpretation: point at the source.

**Cost:** Maximum. This is the user's #1 complaint. The kid is
_already_ stuck; "look at it harder" is condescending and useless.

**Literature confirms:** "Repeated identical explanations" + "no
new retrieval anchor" — both LLM-tutor failure modes catalogued in
the 2025 Discerning Minds and BEA papers.

**Fix:** [S1, S3, S5] — hint ladder with explicit moves; ban
verbatim source redirects; introduce subject-specific retrieval
anchors.

---

## P2 — Hint asks for what the student just said they don't know

**Looks like:**

> Lena: weiß nicht
> Tutor: Denk mal an das französische Wort für 'Stunde'.

**Why:** The model defaults to "Socratic = ask another question",
but the question is a synonym of the original.

**Cost:** Erodes trust. Kid thinks the tutor isn't listening.

**Literature confirms:** Kirschner/Sweller/Clark — pure Socratic
fails on novices. The fix is _switching to a worked example_ after
one failure, not asking a different question.

**Fix:** [S1, S2] — descend hint ladder on each "weiß nicht";
after rung 3 → show, don't ask.

---

## P3 — Blanket "Fast!" for far-off-wrong answers

**Looks like:**

> Max: 11/7
> Tutor: Fast, Max! Denk mal daran, was du zuerst machen musst…

**Why:** The prompt bans "Falsch!" and prefers "Fast — fehlt nur
noch …" without distinguishing near-miss from far-off-wrong.

**Cost:** Both directions wrong: false praise on bad answer
(sycophancy, named in literature as #1 LLM-tutor failure), and
under-diagnosis of the actual misconception.

**Literature confirms:** "Indiscriminate affirmation / sycophancy"
— the leading 2025 LLM-tutor failure.

**Fix:** [S6] — explicit wrong-but-close vs wrong-and-far branches
with different reaction templates.

---

## P4 — Ignored emotional escalation

**Looks like:**

> Max: ich kann das nicht
> Tutor: Kein Problem, Max, das kriegen wir hin! Um die Nenner
> gleich zu machen, suchst du am besten das kleinste
> gemeinsame Vielfache von 3 und 4. Was wäre das?

**Why:** v2 bans "Du bist frustriert" labelling but provides no
template for handling affect. Model defaults to ignoring it and
pushing forward with content.

**Cost:** Sends the message "your feelings aren't real to me, only
the task is". Real frustration deepens. Kid disengages.

**Literature confirms:** "No emotional intelligence" — explicit
2025 finding. Affective acknowledgement template (name →
normalise → micro-step) is established practice in real tutoring.

**Fix:** [S7] — affect-detection trigger ("nervt", "kann das
nicht", "egal", "ist scheisse") routes to a dedicated 3-move
affective response BEFORE next content move.

---

## P5 — Strong students treated like struggling ones

**Looks like:**

> Anna: 11/12
> Tutor: Super, Anna! Das ist genau richtig.
> Als Nächstes: Was ist 5/6 - 1/3?

**Why:** No competence signal in the input; same warmth-padding
applied universally. Auto-advance on correct.

**Cost:** Strong students read this as patronising and
disconnect. They want depth, not warmth.

**Literature confirms:** Khanmigo persona-tested at multiple skill
levels and branched prompt accordingly. The same is required here.

**Fix:** [S8, S9] — pass session competence signal; "depth-deepen"
intent for strong students; skip the "Super!" padding when streak
is hot.

---

## P6 — Hints are riddles, not bridges

**Looks like:**

> Tutor: Denk mal an den Artikel, der oft vor französischen Nomen
> steht. Da gibt es manchmal eine kleine Besonderheit,
> besonders wenn das Wort mit einem Vokal anfängt.

**Why:** v2 prompt says "Hint 1: broad, directs attention to the
gap; Hint 2: specific, names the missing piece." — adjectives,
not procedures.

**Cost:** Cryptic hints frustrate. The user said this exactly:
"Hinweise klingen oft wie Rätsel."

**Literature confirms:** Anderson's hint ladder is goal →
explanatory → procedural. Each step has a clear template, not an
adjective.

**Fix:** [S1] — replace adjective hint-guidance with explicit
3-rung ladder + templates per subject.

---

## P7 — Reveals dump full explanation as one paragraph

**Looks like:**

> Tutor: Die richtige Antwort wäre 11/12. Du musst zuerst einen
> gemeinsamen Nenner finden, das ist hier die 12. Dann
> rechnest du 8/12 + 3/12, und das ergibt 11/12. Lass uns
> gleich die nächste Aufgabe ansehen, dann können wir das
> weiter üben!

**Why:** v2 says "reveal kindly" but specifies nothing about the
_form_ of a reveal.

**Cost:** Kid can't anchor anything. Same misconception will recur.
"Vielleicht wird es dann klarer" is hope, not pedagogy.

**Literature confirms:** Self-explanation amplifies worked
examples (Renkl). Without a micro-check after the reveal, the
explanation slides off.

**Fix:** [S4] — reveal template = answer + 1-sentence rule-name +
1 micro-check ("Macht das Sinn?" or "Probier ein ähnliches:
1/2 + 1/3 — Hauptnenner ist?").

---

## P8 — Praise is generic ability-adjacent

**Looks like:**

> Tutor: Super, Tom! 11/12 ist richtig. Super gemacht!

**Why:** Prompt bans "schlau / clever / Talent" but doesn't enforce
process-specific praise.

**Cost:** Same praise for 0-hint correct and 1-hint correct =
zero signal. Misses the actual learnable moment (Tom self-
corrected, that's the praise-worthy thing).

**Literature confirms:** Dweck — process-specific, non-generic
praise. v2 has the rule but not the language.

**Fix:** [S10] — require concrete process praise in the prompt
("name the specific thing the kid did well").

---

## P9 — No metacognitive close-out

**Looks like:** Every correct turn ends with advance. No
"Was hat dir geholfen?" / "Welche Regel war hier wichtig?" /
"Erinner dich an die Regel, wie hieß die nochmal?"

**Why:** Not in the intent enum or prompt at all.

**Cost:** Wasted learning moment. The kid had a strategy that
worked — articulating it would anchor it for next time.

**Literature confirms:** Self-explanation literature (Chi, Renkl).
Anchoring the strategy moves it from procedural to declarative
memory.

**Fix:** [S11] — new intent `metacognitive_close`; fires
occasionally on correct answers (not every time — would feel
robotic).

---

## P10 — Auto-advance kills follow-up questions

**Looks like:** Anna gets it right → tutor immediately advances to
next item. Anna's "warum nimmt man den Hauptnenner?" follow-up
arrives with the model already looking at a different problem.

**Why:** `advance=true` pops the queue server-side. The next call
has `currentItem = next_question`, so the prior context (the WHY)
is gone.

**Cost:** Curious strong students never get their follow-ups
answered. They learn "asking deeper doesn't pay" and stop.

**Fix:** [S12] — `advance=true` only when (a) the student moved
on themselves, OR (b) >= one beat of silence. New intent
`stay_for_depth` lets the model deepen on a correct without
advancing.

---

## P11 — Subject-blind hints

**Looks like:** Math hints and vocab hints and history hints all
read the same: "Denk mal an X." / "Schau in den Text."

**Why:** Prompt doesn't branch on subject. Has subject in context
but doesn't tell the model how to use it.

**Cost:** Math kid gets "remember the principle" when they need a
worked example. Vocab kid gets "look in the text" when they need
a cognate bridge. History kid gets "look in the text" instead of
chronology/causation.

**Fix:** [S5] — subject-specific guidance block in the prompt,
parallel to the existing SUBJECT_GUIDANCE in `prompts/p1.ts`.

---

## P12 — Repeated explanation when explanation fails

**Looks like:** Tutor explains a rule. Kid still doesn't get it.
Tutor explains the same rule in slightly different words.

**Why:** No "switch modality" instruction.

**Cost:** Kid feels stuck in a loop. Same words, same confusion.

**Literature confirms:** Explicit 2025 LLM-tutor failure mode.

**Fix:** [S13] — track explanation count per item; second
explanation must change modality (example, analogy, sub-question).

---

## P13 — Three nested questions in one turn

**Looks like:** "Was brauchen sie, damit man sie zusammenrechnen
kann? Und wie findest du das? Kannst du es probieren?"

**Why:** No turn-economy constraint in the prompt. Khanmigo
discovered this hurts UX; we haven't.

**Cost:** Working-memory overload. Especially bad for younger or
struggling kids.

**Fix:** [S14] — "one question per turn, max 3 sentences" hard
rule; banned conjunction patterns.

---

## P14 — Tutor leaks the answer in hints

**Looks like:** Hint says "Das Wort fängt mit einem Vokal an" — for
a vocab item where the answer is `l'heure`. The hint material
ascribes the apostrophe-elision specifically to vowel-initial
words; that's effectively half the answer.

**Why:** The model has the expected answer in the system
instruction. Counter-instruction "Never include the exact expected
answer" is too narrow — model leaks structural hints.

**Cost:** Defeats the point of hinting; teaches kid to game hints.

**Literature confirms:** "Premature solution reveal" in hint
generation — 2024 paper finding.

**Fix:** [S15] — restructure how the answer is exposed to the
model: either hide it from `hint`/`give_up_scaffold` intents
entirely (requires 2-call architecture), OR add explicit "leak
test" rule (would-the-answer-be-guessable-from-the-hint).

For v3 prompt: take the lighter fix (explicit leak-test instruction

- banned hint patterns). The 2-call architecture is the v4 step.

---

## P15 — Auto-invented next-question

**Looks like:** When the test harness only seeds one item, the
model hallucinates a follow-up. In production this is masked
because the server pops the real queue.

**Why:** Prompt says "If advance=true, your reply should already
introduce the next question."

**Cost:** Confusing in voice mode (kid hears a question that
isn't in the script). In production, masked but still wasteful
tokens.

**Fix:** [S16] — when advancing, the model must use a transition
phrase WITHOUT inventing the next question text. Server provides
the next question on the next turn.

---

## Cross-cutting causes

Drilling down, the 15 patterns collapse into 5 root causes:

| Root cause                                                        | Patterns              |
| ----------------------------------------------------------------- | --------------------- |
| C1. Hint-construction is unspecified (adjectives, not procedures) | P1, P2, P6, P14       |
| C2. No subject branching                                          | P1, P11               |
| C3. No competence signal → no adaptation                          | P5, P10               |
| C4. No affective handling                                         | P4, P3 (partial)      |
| C5. No structured tutoring "moves" beyond evaluate/hint/reveal    | P7, P9, P12, P13, P10 |

The new prompt (v3) must address all five. See
`05-improvement-strategies.md` for concrete levers.
