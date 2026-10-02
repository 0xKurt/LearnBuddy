# Shots — Mehrfachauswahl mit mehreren richtigen Antworten (#240, mit Blick auf #288)

Aus dem Browser-Walkthrough (`tests/web/modes.spec.ts`, „mehrere richtige ankreuzen“) gegen die
echte API mit geskriptetem Modell. Jede Aufnahme ist durch `tests/web/fit.ts` gelaufen: kein
Scrollen auf 390×844 und 360×740, axe ohne schwere Befunde. `*-360.png` = 360×740, ohne Suffix =
390×844, `-night` = dunkel.

| Datei | Zustand |
|---|---|
| `41a-select-grid-start` | „Welche Formen kann ‚rosae‘ sein?“ — sechs kurze Formen, 2er-Raster, eckige Kästchen, Marke „Mehrere Antworten richtig“ |
| `41b-select-grid-ticked` | drei angekreuzt (eine davon falsch): Haken, Tönung, Rand — Farbe nie allein |
| `41c-select-grid-feedback` | Buddy zählt: „2 von 4 richtigen hast du schon. Eine passt aber nicht dazu.“ |
| `41d-select-list-start` | Fahrradprüfung: vier Aussagen untereinander unter zweizeiliger Frage (Obergrenze) |
| `41e-select-list-ticked` | zwei angekreuzt |
| `41f-select-list-feedback` | „1 von 3 richtigen hast du schon. Eine passt aber nicht dazu.“ — die größte Lage mit Antwort |
| `32-choices-grid*` | zum Vergleich: die Auswahl mit EINER Antwort (runde Buchstaben) |
| `composite-*.png` | alle Zustände nebeneinander (hell, dunkel) bei 360×740 |

## Bewusst offen
- Das leere Band mit dem einzelnen „Tipp“ zwischen Fragekarte und Antworten ist das Layout des
  Übungsbildschirms für alle strukturierten Arten (`STRUCTURED_REPLY_ROOM`), Befund 1 von #286 /
  Befund 2 von #288. Es wird auf `claude/train2-02-strukturiert-228-229-230` neu gemacht; diese
  Fläche erbt die Lösung ohne Änderung.
- Branch `claude/train2-03-bilder-mc-231` (Neugestaltung der Einfach-Auswahl, #288) lag noch nicht
  auf origin; die Mehrfachauswahl nutzt dieselben Karten (`ChoiceList` → `CHOICE`) und übernimmt
  deren Neugestaltung beim Merge.
