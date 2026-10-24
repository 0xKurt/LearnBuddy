# Themenvokabeln #940 — 24.10.2026

Basis nach Rebase: `989c448a` (Rot-Nachweis gegen `ef570387`); echte lokale Testdatenbanken auf dem gemeinsamen Postgres, EU-Endpunkt,
Modell `gpt-5.4-mini-2026-03-17`, synthetische Lernende Lena, Klasse 6.
[Messdaten einschließlich Varianten und Entwicklungsdurchläufen](vocabulary-940.json).

| Wunsch | Ergebnis des geprüften Laufs |
| --- | --- |
| Bekannte getippte Liste | 2 Paare, 4 Karten, Herkunft `typed` |
| Unbekannte Unit-3-Liste | Rückfrage, keine erfundenen Wörter und kein Angebot |
| 20 Wohnungswörter DE↔EN | 20 Paare, 40 Karten, Herkunft `buddy` |
| 20 französische Wörter, Deutsch zeigen | Ausgabe `practice`, 20 Fragen Deutsch→Französisch, 40 gespeicherte Karten |
| 20 englische Wörter im Chat | 20 nummerierte Paare unmittelbar in der Antwort, Antippen öffnet genau diese 40 Karten |

Semantisch geprüft: Artikel und Bedeutungen der deutschen und französischen Nomen,
Sprachzuordnung jeder Seite sowie Vorwärts-/Rückwärtsvarianten. Geprüfte englische Varianten
umfassen apartment/flat, hallway/corridor, sofa/couch und wardrobe/closet. Die Prüfung ist eine
Stichprobe; sie garantiert nicht jede künftig erzeugte Übersetzung.

Die Entwicklungsdurchläufe deckten falsche Rückwärtsvarianten, vertauschte Produktionsrichtung,
eine unerwünschte Chat-Ausgabe, ein als `typed` falsch eingeordnetes Thema und eine freie Liste
ohne Werkzeug auf. Daraus folgen die expliziten Seitenregeln, das begrenzte Nachdenken bei der
Generierung, der Strukturcheck mit Reparatur und die verbindliche Werkzeuganweisung.
Ein früher Eval-Check verlangte fälschlich ein Fragezeichen, obwohl die Antwort die Liste
anfordert; der Check akzeptiert jetzt auch diese Form der Rückfrage.

Nach der Routing-Schärfung bestanden drei Chat-Wiederholungen und ein weiterer kompakter Lauf.
Nach dem Rebase auf `989c448a` bestand die kombinierte Fassung (`buddy.ffc6b990`) alle fünf
Routing-, Mengen- und Kartenprüfungen in einem Batch. Die semantische Prüfung fand im Chatfall
eine falsche Rückwärtsvariante: „kitchen“ akzeptierte zusätzlich „das Badezimmer“. Die
Generieranweisung verlangt jetzt ausdrücklich die Prüfung gegen das eigene Paar statt einen
Nachbareintrag. Der gezielte Chat-Nachlauf (`generate.1c0492cb`) bestand auch die semantische
Prüfung aller Paare und Varianten. Die Tabelle und Rohdaten verwenden die ersten vier Fälle
des Rebase-Batches und diesen abschließenden Chat-Nachlauf.

Alle Entwicklungsaufrufe sind erfasst: **93 Aufrufe, 0,843792 USD**; das Ledger wurde nach jedem
Batch ergänzt. Der kombinierte Buddy-Systemtext bleibt mit 24.993 Zeichen unter der unveränderten
25.000-Zeichen-Grenze; das Turn-Schema bleibt bei 29.996 Zeichen. Nach dem Rebase bestanden
zusätzlich alle 38 Tests der vier betroffenen Vokabel-, Pin-, Streaming- und Budgetdateien.

Rot vor Grün: gegen die Ausgangsimplementierung scheiterten acht der ersten neun Regressionen.
Mit dem Fix bestanden 61 Tests in sieben geänderten Dateien, darunter 13 Vokabel-Integrationstests,
vier Prompt-Pins, der Streaming-Schutz und die Schema-Budgets. Alt-Fixtures enthalten nun
vollständige Paare; abgewiesene Kartenaktionen lassen vorhandene Wiederholungshistorie unverändert.
Rückwärtsvarianten vergrößern die Extraktionsschemas nicht.

Browser: `scripts/web-walkthrough.sh tests/web/topic-vocabulary.spec.ts` — zwei Tests bestanden,
360×740 und 390×844, hell/dunkel, vor der Anfrage, Chatliste und Antippen bis zur Vokabelkarte.
Die Screenshots wurden angesehen; die lokalen Server danach beendet. Kein nativer Build und
keine POCO-Installation. Die Produktionsdiagnose stammt aus der bereitgestellten
Koordinator-Evidenz, dokumentiert in `docs/architecture.md §Practice`; keine eigene Prod-Abfrage.
