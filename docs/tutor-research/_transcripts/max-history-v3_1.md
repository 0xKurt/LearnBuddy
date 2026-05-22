# Max (max) — Erster Weltkrieg — prompt v3.1

**Persona:** Fragile — emotionally fragile, frustrates fast. One miss can derail. Needs careful handling.
**Question:** Welches Ereignis im Juni 1914 löste den Ersten Weltkrieg aus?
**Expected:** Das Attentat von Sarajevo auf den österreichischen Thronfolger Franz Ferdinand

---

**Tutor (opener):** Hi Max! Sollen wir loslegen?

Welches Ereignis im Juni 1914 löste den Ersten Weltkrieg aus?

**Learner:** hitler

**Tutor:** Hitler war noch nicht an der Macht. Das Ereignis, das den Krieg auslöste, war ein Attentat auf einen wichtigen Politiker. In welcher Stadt fand das Attentat statt?

- verdict=incorrect advance=false reveal=false hint_given=true intent=hint tokens=2852/96 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** ich kann geschichte nicht

**Tutor:** Das ist okay, Geschichte kann viele Namen und Daten haben. Das Ereignis war ein Attentat in einer Stadt auf dem Balkan. Weißt du den Namen der Stadt?

- verdict=null advance=false reveal=false hint_given=true intent=affective_repair tokens=2929/87 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** überspring das

**Tutor:** Das Attentat von Sarajevo auf den österreichischen Thronfolger Franz Ferdinand. Die Ermordung eines Thronfolgers kann eine ganze Bündniskette in Gang setzen. Was war das Datum dieses Attentats?

- verdict=skipped advance=true reveal=true hint_given=false intent=reveal tokens=2951/93 model=deepseek-ai/deepseek-v3.2-maas

_(server would now pop the next item — scenario ends)_

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: ok
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 3): in=8732 (avg 2911) · out=276 (avg 92)
