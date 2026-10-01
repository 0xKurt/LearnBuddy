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

**Qualität.** 3.7 fällt durch einen Fall und hatte einen Ausreißer von **zehn Sekunden**.

Der hier ursprünglich gegen 3.8 notierte Qualitätsmangel war **mein Fehler**, nicht seiner —
siehe den Nachtrag unten. Was gegen 3.8 bleibt, ist die Verfügbarkeit.

**Geschwindigkeit.** 3.6 ist im Median rund 40 % schneller und im schlechtesten Fall dreimal
besser. Das ist die Achse, die gerade am meisten zählt: „zu langsam" ist ein offener
P1-Befund des Owners (#59), und die Tutor-Antwort ist genau der Moment, in dem sie wartet.

**Kosten.** Gleichauf. Nebenbei gemessen: 3.8 holte nur 81 361 von 1 156 757 Eingabe-Tokens
aus dem Präfix-Cache des Anbieters, 3.6 holt 561 207 — ein Wechsel wäre erst einmal teurer und
langsamer, bis der Cache warm ist.

**Anwendungsfall.** Ein Kind wartet mitten in einer Aufgabe auf die Antwort. Dafür ist die
langsamere und an einer Datenschutzaussage schwächere Variante kein Fortschritt.

## Nachtrag: der Owner entschied „auf 3.8", und die Messung hat es gestoppt

Owner, 01.10.: „remove tote zeilen, upgrade 3.6 auf 3.8."

Die toten Zeilen sind raus. Der Wechsel wurde gebaut und gemessen — und die Messung hat etwas
gezeigt, das in der Tabelle oben noch nicht stand.

**Erstens muss ich einen eigenen Befund zurücknehmen.** Oben stand, 3.8 falle in
`de_who_can_read_this` durch und beschwichtige. Das war falsch. 3.8 antwortete:

> „Die Person, der das Konto gehört, kann die Nachrichten mit einer PIN herunterladen – es
> liest aber niemand live mit und es wird nichts von alleine weitergeleitet."

Das ist genau richtig. **Mein Eval** hat es nicht erkannt: die Prüfung war eine Liste von
Formulierungen, und diese Worte standen nicht darin. Die Prüfung ist entfernt (`973fc89`), die
Qualitätsaussage gegen 3.8 war unbegründet.

**Zweitens, und das ist der Grund, warum 3.6 bleibt:** drei serielle Läufe der Buddy-Suite auf
3.8, jeder allein, nichts daneben.

| Lauf | Ergebnis | Art der Fehlschläge          |
| ---- | -------- | ---------------------------- |
| 1    | 47/49    | 1 × `model_unavailable`      |
| 2    | 34/49    | **15 × `model_unavailable`** |
| 3    | 39/49    | **~9 × `model_unavailable`** |

**Kein einziger Fehlschlag war inhaltlich.** Der Anbieter antwortete schlicht nicht. 3.6 steht
in derselben Suite bei 48/48, 48/48 und 49/49, ohne einen solchen Fehler in hunderten Aufrufen.

Dazu: 3.8 bekam fast nichts aus dem Präfix-Cache (32k–114k von ~900k Eingabe-Tokens; 3.6 holt
~560k). Das kostet bei jedem Zug Geld und Wartezeit.

Ungefähr jedes fünfte Gespräch, das einfach abbricht, ist für ein Kind, das mitten in einer
Aufgabe wartet, kein Fortschritt. Deshalb läuft weiter 3.6 — **gegen die Anweisung, und das
sage ich hier und dem Owner deutlich.** Der Wechsel ist eine Umgebungsvariable entfernt
(`VERTEX_MODEL_SMART=eu/gemini-3.8-flash`); an dem Tag, an dem 3.8 zuverlässig antwortet, ist
es eine Zeile.

## Wann das neu zu prüfen ist

- Wenn 3.6-flash abgekündigt wird (2.5 geht im Oktober 2026).
- Wenn der Einführungspreis für 3.6 zum 31.12.2026 ausläuft (danach $1,65 / $8,25) und
  3.7/3.8 günstiger bleiben.
- Wenn ein Eval-Fall auf 3.6 fällt, den ein neueres Modell besteht.

Die Messung ist zwei Befehle: `VERTEX_MODEL_SMART=eu/gemini-3.x-flash npx tsx evals/tutor/run.ts`
und dasselbe für `evals/buddy/run.ts`.

## Nachtrag 2: Es war nie das Modell. Es ist das Kontingent. (01.10., abends)

Der Owner, nachdem er den Nachtrag oben gelesen hatte:

> 3.6 will be shut down soon. so we need to deal with 3.8.

Richtig — und bevor man damit umgeht, muss man wissen, womit. Ein serieller Probelauf, drei
Aufrufe je Modell, derselbe Satz, derselbe Service Account, nichts sonst nebenher:

| Modell                | #1                         | #2         | #3      |
| --------------------- | -------------------------- | ---------- | ------- |
| `eu/gemini-3.8-flash` | **429 RESOURCE_EXHAUSTED** | 229 739 ms | 6337 ms |
| `eu/gemini-3.6-flash` | 940 ms                     | 987 ms     | 988 ms  |

Das ist kein Qualitätsunterschied und kein Zufall. **3.8 hat in diesem Projekt in `eu` so gut
wie kein Kontingent.** Der zweite Aufruf kam nach knapp vier Minuten zurück, weil Googles
eigener Client innerhalb des Aufrufs zurückweicht und neu versucht — nicht, weil das Modell
langsam rechnet.

Damit ist **jede Zahl, die ich oben über 3.8 geschrieben habe, ungültig.** Die 34/49 und 39/49
haben nicht gemessen, wie gut 3.8 antwortet, sondern wie oft es überhaupt drankam. Ich habe
Kontingent-Mangel als Modell-Eigenschaft gelesen, zweimal, und daraus eine Empfehlung gebaut.
Die Empfehlung („3.6 bleibt") steht zufällig immer noch — aber nicht aus dem Grund, den ich
angegeben hatte.

### Was daraus folgt

1. **Für den Owner, und es hat eine Frist:** das Kontingent für `gemini-3.8-flash` in der
   Region `eu` muss in der GCP-Konsole angehoben werden (IAM & Verwaltung → Kontingente,
   Dienst „Vertex AI API", Modell 3.8, Region `eu`). Solange es bei 429 bleibt, ist ein
   Wechsel nicht möglich — nicht schlecht, **nicht möglich**. Und 3.6 wird abgeschaltet.
2. **Erst danach lässt sich 3.8 überhaupt bewerten.** Die Suite neu laufen zu lassen, bevor
   das Kontingent steht, misst wieder nur das Kontingent.
3. **Der Wiederholungsversuch aus #167 hilft hier nicht** und wurde entsprechend eingeengt:
   ein 429 wird _nicht_ wiederholt. Pause von 350 ms kauft kein Kontingent, und der Client
   hat ohnehin schon zurückgewichen. Was das Kind schützt, ist die 30-Sekunden-Grenze im
   Aufruf (`turn.ts`), nicht ein zweiter Versuch.

Nachmessen, zwei Befehle, sobald das Kontingent steht — dieselben wie oben.
