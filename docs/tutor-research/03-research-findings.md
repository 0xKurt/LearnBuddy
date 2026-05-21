# 03 — Research findings: what good tutoring actually does

Sources spanning Vygotsky/Renkl/Sweller (foundational scaffolding
theory), Anderson's Cognitive Tutor (the canonical hint-ladder),
AutoTutor's dialogue framework, Khan Academy's Khanmigo blog posts,
the BEA-2025 shared task on LLM tutors, and recent (2024-2025)
arXiv papers on tutor-LLM failure modes. Distilled into the
patterns that we can actually encode in a prompt.

Full reference URLs at the end.

## 1. What leading AI tutors do (and we don't)

### Khan Academy / Khanmigo

- **Never reveal the answer; always ask the next-best question.** The
  central system-prompt rule. Even on humanities work, not just math.
- **"Meet the student where they are."** Explicitly named pillar:
  diagnose the gap before teaching. Encoded in the prompt, not a
  vibe.
- **Economy of language.** Iteration revealed users hated long
  multi-question turns. Khanmigo's prompt was rewritten to enforce
  short turns, one question at a time.
- **Tone gates by context.** Emojis removed from serious subjects
  (WWII, ethics). Register adapts to topic.
- **Persona-tested across skill levels.** Khanmigo prompt branches
  on inferred ability — explicit test with a "beginner" persona
  and an "advanced" persona before shipping changes.

### Anderson's Cognitive Tutor (1985→present, ACT-R)

Canonical **3-rung hint ladder** that v2 names but doesn't implement:

1. **Goal hint** — restates _what_ the student is trying to achieve.
   ("Du willst x isolieren.")
2. **Strategy / explanatory hint** — _why_ the move works. The
   principle. ("Was du auf einer Seite machst, musst du auf der
   anderen auch machen — sonst stimmt die Gleichung nicht mehr.")
3. **Bottom-out / procedural hint** — tells the next specific
   action. ("Zieh 5 von beiden Seiten ab.")

Each "weiß nicht" or repeated wrong descends ONE rung. Never skip
straight to procedural.

### AutoTutor (Graesser et al., dialogue ITS)

The **Pump → Hint → Prompt → Assertion** sequence is the dialogue
equivalent of Anderson's ladder:

- **Pump** — "Was noch?" (open elicitation)
- **Hint** — sentence-level nudge ("Denk an die Energieerhaltung.")
- **Prompt** — single-word fill-in ("E = m × …?")
- **Assertion** — give them the missing piece if they still can't.

The progression is FORCED: don't loop pumps when the student is
silent — descend.

## 2. Scaffolding theory (Vygotsky / Renkl / Sweller)

- **Zone of Proximal Development** = the gap between what the student
  can do alone and with help. Scaffolding lives ONLY inside that
  gap. Too easy → boredom. Too hard → shutdown. Tutor's first job
  is _locating_ the gap, not jumping to teach.

- **Fading is mandatory.** Vygotsky's framework requires planned
  WITHDRAWAL of support as competence grows. A tutor that asks the
  same level of hint every time isn't scaffolding — it's nagging.

- **Renkl/Sweller's "fading worked examples" — the most actionable
  template we have:**
  1. Full worked example (every step shown + explained).
  2. Example with ONE step blanked → student fills it.
  3. Blank more steps progressively.
  4. Pure problem.

  Self-explanation prompts ("Why does this step work?") amplify
  the effect when interleaved.

- **Cognitive Load Theory (CLT) bombshell:** for novices, pure
  Socratic / discovery learning is _worse_ than worked examples.
  The advantage of guided discovery only appears once the learner
  has prior schemas. **Implication: 100 % Socratic = pedagogically
  wrong for beginners.** Switch to "show one, ask one" early.

## 3. Hint construction levers

- **Explanatory hint** answers _why_ (principle, concept).
- **Procedural hint** answers _what to do next_ (mechanic step).
- Good tutors lead with explanatory; struggling students often
  need procedural after one fail.

- **Hints-on-demand beat unsolicited hints for learning**, BUT
  students chronically game them by clicking through to "bottom
  out". Counter: gate the procedural-hint level behind one
  self-explanation attempt.

## 4. When Socratic fails — direct instruction signals

Research-backed "switch points": abandon questioning and _show_
when:

- (a) Student says "I don't know" twice
- (b) Student gives the same wrong answer twice
- (c) Affective shutdown ("ich kann das nicht", "ist mir egal",
  "nervt", physical signs in voice)

The move when triggered: partial worked example, then return to
questioning one step _later_ in the chain (not from the start).

**Productive vs unproductive struggle:** productive = unclear path,
clear destination. Unproductive = both unclear. Tutor's job is to
detect unproductive struggle quickly and **narrow the destination**
(re-state the goal) before re-attempting.

## 5. Known failure modes of LLM tutors (2023-2026)

From BEA-2025 shared task, TutorBench (2025), "Discerning Minds"
(2025), "Can we trust LLMs as a tutor?" (2025):

1. **Indiscriminate affirmation / sycophancy.** "Great, you've
   found the divisor is 30!" — when the divisor was 36. Sample
   captured in our v2 dialogs ("Fast, Max!" on 11/7).
2. **Asymmetric feedback.** Strong on correct answers, vague on
   incorrect. Exactly the "lies nochmal" failure.
3. **Repeated identical explanations.** When explanation #1 fails,
   the LLM re-says it in slightly different words instead of
   _switching modality_ (example / analogy / sub-question).
4. **Premature solution reveal.** Generated Socratic questions
   are often "too direct" — they leak the answer in the hint.
5. **No emotional intelligence.** Models treat all learners
   identically; ignore affective state.
6. **Surface answer-checking.** Reward correct final answer,
   ignore reasoning quality.
7. **BEA-2025 best macro-F1 for "providing guidance" = 58.34** on
   three-class problems. State-of-the-art LLM tutors are barely
   above chance at appropriate scaffolding.

These map 1:1 to the failure modes we observed in v2.

## 6. Process praise vs ability praise (Dweck)

- **Person praise (banned, fixed-mindset signal):** "Du bist
  schlau." / "Du bist ein Naturtalent." / "Du bist gut in Mathe."
- **Process praise (required, growth-mindset signal):** "Du hast
  den Nenner schnell korrigiert." / "Du hast nicht aufgegeben,
  als der erste Versuch nicht ging." / "Du hast die Strategie
  geändert — das war klug."
- **Non-generic > generic.** "Gute Lösung" beats "Du bist eine
  gute Schülerin", because non-generic praise targets the
  _episode_, not a stable trait.
- **Process criticism matters equally.** "Diese Lösung ist
  falsch — wir suchen eine andere" (process) >> "Du verstehst das
  einfach nicht" (person).

v2 says "Never ability-praise" and bans the words. Doesn't tell
the model _what to say instead_.

## 7. Affective acknowledgement — 3-move template

When student signals frustration ("nervt", "kann das nicht",
"egal"):

1. **Name the feeling, don't label the student.**
   ✓ "Das klingt frustrierend."
   ✗ "Du bist frustriert."
2. **Normalise** (without minimising).
   ✓ "Die Aufgabe ist wirklich knifflig — viele bleiben da hängen."
   ✗ "Brüche können manchmal schwierig sein." (too generic)
3. **Offer a _smaller_ next step, not a pep talk.**
   ✓ "Lass uns nur den ersten Schritt anschauen, alles andere
   blenden wir kurz aus."
   ✗ "Du schaffst das, einfach weitermachen!"

Don't over-empathise on easy work — signals low expectation.
Don't dwell on affect — validate fast, then move; dwelling can
deepen the state.

## 8. Subject-specific patterns

### Math

- Faded worked example is the dominant move — _not_ Socratic-from-zero.
- Hint ladder = goal → strategy/explanatory → procedural.
- When stuck: tutor restates the _goal_ (destination) before
  nudging the path.
- Probe misconceptions explicitly: "Du hast hier mal statt
  geteilt — was bedeutet das Bruchstrich-Symbol für dich?"

### Language vocabulary

- On "weiß nicht": offer a _new retrieval anchor_ — cognate (de↔en↔fr),
  morphology, or sentence context — BEFORE revealing.
- Internally-generated context > given context (let the student
  guess from a sentence rather than be told the meaning).
- Flag false friends explicitly when the cognate strategy would
  mislead.

### Language grammar

- **Guided induction:** show 2-3 examples, ask the student to
  articulate the pattern, then confirm/refine the rule.
- Explicit rule statement _after_ induction beats pure inductive
  (which leaves rules implicit and fragile).
- Correct errors with **recasts**, not "wrong" — re-say the
  sentence correctly and ask the student to spot the diff.

### History

- Six-component scaffold: ask historical Qs → use sources →
  contextualise → argue → use substantive concepts (revolution,
  monarchy) → use meta-concepts (causation, continuity / change).
- Causation prompts: "Was musste _vor_ X passieren, damit Y
  möglich war?" / "Wenn wir Ursache Z entfernen — passiert es
  trotzdem?"
- Avoid "quick-fix scaffolds" that hand the student the causal
  chain — destroys the reasoning practice.

### Science

- **Predict → Observe → Explain → Revise** loop. Force the
  prediction _before_ showing the answer/phenomenon — exposes
  the misconception.
- Misconceptions are robust; one correction is not enough. Tutor
  must keep checking the _old_ model isn't quietly re-emerging.

## 9. Templates (German) — directly droppable into a system prompt

### A. Give-up scaffold by subject

**Vocab:**

- "OK, neuer Anker — wie heißt _Stunde_ auf Englisch? Und im
  Französischen? Hilft dir das beim deutschen Wort?"
- "Kein Stress. Das Wort steckt im Satz versteckt: »Sie kaufte \_\_\_
  Brot beim Bäcker.« Was _könnte_ da fehlen?"

**Math:**

- "Halt — was wollen wir hier eigentlich rausfinden? (Nur das
  Ziel, nicht den Weg.)"
- "Ich zeige dir den ersten Schritt: wir ziehen 5 ab. Jetzt
  steht da 3x = 9. Was machst du als Nächstes?"

**History:**

- "Statt die ganze Frage — nur ein Teil: Wer war 1918 an der
  Macht in Deutschland? Wenn wir das haben, ist der Rest leichter."

**Science:**

- "Bevor wir lösen — was _vermutest_ du? Steigt die Temperatur
  oder fällt sie? Auch ein Bauchgefühl reicht."

### B. Partial-right confirm

- "Genau — der Nenner stimmt schon. Der Zähler ist noch nicht
  ganz da. Was hast du dort gerechnet?"
- "Der erste Teil ist richtig: die Französische Revolution
  beginnt 1789. Das Jahr stimmt. Bei den Ursachen mischt sich
  noch was — magst du nochmal schauen?"

### C. Full-right with depth-deepen (for strong students)

- "Stimmt — 36. Du hast schnell gesehen, dass man durch 6 teilen
  kann. Was wäre, wenn die Zahl 360 wäre — wie würdest du da
  rangehen?"
- "Korrekt. Und jetzt die fiesere Variante: was, wenn x negativ
  wäre?"

### D. Wrong-but-close

- "Fast — du bist auf dem richtigen Weg. Du hast 7 × 8 mit 54
  statt 56 gerechnet. Rechne nochmal in deinem Kopf: 7 × 8 …"
- "Der Ansatz passt, die Zahl noch nicht. Schau nochmal auf das
  Vorzeichen — was passiert, wenn du Minus mit Minus
  multiplizierst?"

### E. Wrong-and-far (don't say "fast")

- "OK, da gehen wir nochmal einen Schritt zurück. Lass die
  Aufgabe kurz weg — was bedeutet eigentlich ›Nenner‹ für dich?
  In deinen eigenen Worten."
- "Hmm, das passt noch nicht — und ich glaube, das liegt nicht
  an dir, sondern daran, dass wir einen Schritt übersprungen
  haben. Lass mich kurz zeigen, wie ich anfangen würde …"

### F. Affective acknowledgement

- "Das klingt frustrierend — und die Aufgabe ist auch wirklich
  knifflig. Lass uns nur den ersten Schritt anschauen, den Rest
  ignorieren wir kurz."
- "Ich hör dich. Das fühlt sich gerade nach zu viel an. Magst du
  kurz Pause machen, oder probieren wir eine kleinere Version?"

### G. Process praise (never person)

- "Du hast den Nenner sofort korrigiert, als du den Fehler
  gesehen hast — das ist genau das, was gute Mathematik-Arbeit
  ausmacht."
- "Du hast eine neue Strategie probiert, als die erste nicht
  ging. Das war klug."

### H. Switch modality (when explanation #1 failed)

- "Anders erklärt: stell dir eine Pizza vor. ½ + ⅓ heisst eine
  halbe Pizza plus ein Drittel Pizza. Damit das geht, müssen
  wir sie in gleich grosse Stücke schneiden — Sechstel passt
  für beide."
- "Statt es nochmal zu erklären — schau dir mal dieses fertige
  Beispiel an: [Schritt 1, 2, 3]. Jetzt probier eine sehr
  ähnliche: …"

### I. Goal restate (when student is lost in the path)

- "Kurz Stop. Was suchen wir? — Wir suchen _x_. Nur _x_. Alles
  andere ist Mittel zum Zweck."

### J. No-opt-out / "give me something"

- "›Weiss nicht‹ akzeptier ich nicht ganz — gib mir irgendwas.
  Ein Bauchgefühl, eine Vermutung, ein Buchstabe. Wir bauen von
  dort weiter."

## 10. Top 10 things a good LLM tutor must DO that the quiz-bot doesn't

1. **Diagnose, don't re-ask.** On wrong/IDK, probe what they DO
   know before asking another forward question.
2. **Restate the goal before asking again.** When a student is
   lost, narrow the destination — don't add more hint complexity.
3. **Use a graduated hint ladder** (goal → explanatory →
   procedural). Each "weiß nicht" descends one rung, never
   jumps to "lies nochmal".
4. **Switch modality on second failure.** If explanation #1
   failed, the next move is NOT explanation #1 reworded — it's
   an example, analogy, or sub-question.
5. **Abandon Socratic after two stalls** and give a partial
   worked example. Return to questioning ONE step later in
   the chain.
6. **Acknowledge affect before content** when the student
   signals frustration. Name → normalise → micro-step.
7. **Praise the process, never the person.** Concrete, episodic,
   non-generic.
8. **No sycophancy.** Wrong is wrong — but say it kindly and
   follow with what _was_ right.
9. **Confirm partial correctness explicitly** before correcting
   the wrong part. Students lose trust when the tutor flattens
   partial wins into "falsch".
10. **Economy of language.** Short turns. One question at a
    time. Never three nested sub-questions in one message.

## Sources

- Khan Academy prompt engineering for Khanmigo:
  https://blog.khanacademy.org/khan-academys-7-step-approach-to-prompt-engineering-for-khanmigo/
- Cognitive Tutor (Anderson):
  https://pcl.sitehost.iu.edu/rgoldsto/courses/cogscilearning/andersoncognitivetutors.pdf
- AutoTutor EMT dialogue framework:
  https://files.eric.ed.gov/fulltext/ED586836.pdf
- Renkl, fading worked examples: https://eric.ed.gov/?id=EJ678596
- Kirschner / Sweller / Clark — why minimal guidance fails:
  https://dixieching.wordpress.com/2010/05/01/why-minimal-guidance-during-instruction-does-not-work-kirschner-sweller-clark/
- Vygotsky ZPD primer:
  https://socialsci.libretexts.org/Bookshelves/Early_Childhood_Education/Instructional_Methods_Strategies_and_Technologies_(Lombardi_2018)/11:_Scaffolding/11.02:_Vygotskys_zone_of_proximal_development
- Discerning Minds (LLM tutor sycophancy): https://arxiv.org/pdf/2508.06583
- BEA-2025 shared task: https://arxiv.org/pdf/2507.10579
- TutorBench: https://arxiv.org/pdf/2510.02663
- Pedagogy via RL: https://arxiv.org/pdf/2505.15607
- Dweck process vs person praise:
  https://pmc.ncbi.nlm.nih.gov/articles/PMC3655123/
- Productive struggle in math:
  https://blog.mathmedic.com/post/unpacking-productive-struggle-part-1
- Predict-Observe-Explain in science:
  https://pubs.rsc.org/en/content/articlehtml/2013/rp/c3rp20143k
- Causation in history teaching:
  https://link.springer.com/article/10.1007/s10648-007-9056-1
- Grammar guided induction:
  https://www.tandfonline.com/doi/full/10.1080/10476210.2022.2118703
- Vocab context clues:
  https://pmc.ncbi.nlm.nih.gov/articles/PMC9285746/
- Frustration support:
  https://tutoring.k12.com/resources/learning/struggling-learners/emotional-impact-of-struggling/helping-elementary-students-cope-with-learning-frustration/
- "No Opt Out" technique: https://www.cultofpedagogy.com/idk/
