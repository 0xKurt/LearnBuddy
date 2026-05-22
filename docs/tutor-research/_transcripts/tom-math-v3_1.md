# Tom (tom) — Bruchrechnung — prompt v3.1

**Persona:** Average — knows the concept but slips on detail. Often nearly right; self-corrects on a hint.
**Question:** Wie viel ist 2/3 + 1/4?
**Expected:** 11/12

---

**Tutor (opener):** Hi Tom! Sollen wir loslegen?

Wie viel ist 2/3 + 1/4?

**Learner:** 5/12?

**Tutor:** Das ist nicht richtig. Du hast die Brüche einfach addiert, als wären die Nenner gleich. Aber bei 2/3 und 1/4 sind die Nenner unterschiedlich. Weißt du, was man machen muss, bevor man Brüche addieren kann?

- verdict=incorrect advance=false reveal=false hint_given=false intent=explain tokens=2681/111 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** oh stimmt — 11/12?

**Tutor:** Genau! 11/12 ist richtig. Du hast erkannt, dass man zuerst einen gemeinsamen Nenner braucht. Welchen gemeinsamen Nenner hast du hier verwendet?

- verdict=correct advance=false reveal=false hint_given=false intent=stay_for_depth tokens=2755/82 model=deepseek-ai/deepseek-v3.2-maas

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 2): in=5436 (avg 2718) · out=193 (avg 97)
