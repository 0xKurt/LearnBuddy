# Tom (tom) — Bruchrechnung — prompt v3

**Persona:** Average — knows the concept but slips on detail. Often nearly right; self-corrects on a hint.
**Question:** Wie viel ist 2/3 + 1/4?
**Expected:** 11/12

---

**Tutor (opener):** Hi Tom! Sollen wir loslegen?

Wie viel ist 2/3 + 1/4?

**Learner:** 5/12?

**Tutor:** Nicht ganz, Tom. Wenn du Brüche addieren möchtest, ist der erste Schritt immer, die Nenner gleich zu machen. Erinnerst du dich, wie man das nennt?

- verdict=incorrect advance=false reveal=false hint_given=false intent=evaluate

**Learner:** oh stimmt — 11/12?

**Tutor:** Genau, Tom! 11/12 ist richtig. Du hast den Schritt mit dem gleichen Nenner super hinbekommen.

- verdict=correct advance=true reveal=false hint_given=false intent=praise_and_advance

_(server would now pop the next item — scenario ends)_

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok
