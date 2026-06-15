# Anna (anna) — Uhrzeit — prompt v3.1

**Persona:** Strong — answers correctly fast. Wants the "why" + depth. Bored by warmth padding.
**Question:** Was heißt "die Uhr" auf Französisch?
**Expected:** l'heure

---

**Tutor (opener):** Hi Anna! Sollen wir loslegen?

Was heißt "die Uhr" auf Französisch?

**Learner:** l'heure

**Tutor:** Richtig! Das ist die Übersetzung für 'die Uhr' im Sinne von Uhrzeit. Was ist der Unterschied zwischen 'l'heure' und 'la montre'?

- verdict=correct advance=false reveal=false hint_given=false intent=stay_for_depth tokens=2659/86 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** warum ist das weiblich?

**Tutor:** Gute Frage! Im Französischen hat jedes Substantiv ein grammatikalisches Geschlecht – das muss man einfach mitlernen. 'Heure' ist weiblich, daher heißt es 'la heure'. Weil aber 'la' vor einem Vokal zu 'l'' wird, sagt man 'l'heure'. Weißt du noch, wie man 'die Uhr' als Gegenstand (die Armbanduhr) auf Französisch sagt?

- verdict=null advance=false reveal=false hint_given=false intent=explain tokens=2707/142 model=deepseek-ai/deepseek-v3.2-maas

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✗ **C2** — Economy of language (≤ 4 sentences per reply): Long reply: "Gute Frage! Im Französischen hat jedes Substantiv ein grammatikalisches Geschlec…"
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 2): in=5366 (avg 2683) · out=228 (avg 114)
