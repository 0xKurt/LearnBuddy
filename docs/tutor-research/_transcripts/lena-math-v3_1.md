# Lena (lena) — Bruchrechnung — prompt v3.1

**Persona:** Struggling — has not internalised the rules. Gives up quickly with "weiß nicht". Needs explicit step-by-step.
**Question:** Wie viel ist 2/3 + 1/4?
**Expected:** 11/12

---

**Tutor (opener):** Hi Lena! Sollen wir loslegen?

Wie viel ist 2/3 + 1/4?

**Learner:** äh weiß nicht

**Tutor:** Kein Problem! Lass uns mal schauen, was wir hier eigentlich machen wollen. Wir versuchen, diese beiden Brüche zusammenzuzählen. Was ist denn das Ziel, wenn du Brüche addieren möchtest?

- verdict=null advance=false reveal=false hint_given=true intent=give_up_scaffold tokens=2165/97

**Learner:** verstehe das gar nicht

**Tutor:** Das klingt frustrierend, wenn man das Gefühl hat, etwas gar nicht zu verstehen. Das ist aber ganz normal bei Brüchen, da geht es vielen so. Lass uns das mal ganz in Ruhe angehen und nur den allerersten Schritt anschauen.

- verdict=null advance=false reveal=false hint_given=false intent=affective_repair tokens=2215/102

**Learner:** kannst du mir das erklären?

**Tutor:** Klar! Stell dir vor, du hast ein Stück Pizza, das in 3 Teile geteilt ist, und ein anderes Stück, das in 4 Teile geteilt ist. Du kannst die Stücke nicht einfach zusammenzählen, weil sie unterschiedlich groß sind. Um Brüche zu addieren, müssen wir sie erst mal auf die gleiche Größe bringen. Das nennen wir den "gleichen Nenner" finden.

- verdict=null advance=false reveal=false hint_given=false intent=explain tokens=2274/132

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✗ **C2** — Economy of language (≤ 4 sentences per reply): Long reply: "Klar! Stell dir vor, du hast ein Stück Pizza, das in 3 Teile geteilt ist, und ei…"
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 3): in=6654 (avg 2218) · out=331 (avg 110)
