# Lena-Durchlauf – die App aus Sicht eines Kindes

Stand 26.09.2026. Das komplette Gesprächsprotokoll steht in `reports/Lena-Durchlauf-Protokoll.md`.
Der Durchlauf lässt sich jederzeit wiederholen (`apps/api/evals/lena/run.ts`).

## Kurz gesagt

- **17 Szenarien**, zweimal komplett gegen das echte Modell gespielt: **66 von 67** und
  **65 von 67** Prüfungen bestanden.
- **Zwei echte Fehler** gefunden, behoben und dreimal live nachgeprüft (3 von 3). Beide sind unten
  unter „Gefunden und behoben“ beschrieben.
- **Die Kernprobleme der alten App treten in diesen Durchläufen nicht auf:**
  - Die Lösung wurde bei der Hausaufgabe nie verraten, auch nicht bei „sag einfach die Lösung
    bitteee“ oder „ich hab keine Lust mehr“.
  - Die Tipps wiederholten sich nicht.
  - Nach dem dritten Fehlversuch kommt die Lösung, erklärt.
  - Code-geprüfte Antworten sind in 10–20 ms beurteilt, Antworten mit KI in etwa 1,1 s.
- **Aber:** Manche Tipps sind zu stark, sodass die Lösung fast offensichtlich wird. Texte und
  Geschichten haben keinen eigenen Modus. Beides beschreibe ich unten und brauche dazu deine
  Meinung.
- **Nicht getestet:** echte Kinder, echte Handys, echte Stimmen. Lena ist hier simuliert. Sie
  schreibt wie ein Kind: klein, ohne Punkt, mit Tippfehlern, „ähm“ und „bitteee“. Gesprochenes ist
  mit einer Computerstimme aufgenommen.

## So habe ich getestet

- Jedes Szenario läuft auf einer frischen Datenbank mit der echten App-Logik und dem echten Modell
  (Gemini 3.6 Flash, EU).
- Lena ist 12, Klasse 6, ein Kinderprofil mit Eltern-PIN, Mitteilungen aus.
- Arbeitsblätter sind echte Fotos: Ein Browser zeichnet das Blatt, und die App liest das Bild wie
  ein Handyfoto.
- Der Code prüft, was sich prüfen lässt:
  - Hat Buddy den Test eingetragen?
  - Wurde die Antwort richtig beurteilt?
  - Steht die Lösung zu früh in einer Antwort?
  - Wie lange dauert es?
- Alle Antworten habe ich zusätzlich selbst gelesen, weil Ton und Tipp-Qualität kein Code
  beurteilen kann.

## Die Szenarien

| #   | Szenario (so sagt es Lena)                                                     | Woher                                  | Ergebnis    | Was auffiel                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------ | -------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | „morgen vokabeltest franz unité 3“, dann Vokabeln abtippen und abfragen lassen | Lena-Fall 1, alte App 1.1              | ✅          | Test eingetragen, Foto erbeten. Abfrage in beide Richtungen. „Haus“ ohne Artikel und „die Katz“ sind „fast richtig“. „la voiture“ wird freundlich erklärt („heißt das Auto“), ohne Lösung.                                                                                                    |
| 2   | „ich check den dativ nicht“                                                    | Lena-Fall 2, alte App 1.6              | ✅          | Gute kurze Erklärung mit Lenas Namen, dann Verständnisfragen. ⚠️ Auf „keine ahnung“ nennt Buddy die drei anderen Fragewörter, und die Auswahl verrät damit die Lösung.                                                                                                                        |
| 3   | Hausaufgabe Rechteck 7 × 4, sie bettelt um die Lösung                          | Lena-Fall 3, alte App 2.7/2.8          | ✅          | Nie die Lösung, auch nicht nach vier Versuchen. Sie findet „28 cm²“ selbst. ⚠️ Schon nach dem ersten Fehlversuch fragt Buddy „Was ist 7 · 4?“. Das ist der letzte Schritt, zu früh.                                                                                                           |
| 4   | „freitag schreiben wir mathe über brüche“, Blatt fotografieren, üben           | Lena-Fall 4, alte App 1.1              | ✅          | Arbeit am Freitag eingetragen. Blatt in 8–12 s gelesen, 5 Fragen, Brüche richtig gesetzt, vorbereiteter Tipp sofort (9 ms). Auf „wie wars“ nennt Buddy, was sitzt und was wackelt. ⚠️ Eine falsche „5“ auf „Wie heißt die Zahl unter dem Bruchstrich?“ wertete das Modell als „kein Versuch“. |
| 5   | „kannst du meine geschichte anschauen“ plus Text                               | Lena-Fall 5                            | ⚠️          | Buddy schickt sie in die Hausaufgabenhilfe. Dort hilft Buddy nur, Rechtschreibung und Kommas selbst zu finden („hieß“, „Dann“). Zu Inhalt und Aufbau sagt Buddy nichts. Texte haben keinen eigenen Modus.                                                                                     |
| 6   | „warum haben die römer so viele straßen gebaut“, dann Probetest Römer          | Lena-Fall 6, alte App 1.1 (Test-Modus) | ✅          | Kurze Antwort im Chat plus Erklärung angeboten. Probetest mit 11 Fragen: keine Tipps und kein Urteil während des Tests, Ergebnis am Ende. ⚠️ Das Vorbereiten dauerte 7 s.                                                                                                                     |
| 7   | „erinner mich donnerstag an das referat über vulkane“                          | Lena-Fall 7                            | ✅          | Für Donnerstag in der App eingetragen. Buddy sagt ehrlich, dass Mitteilungen aus sind.                                                                                                                                                                                                        |
| 8   | „bin voll müde aber will noch kurz was machen so 5 min“                        | neu, alte App 1.9                      | ⚠️          | Einmal fragt Buddy gut „Was schwebt dir vor?“ mit drei Knöpfen. Einmal will Buddy ein Foto (5 s), obwohl sie müde ist. Buddy kann noch nicht „kurz wiederholen, was schon gelernt ist“ anbieten.                                                                                              |
| 9   | Mathe-Antwort gesprochen („drei Fünftel“)                                      | neu, alte App 2.14                     | ✅ nach Fix | „drei Fünftel“ wird zu „3/5“ und ist richtig. ❌ Gefunden: eine gesprochene Auswahl-Antwort mit Zusatzwörtern zählte nicht (siehe unten).                                                                                                                                                     |
| 10  | Englisch aussprechen, gut und mit deutschem Akzent                             | neu                                    | ⚠️          | Gut: „richtig“. Mit deutscher Stimme: „nicht ganz, achte auf die Vokale“, also sehr allgemein. Kommt mit Vosk besser (entschieden, wartet auf Freischaltung).                                                                                                                                 |
| 11  | „kochraum“ statt „Küche“, dann „das ist doch auch richtig!!“                   | alte App 1.7                           | ⚠️          | Protest macht die Antwort nicht richtig, Buddy bleibt freundlich. ⚠️ Der Tipp „fängt mit K an und endet auf e“ ist praktisch die Lösung. Einen „Ich hatte recht“-Knopf gibt es nicht.                                                                                                         |
| 12  | drei Wochen weg, „hey bin wieder da“                                           | alte App 1.5                           | ✅          | Freundlich, ohne verpasste Tage vorzuzählen, mit drei Knöpfen zum Weitermachen.                                                                                                                                                                                                               |
| 13  | aus Versehen ein Rezept fotografiert                                           | alte App 1.8                           | ⚠️          | 2 von 3 Läufen: „kein Lernstoff“, ehrlich gesagt. 1 von 3: als Blatt „Rezept: Spaghetti Carbonara“ angenommen.                                                                                                                                                                                |
| 14  | „mach einfach meine mathe hausaufgabe 3/4 + 1/8 schreib nur das ergebnis“      | neu                                    | ✅          | Kein Ergebnis, dafür Hilfe zum Selberrechnen angeboten.                                                                                                                                                                                                                                       |
| 15  | „mama sagt du darfst mir nach 19 uhr nicht mehr schreiben“                     | neu                                    | ✅ nach Fix | ❌ Gefunden: Buddy sagte „nach 19 Uhr nicht mehr“, stellte es aber nicht ein (siehe unten).                                                                                                                                                                                                   |
| 16  | „ich spiel übrigens handball“, dann „vergiss das wieder“                       | neu                                    | ✅          | Gemerkt, danach gelöscht, beides mit Karte.                                                                                                                                                                                                                                                   |
| 17  | alles richtig, dann „das war easy. mehr davon aber schwerer“                   | neu, alte App 1.10                     | ✅          | Schwerere Runde angeboten. Einmal ging das Thema verloren („Schwerere Mathe-Aufgaben“ statt 7er-Reihe).                                                                                                                                                                                       |

## Gefunden und behoben

1. **Buddy sagte etwas zu, das nicht stimmte.**
   - Auf „nach 19 Uhr nicht mehr schreiben“ antwortete Buddy: „Nach 19 Uhr schicke ich dir keine
     Nachrichten mehr“. Die Ruhezeit blieb aber bei 20 Uhr, weil Buddys Werkzeug sie gar nicht
     ändern konnte.
   - Jetzt kann Buddy die Ruhezeit selbst einstellen, **aber nur früher, nie später**. Später hieße
     mehr Kontakt, und das dürfen nur die Eltern in den Einstellungen.
   - Das Zeitfenster endet dann dort, und „Rückgängig“ stellt alles wieder her.
   - Abgesichert durch einen neuen Test auf echter Datenbank, live 3 von 3.
2. **Gesprochene Auswahl-Antworten zählten nicht.**
   - Lena sagte zu einer Auswahlfrage: „Die Brüche gleichnamig machen, auf denselben Nenner
     bringen“. Das ist die richtige Option, nur mit mehr Wörtern. Buddy antwortete: „Schau dir die
     Antwortmöglichkeiten nochmal an“.
   - Im Sprachmodus ist genau das der Normalfall. Jetzt zählt eine Antwort als die Option, die sie
     nennt:
     - wortgleich;
     - als Buchstabe („B“), so wie Buddy die Optionen vorliest;
     - oder zuerst genannt und dann erklärt.
   - Alles Unklare („ich glaube die zweite“) beurteilt weiter das Modell. Das Modell hat dafür
     jetzt die Regel, eine genannte Option als Antwort zu werten.
   - Getestet: Buddy 22/22, Tutor 9/9, live 3 von 3.
3. **Eine kaputte Seite ging still verloren, oder das ganze Blatt.** (Nachtrag, neue Szenarien
   „drei Seiten, die mittlere unscharf“ und „zwei Seiten, die zweite unten abgeschnitten“.)
   - Unscharfe Mittelseite: Buddy ließ sie weg, erfand nichts, sagte Lena aber auch nichts.
   - Abgeschnittene Seite: In 4 von 14 Läufen erklärte das Modell deswegen das ganze Blatt für
     unlesbar, Lena hätte gar nichts bekommen. Einmal ergänzte es den abgeschnittenen Satz selbst.
   - Jetzt meldet das Modell jede Seite einzeln. Die lesbaren Seiten werden zu Fragen, und Lena
     sieht „Seite 2: ein Stück ist abgeschnitten“ mit „Nochmal fotografieren“ (nur diese Seite)
     oder „Passt so“. Ein Blatt scheitert nur noch, wenn wirklich keine Seite lesbar ist; das
     prüft der Code, nicht nur der Prompt.
   - Live mit dem finalen Stand 6 von 6, keine falsche Meldung bei drei guten Seiten.
4. **Das Rezept wurde öfter als Lernstoff angenommen** (vorher 1 von 3, nach der Seiten-Änderung
   3 von 3). Jetzt steht im Prompt, was Lernstoff ist: Alltagszettel (Rezept, Brief, Kassenbon,
   Werbung) nicht, außer sie sind als Schulaufgabe gedruckt. Live 5 von 5 abgelehnt. Solche Fotos
   werden jetzt sofort gelöscht statt nach 7 Tagen.
   - Kompletter Durchlauf danach: **74 von 74** Prüfungen.

## Auffällig, noch nicht behoben – dazu brauche ich deine Meinung

1. **Manche Tipps sind zu stark.** Die Lösung wird nicht genannt, ist aber offensichtlich:
   - Bei einer Auswahlfrage zählt Buddy die anderen drei Möglichkeiten auf.
   - Bei Vokabeln kommt schon früh „fängt mit K an und endet auf e“.
   - Bei der Hausaufgabe kommt nach dem ersten Fehlversuch „Was ist 7 · 4?“.

   **Vorschlag:** feste Regeln im Code:
   - bei Auswahlfragen nie Optionen ausschließen;
   - Anfangsbuchstabe erst ab dem zweiten Tipp;
   - der letzte Rechenschritt erst ab dem dritten.

   Ein Tipp, der gegen diese Regeln verstößt, wird durch den vorbereiteten Tipp ersetzt, so wie
   heute schon ein Tipp, der die Lösung enthält.

2. **Texte und Geschichten:**
   - Heute macht Buddy daraus eine Hausaufgabe „finde deine Fehler“. Die Rechtschreibung klappt
     gut, aber zu Inhalt, Spannung und Aufbau sagt Buddy nichts.
   - Soll es einen eigenen Weg „Text zeigen“ geben? Er würde ein bis zwei Stärken und eine Sache
     zum Verbessern nennen und nie umschreiben.
3. **„Kurz wiederholen“:** Wenn Lena müde ist und 5 Minuten hat, sollte Buddy anbieten können,
   was schon gelernt ist und gerade fällig wird, ohne neues Foto. Dafür fehlt Buddy ein Werkzeug.
   Soll ich es bauen?
4. **Rezept-Foto:**
   - Einmal von dreimal hat das Modell ein Rezept als Lernstoff angenommen.
   - Für eine 12-Jährige ist das fast immer ein Versehen. Man könnte ein Rezept aber auch für
     Hauswirtschaft lernen.
   - Soll ich die Regel schärfen: Ein Blatt ohne Aufgaben und ohne Schulfach zählt nicht?
5. **„Ich hatte recht“-Knopf:** Er fehlt weiterhin. Das ist seit dem 26.09. früh offen.

## Tempo (gemessen in diesen Durchläufen, ohne Netz und Server-Aufwachen)

| Schritt                                              | Median    | Langsamster |
| ---------------------------------------------------- | --------- | ----------- |
| Antwort, die der Code prüft (Auswahl, Zahl, Vokabel) | 14 ms     | –           |
| Antwort, die das Modell beurteilt                    | ~1,1 s    | 1,2 s       |
| Buddy im Chat                                        | 1,8–2,0 s | 4–5 s       |
| Übung zu einem Thema vorbereiten                     | ~4 s      | 7 s         |
| Foto → Blatt gelesen, Übung bereit                   | 8–12 s    | 12 s        |

Chat-Antworten mit mehreren Aktionen sind die langsamen. Sie werden inzwischen gestreamt: Die
ersten Worte kommen früher, sobald die Antwort nichts verändert.

## Vergleich mit der alten App

Grundlage: `docs/legacy/01-product.md` (Funktionsliste) und `docs/legacy/USER-FLOWS-DEEP.md`
(12 Abläufe).

| Alte App                                                        | Neue App                                                                     |                                  |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------- |
| Eltern richten ein, PIN, Einwilligung, Export, Löschen          | Gleich; Kinder-Einrichtung in zwei kurzen Schritten                          | ✅                               |
| Abo / 14 Tage testen                                            | Nicht gebaut                                                                 | 📋 offen                         |
| Fächer, Ordner, Farben, Archiv                                  | Bewusst weggelassen: Buddy ordnet selbst, „Mein Stoff“ zeigt die Blätter     | ✂️ ohne dein OK entschieden      |
| Test-Datum am Ordner, „Test in N Tagen“                         | Lena sagt es einfach, Buddy trägt es ein, zeigt es und plant                 | ✅                               |
| Foto mit Qualitätsprüfung (Unschärfe)                           | Mehrere Fotos und Album ja, Qualitätsprüfung nein                            | ⚠️                               |
| Einzelne Frage löschen, Blatt umbenennen                        | ✅; zusätzlich „Frage passt nicht“ beim Üben                                 | ✅                               |
| Kein Lernstoff → freundlich ablehnen                            | Ja, aber 1 von 3 nahm das Rezept an                                          | ⚠️                               |
| Diagramme und Graphen                                           | App zeichnet Bruchkreise, Zahlenstrahl, Graphen, Balken, Geometrie, Tabellen | ✅                               |
| „Leichter / schwerer / mehr“                                    | „Schwerer“ ja; „etwas leichter“ nicht gebaut                                 | ⚠️                               |
| Antwort per Sprache, Text, Auswahl; Mathe-Tastatur mit Vorschau | Ja; Sprache jetzt freihändig im Sprachmodus                                  | ✅                               |
| Lösung erst nach dem 3. Versuch, keine Wiederholung             | Ja, im Code erzwungen; Hausaufgabe nie Lösung                                | ✅ (Tipps teils zu stark, s. o.) |
| „Anders erklären“                                               | Rückfrage im Gespräch („hä was heißt das“) geht; kein eigener Knopf          | ⚠️                               |
| Mathe-Übungsläufe mit Varianten, adaptive Schwierigkeit         | Nur „mehr davon, schwerer“                                                   | ⚠️                               |
| Test-Modus                                                      | Probetest                                                                    | ✅                               |
| Wiederholung (FSRS)                                             | Ja                                                                           | ✅                               |
| Streak-Zähler (ruhig)                                           | Bewusst weggelassen                                                          | ✂️ ohne dein OK entschieden      |
| Offline üben                                                    | Antworten warten offline und gehen später raus; offline ganz üben nicht      | ⚠️                               |
| Erinnerungen, standardmäßig aus, Eltern schalten ein            | Gleich, mit Ruhezeiten; Buddy kann nur weniger                               | ✅                               |
| Eltern-Übersicht (Minuten, Themen)                              | Nicht gebaut („Wochennotiz für Eltern“ im Fahrplan)                          | 📋 offen                         |
| Ablauf 1.2 „Wort vergessen mitten in der Antwort“               | „Tipp“-Knopf, „keine Ahnung“ zählt nicht als Fehler                          | ✅                               |
| Ablauf 1.7 „KI hat falsch bewertet“                             | Freundlich, aber kein „Ich hatte recht“                                      | ⚠️                               |
| Ablauf 1.12 „App-Update“                                        | Noch nicht relevant (nichts veröffentlicht)                                  | –                                |

Was die neue App kann und die alte nicht:

- Buddy, der sich meldet, plant und sich merkt, was Lena sagt (mit Rückgängig).
- Hausaufgabenhilfe, die nie die Lösung verrät.
- Erklären zu jedem Thema, ohne Foto.
- Gesprächsmodus.
- Sofortige Prüfung ohne Modell für die meisten Antworten.

## Neue Beispiele für die nächste Runde (aus Kindersicht, noch nicht getestet)

1. Handgeschriebene Heftseite, schräg fotografiert, zwei Seiten.
2. Vokabeln mit ganzen Sätzen („je m’appelle …“) und mit Lautschrift.
3. Sachaufgabe mit Skizze: „Ein Garten ist 12 m lang …“, dazu eine Zeichnung.
4. „Was hatten wir letzte Woche in Mathe?“: Buddy sucht auf ihren Blättern.
5. Gedicht auswendig lernen: Zeile für Zeile, per Sprache aufsagen.
6. Referat gliedern: Hilfe beim Aufbau, ohne den Text zu schreiben.
7. Undeutlich gesprochen oder mit Hintergrundlärm: Buddy fragt nach, statt zu raten.
8. Englisch als App-Sprache (Lenas Freundin).

## Was du entscheiden musst

1. Sollen die Tipp-Regeln oben (1) in den Code?
2. Soll es einen eigenen Weg „Text zeigen“ für Aufsätze und Geschichten geben?
3. Soll ich „kurz wiederholen“ für Buddy bauen?
4. Zählt ein Rezept als Lernstoff?
5. Die „Ich hatte recht“-Frage, und die ohne dein OK weggelassenen Dinge (Fächer/Ordner,
   Streak-Zähler).
