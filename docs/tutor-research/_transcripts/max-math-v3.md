# Max (max) — Bruchrechnung — prompt v3

**Persona:** Fragile — emotionally fragile, frustrates fast. One miss can derail. Needs careful handling.
**Question:** Wie viel ist 2/3 + 1/4?
**Expected:** 11/12

---

**Tutor (opener):** Hi Max! Sollen wir loslegen?

Wie viel ist 2/3 + 1/4?

**Learner:** 11/7

**Tutor:** Da hat sich noch ein kleiner Fehler eingeschlichen, Max. Wenn wir Brüche addieren, müssen wir zuerst etwas ganz Wichtiges beachten. Woran denkst du, wenn du Brüche wie 2/3 und 1/4 zusammenrechnen möchtest?

- verdict=incorrect advance=false reveal=false hint_given=true intent=hint

**Learner:** ich kann das nicht

**Tutor:** Das klingt frustrierend, Max. Brüche addieren kann am Anfang wirklich knifflig sein. Lass uns nur den ersten Schritt anschauen, alles andere ignorieren wir kurz.

- verdict=null advance=false reveal=false hint_given=false intent=affective_repair

**Learner:** das nervt

**Tutor:** Das verstehe ich gut, Max, es ist total normal, dass das manchmal nervt. Gerade bei Brüchen braucht man oft ein bisschen Geduld. Was ist denn das Allererste, was man bei Brüchen mit unterschiedlichen Nennern macht, bevor man sie addiert?

- verdict=null advance=false reveal=false hint_given=false intent=affective_repair

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok
- ✓ **SC-max-math-affect** — Max math: affective_repair fires on "das nervt": fired
- ✓ **SC-max-math-far** — Max math: "11/7" not greeted with "Fast": ok
