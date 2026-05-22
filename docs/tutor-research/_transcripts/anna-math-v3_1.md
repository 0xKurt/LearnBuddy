# Anna (anna) — Bruchrechnung — prompt v3.1

**Persona:** Strong — answers correctly fast. Wants the "why" + depth. Bored by warmth padding.
**Question:** Wie viel ist 2/3 + 1/4?
**Expected:** 11/12

---

**Tutor (opener):** Hi Anna! Sollen wir loslegen?

Wie viel ist 2/3 + 1/4?

**Learner:** 11/12

**Tutor:** Genau, 11/12 ist richtig! Du hast das schnell ausgerechnet. Bereit für die nächste Aufgabe?

- verdict=correct advance=true reveal=false hint_given=false intent=praise_and_advance tokens=2167 (cached=1956)/81 model=gemini-2.5-flash

_(server would now pop the next item — scenario ends)_

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✗ **C6** — No fabricated next-question on plain advance: Fabricated next: "Genau, 11/12 ist richtig! Du hast das schnell ausgerechnet. Bereit für die nächs…"
- ✗ **SC-anna-math-depth** — Anna math: stays for depth on "warum?": never fired

Tokens (turns 1): in=2167 (avg 2167) · out=81 (avg 81)
