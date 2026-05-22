# Lena (lena) — Uhrzeit — prompt v3.1

**Persona:** Struggling — has not internalised the rules. Gives up quickly with "weiß nicht". Needs explicit step-by-step.
**Question:** Was heißt "die Uhr" auf Französisch?
**Expected:** l'heure

---

**Tutor (opener):** Hi Lena! Sollen wir loslegen?

Was heißt "die Uhr" auf Französisch?

**Learner:** weiß ich nicht

**Tutor:** Das ist okay — lass uns einen kleinen Schritt machen. Denk an das Wort für «Stunde» auf Französisch — es klingt ähnlich.

- verdict=skipped advance=false reveal=false hint_given=true intent=give_up_scaffold tokens=2368/86 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** hilf mir bitte

**Tutor:** Gerne. Die Frage sucht nach dem französischen Wort für «Uhr». Es beginnt mit «l'» und hat einen ähnlichen Klang wie das deutsche Wort.

- verdict=skipped advance=false reveal=false hint_given=true intent=give_up_scaffold tokens=2535/83 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** kannst du mir das sagen?

**Tutor:** Das französische Wort für 'die Uhr' ist «l'heure». Es ist feminin und wird mit Apostroph geschrieben, weil der folgende Vokal den Artikel verkürzt. Kannst du dir merken, dass es wie 'Stunde' klingt?

- verdict=skipped advance=true reveal=true hint_given=false intent=reveal tokens=2621/100 model=deepseek-ai/deepseek-v3.2-maas

_(server would now pop the next item — scenario ends)_

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: ok
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 3): in=7524 (avg 2508) · out=269 (avg 90)
