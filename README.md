# Shots: Vermitteln, nicht nur abfragen (#298)

Branch `claude/train2-vermitteln-298`. Aufgenommen vom Walkthrough
(`tests/web/modes.spec.ts`, „shown step by step, then explained with a figure", hell und dunkel)
gegen die echte API mit geskriptetem Modell, je auf 390×844 und 360×740. Jede Aufnahme ging durch
`tests/web/fit.ts` (kein Scrollen außer im Gespräch) und die a11y-Prüfung.

| Datei | Zustand |
| --- | --- |
| `60-guide-offer-*` | Nach dem zweiten Fehlversuch: Buddys Angebot „Zeig's mir Schritt für Schritt" als eigene, weiche Zeile über „Tipp · Lösung zeigen". Vorher (main) gab es an dieser Stelle nur „Tipp" und „Lösung zeigen". |
| `61-guide-first-step-*` | Buddy zeigt den ersten Schritt; jede Rechenzeile steht auf eigener Zeile mit Linie links. Das Feld fragt „Deine nächste Zeile …", der Weg hinaus heißt „Selbst weiter", „Tipp" ruht. |
| `62-guide-miss-*` | Eine Zeile, die nicht folgt: Code nennt die Zeile davor und den Hinweis zu genau diesem Schritt. Kein Versuch gezählt. |
| `63-guide-solved-*` | Ihre letzte Zeile ist das Ergebnis: gelöst mit Hilfe („Richtig"), danach „Anders erklären" und „Weiter". |
| `64-explain-figure-*` | „Mit Beispiel" nach der gezeigten Lösung: die Erklärung mit einer Figur aus der Bibliothek (zwei Parabeln, a = 1 und a = 2), blasenbreit unter Buddys Antwort, antippbar. |

`composite-*.png`: alle Zustände nebeneinander (oben 390×844 hell, darunter 360×740 hell, 390×844 dunkel, 360×740 dunkel).

Was diese Bilder nicht zeigen: das Vormachen für Textfächer (Kernpunkte) — es ist per
Integrationstest belegt (`apps/api/src/__tests__/guide.int.test.ts`), im Walkthrough aber nicht
aufgenommen.
