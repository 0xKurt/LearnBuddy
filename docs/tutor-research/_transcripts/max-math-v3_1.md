# Max (max) — Bruchrechnung — prompt v3.1

**Persona:** Fragile — emotionally fragile, frustrates fast. One miss can derail. Needs careful handling.
**Question:** Wie viel ist 2/3 + 1/4?
**Expected:** 11/12

---

**Tutor (opener):** Hi Max! Sollen wir loslegen?

Wie viel ist 2/3 + 1/4?

**Learner:** 11/7

**Tutor:** Das ist noch nicht ganz richtig. Bei Brüchen

- verdict=incorrect advance=false reveal=false hint_given=false intent=evaluate tokens=2166/17

**Learner:** ich kann das nicht

**Tutor:** Das klingt frustrierend. Das ist auch wirklich knifflig – viele bleiben da hängen. Lass uns nur den ersten Schritt anschauen.

- verdict=null advance=false reveal=false hint_given=false intent=affective_repair tokens=2180/80

**Learner:** das nervt

**Tutor:** Das klingt frustrierend. Das ist auch wirklich knifflig – viele bleiben da hängen. Lass uns nur den ersten Schritt anschauen.

- verdict=null advance=false reveal=false hint_given=false intent=affective_repair tokens=2212/80

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok
- ✓ **SC-max-math-affect** — Max math: affective_repair fires on "das nervt": fired
- ✓ **SC-max-math-far** — Max math: "11/7" not greeted with "Fast": ok

Tokens (turns 3): in=6558 (avg 2186) · out=177 (avg 59)
