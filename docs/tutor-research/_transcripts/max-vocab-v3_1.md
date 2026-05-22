# Max (max) — Uhrzeit — prompt v3.1

**Persona:** Fragile — emotionally fragile, frustrates fast. One miss can derail. Needs careful handling.
**Question:** Was heißt "die Uhr" auf Französisch?
**Expected:** l'heure

---

**Tutor (opener):** Hi Max! Sollen wir loslegen?

Was heißt "die Uhr" auf Französisch?

**Learner:** la temps

**Tutor:** «la temps» ist nicht richtig. Das französische Wort für „die Uhr“ ist ein anderes. Denkst du an die Uhrzeit oder den Gegenstand?

- verdict=incorrect advance=false reveal=false hint_given=false intent=redirect tokens=2658/86 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** die uhrzeit ist scheisse

**Tutor:** Ja, die Uhrzeit kann echt knifflig sein. Das ist okay, dass es gerade nicht klappt. Lass uns einen ganz kleinen Schritt machen: Das französische Wort für „die Uhr“ (im Sinne der Uhrzeit) ist ein weibliches Hauptwort, das mit einem Vokal beginnt. Wie könnte es wohl lauten?

- verdict=null advance=false reveal=false hint_given=true intent=affective_repair tokens=2720/117 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** ich gebs auf

**Tutor:** l'heure

Der Grund: Im Französischen heißt „die Uhr“ (im Sinne der Zeit) «l'heure». Das ist ein weibliches Wort, und weil es mit einem Vokal (h) beginnt, wird der Artikel verkürzt. Das Wort für den Gegenstand (die Armbanduhr) wäre «la montre».

Kannst du mir sagen, wie man „die Uhr“ (die Armbanduhr) auf Französisch sagt?

- verdict=skipped advance=true reveal=true hint_given=false intent=reveal tokens=2803/145 model=deepseek-ai/deepseek-v3.2-maas

_(server would now pop the next item — scenario ends)_

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: ok
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 3): in=8181 (avg 2727) · out=348 (avg 116)
