# Lena (lena) — Bruchrechnung — prompt v3

**Persona:** Struggling — has not internalised the rules. Gives up quickly with "weiß nicht". Needs explicit step-by-step.
**Question:** Wie viel ist 2/3 + 1/4?
**Expected:** 11/12

---

**Tutor (opener):** Hi Lena! Sollen wir loslegen?

Wie viel ist 2/3 + 1/4?

**Learner:** äh weiß nicht

**Tutor:** Kein Problem, das schauen wir uns gemeinsam an. Denk mal darüber nach, was wir tun müssen, um zwei Brüche wie 2/3 und 1/4 zusammenzuzählen.

- verdict=skipped advance=false reveal=false hint_given=true intent=give_up_scaffold

**Learner:** verstehe das gar nicht

**Tutor:** Das klingt, als ob du dich gerade ein bisschen überfordert fühlst. Bruchrechnung kann am Anfang wirklich knifflig sein, das geht vielen so. Lass uns mal nur den allerersten Schritt anschauen, um Brüche zu addieren. Was ist das Wichtigste, bevor wir Zähler und Nenner zusammenrechnen können?

- verdict=null advance=false reveal=false hint_given=false intent=affective_repair

**Learner:** kannst du mir das erklären?

**Tutor:** Klar, das mache ich gerne! Stell dir vor, du hast ein Stück Pizza, das in 3 Teile geteilt ist, und ein anderes, das in 4 Teile geteilt ist. Du kannst die Stücke nicht einfach zusammenzählen, wenn sie unterschiedlich groß sind, oder? Genauso ist es bei Brüchen: Bevor du sie addieren kannst, müssen sie den gleichen Nenner haben. Das nennt man den Hauptnenner.

- verdict=null advance=false reveal=false hint_given=false intent=explain

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✗ **C2** — Economy of language (≤ 4 sentences per reply): Long reply: "Klar, das mache ich gerne! Stell dir vor, du hast ein Stück Pizza, das in 3 Teil…"
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok
