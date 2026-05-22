# Max (max) — Verben Präsens — prompt v3.1

**Persona:** Fragile — emotionally fragile, frustrates fast. One miss can derail. Needs careful handling.
**Question:** Wie heißt "aller" in der ersten Person Singular Präsens?
**Expected:** je vais

---

**Tutor (opener):** Hi Max! Sollen wir loslegen?

Wie heißt "aller" in der ersten Person Singular Präsens?

**Learner:** je aller

**Tutor:** Fast! Du hast den Infinitiv erkannt. Jetzt brauchen wir die konjugierte Form für 'ich'. Wie lautet die erste Person Singular von 'aller'?

- verdict=incorrect advance=false reveal=false hint_given=false intent=explain tokens=2663/88 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** fränzosich ist dumm

**Tutor:** Ich verstehe, Französisch kann sich manchmal echt nervig anfühlen. Lass uns einen Schritt zurückgehen und ganz einfach anfangen: Welches deutsche Wort bedeutet 'ich' auf Französisch?

- verdict=null advance=false reveal=false hint_given=false intent=affective_repair tokens=2712/90 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** ich kann das nicht

**Tutor:** Das ist okay, wenn es gerade nicht klappt. 'Ich' heißt auf Französisch 'je'. Jetzt versuchen wir es zusammen: 'je' + die richtige Form von 'aller'. Kannst du 'aller' für 'ich' sagen?

- verdict=null advance=false reveal=false hint_given=true intent=affective_repair tokens=2782/97 model=deepseek-ai/deepseek-v3.2-maas

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 3): in=8157 (avg 2719) · out=275 (avg 92)
