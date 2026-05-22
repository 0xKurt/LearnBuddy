# Tom (tom) — Uhrzeit — prompt v3.1

**Persona:** Average — knows the concept but slips on detail. Often nearly right; self-corrects on a hint.
**Question:** Was heißt "die Uhr" auf Französisch?
**Expected:** l'heure

---

**Tutor (opener):** Hi Tom! Sollen wir loslegen?

Was heißt "die Uhr" auf Französisch?

**Learner:** l heure?

**Tutor:** Fast richtig! Du hast die richtige Richtung. Es ist ein Wort, das mit 'l' beginnt, aber es fehlt noch ein kleines Zeichen. Kannst du das Wort nochmal schreiben, mit dem richtigen Zeichen?

- verdict=partially_correct advance=false reveal=false hint_given=false intent=evaluate tokens=2659/105 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** l'heure

**Tutor:** Genau! l'heure. Das ist die richtige Schreibweise. Der kleine Strich heißt Apostroph und zeigt an, dass das 'e' von 'le' wegfällt, weil 'heure' mit einem Vokal beginnt. Kannst du mir sagen, warum es 'l'heure' heißt und nicht 'le heure'?

- verdict=correct advance=false reveal=false hint_given=false intent=stay_for_depth tokens=2719/114 model=deepseek-ai/deepseek-v3.2-maas

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✗ **C2** — Economy of language (≤ 4 sentences per reply): Long reply: "Genau! l'heure. Das ist die richtige Schreibweise. Der kleine Strich heißt Apost…"
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 2): in=5378 (avg 2689) · out=219 (avg 110)
