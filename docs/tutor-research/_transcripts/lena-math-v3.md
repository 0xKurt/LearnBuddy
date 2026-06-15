# Lena (lena) — Bruchrechnung — prompt v3

**Persona:** Struggling — has not internalised the rules. Gives up quickly with "weiß nicht". Needs explicit step-by-step.
**Question:** Wie viel ist 2/3 + 1/4?
**Expected:** 11/12

---

**Tutor (opener):** Hi Lena! Sollen wir loslegen?

Wie viel ist 2/3 + 1/4?

**Learner:** äh weiß nicht

**Tutor:** Kein Problem! Wir wollen herausfinden, was das Ergebnis ist, wenn wir die beiden Brüche 2/3 und 1/4 zusammenzählen. Was ist unser Ziel?

- verdict=null advance=false reveal=false hint_given=true intent=give_up_scaffold tokens=4135/91

**Learner:** verstehe das gar nicht

**Tutor:** Das klingt frustrierend, Lena. Brüche können am Anfang wirklich knifflig sein. Lass uns nur den allerersten Schritt anschauen, um Brüche zu addieren.

- verdict=null advance=false reveal=false hint_given=false intent=affective_repair tokens=4179/88

**Learner:** kannst du mir das erklären?

**Tutor:** Klar! Stell dir vor, du hast eine Pizza in 3 Stücke geteilt und nimmst 2 davon (2/3). Dann hast du eine andere Pizza in 4 Stücke geteilt und nimmst 1 davon (1/4). Um sie zusammenzuzählen, müssen die Stücke gleich groß sein. Das heißt, wir brauchen einen gemeinsamen Nenner. Was wäre der kleinste gemeinsame Nenner für 3 und 4?

- verdict=null advance=false reveal=false hint_given=true intent=hint tokens=4224/145

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✗ **C2** — Economy of language (≤ 4 sentences per reply): Long reply: "Klar! Stell dir vor, du hast eine Pizza in 3 Stücke geteilt und nimmst 2 davon (…"
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 3): in=12538 (avg 4179) · out=324 (avg 108)
