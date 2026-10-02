# Screenshots — Proaktiv statt reaktiv (#59) · Wartezeit vom Gerät (#169)

Code: branch `claude/train2-proaktiv-59-169`. Echte App im Browser gegen die echte API
(gescriptetes Modell), je **390×844** und **360×740**, **hell** und **dunkel**.

| Datei | Zustand |
| --- | --- |
| `01-offer-preparing-*` | Buddy hat eine Übung angeboten und schreibt sie noch: die Karte sieht aus wie immer — „bereite vor" wird nie als „liegt bereit" gezeigt (Regel 5). |
| `02-offer-ready-*` | Die Fragen stehen: oben rechts „✓ Liegt bereit" (Chip, Ton `mint`, Text + Haken — Farbe ist nie das einzige Signal). Die Karte springt nicht: der Chip sitzt in der Kopfzeile. Ihr Tipp öffnet die Übung ohne weitere Anfrage. |
| `03-practice-opened-*` | Nach „Los geht's": die erste Frage, unverändert (der Übungsbildschirm selbst wurde hier nicht umgestaltet). |
| `composite-offer-390.png`, `composite-offer-360.png` | nebeneinander: vorbereiten hell · bereit hell · vorbereiten dunkel · bereit dunkel · geöffnet. |

Design-Runden: zuerst eine graugrüne Textzeile mit dünnem Haken (wirkte wie Systemtext), dann der
`success`-Chip (auf Lila matschig grau), jetzt `mint` mit Haken — ruhig in beiden Themes,
Kontrast `successText` auf `mint` ≥ 4,5 : 1.

Gemessen (docs/speed-audit.md §Proaktiv statt reaktiv, 300 ms Latenz je Anfrage, je 4 Läufe):
„Los geht's" → erste Frage **Median 671 ms → 139 ms**; Audio der nächsten Frage **358–373 ms nach
„Weiter" → 6,1 s davor**.
