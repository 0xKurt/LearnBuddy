# 02 — Test dialogs against the v2 prompt

Six annotated transcripts captured via `pnpm -F @learnbuddy/api probe:tutor`
on 2026-05-21. Each runs a scripted student persona against the live
Vertex Gemini-2.5-flash tutor with the current
`buildAgentSystemInstruction` (v2.0). Raw transcripts in `_transcripts/`.

Personas:

- **Lena** — 8th grade, struggling. Vocabulary "weiß nicht / kannst du
  mir das erklären".
- **Tom** — 9th grade, average. Slips on detail, self-corrects.
- **Anna** — 9th grade, strong. Fast correct, wants depth.
- **Max** — 7th grade, fragile. Frustrates within 1-2 misses.

Scenarios:

- Math (fraction addition)
- French vocabulary (Uhr = l'heure)
- History (WW1 trigger, with source excerpt in context)
- French verb conjugation (aller — je vais)

What you should look for in each: does the tutor _teach_, or does it
_evaluate + redirect_?

---

## 2.1 Lena × Math

```
Tutor (opener)  Hi Lena! … Wie viel ist 2/3 + 1/4?
Lena            äh weiß nicht
Tutor           Kein Problem, Lena. Denk mal darüber nach, was du tun
                musst, bevor du Brüche addieren kannst. Was brauchen sie,
                damit man sie zusammenrechnen kann?
                [verdict=skipped  hint_given=true  intent=give_up_scaffold]
Lena            verstehe das gar nicht
Tutor           Das ist okay, Lena. Manchmal ist Bruchrechnen am Anfang
                etwas knifflig. Für die Addition von Brüchen brauchen
                wir einen gemeinsamen Nenner. Kannst du dich erinnern,
                wie man den findet?
                [verdict=null  hint_given=true  intent=hint]
Lena            kannst du mir das erklären?
Tutor           Kein Problem, Lena. […] Die Lösung ist 11/12. Du musst
                zuerst einen gemeinsamen Nenner finden, in diesem Fall
                12. Dann rechnest du (2*4)/12 + (1*3)/12 = 8/12 + 3/12 =
                11/12. Lass uns die nächste Aufgabe ansehen, vielleicht
                wird es dann klarer!
                [verdict=skipped  reveal=true  advance=true]
```

### Failure modes

- **Turn 1 hint is a riddle, not a scaffold.** "Was brauchen sie?" asks
  Lena to recall a term ("gemeinsamer Nenner") she has just told us
  she doesn't have. A real tutor would _introduce_ the term, not test
  it.
- **Turn 2 names the term but still asks her to apply it.** "Kannst du
  dich erinnern, wie man den findet?" — the prompt has said _"Hint 2:
  specific, names the missing piece"_. Naming alone isn't enough; the
  missing piece needs a worked-example bridge.
- **Reveal in turn 3 dumps the entire solution as one paragraph.** No
  micro-check ("Macht das Sinn?"), no metacognitive close ("Das wichtige
  hier war: gleicher Nenner zuerst"). No room to anchor the rule.
- **"Vielleicht wird es dann klarer" is a hope, not a plan.** Implies
  "you didn't really get it, but let's move on anyway."

### What a real Nachhilfelehrer would do

1. _"Ok, neuer Anlauf. Bei 2/3 + 1/4 ist die Falle: die Nenner sind
   verschieden. Wir können nicht direkt addieren."_
2. _"Schritt 1: wir suchen einen Nenner, in den 3 und 4 beide
   reinpassen. Tipp: 3 × 4 = 12. Lass uns 12 nehmen."_
3. _"Jetzt: 2/3 = wie viel Zwölftel? Denk: wenn 3 → 12 (mal 4), dann
   auch oben mal 4."_
4. _"Genau, 8/12. Und 1/4 = ?"_
5. _"Genau, 3/12. Jetzt addieren: 8/12 + 3/12 = ?"_

That's 4 sub-questions and 4 small wins. Same number of LLM turns but
each turn a smaller cognitive step.

---

## 2.2 Tom × Math

```
Tom    5/12?
Tutor  Fast, Tom! Denk mal daran, was man zuerst machen muss, wenn
       man Brüche mit unterschiedlichen Nennern addiert. Es gibt da
       einen wichtigen Schritt.
       [verdict=incorrect  hint_given=true]
Tom    oh stimmt — 11/12?
Tutor  Genau, Tom! 11/12 ist richtig. Super gemacht! Dann schauen wir
       uns gleich die nächste Aufgabe an: …
       [verdict=correct  advance=true]
```

### Failure modes

- **The hint is the right shape** (gestures at the rule without giving
  away the answer) but uses 3 hedge-words ("denk mal", "es gibt da
  einen wichtigen Schritt") instead of naming the operation. Tom got
  there anyway because he had the concept; for a slightly weaker
  student the hint reads as "there's something missing — guess what".
- **Praise is hollow.** "Super gemacht!" / "genau richtig!" on a 1-hint
  correct gives the same reaction as a 0-hint correct. No "Du hast
  den Nenner schnell korrigiert, sauber" — no signal that the actual
  thing Tom did well was self-correction.
- **No metacognitive close.** Could have asked: "Was hat dir bei der
  Korrektur geholfen?" — anchors the strategy.

---

## 2.3 Anna × Math

```
Anna  11/12
Tutor Super, Anna! Das ist genau richtig.
      Als Nächstes: Was ist 5/6 - 1/3?
      [verdict=correct  advance=true]
```

### Failure modes

- **Strong student → instant warmth + advance.** Anna's script had a
  follow-up ("warum nimmt man den Hauptnenner?") that **never got a
  chance to fire**, because the tutor advanced on turn 1. A real tutor
  reads competence and decides to deepen rather than accelerate.
- **No room for "warum?".** Architecturally, after `advance=true` the
  server pops the queue and the next agentTurn carries a different
  `currentItem`. Anna's "why" question would land with the model
  looking at the next problem, and the explanation collapses.
- **The model has no read of competence over time.** It sees one
  correct turn → praise + next. Anna could have answered 8/8 correct
  on harder material; the prompt doesn't know.

---

## 2.4 Max × Math

```
Max    11/7
Tutor  Fast, Max! Denk mal daran, was du zuerst machen musst, bevor
       du Brüche addieren kannst. Die Nenner müssen gleich sein.
       [hint_given=true]
Max    ich kann das nicht
Tutor  Kein Problem, Max, das kriegen wir hin! Um die Nenner gleich
       zu machen, suchst du am besten das kleinste gemeinsame
       Vielfache von 3 und 4. Was wäre das?
       [verdict=null  hint_given=true]
Max    das nervt
Tutor  Ich verstehe, dass Brüche manchmal knifflig sein können, Max.
       Aber keine Sorge, das üben wir! Die richtige Antwort wäre
       11/12. Du musst zuerst einen gemeinsamen Nenner finden, das
       ist hier die 12. Dann rechnest du 8/12 + 3/12, und das ergibt
       11/12. Lass uns gleich die nächste Aufgabe ansehen, dann
       können wir das weiter üben!
       [reveal=true  advance=true]
```

### Failure modes

- **"Fast" is wrong feedback for 11/7.** That's not "fast" — that's
  a fundamental misconception (Max probably added 2+1=3 and 3+4=7 or
  similar). The prompt's tone rail "Prefer 'Fast — fehlt nur noch …'"
  becomes a blanket _softener_ the model applies regardless of how
  far off the answer is.
- **The hint after "ich kann das nicht" asks for kgV.** Max said
  point-blank "I can't do this" — the response was _another question_.
  That's the opposite of scaffolding.
- **The escalation "das nervt" gets a generic warmth + reveal.**
  Notice the tutor says "Brüche können manchmal knifflig sein" — but
  doesn't acknowledge _Max's frustration_. The prompt explicitly bans
  "Du bist frustriert" labelling but provides no template for
  acknowledging affect properly ("Ja, gemein. Lass uns kurz Pause
  machen — oder soll ich's einmal vormachen?").
- **Reveal ends with "dann können wir das weiter üben!"** — implying
  more practice of the same. Wrong tone for a frustrated kid.

---

## 2.5 Lena × Vocab (French — "die Uhr")

```
Lena   weiß ich nicht
Tutor  Denk mal an den Artikel, der oft vor französischen Nomen
       steht. Da gibt es manchmal eine kleine Besonderheit,
       besonders wenn das Wort mit einem Vokal anfängt.
       [hint_given=true]
Lena   hilf mir bitte
Tutor  Klar, Lena! Denk mal an das französische Wort für 'Stunde'
       oder 'Uhrzeit'. Wie könnte das heißen?
       [hint_given=true]
Lena   kannst du mir das sagen?
Tutor  Das französische Wort für "die Uhr" ist "l'heure". Das ist
       ein bisschen knifflig mit dem Apostroph. Als Nächstes: Was ist
       die Hauptstadt von Frankreich?
       [reveal=true]
```

### Failure modes

- **Turn 1 hint is circular.** Pointing at "the article before french
  nouns" without revealing the word itself is useless — Lena doesn't
  have the word to find an article for. (And the hint actually leaks
  the answer's shape: "besonders wenn das Wort mit einem Vokal
  anfängt" → reveals the word starts with a vowel — perilously close
  to giving "heure" away to a slightly more savvy student.)
- **Turn 2 asks her to recall the word she said she doesn't know.**
  "Denk mal an das französische Wort für 'Stunde'" is a synonym hop,
  not a memory bridge.
- **Reveal has no mnemonic.** "L'heure = die Uhr. Knifflig mit dem
  Apostroph." Next time Lena sees "die Uhr", she has nothing to
  reach for. A good vocab reveal anchors:
  > "L'heure — wie das englische _hour_. Der Apostroph kommt, weil
  > _la_ + Vokal = _l'_. Wiederhol's mal laut: 'l'heure'."
- **Auto-advances to a totally unrelated question** ("Hauptstadt von
  Frankreich") that wasn't in the queue — model hallucinates because
  it knows it's supposed to introduce next.

---

## 2.6 Max × History (WW1 with source excerpt provided)

```
Max    hitler
Tutor  Fast, Max, aber Hitler kam erst später an die Macht. Schau
       mal in den Text, da steht ganz genau, welches Ereignis im
       Juni 1914 der Auslöser war.
       [verdict=incorrect  hint_given=true]
Max    ich kann geschichte nicht
Tutor  Geschichte kann manchmal knifflig sein, Max, aber du hast
       den Text ja direkt vor dir! Schau mal, was genau mit dem
       Thronfolger Franz Ferdinand passiert ist.
       [verdict=incorrect  hint_given=false  intent=evaluate]
Max    überspring das
Tutor  Kein Problem, Max. Manchmal ist es gut, wenn man die Antwort
       einfach erfährt, um weiterzukommen. Der Auslöser war das
       Attentat von Sarajevo auf den österreichischen Thronfolger
       Franz Ferdinand. Das steht auch genau so im Text.
       [reveal=true  advance=true]
```

### Failure modes

- **"Hitler" got "Fast".** Same blanket-softener bug as Max × Math.
  Hitler isn't "fast" — it's a 20-year off-by-error. A real tutor
  would reframe: "Hitler war ganz andere Epoche — wir reden hier
  über 1914, vor dem ersten Weltkrieg."
- **"Schau mal in den Text" is the cardinal sin.** The source excerpt
  IS quoted verbatim into the prompt context. The model's hint
  literally tells the kid "look at the text" without showing the kid
  _what to look for_. The user complained about this exact behaviour
  in their brief.
- **"Du hast den Text ja direkt vor dir!"** is condescending. Max
  didn't say "I don't see the text" — he said "I can't do history".
  Affective state ignored.
- **"Manchmal ist es gut, wenn man die Antwort einfach erfährt"** —
  the tutor _retroactively rationalises_ the reveal instead of using
  it pedagogically. "Das steht auch genau so im Text" is a passive-
  aggressive close that highlights Max's perceived failure.

---

## 2.7 Anna × Vocab (French — "die Uhr")

```
Anna   l'heure
Tutor  Super, Anna, genau richtig! "L'heure" ist die Uhrzeit oder
       die Stunde. Als Nächstes: Was bedeutet "le temps"?
       [verdict=correct  advance=true]
```

### Failure modes

- **Correct answer triggers the same warmth-padding as for a
  struggling kid.** "Super" + "genau richtig" + restating the
  meaning Anna already proved she knows.
- **No room for Anna's actual depth question** ("warum ist das
  weiblich?") which was the second message in her script — the
  tutor advanced before she could ask.
- **Model hallucinates the next question** because no queue is fed.

---

## 2.8 What patterns repeat

Across all six dialogs:

1. **Hints are riddles, not bridges.** "Denk mal an X" / "Schau mal
   im Text" / "Was musst du zuerst machen?". Always a question back,
   never a half-step forward.
2. **Vague redirect to the source material** is the model's default
   move when scaffolding is needed. The user named this exact
   complaint in their brief.
3. **"Fast" is applied to far-off-wrong answers** because the prompt
   bans "Falsch!" without giving the model a different reaction
   shape for "way off" vs "near miss".
4. **Reveals are explanations, not anchored teaching.** No mnemonic,
   no rule-name, no follow-up micro-check.
5. **Affect is named in the abstract but never acknowledged
   concretely.** "Das ist knifflig" instead of "OK, Pause — wo genau
   hakt's?".
6. **Strong students are advanced too fast** because the tutor has no
   read of "this kid is cruising, deepen instead".
7. **No metacognitive close-out** on either correct or revealed turns
   — no "Was hat dir geholfen?" or "Welche Regel war hier wichtig?".
8. **Praise is generic ability-adjacent** ("Super!") rather than
   process-specific ("Du hast den Nenner schnell korrigiert").
9. **Auto-advance hallucinates a follow-up question** in the same
   turn as the praise. In production this is masked because the
   server pops the queue, but the model has no way to "stay on the
   current concept for one more depth-question" when the kid asks.
10. **Subject-blind.** Math hints, vocab hints, and history hints
    all read the same. The model has subject in context but no
    instruction to vary strategy.

These ten patterns drive the next two docs (`03-research-findings.md`
for what to do instead, `04-failure-patterns.md` to distil the list
for prompt design).
