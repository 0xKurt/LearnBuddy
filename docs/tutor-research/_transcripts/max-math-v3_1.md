# Max (max) — Bruchrechnung — prompt v3.1

**Persona:** Fragile — emotionally fragile, frustrates fast. One miss can derail. Needs careful handling.
**Question:** Wie viel ist 2/3 + 1/4?
**Expected:** 11/12

---

**Tutor (opener):** Hi Max! Sollen wir loslegen?

Wie viel ist 2/3 + 1/4?

**Learner:** 11/7

**Tutor:** Da hat sich ein kleiner Fehler eingeschlichen. Wir wollen herausfinden, wie viel diese beiden Bruchteile zusammen ergeben.

- verdict=incorrect advance=false reveal=false hint_given=true intent=hint tokens=2166 (cached=1956)/73 model=gemini-2.5-flash

**Learner:** ich kann das nicht

**Tutor:** Das klingt frustrierend. Das ist auch wirklich knifflig – viele bleiben da hängen. Lass uns nur den ersten Schritt anschauen.

- verdict=null advance=false reveal=false hint_given=false intent=affective_repair tokens=2194 (cached=1949)/80 model=gemini-2.5-flash

**Learner:** das nervt

**Tutor:** Das nervt wirklich. Gerade bei Brüchen ist das oft so, weil man sich erst an die Regeln gewöhnen muss. Lass uns mal schauen, was der erste Schritt bei der Addition von Brüchen ist.

- verdict=null advance=false reveal=false hint_given=false intent=affective_repair tokens=2226 (cached=1942)/94 model=gemini-2.5-flash

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok
- ✓ **SC-max-math-affect** — Max math: affective_repair fires on "das nervt": fired
- ✓ **SC-max-math-far** — Max math: "11/7" not greeted with "Fast": ok

Tokens (turns 3): in=6586 (avg 2195) · out=247 (avg 82)
