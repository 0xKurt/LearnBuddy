# Tom (tom) — Uhrzeit — prompt v3.1

**Persona:** Average — knows the concept but slips on detail. Often nearly right; self-corrects on a hint.
**Question:** Was heißt "die Uhr" auf Französisch?
**Expected:** l'heure

---

**Tutor (opener):** Hi Tom! Sollen wir loslegen?

Was heißt "die Uhr" auf Französisch?

**Learner:** l heure?

**Tutor:** Fast! Du hast die richtige Richtung — es ist ein Wort mit 'heure'. Aber 'l heure' fehlt den Apostroph und das Geschlecht stimmt nicht ganz. Wie schreibt man 'die Uhr' auf Französisch mit Artikel?

- verdict=incorrect advance=false reveal=false hint_given=false intent=evaluate tokens=2661/104 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** l'heure

**Tutor:** Genau — l'heure. Bei Uhrzeitangaben verwendet man im Französischen «l'heure», nicht «la montre» (das ist die Armbanduhr). Welches Wort würdest du für 'Es ist drei Uhr' nehmen?

- verdict=correct advance=false reveal=false hint_given=false intent=stay_for_depth tokens=2722/102 model=deepseek-ai/deepseek-v3.2-maas

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 2): in=5383 (avg 2692) · out=206 (avg 103)
