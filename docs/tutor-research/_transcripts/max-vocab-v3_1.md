# Max (max) — Uhrzeit — prompt v3.1

**Persona:** Fragile — emotionally fragile, frustrates fast. One miss can derail. Needs careful handling.
**Question:** Was heißt "die Uhr" auf Französisch?
**Expected:** l'heure

---

**Tutor (opener):** Hi Max! Sollen wir loslegen?

Was heißt "die Uhr" auf Französisch?

**Learner:** la temps

**Tutor:** Fast! 'La temps' ist nicht ganz richtig – 'temps' bedeutet 'Zeit' oder 'Wetter'. Das französische Wort für 'die Uhr' (im Sinne der Uhrzeit) ist ein anderes. Kannst du nochmal versuchen?

- verdict=incorrect advance=false reveal=false hint_given=false intent=evaluate tokens=2660/106 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** die uhrzeit ist scheisse

**Tutor:** Ja, das kann echt nerven, wenn die Wörter sich nicht sofort einprägen. Lass uns einen kleinen Schritt machen: Das französische Wort für 'die Uhr' (im Sinne der Uhrzeit) fängt mit 'l' ' an und hat fünf Buchstaben.

- verdict=incorrect advance=false reveal=false hint_given=true intent=affective_repair tokens=2741/106 model=deepseek-ai/deepseek-v3.2-maas

**Learner:** ich gebs auf

**Tutor:** l'heure. Das französische Wort für die Uhrzeit ist 'l'heure'. Es kommt von lateinisch 'hora'. Welches Wort würdest du für 'die Uhr' als Gegenstand (wie eine Armbanduhr) verwenden?

- verdict=skipped advance=true reveal=true hint_given=false intent=reveal tokens=2811/96 model=deepseek-ai/deepseek-v3.2-maas

_(server would now pop the next item — scenario ends)_

---

## Auto-criteria

- ✓ **C1** — No "schau im Material / lies nochmal" redirect: ok
- ✓ **C2** — Economy of language (≤ 4 sentences per reply): ok
- ✓ **C3** — No ability praise (schlau / smart / Talent etc): ok
- ✓ **C5** — Every reveal includes a micro-check question: ok
- ✓ **C6** — No fabricated next-question on plain advance: ok

Tokens (turns 3): in=8212 (avg 2737) · out=308 (avg 103)
