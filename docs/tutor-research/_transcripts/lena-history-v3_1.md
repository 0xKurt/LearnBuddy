# Lena (lena) — Erster Weltkrieg — prompt v3.1

**Persona:** Struggling — has not internalised the rules. Gives up quickly with "weiß nicht". Needs explicit step-by-step.
**Question:** Welches Ereignis im Juni 1914 löste den Ersten Weltkrieg aus?
**Expected:** Das Attentat von Sarajevo auf den österreichischen Thronfolger Franz Ferdinand

---

**Tutor (opener):** Hi Lena! Sollen wir loslegen?

Welches Ereignis im Juni 1914 löste den Ersten Weltkrieg aus?

**Learner:** hm

**Tutor:** Okay, lass uns das gemeinsam angehen. Weißt du, welches Land damals in den Konflikt verwickelt war oder wer dabei eine wichtige Rolle spielte?

- verdict=null advance=false reveal=false hint_given=true intent=hint tokens=2849/86 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** keine ahnung

**Tutor:** Alles klar, kein Problem. Das Ereignis war ein Attentat. Weißt du noch, in welcher Stadt es stattfand?

- verdict=skipped advance=false reveal=false hint_given=true intent=hint tokens=2918/72 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** kannst du mir helfen?

**Tutor:** Ja, natürlich. Das Ereignis war ein Attentat in der Stadt Sarajevo. Wer war das Opfer dieses Attentats?

- verdict=skipped advance=false reveal=false hint_given=true intent=hint tokens=2960/71 model=deepseek-ai/deepseek-v3.2-maas

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 3): in=8727 (avg 2909) · out=229 (avg 76)
