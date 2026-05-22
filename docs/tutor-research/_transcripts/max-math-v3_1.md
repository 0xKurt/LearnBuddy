# Max (max) — Bruchrechnung — prompt v3.1

**Persona:** Fragile — emotionally fragile, frustrates fast. One miss can derail. Needs careful handling.
**Question:** Wie viel ist 2/3 + 1/4?
**Expected:** 11/12

---

**Tutor (opener):** Hi Max! Sollen wir loslegen?

Wie viel ist 2/3 + 1/4?

**Learner:** 11/7

**Tutor:** 11/7 ist nicht richtig. Lass uns einen Schritt zurückgehen: Um Brüche zu addieren, müssen sie denselben Nenner haben. Welchen gemeinsamen Nenner könnten 3 und 4 haben?

- verdict=incorrect advance=false reveal=false hint_given=true intent=hint tokens=2682/99 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** ich kann das nicht

**Tutor:** Das ist echt knifflig, wenn man den gemeinsamen Nenner suchen muss. Kein Wunder, dass es gerade hakt. Lass uns einen ganz kleinen Schritt machen: Nimm die beiden Nenner 3 und 4. Kannst du mir eine Zahl nennen, durch die sich beide teilen lassen?

- verdict=incorrect advance=false reveal=false hint_given=true intent=affective_repair tokens=2753/113 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** das nervt

**Tutor:** Ja, das nervt, wenn man den gemeinsamen Nenner nicht sofort sieht. Das ist normal. Mach wir's konkret: Bei 3 und 4 ist die kleinste gemeinsame Zahl die 12. Jetzt der nächste Schritt: Was ist 2/3, wenn der Nenner 12 ist?

- verdict=null advance=false reveal=false hint_given=true intent=affective_repair tokens=2829/111 model=deepseek-ai/deepseek-v3.2-maas

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok
- ✓ **SC-max-math-affect** — Max math: affective_repair fires on "das nervt": fired
- ✓ **SC-max-math-far** — Max math: "11/7" not greeted with "Fast": ok

Tokens (turns 3): in=8264 (avg 2755) · out=323 (avg 108)
