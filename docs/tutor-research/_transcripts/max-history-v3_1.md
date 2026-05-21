# Max (max) — Erster Weltkrieg — prompt v3.1

**Persona:** Fragile — emotionally fragile, frustrates fast. One miss can derail. Needs careful handling.
**Question:** Welches Ereignis im Juni 1914 löste den Ersten Weltkrieg aus?
**Expected:** Das Attentat von Sarajevo auf den österreichischen Thronfolger Franz Ferdinand

---

**Tutor (opener):** Hi Max! Sollen wir loslegen?

Welches Ereignis im Juni 1914 löste den Ersten Weltkrieg aus?

**Learner:** hitler

**Tutor:** Da hat sich etwas eingeschlichen. Wir suchen nach einem ganz bestimmten Ereignis im Juni 1914, das den Ersten Weltkrieg direkt ausgelöst hat.

- verdict=incorrect advance=false reveal=false hint_given=true intent=hint tokens=2313/82

**Learner:** ich kann geschichte nicht

**Tutor:** Das klingt frustrierend. Geschichte kann manchmal wirklich knifflig sein, besonders wenn es um viele Daten und Ereignisse geht. Lass uns nur den ersten kleinen Schritt für diese Frage anschauen.

- verdict=null advance=false reveal=false hint_given=false intent=affective_repair tokens=2351/90

**Learner:** überspring das

**Tutor:** Kein Problem, wir schauen uns das gemeinsam an. Wir suchen nach einem konkreten Vorfall im Juni 1914, der als direkter Auslöser für den Ersten Weltkrieg gilt. Es war ein einzelnes Ereignis, keine Person.

- verdict=null advance=false reveal=false hint_given=true intent=give_up_scaffold tokens=2394/105

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 3): in=7058 (avg 2353) · out=277 (avg 92)
