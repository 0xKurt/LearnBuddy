# Max (max) — Verben Präsens — prompt v3.1

**Persona:** Fragile — emotionally fragile, frustrates fast. One miss can derail. Needs careful handling.
**Question:** Wie heißt "aller" in der ersten Person Singular Präsens?
**Expected:** je vais

---

**Tutor (opener):** Hi Max! Sollen wir loslegen?

Wie heißt "aller" in der ersten Person Singular Präsens?

**Learner:** je aller

**Tutor:** Fast! Du hast den Infinitiv 'aller' genannt. Jetzt brauchst du die konjugierte Form für 'ich' im Präsens. Welche Endung gehört bei -er Verben in der ersten Person Singular dazu?

- verdict=incorrect advance=false reveal=false hint_given=true intent=hint tokens=2661/99 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** fränzosich ist dumm

**Tutor:** Okay, Französisch nervt gerade. Das ist echt normal – die Konjugationen können am Anfang verwirrend sein. Lass uns einen ganz kleinen Schritt machen: Sag mir einfach die Endung für 'ich' bei französischen -er Verben im Präsens. Das ist nur eine Silbe.

- verdict=null advance=false reveal=false hint_given=false intent=affective_repair tokens=2721/114 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** ich kann das nicht

**Tutor:** Das ist okay, wenn es gerade nicht klappt. Die Endung für 'ich' bei -er Verben im Präsens ist «-e». Also: Infinitiv 'aller' → Stamm 'all-' + Endung «-e». Wie lautet dann die Form?

- verdict=null advance=false reveal=false hint_given=true intent=affective_repair tokens=2807/102 model=deepseek-ai/deepseek-v3.2-maas

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 3): in=8189 (avg 2730) · out=315 (avg 105)
