# Erste geprüfte Fragen vor dem Ende der Blattlesung (#870)

23.10.2026, `docs/architecture.md` §Material. Eine synthetisch fotografierte
Französischliste mit zwölf Wortpaaren, echte Formenwahl und Lesung, gemeinsame lokale
Postgres-Testinstanz. Authentifizierung und Fotospeicher ersetzt; keine Produktionsdaten.

| Messung ab Submit | Verifizierter Lauf |
| --- | ---: |
| Erstes Textstück der Lesung | 2.641 ms |
| Erste startbare Karte aus gespeicherten Fragen | 3.956 ms |
| Ende des Modellstreams | 9.726 ms |
| Vorsprung der Startkarte | 5.770 ms (59 %) |
| Beobachtete Kartenzahlen | 2 → 4 → 6 → 8 → 10 → 12 |
| Gespeicherte Fragen am Ende | 24, zwölf Paare in beiden Richtungen |
| Kosten | 0,015482 USD, eine Formenwahl und eine Lesung |

Die Karte verwendet die vorhandene Auswahl für ungefähr zehn Minuten; ihre Zahl ist
die Größe dieser vorbereiteten Übung, nicht die Gesamtzahl des Blatts. Gemessen wurde
über die echte Home-API in Abständen von 100 ms. Der Stream war bei Erscheinen der
Karte noch offen; am Ende war das Blatt vollständig und `ready`.

Ein erster Diagnose-Lauf kostete 0,020204 USD und zeigte trotz 14.701 ms Streamdauer
keine frühe Karte. Die Quellen- und Zweitfachfelder waren noch optional. Im
verifizierten Lauf sind diese bestehenden Felder im Ausgabeschema verpflichtend und
stehen vor den Fragen; die tatsächlich gelieferte Feldreihenfolge wurde protokolliert.
Die Anzahl der Schemaproperties und die eingeengten Leseanweisungen bleiben gleich.

Gesamt: **0,035686 USD, vier Aufrufe**, im lokalen Budgetbuch protokolliert. Die
temporär kopierte `apps/api/.env.local` wurde nach beiden Läufen entfernt.
Reproduzierbarer Einstieg: `apps/api/evals/stream/reading.ts`, unter der Testsperre.

Kein neuer Gerätelauf: Upload über Mobilfunk, Gerätepolling und die Zeit vom Senden
auf dem Telefon bis zur gerenderten Karte sind damit nicht gemessen. Die historischen
21 Sekunden sind keine kontrollierte Vergleichsmessung zu diesem Blatt.
