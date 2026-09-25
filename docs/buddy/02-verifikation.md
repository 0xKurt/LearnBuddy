# Buddy: Was ist geprüft – und was nicht

Stand: 25. September 2026 · gehört zu [ADR 0004](../adr/0004-proactive-buddy.md) und
[Architektur](../architecture.md).

Dieses Dokument trennt streng zwischen **automatisch belegt**, **im Browser durchgespielt** und
**noch offen**. Nichts hier ist „produktionsreif“, nur weil es gebaut ist.

## 1. Automatisch belegt (bei jedem Commit)

Alle API-Tests laufen gegen eine **echte Postgres-Datenbank** mit den echten Migrationen (jede
Testdatei bekommt eine eigene Datenbank). Ersetzt werden nur die Außenwelt: das Sprachmodell
(festgelegte Antworten, die zusätzlich prüfen, was das Modell zu sehen bekommt), Push-Anbieter,
Anmeldung und Foto-Speicher, dazu eine gemeinsame Test-Uhr.

**Kernablauf** (`apps/api/src/__tests__/buddy-loop.int.test.ts`), ein Kind in Berlin:

1. _Kennenlernen_: „7. Klasse, Freitag Mathearbeit über Brüche“ → Stufe gespeichert, Arbeit mit
   vom Server berechnetem Datum, Weckzeiten 3 und 1 Tag vorher sowie am Tag danach, Bitte um ein Foto.
2. _Kontext behalten_: Das fotografierte Blatt wird im Hintergrund gelesen; der Foto-Schritt ist
   erst mit Nachweis erledigt.
3. _Selbst tätig werden_: Buddy bereitet sofort eine Übung vor; eine Nachricht nach außen
   unterbleibt, weil der Kontakt nicht erlaubt ist.
4. Ein Erwachsener erlaubt Kontakt mit der PIN – das Kind allein kann es nicht.
5. _Nützliches Ergebnis_: Übung mit Regelprüfung, einer vom Modell beurteilten freien Antwort,
   Wiederholungsschutz, Nachweis am Schritt, genau eine Spaced-Repetition-Bewertung pro Frage.
6. _Feedback verstehen_: „Mach die Übungen bitte kürzer“ → Präferenz mit wörtlichem Zitat.
7. _Anpassen_: Der nächste Weckruf sieht die Präferenz, bereitet höchstens 6 Fragen vor und
   schickt eine Push-Nachricht im Wunschzeitfenster; der Status steigt nur mit Belegen
   („angenommen“ → „an Apple/Google übergeben“), „geöffnet“ nie ohne App-Nachweis.
8. „Diese Woche keine Nachrichten, ich bin krank“ → befristete Situation und Pause bis Sonntag;
   der Weckruf am Samstag denkt, schickt aber nichts; die Situation verschwindet danach von selbst.

**Fehler und Unterbrechungen** (`buddy-robustness`, `delivery`, `learning`, `identity`):

- Dieselbe Nachricht zweimal (auch während sie läuft) → genau ein Modellaufruf.
- Veraltete Entscheidung (etwas änderte sich während das Modell dachte) → nicht angewendet, neu gefragt.
- Neue Nachricht während einer Runde → nur die neueste wird beantwortet, mit beiden im Blick.
- Ungültige Modellantwort → eine Reparaturrunde mit Begründung, danach ehrlicher Fehlschlag ohne erfundene Antwort.
- Modell nicht erreichbar / Tagesbudget erschöpft → ehrlicher Fehler; ausgefallene Aufrufe zählen nicht aufs Budget.
- Abgebrochene Runde (Prozess eingefroren) → der Scheduler übernimmt genau einmal, der alte Lauf kann nichts mehr veröffentlichen.
- Rückgängig machen → exakt die Änderung; verweigert, wenn sich seitdem etwas geändert hat.
- Mandantentrennung → fremde IDs „nicht gefunden“, Aliase des Modells erreichen nur eigene Daten.
- Minderjährige → Kontakt verringern allein möglich, lockern nur mit PIN; ein Kind kann die Eltern-PIN weder setzen noch ändern (ein Token-Refresh gilt nicht als Anmeldung).
- Zeitzonen und Zeitumstellung → Tokio-Abend richtig auf „morgen“ bezogen; doppelte Uhrzeit in New York wird nachgefragt statt geraten.
- Zustellung → unklarer Push-Ausgang wird nie wiederholt; abgemeldete Geräte werden deaktiviert; Rate-Limit wartet; Absturz beim Senden gilt als unklar; in der App wird nicht gepusht; zwei gleichzeitige Scheduler-Läufe erledigen alles genau einmal; Pausen erzeugen keinen Nachrichtenstau.
- Ohne Modell → feste, übersetzte Ersatzabläufe (vorbereitete Übung vor der Arbeit).
- Material → unlesbare Fotos, begrenzte Wiederholungen, Zeitüberschreitung beim Anbieter, Löschung entfernt Fotos sofort; Fotos werden nach 7 Tagen gelöscht.
- Abgebrochenes Senden → Fotos, die nie ganz ankamen, gelten nicht als „wird gelesen“ (Buddy bittet weiter um das Foto); nach einem Tag wird der Rest weggeräumt und angekommene Fotos sofort gelöscht. Dasselbe Senden nach Erfolg nochmal → kein zweiter Upload.
- Warten auf Buddy → Solange Buddy auf die eigenen Fotos oder eine gerade beendete Übung reagiert, zeigt die Startseite das an. Ist das Modell in dem Moment kurz weg, bereitet der feste Ersatzablauf die Übung sofort vor, statt erst zehn Minuten später.
- Übung ohne Modell → nichts wird bewertet; Hilferufe sind keine Antworten; Tipps und Auflösen zählen ehrlich.
- Datenschutz → Export, Löschung mit 7-Tage-Frist und Abbruch, vollständige Kaskade.

## 2. Im Browser durchgespielt

`scripts/web-walkthrough.sh` baut die echte App fürs Web und spielt den Kernablauf in Chromium
durch (`tests/web/core-loop.spec.ts`), gegen die echte API mit Scheduler und Schema. Ersetzt sind
nur Anmeldung, Foto-Speicher und das Modell (feste Antworten aus
`apps/api/src/testing/scenarios/core-loop.ts`). Die Screenshots landen in
`test-results/web/shots`. Der Ablauf ist der Hauptfall der Zielgruppe (7.–12. Klasse):

1. Ein Elternteil legt das Konto an, stimmt zu, richtet ein Profil für Mia (Jahrgang 2013) ein
   und setzt die Eltern-PIN.
2. Mia sieht, wer Buddy ist, und drei Möglichkeiten zum Anfangen.
3. „Ich schreibe am Freitag eine Mathearbeit über Brüche.“ → Buddy trägt die Arbeit ein, bittet
   um ein Foto und fragt, ob es aufs Handy schreiben darf – das müssen die Eltern erlauben.
4. „Eltern fragen“ → PIN der Eltern → erlaubt.
5. Foto des Arbeitsblatts → gesendet → gelesen → Buddy macht von selbst eine Übung daraus und
   sagt es.
6. Übung: Zahl mit Komma, Auswahl, kurze und freie Antwort, jeweils geprüft; Zusammenfassung.
7. „Mach die Übungen bitte kürzer.“ → gemerkt, sichtbar unter „Was Buddy über dich weiß“ mit
   Mias eigenen Worten; dazu „Mein Stoff“ und die Einstellungen.

Das zeigt, dass die Oberfläche mit der echten API zusammenspielt. Es ersetzt keinen Test auf
echten Geräten (Kamera, Tastatur, Push, Bildschirmleser).

## 3. Nicht automatisch belegt

- **Urteilsqualität des echten Modells.** Die Tests prüfen die Maschinerie, nicht Gemini. Dafür
  gibt es `apps/api/evals/buddy/` (16 Fälle: Wochentage, genanntes Datum, unklares Datum,
  befristete Situation, Erinnerung, weniger Kontakt, Prompt-Injection, Zeitzone New York,
  Verschiebung, Klassenstufe, Ergebnis einer Arbeit, Korrektur, Französisch, junges Kind). Er
  braucht Vertex-Zugangsdaten und lief hier **nicht**.
- **Push auf echten Geräten** (Expo, APNs/FCM) und die **rechtliche Prüfung** des Push-Anbieters.
- **Supabase Auth/Storage und pg_cron** auf einem gehosteten Projekt.
