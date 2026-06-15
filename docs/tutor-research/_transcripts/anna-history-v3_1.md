# Anna (anna) — Erster Weltkrieg — prompt v3.1

**Persona:** Strong — answers correctly fast. Wants the "why" + depth. Bored by warmth padding.
**Question:** Welches Ereignis im Juni 1914 löste den Ersten Weltkrieg aus?
**Expected:** Das Attentat von Sarajevo auf den österreichischen Thronfolger Franz Ferdinand

---

**Tutor (opener):** Hi Anna! Sollen wir loslegen?

Welches Ereignis im Juni 1914 löste den Ersten Weltkrieg aus?

**Learner:** Attentat von Sarajevo

**Tutor:** Genau richtig. Das Attentat von Sarajevo auf Franz Ferdinand war der unmittelbare Auslöser.

Was war an diesem Ereignis so folgenschwer, dass es zum Krieg führte?

- verdict=correct advance=false reveal=false hint_given=false intent=stay_for_depth tokens=2855/97 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** warum führte das gerade zum Krieg?

**Tutor:** Das ist eine sehr gute Frage. Es war nicht nur ein Mord, sondern ein politischer Funke in einem Pulverfass. Welche zwei Großmächte standen sich damals besonders feindlich gegenüber?

- verdict=null advance=false reveal=false hint_given=false intent=stay_for_depth tokens=2913/93 model=deepseek-ai/deepseek-v3.2-maas

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 2): in=5768 (avg 2884) · out=190 (avg 95)
