# Lena (lena) — Bruchrechnung — prompt v3.1

**Persona:** Struggling — has not internalised the rules. Gives up quickly with "weiß nicht". Needs explicit step-by-step.
**Question:** Wie viel ist 2/3 + 1/4?
**Expected:** 11/12

---

**Tutor (opener):** Hi Lena! Sollen wir loslegen?

Wie viel ist 2/3 + 1/4?

**Learner:** äh weiß nicht

**Tutor:** Kein Problem, das ist eine typische Bruchrechnung. Weißt du, was man zuerst machen muss, um Brüche zu addieren?

- verdict=skipped advance=false reveal=false hint_given=false intent=explain tokens=2705/83 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** verstehe das gar nicht

**Tutor:** Okay, lass uns einen Schritt zurückgehen. Um Brüche zu addieren, müssen sie den gleichen Nenner haben. Weißt du, wie man einen gemeinsamen Nenner findet?

- verdict=null advance=false reveal=false hint_given=true intent=explain tokens=2725/91 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** kannst du mir das erklären?

**Tutor:** Klar. Ein gemeinsamer Nenner ist eine Zahl, durch die beide Nenner (also 3 und 4) teilbar sind. Die kleinste solche Zahl ist 12. Kannst du mir sagen, wie man 2/3 in Zwölftel umwandelt?

- verdict=null advance=false reveal=false hint_given=true intent=explain tokens=2804/100 model=deepseek-ai/deepseek-v3.2-maas

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 3): in=8234 (avg 2745) · out=274 (avg 91)
