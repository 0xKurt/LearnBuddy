# Lena (lena) — Uhrzeit — prompt v3.1

**Persona:** Struggling — has not internalised the rules. Gives up quickly with "weiß nicht". Needs explicit step-by-step.
**Question:** Was heißt "die Uhr" auf Französisch?
**Expected:** l'heure

---

**Tutor (opener):** Hi Lena! Sollen wir loslegen?

Was heißt "die Uhr" auf Französisch?

**Learner:** weiß ich nicht

**Tutor:** Kein Problem, das finden wir zusammen heraus! Es geht darum, wie man das deutsche Wort „Uhr“ ins Französische übersetzt.

- verdict=null advance=false reveal=false hint_given=true intent=give_up_scaffold tokens=2186/83 model=gemini-2.5-flash

**Learner:** hilf mir bitte

**Tutor:** Im Französischen gibt es ein Wort, das sowohl 'Uhrzeit' als auch 'Stunde' bedeuten kann. Kennst du ein französisches Wort, das mit 'Stunde' verwandt ist?

- verdict=null advance=false reveal=false hint_given=true intent=hint tokens=2220/94 model=gemini-2.5-flash

**Learner:** kannst du mir das sagen?

**Tutor:** Das französische Wort für 'Uhr' klingt fast wie das englische Wort für 'Stunde'. Kannst du dich erinnern, wie das englische Wort für 'Stunde' geschrieben wird?

- verdict=null advance=false reveal=false hint_given=true intent=give_up_scaffold tokens=2274/93 model=gemini-2.5-flash

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: no reveal
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 3): in=6680 (avg 2227) · out=270 (avg 90)
