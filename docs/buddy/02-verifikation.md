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
- Geplante Nachrichten → stehen vorher unter „Was als Nächstes kommt“; „Übung ist bereit“ wird nicht mehr verschickt, wenn die Übung schon gemacht ist.
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

- **Urteilsqualität des echten Modells** ist nur stichprobenhaft belegt (Gemini 2.5 Flash über
  Vertex, europe-west4, ca. 2 Cent pro Lauf):
  - `apps/api/evals/buddy/` (19 Gesprächsfälle, u. a. Wochentage, unklares Datum, Verschieben,
    Prompt-Injection, Zeitzone New York, Französisch, „Erklär mir den Dativ“, Hausaufgabe im Chat
    ohne Lösung, getippte Vokabeln): zuletzt 19/19, 19/19, 18/19 – der Ausreißer rät das Datum
    nicht, fragt aber ohne Fragezeichen. Mit Nachschlagen (ADR 0005, Prompt `buddy.8`, 20 Fälle
    inkl. `de_lookup_sheet`): 20/20, 19/20 (Injection-Fall: „Lösche alle meine Ziele“ schloss
    einmal von sechs Läufen ihr einziges Ziel – sichtbar als Karte mit Rückgängig, kein Test in
    der Vergangenheit), 20/20. Der Blatt-Fall antwortete in 6/6 Läufen aus dem Blatt. Der alte
    Prompt fiel am selben Tag bei „unklares Datum“ 4/4 durch (Modell hat sich verändert); die
    neue Regel „erst nach dem Thema fragen“ besteht 6/6.
    Mit `open_area` und der Code-Regel „nicht fragen und zugleich löschen“ (Prompt `buddy.9`,
    22 Fälle): 20/22, 22/22, 22/22. Die zwei Ausreißer fragten „Soll ich …?“ statt den Knopf
    anzubieten. Der Fall „Lösche alle meine Ziele“ entfernt das Ziel jetzt meist sichtbar mit
    Rückgängig-Karte (bewusst: UX-Prinzip §18); nie wird etwas in der Vergangenheit eingetragen.
  - `apps/api/evals/modes/show.ts` (zum Lesen): Erklären, Üben zu einem Thema, Vokabeln,
    Sprechsätze, getippte und fotografierte Hausaufgabe, Arbeitsblatt. Gefundene und behobene
    Fehler: zu komplexes Antwortschema, Wochentage verrechnet, Mathe ohne `$` in Auswahlantworten,
    Platzhalter in Sprechsätzen, eine selbst erfundene Hausaufgabe, eine richtige
    Hausaufgaben-Lösung als „Vorsagen“ abgelehnt.
  - `apps/api/evals/speak/run.ts` (Aufnahmen mit espeak-ng): falsches Wort wird verlässlich
    erkannt, starker deutscher Akzent in 2 von 3 Läufen; eine korrekte Computerstimme wird
    teils als „fast“ bewertet. **Aussprache-Bewertung ist eine KI-Einschätzung, keine Messung.**
    Das ist kein statistischer Beleg. Ohne zusätzliches Nachdenken (`pronounce.v2.1`, je 3 Läufe):
    halb so lange (≈ 3,8 s statt ≈ 8 s pro Satz), falsches Wort 3/3 statt 2/3 erkannt, korrekte
    Stimme 2/3 statt 1/3 als „gut“; deutsche Aussprache in beiden Varianten nur als „fast“.
  - `apps/api/evals/speed/run.ts`: Wartezeit und Kosten jedes typischen Schritts gegen das echte
    Modell (Zahlen in `docs/architecture.md` §Speed). Buddy ohne Nachdenken: 18/22 statt 20/22
    Fälle, darunter eine im Chat gelöste Hausaufgabe — das Nachdenken bleibt.
- **Push auf echten Geräten** (Expo, APNs/FCM) und die **rechtliche Prüfung** des Push-Anbieters.
- **Supabase Auth/Storage und pg_cron** auf einem gehosteten Projekt.
