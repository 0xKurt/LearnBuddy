# Max (max) — Erster Weltkrieg — prompt v3

**Persona:** Fragile — emotionally fragile, frustrates fast. One miss can derail. Needs careful handling.
**Question:** Welches Ereignis im Juni 1914 löste den Ersten Weltkrieg aus?
**Expected:** Das Attentat von Sarajevo auf den österreichischen Thronfolger Franz Ferdinand

---

**Tutor (opener):** Hi Max! Sollen wir loslegen?

Welches Ereignis im Juni 1914 löste den Ersten Weltkrieg aus?

**Learner:** hitler

**Tutor:** Das ist eine interessante Idee, Max, aber Hitler kam erst viel später an die Macht und hat den Zweiten Weltkrieg ausgelöst, nicht den Ersten. Wir suchen ein Ereignis, das im Juni 1914 passiert ist und den Ersten Weltkrieg gestartet hat.

- verdict=incorrect advance=false reveal=false hint_given=true intent=hint

**Learner:** ich kann geschichte nicht

**Tutor:** Das klingt frustrierend, Max. Geschichte kann manchmal echt knifflig sein, besonders wenn viele Namen und Jahreszahlen durcheinandergehen. Aber keine Sorge, wir schauen uns das Schritt für Schritt an.

- verdict=null advance=false reveal=false hint_given=false intent=affective_repair

**Learner:** überspring das

**Tutor:** Der Auslöser des Ersten Weltkriegs war das Attentat von Sarajevo auf den österreichischen Thronfolger Franz Ferdinand. Dieses Ereignis hat die Spannungen zwischen den Ländern so stark erhöht, dass es zum Krieg kam. Wer war denn Franz Ferdinand?

- verdict=skipped advance=true reveal=true hint_given=false intent=reveal

_(server would now pop the next item — scenario ends)_

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: ok
- ✓ **C6** — No fabricated next-question on plain advance: ok
