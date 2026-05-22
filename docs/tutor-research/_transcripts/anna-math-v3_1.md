# Anna (anna) — Bruchrechnung — prompt v3.1

**Persona:** Strong — answers correctly fast. Wants the "why" + depth. Bored by warmth padding.
**Question:** Wie viel ist 2/3 + 1/4?
**Expected:** 11/12

---

**Tutor (opener):** Hi Anna! Sollen wir loslegen?

Wie viel ist 2/3 + 1/4?

**Learner:** 11/12

**Tutor:** Richtig! Du hast die Brüche korrekt addiert. Wie bist du vorgegangen? Hast du einen gemeinsamen Nenner gesucht?

- verdict=correct advance=false reveal=false hint_given=false intent=metacognitive_close tokens=2682/84 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** warum nimmt man den Hauptnenner?

**Tutor:** Der Hauptnenner ist der kleinste gemeinsame Nenner, damit man die Brüche überhaupt addieren kann. Er sorgt dafür, dass die Anteile gleich groß sind – wie wenn du Äpfel und Birnen erst in gleich große Stücke schneidest, bevor du sie zusammenzählst. Was wäre der Hauptnenner von 1/2 und 1/3?

- verdict=null advance=false reveal=false hint_given=false intent=explain tokens=2729/124 model=deepseek-ai/deepseek-v3.2-maas

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok
- ✓ **SC-anna-math-depth** — Anna math: stays for depth on "warum?": fired (intent=explain)

Tokens (turns 2): in=5411 (avg 2706) · out=208 (avg 104)
