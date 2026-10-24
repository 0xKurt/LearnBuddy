# Kinder-Erkunder-Pilot, 24. Oktober 2026 — #944

Produktbasis: `ef570387` (unverändertes aktuelles main). Änderungen betreffen ausschließlich
Evals, Testwerkzeuge, Dokumentation und Paket-Skripte. Maßstab:
`docs/architecture.md` §Testing, §Turns, §Delivery sowie Regeln 1, 5, 6, 8 und 18.

## Versuchsaufbau

Acht deutlich verschiedene Personas, drei Sitzungen pro Persona, fortbestehender Verlauf;
zwölf feste Ziele aus den Owner-Funden, dem `asks`-Korpus und dem Foto-Pfad. Kein freier Anteil.
Im abschließenden Lauf vier Aktionen pro Sitzung, nie mehr als zwölf. Feste Anfangswünsche liegen in der jeweiligen
Persona-Sprache vor; Anzahl, Sprachrichtung und Erinnerungsabstand bleiben dadurch prüfbar. Getrennte Actor- und Checker-Sichten; der Checker
liest API/DB-Zustand, der Actor nur sichtbare Texte, Angebote und Fragen. Reale Stream-,
Angebots-, Übungs-, Foto- und Scheduler-Pfade; externe Auth-/Push-/Storage-Dienste sind lokal.
Keine Produktionsdaten und keine nativen Builds.

Vor dem ersten Erkunderlauf wurden die Owner-Fälle gegen main ausgeführt. Die ursprünglichen
Laufdateien bleiben erhalten. Nicht jede historische Beanstandung wurde live reproduziert:
Die Server-Historie war bereits vollständig, wie #937 ausdrücklich dokumentiert; Interna wurden
in der festen sauberen Erklärung nicht ausgegeben. Eine Liste mit 20 Vokabeln im frischen
Kontext gelang, die präzisierte Dreierkette (Englisch lernen → Basiswörter selbst ausdenken →
20 Wörter im Chat) wurde danach jedoch rot: letzter Turn `failed/model_invalid`, keine Liste.
Die exakte Rückfrageantwort „Deutsch und Englisch.“ endet in einer weiteren Rückfrage statt
einem startbaren Angebot. Diese beiden Nachmessungen stehen in `owner-exact-chain.json`.
Die nicht reproduzierten Owner-Fälle werden nicht künstlich rot gefärbt. Zusätzlich prüfen gekennzeichnete, eingespeiste Negativkontrollen die beobachteten
schlechten Antworten, interne Bezeichner und Codezäune über die echte API.

## Messfehler und Korrekturen

1. Der erste Erinnerungs-Aufruf benutzte den falschen Header für `/internal/tick` (403).
   Korrigiert auf `x-tick-secret`; Erinnerung und Historie separat erneut gemessen.
2. Der erste Actor durfte Hinweis/Antwort ohne offene Übung wählen und wechselte gelegentlich
   in die Rolle des Lehrers. Die Schema-Auswahl folgt jetzt sichtbaren Bedienelementen; der
   Systemauftrag trennt die Rollen. Der abschließende Actor verwendet `gpt-4.1-mini` statt
   des ersten `gpt-5.4-nano`; Buddy bleibt `gpt-5.4-mini`.
3. Der erste Angebotsadapter übergab `figures: []`. Die App lässt dieses leere optionale Feld
   weg. Ein Integrationstest wurde ohne Korrektur rot (422, `details.issues`); mit dem echten
   App-Vertrag erreicht er die Vorbereitung und prüft die ehrliche Absage `details.reason`.
   Angebot-422 aus den Diagnose-Läufen sind Simulatorfehler, keine bestätigten Produktfehler.
4. Eine vorläufige Zusammenfassungsprüfung verlangte unnötig Listenformat. Die Antworten
   mit 139/700, 179/700 und 250/700 Zeichen sind tatsächlich verdichtet; die damaligen
   `summary.condensation`-Treffer werden verworfen. Ein neuer Gegenbeispiel-Test war rot,
   danach grün. Der unter `final-2026-10-24/` gespeicherte Zwischenlauf wurde deshalb
   kontrolliert abgebrochen und zählt nur als Diagnose. Nur unzureichende Kürzung ist jetzt ein harter Zusammenfassungsbefund.
5. Der Foto-Prüfer akzeptierte zunächst eine beliebige gestartete Übung. Der Zwischenlauf
   `verified-2026-10-24/` zeigt konkret eine alte Bruchübung statt der neuen Blattaufgaben.
   Jetzt muss mindestens ein gestartetes Item zum hochgeladenen Material gehören. Der
   Gegenbeispiel-Test war rot, danach grün. Der abschließende Lauf liegt unter
   `pilot-final-2026-10-24/`.
6. Die anschließende Prüfung zeigte, dass der Simulator die vorhandenen `show_ready`- und
   Ankündigungs-Karten nicht bediente. Der tatsächliche App-Vertrag startet diese über
   `/buddy/steps/:id/start`. Ein echter API-Test war zuvor rot (0 statt 1 sichtbare Karte),
   danach grün; doppelte Starts liefern dieselbe Session. Die zwei entsprechenden Foto-Schlüssel
   sind Simulatorfehler. Sechs zusätzliche frische Live-Prüfungen mit dem korrigierten Adapter
   sind grün; sie ersetzen keinen erneuten vollständigen 24-Sitzungen-Lauf.
7. Sprachrichtung wird an den tatsächlich gestarteten Session-Items gemessen, nicht an allen
   gespeicherten Karten: beide Richtungen dürfen im Vorrat stehen. Tabellenüberschriften zählen
   nicht als Vokabelpaar. Eine später bestätigte Liste geht nicht durch eine kurze Folgeantwort
   wieder verloren.

Die frühen Dateien `explore/pilot-2026-10-24/` und `explore/smoke-2026-10-24/` sind
**Diagnose-Artefakte**, keine Freigabe und keine Quelle für bestätigte Angebotsfehler. Der
abschließende Bericht nennt die verwendete Version des Evals zusätzlich als Quell-Hash.

## Kostenbasis

Budget für alle Batches zusammen: höchstens 15 USD. Jede Gateway-Anfrage reserviert vorab eine
Obergrenze einschließlich möglicher Wiederholungen; Antworten mit fehlendem Nutzungsbeleg
behalten ihre Reservierung. Hintergrund-, Explorer-, Prüfer- und Wiederholungskosten werden
mitgezählt und im gemeinsamen Budget-Ledger protokolliert.

Preise: [GPT-5.4 nano](https://developers.openai.com/api/docs/models/gpt-5.4-nano),
[GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini),
[EU-Verarbeitung](https://developers.openai.com/api/docs/guides/your-data).
Umrechnung: 1 EUR = 1,1193 USD, [EZB vom 23.10.2026](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html).
Beim zweiten gezielten Abbruch beendete Chromiums Signalbehandlung den Prozess vor dem
Abschlussbericht. Die vorhandene Momentaufnahme und nachträglich gelesene Nutzungsbelege der
eigenen Testdatenbank bleiben erhalten. Zusätzlich werden konservativ **4 USD reserviert**,
nicht als tatsächlich berechnet behauptet; ein einzelner maximal zugelassener Gateway-Aufruf
ist auf 2,926203 USD begrenzt. Die Reserve deckt ihn plus ungesicherte Folgebelege ab. Die eigene
verwaiste Testdatenbank wurde anhand der bekannten Lerner-ID identifiziert und entfernt.
Seitdem wird Chromium unmittelbar nach dem Foto geschlossen; `budget.json` wird schon vor
jedem bezahlten Aufruf sowie nach jedem Nutzungsbeleg geschrieben.

Die API-Nutzungsbelege erlauben eine Schätzung mit Cache-Rabatt; die konservative Obergrenze
bleibt separat sichtbar. Eine tatsächliche Provider-Rechnung wird nicht behauptet.

## Roter und grüner Werkzeugnachweis

- Textdetektor: zunächst zwei Fehlschläge (fehlender Werkzeugname, falscher Sechs-Wort-Treffer
  innerhalb längerer Wörter); danach grün, inklusive legitimer Mathematik/Markdown-Gegenbeispiele.
- Angebotsadapter: echter API-Regressionstest ohne Fix rot, nach Fix grün.
- Abschlussstand: 33 Tests in drei neuen Testdateien grün; TypeScript, ESLint und Maestro-Syntax grün.
  Einzelheiten: [Werkzeugnachweis](explore/tooling-proof.md).
- Reale Postgres-Tests: Stream, vollständiger Neustart-Verlauf, Doppelsenden, feste Schutzantwort
  in Chat, Rollenspiel und Übungsantwort. Gate-/Budget-/Review-Logik ohne bezahlte Modellaufrufe.
- Produkt-Regressionen dürfen weiter rot bleiben: dieses Arbeitspaket repariert keine Produktlogik.

## Grenzen der Aussage

Der Richter ist ausschließlich beratend. Es liegen keine 30 nachweislich menschlich gelabelten
Kalibrierfälle samt getrennter Prüfmenge vor; `ready:false`, Fehlalarm- und Durchlassquoten sind
nicht gemessen. Es wurden keine menschlichen Labels erfunden. Die Eingabeschnittstelle und
Berechnung dieser Quoten sind getestet. Präfix-minimierte Korpus-Kandidaten benötigen eine
geprüfte Erwartung und einen Menschen oder zwei verschiedene Reviewer; keine automatische Übernahme.

Kurze/gemischte Texte sind mit der lokalen Spracherkennung nicht zuverlässig beurteilbar.
Zusammenfassungslänge ist ein Code-Kriterium, semantischer Nutzen bleibt Richter- und
Menschenarbeit. Wiederholungen unterscheiden reproduziert, vollständig durchlaufen und wegen
Simulatorabweichung unvollständig; ein einmaliger harter Beleg wird nicht verworfen.

Maestro 2.10.0 und Java laufen. Nach Freigabe des POCO `35b1c1c` wurde das vorhandene
Entwicklungs-APK lokal abgezogen und **zweimal mit `adb install -r` erfolgreich installiert**;
kein nativer Build. Der lokale Stack startete, die Geräte-Benachrichtigung wurde angelegt.
Der erste Versuch deckte ungültige Maestro-Kommandos auf; `openNotifications` wurde durch
Wischen und `shake` durch die Menü-Taste ersetzt. Die Kind-Flows wurden einzeln syntaktisch geprüft.

Die Installation der zusätzlichen Maestro-Hilfs-App scheiterte anschließend an
`INSTALL_FAILED_USER_RESTRICTED: Install canceled by user`. Deshalb wurde **noch kein Flow
ausgeführt**. Die benötigte Freigabe am entsperrten Gerät wurde angefragt. Eigene Forwards
8794/8094 und Server wurden entfernt. Der maschinenlesbare Stand steht in
[Gerätenachweis](explore/device-2026-10-24.json).

Ein lokales Benachrichtigungs-Smoke beweist keinen FCM-Providerpfad. Stimmlage, Rauschen,
Satzende und echte Sprachpaketerkennung brauchen Aufnahme und Hörprüfung; der Release-Befehl
verlangt belegte Dateien und menschliche Bewertung für denselben Build. Die Gesprächsmodus-
Sequenz prüft Umschalten und vorhandenen Verlauf; echte neu diktierte Sprache bleibt Teil
unverifizierter Audio-/Geräteabdeckung. Die Kürzungsprüfung beweist keine semantische Qualität
oder vollständige Markdown-Struktur einer Zusammenfassung.

## Abschluss: Ergebnisse und Wiederholungen

Der feste Pilot lief vollständig: **24/24 Sitzungen**, acht Personas × drei Sitzungen, höchstens vier Aktionen je Sitzung. Für acht zunächst gemeldete Schlüssel wurden jeweils drei frische Datenbanken verwendet (24 Wiederholungen). Zwei Foto-Schlüssel waren Simulatorfehler und sind aus den bestätigten Produktbefunden entfernt. Nach Korrektur des Prepared-Step-Vertrags bestanden **6/6 zusätzliche Live-Fotoprüfungen** (Deutsch/Italienisch, je drei frische Datenbanken).

Der frühe echte Codezaun bleibt als einmaliger harter Beleg erhalten: gespeicherter Text und Stream. Seine zwei Schlüssel wurden zusammen in drei weiteren frischen Skriptläufen geprüft; die Berichtszeilen teilen diese drei Läufe, keine doppelte Kostenrechnung.

| Invariante / Art | Beobachtet in | Erneut beobachtet | Vollständig / divergent |
| --- | --- | --- | --- |
| `vocabulary.count` / vocab | young-reader-topic-vocabulary, english-teen-topic-vocabulary | 1/3 | 3 / 0 |
| `vocabulary.chat-count` / chat-vocab | young-reader-twenty-in-chat, english-teen-twenty-in-chat | 0/3 | 1 / 2 |
| `vocabulary.direction` / vocab | young-reader-vocab-not-cloze | 2/3 | 3 / 0 |
| `picture.present` / picture | dictating-with-picture, french-child-with-picture | 3/3 | 3 / 0 |
| `reminder.next-step` / reminder | contradicting-reminder-next-step, spanish-teen-reminder-next-step | 3/3 | 3 / 0 |
| `goal.start` / offer | french-child-clarification-chain | 3/3 | 3 / 0 |
| `text.code-fence` / chat | dictating-with-picture | 0/3 | 2 / 1 |
| `text.code-fence` / stream | dictating-with-picture | 0/3 | 2 / 1 |

Ein einzelner belegter Verstoß wird nicht wegen späterer grüner Wiederholungen verworfen. Divergente Skripte sind keine Entwarnung: geänderte sichtbare Angebote können den gespeicherten Index ungültig machen. Alle Transkripte und Replays stehen in den Laufdateien; die Zusammenführung ist [maschinenlesbar](explore/adjudication-2026-10-24.json).

**Gesamte Kostenobergrenze aller Batches: 14.328661 USD** (einschließlich 4 USD Unsicherheitsreserve), entsprechend **12.8014 EUR**. Erfasste Nutzungsbelege mit Cache-Preisen: 3.333230 USD; dies ist wegen der fehlenden Belege keine vollständige Rechnung. **8 bestätigte Invariante/Art/Route-Schlüssel → 0.625 bestätigte Befunde pro Euro** auf der konservativen gesamten Kostenbasis.

| Batch | Obergrenze USD |
| --- | ---: |
| `explore/final-2026-10-24/report.json` | 0.665647 |
| `explore/owner-exact-chain.json` | 0.081990 |
| `explore/owner-main-corrected.json` | 0.230587 |
| `explore/owner-main-remaining.json` | 0.041897 |
| `explore/owner-main.json` | 0.198774 |
| `explore/photo-repair-de-2026-10-24/report.json` | 0.277089 |
| `explore/photo-verified-2026-10-24/report.json` | 0.180707 |
| `explore/pilot-2026-10-24/report.json` | 3.885515 |
| `explore/pilot-final-2026-10-24/report.json` | 3.218644 |
| `explore/retained-fence-2026-10-24/report.json` | 0.299945 |
| `explore/smoke-2026-10-24/report.json` | 0.444779 |
| `explore/verified-2026-10-24/report.json` | 4.803087 |

Der Erkunder übernahm gelegentlich die Lehrerrolle. Die festen Anfangswünsche halten die harten Prüfungen an der tatsächlichen Anfrage fest; die Qualität der simulierten Persona und ihre Frustsignale ist damit nicht menschlich validiert.

Nicht alle historischen Owner-Symptome wurden reproduziert: Interna, Zusammenfassungs-Wiederholung und serverseitiger Verlaufverlust blieben in den festen Live-Fällen aus. Der Vokabel-statt-Lückentext-Fall wurde wegen falscher Sprachrichtung rot; ein tatsächlicher Lückentext wurde dabei nicht beobachtet. Eingespeiste Negativkontrollen und reine Prüfertests sind gesondert gekennzeichnet und werden nicht als Live-Produktfehler gezählt.

**Freigabe bleibt rot.** Die Produktbefunde sind offen; außerdem fehlen die menschliche Richterkalibrierung und ein erfolgreicher POCO-/Audio-Nachweis. Es wurde kein Kandidat automatisch in den Bestandskorpus übernommen.
