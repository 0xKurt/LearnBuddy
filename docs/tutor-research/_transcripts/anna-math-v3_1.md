# Anna (anna) — Bruchrechnung — prompt v3.1

**Persona:** Strong — answers correctly fast. Wants the "why" + depth. Bored by warmth padding.
**Question:** Wie viel ist 2/3 + 1/4?
**Expected:** 11/12

---

**Tutor (opener):** Hi Anna! Sollen wir loslegen?

Wie viel ist 2/3 + 1/4?

**Learner:** 11/12

**Tutor:** Genau! 11/12 ist richtig. Du hast die Brüche auf den gemeinsamen Nenner 12 gebracht: 2/3 = 8/12 und 1/4 = 3/12, dann addiert. Welchen gemeinsamen Nenner hättest du auch noch nehmen können?

- verdict=correct advance=false reveal=false hint_given=false intent=stay_for_depth tokens=2680/117 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** warum nimmt man den Hauptnenner?

**Tutor:** Der Hauptnenner ist das kleinste gemeinsame Vielfache der beiden Nenner – hier 3 und 4. Das ist 12. Man nimmt ihn, weil man dann mit möglichst kleinen Zahlen rechnen kann. Man könnte auch einfach 3·4=12 nehmen, das ist auch ein gemeinsamer Nenner, aber nicht der kleinste. Warum ist es praktisch, mit möglichst kleinen Zahlen zu rechnen?

- verdict=null advance=false reveal=false hint_given=false intent=explain tokens=2761/140 model=deepseek-ai/deepseek-v3.2-maas

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✗ **C2** — Economy of language (≤ 4 sentences per reply): Long reply: "Der Hauptnenner ist das kleinste gemeinsame Vielfache der beiden Nenner – hier 3…"
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok
- ✓ **SC-anna-math-depth** — Anna math: stays for depth on "warum?": fired (intent=stay_for_depth)

Tokens (turns 2): in=5441 (avg 2721) · out=257 (avg 129)
