# Anna (anna) — Erster Weltkrieg — prompt v3.1

**Persona:** Strong — answers correctly fast. Wants the "why" + depth. Bored by warmth padding.
**Question:** Welches Ereignis im Juni 1914 löste den Ersten Weltkrieg aus?
**Expected:** Das Attentat von Sarajevo auf den österreichischen Thronfolger Franz Ferdinand

---

**Tutor (opener):** Hi Anna! Sollen wir loslegen?

Welches Ereignis im Juni 1914 löste den Ersten Weltkrieg aus?

**Learner:** Attentat von Sarajevo

**Tutor:** Richtig! Das Attentat von Sarajevo auf den österreichisch-ungarischen Thronfolger Franz Ferdinand gilt als der unmittelbare Auslöser. Warum führte gerade dieses Ereignis so schnell zum Krieg?

- verdict=correct advance=false reveal=false hint_given=false intent=stay_for_depth tokens=2857/101 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** warum führte das gerade zum Krieg?

**Tutor:** Das lag an den bestehenden Bündnissystemen und Spannungen zwischen den Großmächten. Österreich-Ungarn stellte Serbien nach dem Attentat ein Ultimatum, das diese nicht vollständig erfüllen konnten. Welche zwei großen Bündnisse standen sich damals gegenüber?

- verdict=null advance=false reveal=false hint_given=false intent=stay_for_depth tokens=2921/116 model=deepseek-ai/deepseek-v3.2-maas

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 2): in=5778 (avg 2889) · out=217 (avg 109)
