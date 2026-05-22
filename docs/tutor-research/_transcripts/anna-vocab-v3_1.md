# Anna (anna) — Uhrzeit — prompt v3.1

**Persona:** Strong — answers correctly fast. Wants the "why" + depth. Bored by warmth padding.
**Question:** Was heißt "die Uhr" auf Französisch?
**Expected:** l'heure

---

**Tutor (opener):** Hi Anna! Sollen wir loslegen?

Was heißt "die Uhr" auf Französisch?

**Learner:** l'heure

**Tutor:** Genau! «l'heure» ist das französische Wort für die Uhr im Sinne der Zeit. Welche Regel hilft dir, um sich das zu merken?

- verdict=correct advance=false reveal=false hint_given=false intent=stay_for_depth tokens=2661/88 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** warum ist das weiblich?

**Tutor:** Das ist eine gute Frage. Im Französischen hat das grammatische Geschlecht oft keine direkte Verbindung zur Bedeutung. «L'heure» ist weiblich, weil es vom lateinischen «hora» kommt, das auch weiblich war. Kannst du dir eine Eselsbrücke für «l'heure» überlegen?

- verdict=null advance=false reveal=false hint_given=false intent=explain tokens=2711/113 model=deepseek-ai/deepseek-v3.2-maas

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 2): in=5372 (avg 2686) · out=201 (avg 101)
