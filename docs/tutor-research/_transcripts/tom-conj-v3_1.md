# Tom (tom) — Verben Präsens — prompt v3.1

**Persona:** Average — knows the concept but slips on detail. Often nearly right; self-corrects on a hint.
**Question:** Wie heißt "aller" in der ersten Person Singular Präsens?
**Expected:** je vais

---

**Tutor (opener):** Hi Tom! Sollen wir loslegen?

Wie heißt "aller" in der ersten Person Singular Präsens?

**Learner:** je alle

**Tutor:** Fast — du hast die richtige Idee, aber die Endung passt noch nicht ganz. Bei „aller“ in der 1. Person Singular Präsens endet die Form auf -s. Wie lautet die Grundform ohne Endung?

- verdict=incorrect advance=false reveal=false hint_given=false intent=evaluate tokens=2661/101 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** oh — je vais

**Tutor:** Genau, je vais. Das -s am Ende ist typisch für die 1. Person Singular bei vielen französischen Verben im Präsens. Kannst du mir noch sagen, wie man die 2. Person Singular (du) von „aller“ bildet?

- verdict=correct advance=false reveal=false hint_given=false intent=stay_for_depth tokens=2721/109 model=deepseek-ai/deepseek-v3.2-maas

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✗ **C2** — Economy of language (≤ 4 sentences per reply): Long reply: "Genau, je vais. Das -s am Ende ist typisch für die 1. Person Singular bei vielen…"
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 2): in=5382 (avg 2691) · out=210 (avg 105)
