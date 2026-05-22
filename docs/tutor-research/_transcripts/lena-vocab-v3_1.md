# Lena (lena) — Uhrzeit — prompt v3.1

**Persona:** Struggling — has not internalised the rules. Gives up quickly with "weiß nicht". Needs explicit step-by-step.
**Question:** Was heißt "die Uhr" auf Französisch?
**Expected:** l'heure

---

**Tutor (opener):** Hi Lena! Sollen wir loslegen?

Was heißt "die Uhr" auf Französisch?

**Learner:** weiß ich nicht

**Tutor:** Das klingt frustrierend — viele finden die französischen Wörter erstmal fremd. Lass uns nur einen kleinen Schritt machen: Wir suchen das französische Wort für 'die Uhr' — es ist ein Hauptwort, das man bei der Zeitangabe verwendet.

- verdict=skipped advance=false reveal=false hint_given=true intent=give_up_scaffold tokens=2215/112 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** hilf mir bitte

**Tutor:** Genau, 'Uhr' kann man auf zwei Arten sagen: die Zeit-Uhr (wie 'Es ist drei Uhr') und die Armbanduhr. Hier geht es um die Zeit-Uhr. Kannst du dir vorstellen, wie das französische Wort für 'Stunde' klingen könnte?

- verdict=skipped advance=false reveal=false hint_given=true intent=give_up_scaffold tokens=2408/109 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** kannst du mir das sagen?

**Tutor:** Es ist ein kurzes Wort, das mit einem Vokal anfängt und einen Apostroph hat. Probier mal, wie 'Stunde' auf Französisch klingen könnte.

- verdict=skipped advance=false reveal=false hint_given=true intent=give_up_scaffold tokens=2520/82 model=deepseek-ai/deepseek-v3.2-maas

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 3): in=7143 (avg 2381) · out=303 (avg 101)
