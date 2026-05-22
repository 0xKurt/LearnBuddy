# Tom (tom) — Verben Präsens — prompt v3.1

**Persona:** Average — knows the concept but slips on detail. Often nearly right; self-corrects on a hint.
**Question:** Wie heißt "aller" in der ersten Person Singular Präsens?
**Expected:** je vais

---

**Tutor (opener):** Hi Tom! Sollen wir loslegen?

Wie heißt "aller" in der ersten Person Singular Präsens?

**Learner:** je alle

**Tutor:** Fast — du hast den Infinitiv 'aller' genannt, aber die Frage will die konjugierte Form für 'ich' im Präsens. Weißt du, wie man 'aller' für 'ich' bildet?

- verdict=incorrect advance=false reveal=false hint_given=false intent=evaluate tokens=2663/96 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** oh — je vais

**Tutor:** Genau, 'je vais' ist richtig. Die Endung -ais für 'ich' ist typisch für unregelmäßige Verben wie 'aller'. Kannst du die Form für 'du' nennen?

- verdict=correct advance=false reveal=false hint_given=false intent=stay_for_depth tokens=2718/96 model=deepseek-ai/deepseek-v3.2-maas

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 2): in=5381 (avg 2691) · out=192 (avg 96)
