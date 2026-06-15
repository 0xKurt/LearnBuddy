# Lena (lena) — Uhrzeit — prompt v3.1

**Persona:** Struggling — has not internalised the rules. Gives up quickly with "weiß nicht". Needs explicit step-by-step.
**Question:** Was heißt "die Uhr" auf Französisch?
**Expected:** l'heure

---

**Tutor (opener):** Hi Lena! Sollen wir loslegen?

Was heißt "die Uhr" auf Französisch?

**Learner:** weiß ich nicht

**Tutor:** Kein Problem, das klären wir. Das Wort „Uhr“ kann im Französischen zwei verschiedene Dinge bedeuten: einmal die Uhrzeit (wie spät es ist) und einmal das Gerät, das die Zeit anzeigt (die Armbanduhr oder Wanduhr).

Welche meinst du hier? Die Zeitangabe („Es ist drei Uhr“) oder das Ding an der Wand?

- verdict=skipped advance=false reveal=false hint_given=false intent=explain tokens=2660/139 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** hilf mir bitte

**Tutor:** Gern. Hier geht es um die Zeitangabe, also „wie spät es ist“. Auf Französisch ist das ein weibliches Wort, das mit einem Vokal anfängt. Es ist ein sehr kurzes Wort, das du schon mal gehört hast. Kannst du es erraten?

- verdict=null advance=false reveal=false hint_given=true intent=hint tokens=2778/103 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** kannst du mir das sagen?

**Tutor:** l'heure

- verdict=skipped advance=true reveal=true hint_given=false intent=reveal tokens=2854/45 model=deepseek-ai/deepseek-v3.2-maas

_(server would now pop the next item — scenario ends)_

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✗ **C2** — Economy of language (≤ 4 sentences per reply): Long reply: "Gern. Hier geht es um die Zeitangabe, also „wie spät es ist“. Auf Französisch is…"
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✗ **C5** — Every reveal includes a micro-check question: Reveal without micro-check: "l'heure…"
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 3): in=8292 (avg 2764) · out=287 (avg 96)
