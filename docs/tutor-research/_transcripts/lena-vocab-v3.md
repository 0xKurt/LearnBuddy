# Lena (lena) — Uhrzeit — prompt v3

**Persona:** Struggling — has not internalised the rules. Gives up quickly with "weiß nicht". Needs explicit step-by-step.
**Question:** Was heißt "die Uhr" auf Französisch?
**Expected:** l'heure

---

**Tutor (opener):** Hi Lena! Sollen wir loslegen?

Was heißt "die Uhr" auf Französisch?

**Learner:** weiß ich nicht

**Tutor:** Kein Problem, das finden wir zusammen heraus! Wir suchen also das französische Wort für 'Uhr'.

- verdict=skipped advance=false reveal=false hint_given=true intent=give_up_scaffold

**Learner:** hilf mir bitte

**Tutor:** Gerne! Denk mal an das englische Wort für Stunde. Das französische Wort klingt ganz ähnlich.

- verdict=null advance=false reveal=false hint_given=true intent=hint

**Learner:** kannst du mir das sagen?

**Tutor:** Die Uhr auf Französisch heißt „l'heure“. Das Wort „heure“ bedeutet Stunde, und weil es mit einem Vokal beginnt, wird oft „l'“ davor gesetzt. Macht das Sinn für dich?

- verdict=skipped advance=true reveal=true hint_given=false intent=reveal

_(server would now pop the next item — scenario ends)_

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: ok
- ✓ **C6** — No fabricated next-question on plain advance: ok
