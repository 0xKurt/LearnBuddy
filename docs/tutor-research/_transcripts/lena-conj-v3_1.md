# Lena (lena) — Verben Präsens — prompt v3.1

**Persona:** Struggling — has not internalised the rules. Gives up quickly with "weiß nicht". Needs explicit step-by-step.
**Question:** Wie heißt "aller" in der ersten Person Singular Präsens?
**Expected:** je vais

---

**Tutor (opener):** Hi Lena! Sollen wir loslegen?

Wie heißt "aller" in der ersten Person Singular Präsens?

**Learner:** weiß nicht

**Tutor:** Kein Problem, das ist eine wichtige Form. Lass uns einen Schritt zurückgehen: Was bedeutet das Verb "aller" auf Deutsch?

- verdict=skipped advance=false reveal=false hint_given=false intent=explain tokens=2685/78 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** hilf mir

**Tutor:** «Aller» bedeutet "gehen". Jetzt zur Form: In der ersten Person Singular (also "ich") Präsens (Gegenwart) heißt es «je vais». Kannst du mir die Form nochmal sagen?

- verdict=null advance=false reveal=false hint_given=true intent=explain tokens=2720/89 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** wie geht das nochmal?

**Tutor:** «Je vais».

Die Regel: Bei vielen französischen Verben auf -er (wie «aller») hängt man im Präsens für 'ich' einfach ein -e an den Stamm. Aber «aller» ist unregelmäßig – es hat den besonderen Stamm «v-» für 'ich'.

Was ist der Stamm für 'ich' bei «aller»?

- verdict=skipped advance=true reveal=true hint_given=false intent=reveal tokens=2778/130 model=deepseek-ai/deepseek-v3.2-maas

_(server would now pop the next item — scenario ends)_

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: ok
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 3): in=8183 (avg 2728) · out=297 (avg 99)
