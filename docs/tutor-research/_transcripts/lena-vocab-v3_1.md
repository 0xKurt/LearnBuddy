# Lena (lena) — Uhrzeit — prompt v3.1

**Persona:** Struggling — has not internalised the rules. Gives up quickly with "weiß nicht". Needs explicit step-by-step.
**Question:** Was heißt "die Uhr" auf Französisch?
**Expected:** l'heure

---

**Tutor (opener):** Hi Lena! Sollen wir loslegen?

Was heißt "die Uhr" auf Französisch?

**Learner:** weiß ich nicht

**Tutor:** Kein Problem! Wir suchen das französische Wort für 'die Uhr'. Hast du eine Idee, wie man im Französischen oft ein Wort abkürzt, wenn es mit einem Vokal beginnt?

- verdict=null advance=false reveal=false hint_given=true intent=give_up_scaffold tokens=2186/94

**Learner:** hilf mir bitte

**Tutor:** Im Französischen gibt es ein Wort, das sowohl 'Stunde' als auch 'Uhrzeit' bedeuten kann. Und es beginnt mit einem Vokal, daher wird der Artikel davor oft verkürzt.

- verdict=null advance=false reveal=false hint_given=true intent=give_up_scaffold tokens=2231/97

**Learner:** kannst du mir das sagen?

**Tutor:** Das gesuchte Wort ist „l'heure“. Das ist die Kurzform von „la heure“, weil „heure“ mit einem Vokal beginnt und der Artikel „la“ dann zu „l'“ wird. Wenn du das nächste Mal „Uhr“ oder „Stunde“ auf Französisch sagen möchtest, was fällt dir dann zuerst ein?

- verdict=skipped advance=true reveal=true hint_given=false intent=reveal tokens=2283/122

_(server would now pop the next item — scenario ends)_

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: ok
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 3): in=6700 (avg 2233) · out=313 (avg 104)
