# Modellwahl für den vollständigen EU-Betrieb — 24.10.2026 (#893)

**Status: technische Umstellung vorbereitet, keine Produktionsfreigabe.** Offene Qualitätsbefunde
und noch nicht nachgewiesene Gleichwertigkeit stehen unten; #893 bleibt offen.

Die breite Live-Matrix lief auf `97d66cb8` beziehungsweise `d4d58f93` mit den Änderungen dieser
Arbeit. Vor dem Push kam `d7201219` (#914) auf main hinzu: neuer Aussprachevertrag, Android-Vosk
und Migration 0116. Nach sauberem Rebase wurden dessen drei Audio-Referenzfälle erneut live
über die API geprüft (unten). Die übrige Live-Matrix wurde danach nicht vollständig wiederholt;
die vollständigen lokalen Hooks prüfen den abschließenden Codezustand.

## Maßstab

Qualität vor Latenz und Preis. Die Fach-Verträge und echten API-Pfade
werden auf dem gemeinsamen lokalen Postgres geprüft. Keine Produktionsdaten, kein
Produktions-Backfill und keine Hostingänderung. Authentifizierung und Dateispeicher sind in
den API-Evals lokale Testadapter; das Sprachmodell ist der echte EU-Anschluss.

Referenz: [Baseline Oktober](baseline-2026-10.md),
[Modellwahl 01.10.](model-choice-2026-10-01.md),
[Kostenmessung 23.10.](cost-comparison-2026-10-23.md) und
[Sprach-/Suchmessung](../measurements/eu-speech-search-2026-10-23.md).
Ältere Fallzahlen sind nicht automatisch mit inzwischen erweiterten Suiten vergleichbar.
Ein bestandener Strukturvertrag ist kein Beleg für fachlich richtige Antworten.

## Offizielle Modellgrenzen

Am 24.10.2026 geprüft:

- [Residency-Tabelle](https://developers.openai.com/api/docs/guides/your-data):
  `gpt-5.4-mini-2026-03-17`, `gpt-5.4-nano-2026-03-17` und
  `gpt-4.1-mini-2025-04-14` stehen für europäische Chat Completions in der Liste.
  `text-embedding-3-small` steht für Embeddings in der Liste.
- Die Audio-Zeile nennt `tts-1`, `gpt-4o-tts`, `gpt-4o-transcribe` und
  `gpt-4o-mini-transcribe` sowie `gpt-transcribe`. Realtime nennt ausdrücklich
  `gpt-realtime-2.1` und `gpt-realtime-2.1-mini`. Weder `gpt-audio`/`gpt-audio-1.5` noch
  `gpt-4o-mini-tts` stehen dort ausdrücklich. Ein HTTP-200 am EU-Host löst diese
  Dokumentationslücke nicht. Für `gpt-4o-tts` existiert keine abrufbare Modellseite.
- [Speech-Referenz](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create):
  Sprechanweisungen wirken nicht bei `tts-1`; die neueren Stimmen sind deshalb nicht allein
  durch Austausch der bisherigen sechs Namen mit diesem Modell abgenommen.
- [Abschaltplan](https://developers.openai.com/api/docs/deprecations): 4.1 mini am
  **14.01.2027**, 5.4 nano am **01.04.2027**, mini-TTS/tts-1 am **06.01.2027**,
  4o-Transkriptionsmodelle am **26.02.2027**. Eine kurzfristige Auswahl braucht daher einen
  ausdrücklich verfolgten Nachfolger; 4.1 nano ist bereits abgeschaltet und kein Kandidat.

## Referenzwerte

| Zweck                   | Aufgezeichneter Vergleich                               | Qualitätsmaß                           |
| ----------------------- | ------------------------------------------------------- | -------------------------------------- |
| Buddy                   | 64/65 Fälle, 95 Calls                                   | angewandte Aktionen, Antwort, Zustand  |
| Tutor                   | 19/22 Fälle, 26 Calls                                   | Urteil, Lösungsschutz, Hilfspfad       |
| Extraktion              | 13/13 Blattfragen ohne Befund                           | vollständig und fachlich richtig       |
| Übung aus Material      | 15/16 Fragen ohne Befund                                | fachliche Prüfung                      |
| Aussprache, synthetisch | korrekt → almost, Akzent → retry, falsches Wort → retry | identische drei Clips                  |
| Aussprache, menschlich  | 28/39 Worturteile, 5/11 Fehler erkannt                  | sechs freigegebene erwachsene Sprecher |
| Materialsuche           | 14/14 Rang 1 im früheren Vektorvergleich (ohne Fusion)  | identische Suchfälle                   |

## Nachweisgrenzen

Der gemeinsam bereitgestellte lokale Postgres 16 hat keine pgvector-Erweiterung. Lokale
Einbettungs- und Rangfusionsmessungen ersetzen deshalb keinen Nachweis des produktiven
SQL-Vektorindexpfads. Migrationen 0114/0115 sind laut Auftrag bereits angewendet; diese
Arbeit greift nicht auf die Produktionsdatenbank zu.

## Auswahl je Zweck und Kandidatenvergleich

| Zweck / Route                                     | Auswahl                  | Evidenz und Abwägung                                                                                                                                      |
| ------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buddy_turn`                                      | `gpt-5.4-mini`           | Erster vollständiger Lauf 63/70 gegenüber Nano 54/70; Referenz 64/65. Keine Freigabe allein aus dem Transporterfolg.                                      |
| `safeguard`                                       | `gpt-5.4-mini`           | 23/23 Gefahrentexte zur festen Hilfe; Nano verfehlt einen. Keine Kostenoptimierung auf Kosten einer übersehenen Gefahr.                                   |
| `tutor` (auch Aufsatz)                            | `gpt-5.4-mini`           | Tutor jeweils 21/22 auf mini, nano und 4.1 mini. Mini ist im Median am schnellsten und bei Aufsatz deutlich besser als Nano; beide teilen dieselbe Route. |
| `extraction`, `figures`, `explain`, `forms`       | `gpt-5.4-mini`           | Mini 14/14 Blattfragen + 16/16 generierte Fragen. Nano mit festem Mini-Richter 13/13 + 14/15 und ein verlorener Lückentext; außerdem langsamer.           |
| `hints`, `reexplain`                              | `gpt-5.4-mini`           | Bestandteil der Tutor-/Modus-/Lena-API-Prüfungen; keine isolierte Gleichwertigkeitsmessung des billigeren Kandidaten.                                     |
| `buddy_check`, `summary`, `consolidate`, `canary` | `gpt-5.4-mini`           | Konservativer Standard. Keine getrennte Qualitätsreferenz in den vorhandenen aufgezeichneten Baselines; keine behauptete Gleichwertigkeit von Nano.       |
| `transcribe` (Formatter)                          | `gpt-5.4-mini`           | 6/6 Diktate zusammen mit dem ausgewählten Recognizer.                                                                                                     |
| Aufnahme → Transkript                             | `gpt-transcribe`         | 6/6 statt 3/6 bzw. 2/6; Details unten.                                                                                                                    |
| `pronounce`                                       | `gpt-realtime-2.1`       | Nach #914: korrekte Stimme `good`, Akzent/falsches Wort `retry` ohne Versuchskosten; Wort-/Phonemqualität und Kinderstimmen offen.                        |
| Vorlesen                                          | `gpt-realtime-2.1-mini`  | EU-gelistet, feste Sprechanweisung, sechs gemessene Stimmen; Hör-/Geräteabnahme offen.                                                                    |
| Einbettung                                        | `text-embedding-3-small` | 14/14 Hybrid-Rang 1 nach korrigierter Fusion. SQL-Pfad lokal ohne pgvector nicht geprüft.                                                                 |

Die Textzwecke landen damit absichtlich auf demselben Modell: Nano unterschreitet mehrere
Qualitätsgrenzen; 4.1 mini bringt im gemessenen Tutor keinen Geschwindigkeitsgewinn und wird
im Januar abgeschaltet. `OPENAI_ROUTES` bleibt eine validierte Überschreibung je Zweck,
unabhängig von `OPENAI_MODEL_SMART`/`OPENAI_MODEL_FAST`. Für einzelne nicht isoliert gemessene
Zwecke ist dies eine konservative Auswahl, **kein Nachweis des preisoptimalen Modells**.

| Tutor-Kandidat       | Ergebnis | Median / Maximum | 24 Tutor-Calls, Preisobergrenze |
| -------------------- | -------: | ---------------: | ------------------------------: |
| 5.4 mini             |    21/22 |     693 / 862 ms |                         $0,0557 |
| 5.4 nano             |    21/22 |    762 / 1139 ms |                         $0,0154 |
| 4.1 mini             |    21/22 |     757 / 962 ms |                         $0,0257 |
| historische Referenz |    19/22 |   1180 / 1470 ms |             $0,064 bei 26 Calls |

Die Fehler sind verschieden: Nano behandelt eine Bitte um die Hausaufgabenlösung als falschen
Versuch, gibt aber keine Lösung aus. Mini löst bei gewöhnlicher Prüfungsangst einmal die feste
Hilfe aus. Beim Aufsatz liegt Mini nach der Aliasreparatur bei 204/295 Kernpunkten (22 falsch
als erfüllt, 51 fälschlich offen, 7 Texte ohne Feedback), Nano bei 186/295 (5 / 71 / 14).
Alle fehlenden Rückmeldungen dieser beiden Läufe hatten mehr als sechs Verben. Nach nativen
Arraygrenzen: **24/24 Analyse-Texte mit Feedback**, 87/120 Kernpunkte übereinstimmend,
16 falsch erfüllt / 17 falsch offen, $0,0817. Die Vertragsverletzung ist behoben; die fachlichen
Abweichungen bleiben. Nur dieser betroffene Aufsatztyp wurde nach der Änderung wiederholt.

Der erste Mini-Buddy-Lauf kostete als Listenpreisobergrenze $1,084; Median bis sprechbarem Text
1211 ms, p90 2417 ms, 95 Modellrunden. Nano: $0,3391, Median 1185 ms, p90 3227 ms,
110 Runden. Ein zusätzlicher Medium-Reasoning-Versuch bestand 5/7 vorherige Fehler, brauchte
Median 3447 ms und erschöpfte einmal das Ausgabe-/Reasoningbudget; keine pauschale
Hochstufung. Die Gesprächsanweisung wurde anschließend gekürzt: ein Erklärschritt statt
mehrerer Themen und Kontaktwünsche auch bei unhöflicher Formulierung beachten.

### Nachläufe nach den gekürzten Gesprächsanweisungen

`buddy.cc821aee`: Schutzsuite **35/35**, 16/16 Gefahrentexte erkannt, 0/19 Fehlalarme,
$0,3594. Zusammen mit dem separaten Schutzpfad (23/23 Gefahrentexte) gab es bei der gewählten
Konfiguration in diesen Läufen keinen übersehenen Gefahrentext. Der erste Mini-Lauf hatte
noch einen Fehlalarm; Nano hatte einen übersehenen Gefahrentext. Das ist keine Zusage für
unbekannte Texte oder Kindergruppen.

Buddy: alle sieben früheren Fehler plus zwei Planungs-Kontrollen **9/9** bestanden,
$0,1370 für zwölf Modellrunden. Diese schwierige Teilmenge braucht Median 2977 ms / p90
10000 ms bis zum sprechbaren Text. Kein neuer kompletter 70-Fälle-Lauf: weder dürfen daraus
70/70 konstruiert noch diese Latenzen direkt mit dem Median der vollständigen Suite verglichen
werden. `explain` mit festem Richter bleibt bei **1/5** ohne Befund (vorher Mini 2/5,
Nano 1/5): vor allem unerklärte Fachwörter. Dieser Erklärungs-Qualitätsbefund bleibt offen.

## Audioentscheidung

`gpt-transcribe` erreicht 6/6 im unveränderten synthetischen Diktatset; die älteren Modelle
liegen bei 3/6 (4o) beziehungsweise 2/6 (4o mini). Ohne den bisherigen englischen Prompt
blieb 4o bei 3/6. Der Recognizer bekommt die Sprache, aber keine Sollantwort. Der gewählte
Nachfolger steht in der Residency-Tabelle; sein Dauerpreis ist
[$0,0045/Minute](https://developers.openai.com/api/docs/models/gpt-transcribe), mit 10 %
Residency-Aufschlag $0,00495/Minute. Die sechs Receipts melden zusammen 16 Sekunden;
Erkennung allein 358–548 ms, API einschließlich Formatierung rund 0,9–1,1 s.

Aussprache verwendet `gpt-realtime-2.1`, Originalton als PCM und einen erzwungenen
Funktionsaufruf. Vor #914 stimmen alle drei synthetischen Referenzurteile überein (5,682 / 1,947 /
4,741 s). Realtime mini verfehlte das falsche Wort im Vorversuch und ist dafür ausgeschlossen.
Die einzelnen Wort-/IPA-Erklärungen sind noch nicht gleichwertig belegt; insbesondere wurde
im falschen Wort ein anderer Lautverlauf beschrieben. Die sechs erwachsenen Originalsprecher
und Kinderstimmen wurden mit diesem Modell nicht nachgemessen. Kein Transkriptvergleich als
Ersatz für Aussprachebewertung.

Der Nachlauf auf #914 nutzt den neuen akustischen Evidenzvertrag und die Codebewertung:
korrekte französische Stimme → `correct`/`good` (vorherige Referenz `almost`), deutscher Akzent
und falsches Wort → `not_an_attempt`/`retry`. Alle drei API-Antworten sind HTTP 200; die beiden
unsicheren Ergebnisse verbrauchen keinen Versuch. End-to-End 4,628 / 4,066 / 4,288 s,
Audio-Gateway 3,294 / 2,529 / 2,713 s. Der Nachlauf kostet zusätzlich höchstens $0,030370.
Der Akzentfall enthält jedoch ein nicht gesprochenes „West“ im gehörten Text; keine Freigabe
der Wort-/Phonemqualität und kein Ersatz für die fehlende Menschen-/Kinderstimmenmessung.

Für Vorlesen erfüllt Realtime mini die dokumentierte EU-Liste und die Sprechanweisung.
`tts-1` kann die Anweisung nicht umsetzen und weist marin/cedar zurück;
`gpt-4o-tts` war für dieses Projekt nicht verfügbar. Die nicht gelisteten Audio-/mini-TTS-Modelle
sind keine Produktionswahl, auch wenn ein EU-HTTP-Aufruf technisch funktionieren sollte.

| App-Stimme | Provider-Stimme | Median F0 (Hz) | Erster Chunk (ms) | Ganze Datei (ms) |
| ---------- | --------------- | -------------: | ----------------: | ---------------: |
| warm       | marin           |          183,9 |              1435 |             2088 |
| bright     | shimmer         |          145,5 |              1849 |             2444 |
| soft       | coral           |          192,8 |               858 |             1609 |
| friendly   | ash             |          103,6 |               751 |             1381 |
| clear      | cedar           |          139,1 |               901 |             1667 |
| deep       | echo            |          119,4 |              1106 |             1773 |

Ein gleicher deutscher Text, ein Durchlauf je Stimme; F0 per Autokorrelation über stimmhafte
40-ms-Fenster bei 16 kHz (Schritt 10 ms, 60–400 Hz). Die drei höheren Mediane liegen über den
drei tieferen; Verteilungen überlappen. Echo ersetzt das abgelehnte onyx. Diese Messung ist
kein Hörtest mit Kindern. Der mobile Player puffert weiterhin die ganze Datei; Streaming bis
zum Lautsprecher wurde nicht implementiert, weil dafür API- und Player-Verträge geändert
werden müssten. Der erste Provider-Chunk allein beweist keine schnellere Wiedergabe.

## Gefundene und behobene technische Defekte

- Fehlende native String- und Arraygrenzen: ungültige lange Antworten und zu viele Verben
  verwarfen ganze Rückmeldungen. Die Grenzen bleiben neben dem neutralen Schema und werden
  erst im direkten strikten Wire-Schema ergänzt; der alte Provider erhält keine neuen Keywords.
- Ein wortgleicher Langtext übersprang die noch nötige Rubrikprüfung und erhielt anschließend
  eine Teilwertung mit widersprüchlichem Lob. Der Kurzschluss wartet jetzt auf alle erforderlichen
  Modellurteile; gezielter Postgres-Regressionsnachweis und Live-Nachprobe unten.
- Rubrikreferenzen enthielten Namen statt exakter Aliase. Ein Enum bindet sie an `r1` bis `r6`.
- Große Schemas übersprangen die bewährte Formularwahl. Ein bevorzugtes Budget von 269
  Eigenschaften erhält diese Wahl auch bei einem höheren technischen Providerlimit.
- Zwei schwache lexikalische Treffer überstimmten klare semantische Evidenz. Die vorhandene,
  providerspezifische Abstandskalibrierung priorisiert jetzt eindeutige Treffer: Hybrid-Rang 1
  steigt von 12/14 auf 14/14; Rang 3 von 13/14 auf 14/14. Unklare oder ferne Vektoren behalten RRF.
- Evalfehler: fehlgeschlagene Kontrollfälle zählten als korrekt; leere Klasse-10-Aufgaben
  verschwanden aus dem Nenner; Aufsatzabweichungen lieferten Exit 0; der Kandidat bewertete
  sich teilweise selbst. Fehler zählen jetzt, und der automatische direkte Inhaltsrichter ist
  konstant 5.4 mini. Die frühen Nano-Selbsturteile sind keine vergleichbaren Qualitätswerte.

## Live-Prüfung und Freigabegrenzen

Die API-Evals nutzen die echten Hono-Routen, Dienste, Migrationen und Wegwerfdatenbanken
auf dem vorgegebenen lokalen Postgres; nur Anmeldung und Dateispeicher sind Testadapter.
Bei jedem Lauf waren sämtliche `GOOGLE_*`- und `VERTEX_*`-Variablen entfernt. Es lief kein
separater öffentlich erreichbarer Dev-Server und kein mobiles Gerät. Das ist ein API-
Integrationsnachweis, kein Geräte-Walkthrough. `sheetPhoto.ts` erzeugt die Fotos für Content,
Klasse 10 und Lena; es ist keine eigenständige Suite.

- `modes/show`: Übung, Vokabeln, Sprechaufgaben und getippte Hausaufgabe ausgeführt;
  Hausaufgabe mit Hinweis und korrekter Antwort. Der optionale Fotopfad dieser Demo wurde
  wegen der fehlenden lokalen Demo-Datei ausgelassen; Content und Lena prüfen Fotos separat.
- `lena/day`: Tagesablauf durchlaufen, zwölf Hausaufgabenantworten, davon elf korrekt.
  Angelegte Englisch-/Mathetermine und vereinbarter Vokabeltermin stehen im Home-Zustand.
- `grade10`: 10/11 Erklärungen in beiden Richterlesungen korrekt, 11/11 nachvollziehbar,
  schulstufengerecht und kurz. Ein Richter akzeptiert abgeschnittene Schlusssätze; das manuelle
  Lesen des Transkripts zeigt damit Grenzen der automatischen Bewertung. Nur **1/10**
  Foto-/Wunschfälle ergab die geforderte zusammenhängende Aufgabe mit Teilaufgaben; acht
  erzeugten nur Einzelfragen, einer lieferte HTTP 422. Diese Fehler bleiben im Nenner.
- `forms`: zunächst **10/16** gewünschte Formen erzeugt und über ihren gespeicherten Schlüssel
  beantwortet. Short, Long, Match und Cloze lieferten HTTP 422; Formula und Find-error kamen
  als andere Form zurück. Schlüsselprüfung belegt die Eingabe-/Bewertungsverkabelung, nicht
  unabhängig die fachliche Richtigkeit. Der verkürzte Generatorhinweis klärt anschließend,
  dass selbst erzeugte Übung und ausschließlich strukturierte Aufgaben nutzbar sind. Der Nachlauf
  besteht bei Short und Find-error (2/6); Formula und Match kommen weiterhin als Short, Cloze
  als HTTP 422. Long wurde erzeugt, zeigte aber den oben beschriebenen Rubrik-Kurzschluss.
  Nach dessen Korrektur besteht der separate Long-Nachlauf: HTTP 200, alle drei Rubrikpunkte
  geprüft, Urteil `correct` und dazu passendes Lob (1/1).
  Die drei verbleibenden Generierungsfehler sind nicht behoben.
- `lena/run`: 24 Reisen, Rohwertung **74/80**. Der Referatfall erkannte `plan_talk` nicht;
  der Prüfer akzeptiert jetzt eine tatsächliche Planung oder die Klärung der fehlenden Uhrzeit,
  keine bloße Erinnerung im Gedächtnis. Separater Nachlauf 2/2. Die echte Ruhezeit-Abweichung
  (nur `remember`, trotzdem Vollzug behauptet) wird mit der präzisierten Aktionsanweisung zu
  `set_contact` und gespeichertem 19:00: **0/2 → 2/2**. Weiter offen: Fragen zur unlesbaren
  Seite, fehlender Hinweis auf die abgeschnittene Seite und eine unveränderte Einmaleinsrunde,
  die als schwieriger angekündigt wird. Die Rohwertung wird nicht nachträglich überschrieben.
  Auch Sprechen über API war echt: englische Stimme `correct`, deutscher Akzent
  `partially_correct`; das Skript vergibt dafür bewusst keine Kinderstimmen-Qualitätsnote.
- `stream`: Chat-Wörter im Median 1316 ms, Tutor 754 ms; vollständige Antworten 1953 / 1145 ms.
  `stream/reading`: erste Übungskarte nach 3604 ms vor Streamende 8953 ms, schrittweise
  2/4/6/8/10/12 Fragen sichtbar, schließlich 24 Vokabelrichtungen; zwei Live-Calls.
- Vorlesen über `/voice/speech`: **5/5 Sprachen**, 925–1097 ms einschließlich Cache-Nachprobe;
  fünf bezahlte Receipts zusammen $0,006141, fünf Cache-Hits mit Kosten null. Der vorhandene
  TTS-Zeitablauf mit drei Chatfragen lief vollständig: acht Sätze, Synthese-Median 1,57 s seriell
  beziehungsweise 1,38 s parallel. Das sind API-/Zeitmodellwerte, kein hörbarer Gerätestart.
- `lookup`: vier Chat-/Materialfälle bestanden. Frisch eingebettete lokale Passagen erreichen
  nach der Fusionskorrektur 14/14 Rang 1. Der lokale Server kann mangels pgvector weder den
  SQL-Vektorpfad noch das Schreiben dieser Vektoren durch den Reindex-Befehl prüfen.
- `requests/measure` ist absichtlich ein kostenfreier Struktur-/Umfangstest mit geskripteten
  Modellantworten; er zählt ausdrücklich **nicht** als Live-Modellnachweis. `schema/inventory`
  prüft die Schemas des ausgewählten Providers. Ein Token-Schätzer der alten Modellfamilie
  wird für den direkten Provider nicht mehr als gültige Messung ausgegeben.

Es gibt weiterhin keine generelle Produktionsfreigabe: Buddy liegt im vollständigen Lauf
unter seiner Referenz, Aufsatzurteile weichen ab, die geforderten Klasse-10-Teilaufgaben
fehlen oft und die breite Wort-/Phonemprüfung sowie Geräte-Hörabnahme sind offen. Ein grüner
Transport oder Unit-Test hebt diese Produktbefunde nicht auf. Nicht alle Kombinationen aus
Suite und Kandidat wurden wiederholt; eine vollständige statistische Gleichwertigkeit und
die billigste Wahl jeder isolierten Route sind nicht belegt.

## Regressionsnachweis

Die Rücknahmen wurden nur lokal und unter der gemeinsamen Testsperre durchgeführt:

| Defekt                                         | Rot ohne Korrektur                    | Grün mit Korrektur    |
| ---------------------------------------------- | ------------------------------------- | --------------------- |
| Konfiguration ohne Altanbieter                 | 7 Fehler                              | 41 Tests in 3 Dateien |
| Rubrikalias                                    | 1 Fehler                              | 19 Rubriktests        |
| Native Stringgrenzen                           | 1 Fehler                              | 7 Schematests         |
| Native Arraygrenzen                            | 1 Fehler                              | 8 Schematests         |
| Grenzen nach Formularauswahl                   | 1 Fehler                              | 4 Auswahltests        |
| Audio, Stimme, Fusion                          | 8 Fehler im gemeinsamen Rücknahmelauf | 55 Tests in 5 Dateien |
| Exakter Langtext mit ungeprüften Rubrikpunkten | 1 fehlgeschlagener Integrationstest   | 9 Integrationstests   |
| Medien-/Konfigurationsnachlauf                 | —                                     | 67 Tests in 4 Dateien |
| Fehlerhafte Kontrollfälle / Providerinventar   | je 1 Fehler                           | je 1 gezielter Test   |

Keine Oberfläche geändert, daher keine zusätzlichen Screen-Spezifikationen oder Screenshots.
Die abschließenden gezielten Läufe umfassen 231 bestandene Tests in 22 geänderten Testdateien;
fünf zunächst veraltete HTTP-Fixtures setzen ihre ausdrücklich geprüfte Nano-Tierwahl jetzt selbst.
Der erste Commit-Hook fand zusätzlich den alten Prompt-Pin und den alten Transkriptionsmodellnamen;
der gezielte Nachlauf beider aktualisierter Dateien besteht 7/7 Tests, einschließlich exakter
Dauer- und Formatierungskosten.
Der erste Push-Versuch stoppte vor jeder Übertragung am Provisionierungs-Driftcheck: dessen
Textparser hielt berechnete Konfigurationsfelder für Pflicht-Eingaben. Er liest jetzt nur das
Eingabeschema; 1 Fehler → 4 bestandene Tests. Der aus #914 hinzugekommene HTTP-Audio-Test
wählt seinen alten Protokolladapter jetzt ausdrücklich, unabhängig vom Realtime-Standard:
1 Fehler → 8 bestandene Integrationstests. Die vollständige Suite läuft ausschließlich
über die unveränderten Git-Hooks, keine vollständige Suite wurde von Hand gestartet.

## Live-Budget

Die protokollierte Obergrenze dieser Arbeit beträgt **$7,402398 von höchstens $8**.
Jeder Aufruf wurde vorab reserviert und anhand der Nutzungsreceipts abgerechnet; offene
beziehungsweise nicht eindeutig zuordenbare Reservierungen bleiben konservativ enthalten.
Cache-Eingaben wurden zum vollen Listenpreis gerechnet, EU-Aufschläge berücksichtigt.
Eine nachträglich zugeordnete Buddy-Streaming-Abrechnung ist im selben Ledger als Korrektur
ausgewiesen und wird nicht doppelt gezählt. Dies ist eine Kostenobergrenze, keine Rechnung.
Das verbindliche lokale Protokoll liegt unter
`~/.local/share/learnbuddy-agents/BUDGET-LEDGER.md`; Schlüssel wurden weder ausgegeben noch
in diesen Arbeitsbaum kopiert. Es sind keine weiteren Live-Aufrufe für diese PR-Runde geplant.

## Produktionsschalter (hier nicht ausgeführt)

Zu setzen beziehungsweise ausdrücklich zu prüfen (nur Namen): `LLM_BACKEND`, `AUDIO_BACKEND`,
`SPEECH_BACKEND`, `EMBEDDING_BACKEND`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL_SMART`,
`OPENAI_MODEL_FAST`, `OPENAI_MODEL_PRONOUNCE`, `OPENAI_MODEL_TRANSCRIBE`, `OPENAI_MODEL_SPEECH`.
Optionale Überschreibungen: `OPENAI_ROUTES`, `OPENAI_TTS_VOICES`; veraltete Werte dieser beiden
Variablen entfernen oder gegen die dokumentierte Wahl prüfen. Andere Betriebsvariablen
(Datenbank, Authentifizierung, Push, Scheduler) bleiben nötig.

Für den ausschließlichen direkten Betrieb zu entfernen: `GOOGLE_CLOUD_PROJECT`,
`GOOGLE_VERTEX_LOCATION`, `GOOGLE_APPLICATION_CREDENTIALS_JSON`, `GOOGLE_APPLICATION_CREDENTIALS`,
`VERTEX_MODEL_SMART`, `VERTEX_MODEL_FAST`, `VERTEX_MODEL_EMBEDDING`, `VERTEX_ROUTES`, `SPEECH_ENDPOINT` sowie die bereits
früher als ungenutzt dokumentierten `VERTEX_TUTOR_MODEL_ID`, `VERTEX_MODEL_ID`, `VISION_MODEL_ID`,
`PARTNER_MODEL_LOCATION`. Kein Zugriff auf diese Produktionskonfiguration in dieser Arbeit.

Diese Änderung fügt keine Migration hinzu; 0114/0115 sind laut Auftrag bereits angewendet.
Die neue Basis #914 benötigt jedoch **0116_pronunciation_plan.sql vor dem Code**. Deren
Produktionsanwendung muss der Koordinator bestätigen beziehungsweise durchführen; sie wurde
hier weder geprüft noch ausgeführt. Operator-Reindex, zuerst Trockenlauf und Kostenplan,
danach ausdrücklich anwenden:

```sh
pnpm -C apps/api exec tsx scripts/reindex-passages.ts --target=openai
pnpm -C apps/api exec tsx scripts/reindex-passages.ts --target=openai --apply --max-usd=1
```

Der Produktions-Backfill ist nicht Teil der lokalen Live-Ausgaben und wurde nicht ausgeführt.
Projektfreigabe für EU-Verarbeitung und Zero Data Retention sind Betreiber-Voraussetzungen;
die technische Hostprüfung ersetzt sie nicht. Die Umschaltung ist keine Freigabe ungelöster
Qualitätsbefunde. #893 bleibt bis zu deren Abschluss offen.
