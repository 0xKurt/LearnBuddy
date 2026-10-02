# Screenshots — #259 (neue Lernquellen) und #264 (Referat, Probevortrag, Lautlesen)

Aus dem Browser-Walkthrough `tests/web/talks.spec.ts` (echte App gegen echte API, geskriptetes
Modell, Fake-Mikrofon), Code-Stand `claude/train2-quellen-referat-259-264`. Jede Station bei
390×844 und 360×740 (`-360`), die neuen Bildschirme zusätzlich dunkel (`-dark`). `fit.ts` misst
jede Station: nichts muss gescrollt werden (nur der Lesetext darf in seiner Karte scrollen).

`composite.png` zeigt alle Stationen nebeneinander.

| Datei | Was |
| --- | --- |
| 90-talk-planned | Buddy plant das Referat im Chat: Tag und Schritte mit Daten, Rückgängig |
| 91-rehearse-offer | Karte „Probevortrag" mit „Aufnahme öffnen" unter Buddys Antwort |
| 92-rehearse-ready | Aufnahme-Bildschirm: was gemessen wird, Uhr gegen die Vorgabe, Mikro |
| 93-recording | während der Aufnahme (Stopp-Knopf, Uhr läuft) |
| 94-rehearse-result | Ergebnis: Dauer gegen Vorgabe in Worten, Tempo, Füllwörter, Aufbau (gehört / noch nicht) |
| 95-read-ready | Laut vorlesen: der Text aus Buddys Angebot |
| 96-recording | während des Vorlesens |
| 97-read-result | Tempo (richtig gelesene Wörter/min), Wörter zum Nachüben (ausgelassen/anders gelesen) |
| 98-corrected-ask | Buddy bittet um ein Foto der korrigierten Arbeit (Leiste oben) |
| 99-capture-corrected | Aufnahme-Bildschirm sagt, was fotografiert wird und dass Noten nicht gespeichert werden |

Nicht im Bild: der Hefteintrag „Was war heute?" nutzt denselben Aufnahme-Bildschirm mit eigenem
Titel; seine Übung erscheint am nächsten Morgen als normale „Übung bereit"-Leiste.
