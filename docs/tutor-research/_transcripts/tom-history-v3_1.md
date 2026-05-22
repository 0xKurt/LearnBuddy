# Tom (tom) — Erster Weltkrieg — prompt v3.1

**Persona:** Average — knows the concept but slips on detail. Often nearly right; self-corrects on a hint.
**Question:** Welches Ereignis im Juni 1914 löste den Ersten Weltkrieg aus?
**Expected:** Das Attentat von Sarajevo auf den österreichischen Thronfolger Franz Ferdinand

---

**Tutor (opener):** Hi Tom! Sollen wir loslegen?

Welches Ereignis im Juni 1914 löste den Ersten Weltkrieg aus?

**Learner:** irgendwas mit einem Attentat in Bosnien

**Tutor:** Genau, es geht um ein Attentat in Bosnien. In welcher Stadt fand es statt?

- verdict=partially_correct advance=false reveal=false hint_given=false intent=evaluate tokens=2862/75 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** oh stimmt das war Sarajevo

**Tutor:** Richtig, das war in Sarajevo. Welche wichtige Person war das Ziel des Attentats?

- verdict=partially_correct advance=false reveal=false hint_given=true intent=hint tokens=2897/65 model=deepseek-ai/deepseek-v3.2-maas

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 2): in=5759 (avg 2880) · out=140 (avg 70)
