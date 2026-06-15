# Max (max) — Erster Weltkrieg — prompt v3.1

**Persona:** Fragile — emotionally fragile, frustrates fast. One miss can derail. Needs careful handling.
**Question:** Welches Ereignis im Juni 1914 löste den Ersten Weltkrieg aus?
**Expected:** Das Attentat von Sarajevo auf den österreichischen Thronfolger Franz Ferdinand

---

**Tutor (opener):** Hi Max! Sollen wir loslegen?

Welches Ereignis im Juni 1914 löste den Ersten Weltkrieg aus?

**Learner:** hitler

**Tutor:** Hitler war damals noch nicht an der Macht — das war später. Lass uns einen Schritt zurückgehen: Welches Ereignis im Juni 1914 hat den Ersten Weltkrieg ausgelöst?

- verdict=incorrect advance=false reveal=false hint_given=false intent=redirect tokens=2850/93 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** ich kann geschichte nicht

**Tutor:** Geschichte kann sich manchmal wie ein großes Durcheinander anfühlen. Das ist okay. Lass uns einfach eins nach dem anderen machen. Was fällt dir zum Juni 1914 ein? Irgendwas mit einem Attentat oder einer Stadt?

- verdict=null advance=false reveal=false hint_given=true intent=affective_repair tokens=2925/107 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** überspring das

**Tutor:** Kein Problem. Die Antwort wäre: Das Attentat von Sarajevo auf den österreichischen Thronfolger Franz Ferdinand. Das ist die direkte Ursache. Kurz gesagt: Ein Mord in Sarajevo hat die Bündnisketten in Gang gesetzt. Was war das Besondere an diesem Opfer — warum hatte der Mord so große Folgen?

- verdict=skipped advance=true reveal=true hint_given=false intent=reveal tokens=2967/120 model=deepseek-ai/deepseek-v3.2-maas

_(server would now pop the next item — scenario ends)_

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✗ **C2** — Economy of language (≤ 4 sentences per reply): Long reply: "Geschichte kann sich manchmal wie ein großes Durcheinander anfühlen. Das ist oka…"
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: ok
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 3): in=8742 (avg 2914) · out=320 (avg 107)
