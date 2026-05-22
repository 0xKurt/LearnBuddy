# Lena (lena) — Erster Weltkrieg — prompt v3.1

**Persona:** Struggling — has not internalised the rules. Gives up quickly with "weiß nicht". Needs explicit step-by-step.
**Question:** Welches Ereignis im Juni 1914 löste den Ersten Weltkrieg aus?
**Expected:** Das Attentat von Sarajevo auf den österreichischen Thronfolger Franz Ferdinand

---

**Tutor (opener):** Hi Lena! Sollen wir loslegen?

Welches Ereignis im Juni 1914 löste den Ersten Weltkrieg aus?

**Learner:** hm

**Tutor:** Okay. Das Ereignis war ein Anschlag auf eine wichtige Person. In welcher Stadt fand das statt?

- verdict=skipped advance=false reveal=false hint_given=true intent=hint tokens=2851/74 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** keine ahnung

**Tutor:** Die Stadt liegt auf der Balkanhalbinsel. Der Name der Stadt beginnt mit 'S'.

- verdict=skipped advance=false reveal=false hint_given=true intent=hint tokens=2906/70 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** kannst du mir helfen?

**Tutor:** Ja, sicher. Das Ereignis war das «Attentat von Sarajevo» auf den Thronfolger Franz Ferdinand. Die Ermordung dieses Erzherzogs führte zu einer Kettenreaktion von Bündnissen, die den Krieg auslösten. Welches Datum hatte dieser Tag im Juni 1914?

- verdict=skipped advance=true reveal=true hint_given=false intent=reveal tokens=2937/123 model=deepseek-ai/deepseek-v3.2-maas

_(server would now pop the next item — scenario ends)_

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: ok
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 3): in=8694 (avg 2898) · out=267 (avg 89)
