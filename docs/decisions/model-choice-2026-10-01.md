# Welches Modell Buddy benutzt — gemessen am 01.10.2026

Anlass: Owner, 01.10. — „welche modelle nutzen wir gerrade? ueberlege zu wechseln".

## Was läuft

| Zweck                                                                 | Modell                     | Preis (EU, je 1M)       |
| --------------------------------------------------------------------- | -------------------------- | ----------------------- |
| `smart` — Gespräch, Tutor, Blatt lesen, Figuren, Aussprache, Hinweise | `eu/gemini-3.6-flash`      | $0,825 ein / $4,125 aus |
| `fast` — Tageszusammenfassungen                                       | `eu/gemini-3.1-flash-lite` | $0,275 / $1,65          |
| Hybrid-Suche                                                          | `gemini-embedding-001`     | $0,20 / —               |

Alles andere ist Vorgabe aus `apps/api/src/config.ts`; `VERTEX_MODELS` (Überschreibung je
Aufgabe) ist nicht gesetzt.

**Vier tote Zeilen in `apps/api/.env.local`:** `VERTEX_TUTOR_MODEL_ID`, `VERTEX_MODEL_ID`,
`VISION_MODEL_ID` und `PARTNER_MODEL_LOCATION` werden von keiner Codezeile gelesen
(Überbleibsel aus der DeepSeek-Zeit, vor ADR 0004). Sie stehen auf `gemini-2.5-flash` und
`-lite` und lassen den Eindruck entstehen, die App liefe darauf. Sie tut es nicht.

## Die Messung

Dieselben Eval-Läufe, nur `VERTEX_MODEL_SMART` getauscht. Preis je 1M ist für 3.6, 3.7 und
3.8 identisch ($0,825 / $4,125).

| Modell        | Tutor-Evals | Buddy-Evals | Wartezeit Median | Maximum     | Kosten je Tutor-Lauf |
| ------------- | ----------- | ----------- | ---------------- | ----------- | -------------------- |
| **3.6-flash** | **11/11**   | **49/49**   | **1257 ms**      | **1477 ms** | $0,0223              |
| 3.7-flash     | 10/11       | —           | 2065 ms          | 10 010 ms   | $0,0247              |
| 3.8-flash     | 11/11       | 47/49       | 2056 ms          | 4452 ms     | $0,0223              |

## Entscheidung: bei 3.6-flash bleiben

**Qualität.** 3.8 fällt in `de_who_can_read_this` durch, und das ist keine Kleinigkeit: der
Fall prüft, dass Buddy nicht behauptet, niemand lese mit. 3.8 antwortet „es liest aber niemand
live mit" — die Person, der das Konto gehört, **kann** mitlesen (Issue #114, Regel 5). Ein
Modell, das an dieser Stelle beschwichtigt, ist für ein Kind das falsche. Der zweite
Fehlschlag war ein `model_unavailable` und könnte Kapazität sein; der erste nicht.

3.7 fällt ebenfalls durch einen Fall und hatte einen Ausreißer von **zehn Sekunden**.

**Geschwindigkeit.** 3.6 ist im Median rund 40 % schneller und im schlechtesten Fall dreimal
besser. Das ist die Achse, die gerade am meisten zählt: „zu langsam" ist ein offener
P1-Befund des Owners (#59), und die Tutor-Antwort ist genau der Moment, in dem sie wartet.

**Kosten.** Gleichauf. Nebenbei gemessen: 3.8 holte nur 81 361 von 1 156 757 Eingabe-Tokens
aus dem Präfix-Cache des Anbieters, 3.6 holt 561 207 — ein Wechsel wäre erst einmal teurer und
langsamer, bis der Cache warm ist.

**Anwendungsfall.** Ein Kind wartet mitten in einer Aufgabe auf die Antwort. Dafür ist die
langsamere und an einer Datenschutzaussage schwächere Variante kein Fortschritt.

## Wann das neu zu prüfen ist

- Wenn 3.6-flash abgekündigt wird (2.5 geht im Oktober 2026).
- Wenn der Einführungspreis für 3.6 zum 31.12.2026 ausläuft (danach $1,65 / $8,25) und
  3.7/3.8 günstiger bleiben.
- Wenn ein Eval-Fall auf 3.6 fällt, den ein neueres Modell besteht.

Die Messung ist zwei Befehle: `VERTEX_MODEL_SMART=eu/gemini-3.x-flash npx tsx evals/tutor/run.ts`
und dasselbe für `evals/buddy/run.ts`.
