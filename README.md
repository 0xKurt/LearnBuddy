# Screenshots: Aufgaben mit Material und Teilaufgaben a) b) c) (#297)

Branch `claude/train2-komplex-297`. Aufgenommen vom Browser-Walkthrough
(`tests/web/complex.spec.ts`) gegen die echte API mit geskriptetem Modell — jede Station auf
**390×844** und **360×740** (`-360`), hell und dunkel (`-night`), mit Fit-Prüfung (kein Scrollen
außer Material/Gespräch) und axe.

| Datei | Was man sieht |
|---|---|
| `70-complex-graph*` | Mathe von Buddy: Material mit Text **und Graph** oben angeheftet, darunter Teilaufgabe a); `a · b · c` in der ersten Zeile der Frage, ohne Zähler |
| `71-complex-folgefehler*` | Mathe c) mit **ihrem** falschen Ergebnis aus b) richtig weitergerechnet → „Richtig weitergerechnet – mit deinem Ergebnis aus b)" (nur hell: ein Themenwechsel lädt den Screen neu und öffnet die nächste Teilaufgabe) |
| `72-complex-text*` | Physik a): Material nur Text (Messwerte im Satz) |
| `73-complex-folded*` | Physik c) mit eingeklapptem Material: Name und „Material zeigen" bleiben, `✓a ✓b c` an der Frage |
| `74-complex-photo-chem*` | **Vom Foto** gelesen: Chemie (Reaktionsgleichung, Stoffmenge, Masse) |
| `75-complex-photo-source*` | Vom Foto: Geschichtsquelle mit 13 Zeilen, scrollt in sich (Zeilennummern wie im Schulbuch) |
| `76-complex-story*` | Deutsch: Kurzgeschichte, b) „Welches sprachliche Mittel steht in Z. 4?" |
| `compare-before-after.png` | Vorher (Lesetext-Panel aus #233, das einzige gemeinsame Material bisher — Teilaufgaben gab es nicht, jede war eine einzelne Frage ohne Material) neben Nachher |

Design-Runden (was sich geändert hat):
1. `a · b · c` stand zuerst im Kopf des Materials → lange Quellentitel wurden zu „Brief eine…"
   gequetscht. Jetzt an der Frage selbst (sie sagt, welcher Teil DIESE Frage ist).
2. Die aktuelle Teilaufgabe war eine lila Pille auf lila Karte → unsichtbar. Jetzt helle Pille wie
   „Frage von Buddy".
3. Material mit Graph bekam erst mehr Höhe → auf 360×740 verschwand Buddys Antwort unter der
   Karte (71). Jetzt derselbe Anteil wie ein Lesetext; der Graph scrollt mit dem Text, antippen
   öffnet ihn groß.
