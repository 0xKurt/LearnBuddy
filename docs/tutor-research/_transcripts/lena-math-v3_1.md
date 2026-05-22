# Lena (lena) — Bruchrechnung — prompt v3.1

**Persona:** Struggling — has not internalised the rules. Gives up quickly with "weiß nicht". Needs explicit step-by-step.
**Question:** Wie viel ist 2/3 + 1/4?
**Expected:** 11/12

---

**Tutor (opener):** Hi Lena! Sollen wir loslegen?

Wie viel ist 2/3 + 1/4?

**Learner:** äh weiß nicht

**Tutor:** Kein Problem. Lass uns Schritt für Schritt vorgehen.

Um Brüche zu addieren, müssen sie denselben Nenner haben – also denselben „Unterteil“. Weißt du, wie man das macht?

- verdict=skipped advance=false reveal=false hint_given=false intent=explain tokens=2703/101 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** verstehe das gar nicht

**Tutor:** Okay, lass uns das ganz von vorne machen. Du hast 2/3 und 1/4. Die Nenner sind 3 und 4. Um sie zu addieren, brauchen wir einen gemeinsamen Nenner. Weißt du, wie man einen gemeinsamen Nenner findet?

- verdict=null advance=false reveal=false hint_given=false intent=explain tokens=2739/104 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** kannst du mir das erklären?

**Tutor:** Klar. Ein gemeinsamer Nenner ist eine Zahl, die durch beide Nenner (3 und 4) teilbar ist. Eine einfache Möglichkeit ist, die beiden Nenner zu multiplizieren: 3 × 4 = 12. 12 ist durch 3 und durch 4 teilbar, also ist 12 ein gemeinsamer Nenner.

Jetzt müssen wir die Brüche so umschreiben, dass beide den Nenner 12 haben.

Erster Schritt: Wie wandelt man 2/3 in einen Bruch mit Nenner 12 um?

- verdict=null advance=false reveal=false hint_given=true intent=explain tokens=2840/168 model=deepseek-ai/deepseek-v3.2-maas

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✗ **C2** — Economy of language (≤ 4 sentences per reply): Long reply: "Okay, lass uns das ganz von vorne machen. Du hast 2/3 und 1/4. Die Nenner sind 3…"
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 3): in=8282 (avg 2761) · out=373 (avg 124)
