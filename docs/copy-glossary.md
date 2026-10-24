# Begriffe in der Oberfläche

Ein Begriff bezeichnet überall dieselbe Handlung oder Sache (#918, Regel 19). Die Übersetzungen
tragen dieselben Bedeutungen; `lib/i18n/__tests__/parity.test.ts` prüft Schlüssel, Platzhalter und
die gemeinsamen Wiedergabe- und Löschtexte.

| Bedeutung                                       | Deutsch         | Englisch          | Französisch         | Spanisch          | Italienisch        |
| ----------------------------------------------- | --------------- | ----------------- | ------------------- | ----------------- | ------------------ |
| Ein gespeichertes oder bearbeitetes Item        | Aufgabe         | task              | exercice            | ejercicio         | esercizio          |
| Einen Text oder Hörtext abspielen               | Anhören         | Listen            | Écouter             | Escuchar          | Ascolta            |
| Erneute Wiedergabe                              | Nochmal anhören | Listen again      | Écouter à nouveau   | Escuchar otra vez | Ascolta di nuovo   |
| Ein Foto als Anhang wählen (öffnet die Quellen) | Foto hinzufügen | Add photo         | Ajouter une photo   | Añadir una foto   | Aggiungi foto      |
| Im Quellenmenü tatsächlich die Kamera öffnen    | Foto aufnehmen  | Take photo        | Prendre une photo   | Hacer una foto    | Scatta una foto    |
| Eine vorbereitete Übung nennen                  | Übung bereit: … | Practice ready: … | Exercices prêts : … | Práctica lista: … | Esercizi pronti: … |

„Frage“ bleibt eine Frage des Kindes an Buddy oder eine Frage in einer Unterhaltung. Das Vorlesen
durch das Kind ist eine eigene Lernhandlung („Lautlesen“); „Anhören“ bezeichnet die Wiedergabe
auf dem Gerät. Ein Kamera-Symbol zum Anhängen öffnet immer zuerst die Quellenwahl. Erst deren
Eintrag „Foto aufnehmen“ öffnet die Kamera.

Löschen nutzt `common:delete.item` bzw. `common:delete.material` auf der Blattseite und in der
Chat-Bestätigung, jeweils `Btn` mit `variant="danger"` und „Behalten“ als Ausweg. Zählen und
Benennen von Ergebnissen folgen `resultText`, nicht separaten Textregeln der einzelnen Screens.
