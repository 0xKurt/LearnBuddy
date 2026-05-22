# Lena (lena) — Uhrzeit — prompt v3.1

**Persona:** Struggling — has not internalised the rules. Gives up quickly with "weiß nicht". Needs explicit step-by-step.
**Question:** Was heißt "die Uhr" auf Französisch?
**Expected:** l'heure

---

**Tutor (opener):** Hi Lena! Sollen wir loslegen?

Was heißt "die Uhr" auf Französisch?

**Learner:** weiß ich nicht

**Tutor:** Kein Problem. Lass uns das Schritt für Schritt angehen. Weißt du, ob es im Französischen zwei verschiedene Wörter für 'Uhr' gibt?

- verdict=skipped advance=false reveal=false hint_given=true intent=hint tokens=2662/84 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** hilf mir bitte

**Tutor:** Gerne. Im Französischen gibt es zwei Wörter: eines für die Uhrzeit und eines für den Gegenstand, den man trägt oder an der Wand hängt. Welches meinst du?

- verdict=null advance=false reveal=false hint_given=true intent=hint tokens=2728/82 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** kannst du mir das sagen?

**Tutor:** Die Antwort ist «l'heure». Das ist das Wort für die Uhrzeit. Welches Wort wäre dann der Gegenstand, die Armbanduhr?

- verdict=skipped advance=true reveal=true hint_given=false intent=reveal tokens=2783/82 model=deepseek-ai/deepseek-v3.2-maas

_(server would now pop the next item — scenario ends)_

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: ok
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 3): in=8173 (avg 2724) · out=248 (avg 83)
