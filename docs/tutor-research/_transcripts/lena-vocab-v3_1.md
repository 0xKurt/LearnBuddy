# Lena (lena) — Uhrzeit — prompt v3.1

**Persona:** Struggling — has not internalised the rules. Gives up quickly with "weiß nicht". Needs explicit step-by-step.
**Question:** Was heißt "die Uhr" auf Französisch?
**Expected:** l'heure

---

**Tutor (opener):** Hi Lena! Sollen wir loslegen?

Was heißt "die Uhr" auf Französisch?

**Learner:** weiß ich nicht

**Tutor:** Kein Problem! Wir suchen das französische Wort für 'die Uhr'. Hast du eine Idee, wie man im Französischen oft ein 'l'' vor ein Wort setzt, wenn es mit einem Vokal anfängt?

- verdict=null advance=false reveal=false hint_given=true intent=give_up_scaffold tokens=2187/98 model=gemini-2.5-flash

**Learner:** hilf mir bitte

**Tutor:** Kein Problem! Das französische Wort für 'U

- verdict=incorrect advance=false reveal=false hint_given=false intent=evaluate tokens=2358 (cached=1955)/18 model=gemini-2.5-flash

**Learner:** kannst du mir das sagen?

**Tutor:** Das französische Wort für 'die Uhr' ist l'heure. Im Französischen wird oft 'l'' vor Wörter gesetzt, die mit einem Vokal beginnen, anstatt 'la' oder 'le'. Macht das Sinn, wenn du an andere Wörter denkst, die mit 'l'' anfangen?

- verdict=skipped advance=true reveal=true hint_given=false intent=reveal tokens=2377/112 model=gemini-2.5-flash

_(server would now pop the next item — scenario ends)_

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: ok
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 3): in=6922 (avg 2307) · out=228 (avg 76)
