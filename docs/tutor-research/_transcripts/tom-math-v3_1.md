# Tom (tom) — Bruchrechnung — prompt v3.1

**Persona:** Average — knows the concept but slips on detail. Often nearly right; self-corrects on a hint.
**Question:** Wie viel ist 2/3 + 1/4?
**Expected:** 11/12

---

**Tutor (opener):** Hi Tom! Sollen wir loslegen?

Wie viel ist 2/3 + 1/4?

**Learner:** 5/12?

**Tutor:** Der Nenner 12 ist super

- verdict=incorrect advance=false reveal=false hint_given=false intent=evaluate tokens=2167/16

**Learner:** oh stimmt — 11/12?

**Tutor:** Genau, 11/12 ist richtig! Du hast den Zähler schnell korrigiert. Bereit für die nächste Aufgabe?

- verdict=correct advance=true reveal=false hint_given=false intent=praise_and_advance tokens=2185/83

_(server would now pop the next item — scenario ends)_

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✗ **C6** — No fabricated next-question on plain advance: Fabricated next: "Genau, 11/12 ist richtig! Du hast den Zähler schnell korrigiert. Bereit für die …"

Tokens (turns 2): in=4352 (avg 2176) · out=99 (avg 50)
