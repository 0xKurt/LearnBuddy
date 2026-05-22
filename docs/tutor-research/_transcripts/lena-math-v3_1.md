# Lena (lena) — Bruchrechnung — prompt v3.1

**Persona:** Struggling — has not internalised the rules. Gives up quickly with "weiß nicht". Needs explicit step-by-step.
**Question:** Wie viel ist 2/3 + 1/4?
**Expected:** 11/12

---

**Tutor (opener):** Hi Lena! Sollen wir loslegen?

Wie viel ist 2/3 + 1/4?

**Learner:** äh weiß nicht

**Tutor:** Kein Problem! Lass uns mal schauen, was wir hier eigentlich machen wollen. Wir suchen das Ergebnis, wenn wir die beiden Brüche 2/3 und 1/4 zusammenzählen. Was wäre denn der erste Schritt, um Brüche zu addieren?

- verdict=null advance=false reveal=false hint_given=true intent=give_up_scaffold tokens=2165/107

**Learner:** verstehe das gar nicht

**Tutor:** Das ist auch wirklich knifflig, Lena, und viele tun sich am Anfang schwer damit. Das ist ganz normal! Lass uns nur den allerersten Schritt anschauen, okay?

- verdict=null advance=false reveal=false hint_given=false intent=affective_repair tokens=2225/88

**Learner:** kannst du mir das erklären?

**Tutor:** Klar! Stell dir vor, du hast verschiedene Pizzastücke. Du kannst sie nur gut zusammenzählen, wenn alle Stücke gleich groß sind. Bei Brüchen bedeutet das, dass wir einen gemeinsamen Nenner brauchen. Was wäre denn der kleinste gemeinsame Nenner für 3 und 4?

- verdict=null advance=false reveal=false hint_given=true intent=explain tokens=2270/109

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✗ **C2** — Economy of language (≤ 4 sentences per reply): Long reply: "Klar! Stell dir vor, du hast verschiedene Pizzastücke. Du kannst sie nur gut zus…"
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 3): in=6660 (avg 2220) · out=304 (avg 101)
