# Max (max) — Bruchrechnung — prompt v3.1

**Persona:** Fragile — emotionally fragile, frustrates fast. One miss can derail. Needs careful handling.
**Question:** Wie viel ist 2/3 + 1/4?
**Expected:** 11/12

---

**Tutor (opener):** Hi Max! Sollen wir loslegen?

Wie viel ist 2/3 + 1/4?

**Learner:** 11/7

**Tutor:** Hmm, 11/7 ist nicht richtig. Lass uns einen Schritt zurückgehen: Weißt du, wie man Brüche addiert, wenn sie unterschiedliche Nenner haben?

- verdict=incorrect advance=false reveal=false hint_given=false intent=explain tokens=2680/90 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** ich kann das nicht

**Tutor:** Das ist okay, Bruchaddition mit unterschiedlichen Nennern ist für viele erstmal knifflig. Lass uns einen ganz kleinen Schritt machen: Siehst du, dass die Nenner 3 und 4 unterschiedlich sind? Um sie zu addieren, müssen wir sie auf einen gemeinsamen Nenner bringen. Weißt du, wie man einen gemeinsamen Nenner für 3 und 4 findet?

- verdict=incorrect advance=false reveal=false hint_given=false intent=affective_repair tokens=2742/142 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** das nervt

**Tutor:** Ja, das kann echt nerven, wenn man nicht weiterkommt. Das ist völlig normal. Lass uns nur eine einzige Sache klären: Der gemeinsame Nenner ist die kleinste Zahl, die sowohl durch 3 als auch durch 4 teilbar ist. Kannst du eine solche Zahl nennen?

- verdict=null advance=false reveal=false hint_given=false intent=affective_repair tokens=2838/110 model=deepseek-ai/deepseek-v3.2-maas

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok
- ✓ **SC-max-math-affect** — Max math: affective_repair fires on "das nervt": fired
- ✓ **SC-max-math-far** — Max math: "11/7" not greeted with "Fast": ok

Tokens (turns 3): in=8260 (avg 2753) · out=342 (avg 114)
