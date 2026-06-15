# Anna (anna) — Bruchrechnung — prompt v3

**Persona:** Strong — answers correctly fast. Wants the "why" + depth. Bored by warmth padding.
**Question:** Wie viel ist 2/3 + 1/4?
**Expected:** 11/12

---

**Tutor (opener):** Hi Anna! Sollen wir loslegen?

Wie viel ist 2/3 + 1/4?

**Learner:** 11/12

**Tutor:** Genau, 11/12 ist richtig! Sehr gut gemacht. Bereit für die nächste Aufgabe?

- verdict=correct advance=true reveal=false hint_given=false intent=praise_and_advance

_(server would now pop the next item — scenario ends)_

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✗ **C6** — No fabricated next-question on plain advance: Fabricated next: "Genau, 11/12 ist richtig! Sehr gut gemacht. Bereit für die nächste Aufgabe?…"
- ✗ **SC-anna-math-depth** — Anna math: stays for depth on "warum?": never fired
