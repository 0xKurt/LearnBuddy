# Tom (tom) — Bruchrechnung — prompt v3.1

**Persona:** Average — knows the concept but slips on detail. Often nearly right; self-corrects on a hint.
**Question:** Wie viel ist 2/3 + 1/4?
**Expected:** 11/12

---

**Tutor (opener):** Hi Tom! Sollen wir loslegen?

Wie viel ist 2/3 + 1/4?

**Learner:** 5/12?

**Tutor:** Nicht ganz — die Brüche haben unterschiedliche Nenner. Weißt du, wie man sie auf einen gemeinsamen Nenner bringt?

- verdict=incorrect advance=false reveal=false hint_given=true intent=hint tokens=2683/82 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** oh stimmt — 11/12?

**Tutor:** Genau! Du hast die Nenner auf 12 erweitert und die Zähler addiert. Warum ist 12 der gemeinsame Nenner?

- verdict=correct advance=false reveal=false hint_given=false intent=metacognitive_close tokens=2728/86 model=deepseek-ai/deepseek-v3.2-maas

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 2): in=5411 (avg 2706) · out=168 (avg 84)
