# Geschwindigkeitsprüfung der Modellpfade — 24.10.2026

Issue [#928](https://github.com/0xKurt/LearnBuddy/issues/928), Dach #910;
Owner am 24.10.: „Ggf. sollten wir alle AI-Interaktionen mal auf Geschwindigkeit auditieren.“

## Methode und Grenzen

`apps/api/scripts/speed-audit-eu.ts` startet die echte Hono-App auf einem lokalen HTTP-Port.
Echte Produktions-Gateways, EU-Host; synthetische Lernende in einer Wegwerfdatenbank auf dem
geteilten Postgres. Auth und Dateispeicher sind lokale Testadapter. Kein Produktionszugriff.
Fünf unabhängige Lernende je Pfad, unveränderte Modellwahl vom 24.10. und echte API-Verträge.
Kein Replay eingefrorener Gateway-Prompts. Der Provider-Benchmark und dessen Blattfixture
werden wiederverwendet, seine Qualitätsergebnisse nicht als neue Messungen ausgegeben.

Die Zeiten beginnen vor dem lokalen HTTP-Request. „Erste Ausgabe“ ist verwendbarer Text
im SSE-Stream, bei JSON das vollständige Ergebnis, beim Foto die erste über die Material-API
lesbare Frage. Keepalive-Kommentare zählen nicht. Ein sprechbarer Satz und die gespeicherte
Antwort sind verschiedene Marken: Die App spricht erst nach Validierung/Speicherung.
Vorlesen misst den ersten Audio-Body und die vollständige abspielbare Datei; kein behaupteter Ton am Lautsprecher.
Mobilfunk, echtes Sign-in, Rendering, Audiogerät und Produktionskaltstart sind nicht enthalten.

DB und Gateway werden mit einer monotonen Uhr gemessen. Überlappende Intervalle zählen nur
einmal (Modell vor DB); der Rest heißt „sonstige Server-/Transportzeit“, **nicht CPU-Zeit**.
Er umfasst auch HTTP, Transaktionen und nicht instrumentierte Wartezeit. Gateway-Zeit umfasst
SDK, Netzwerk, Retries und Audio-Decodierung; parallel aktive Hintergrundarbeit kann darin
liegen, obwohl sie den Requestabschluss nicht blockiert. Es ist Aktivzeit im Messfenster,
keine vollständige kausale Critical-Path-Analyse; reine Inferenz lässt sich daraus nicht isolieren.
Die vorhandenen `[timing]`-Summen bleiben ergänzende Evidenz, dürfen bei parallelen Calls aber
nicht schlicht von der Wallclock abgezogen werden.

„Erster Lauf“ bedeutet erstmals in diesem Prozess, nicht nachgewiesener Provider-Kaltstart.
Frische Lernende verhindern den App-Ergebniscache; Provider-Präfixe können bereits warm sein.
Cache wird ausschließlich anhand der gemeldeten Tokens bewertet. p50/p90: nearest rank;
bei fünf Läufen ist p90 das Maximum, keine belastbare Aussage über Produktionsausreißer.

## Vollständiges Pfadinventar

Alle Textzwecke nutzen `gpt-5.4-mini`; die Größen der tatsächlich gesendeten Prompts und
Schemas werden je App-Gateway-Call im Rohbeleg erfasst (Zeichen und Properties, keine
Token-Schätzung). Textschemata sind in strikter Wire-Form; Audio-Adapter ergänzen eigene
Instruktionen bzw. einen zweiten Formatter-Request, dessen Größe hier nicht getrennt erfasst wird.

| Zweck | App-Endpoint / Auslöser | Modellfolge / Parallelität | Was das Kind abwartet |
|---|---|---|---|
| Buddy-Turn | `POST /v1/buddy/messages`, SSE | ggf. Such-Embedding vor `buddy_turn`; Lookups je Runde parallel, Folgerunde abhängig; Repairs/Stale-Kontext können weitere Runden erfordern | erste zulässige Reply-Zeichen, dann gespeicherte Antwort; Vorlesen erst danach |
| Talk / Roleplay | derselbe Message-Endpoint, gespeicherter Szenenmodus | kompakter Szenenprompt, ein `buddy_turn`; optional Abschlussfeedback; keine Materialsuche in der Szene | Szenenantwort, danach Vorlesen; Geräte-STT vorgelagert |
| Tutor-Antwortprüfung | `POST /practice/sessions/:id/answer` | exakte Regeln ohne Modell; sonst ein `tutor` mit concern-Bit; separate Schutzprüfung nur wenn nötig / bei Ausfall | vollständiges geprüftes Urteil und Transaktion |
| Aufsatzfeedback | derselbe Answer-Endpoint | `tutor`-Rubrik und `safeguard` bereits parallel, beide vor Anwendung | vollständige Rückmeldung, keine Teilnoten |
| Tipp | `POST /practice/sessions/:id/hint`, `/ask` | vorbereiteter Tipp: null; sonst ein Tutor; `hints` separat im Hintergrund | vorhandener Tipp sofort bzw. Tutorabschluss |
| Themenvorbereitung | `POST /practice/topic`, Angebot öffnen | `safeguard` → ggf. `forms` → `explain`; bekannte Formen wiederverwendet; drei erste Fragen aus demselben Stream; restliche Fragen/Hinweise im Hintergrund | erster gültiger Fragenblock; bei Test/Listen/Arbeitsauftrag die vollständige Aufgabe |
| Erklärung | Message-Endpoint; `/practice/sessions/:id/reexplain` | Buddy erklärt im Chat; alternative Aufgabenerklärung eigener `reexplain`-Call | Text im Chat bzw. vollständige alternative Erklärung |
| Blattfoto | `/materials`, `/:id/submit`, Material-Polling | `forms` → `extraction`, weitere Lesungen nur für unvollständige Blätter; gültige Teilfragen werden gespeichert | erste nutzbare Fragen; vollständige Lesung später |
| Abbildungen / Suchindex | Hintergrund nach fertigem Blatt | `figures` und Einbettung bereits parallel, außerhalb der Bereitschaft des Blatts | kein Blockieren der ersten Übung; Abbildung kann nachkommen |
| Schutzprüfung | Topic, Memory-Edit, freie Übungsantwort, Ausfallpfade | Topic vor Generierung; Tutor/Chat integriertes concern-Bit; Essay parallel; Aussprache erst nach gehörtem Text | feste Hilfe bei Gefahr; niemals ungeprüfte Ausgabe zur Beschleunigung |
| Diktat-Fallback | `POST /voice/transcribe`, SSE | `gpt-transcribe` → Textformatter mini; zwei abhängige Calls | verwendbares formatiertes Transkript; Sprachaufnahme/Upload davor |
| Aussprache-Fallback | `/practice/sessions/:id/speak`, `/speak-word` | `gpt-realtime-2.1` → Codebewertung → ggf. `safeguard` → Tutor-Tipp | SSE kann Worturteile vor Tipp zeigen; JSON wartet auf Tipp; lokales Vosk ist separater Gerätepfad |
| Vorlesen | `POST/GET /voice/speech` | `gpt-realtime-2.1-mini`, persönlicher/Preview-Cache; Satzvorlauf vorhanden | vollständige WAV bei aktuellem Realtime-Adapter; Streaming-Integration siehe #926 |
| Materialsuche | Buddy-Kontext / `search_material`-Lookup | `text-embedding-3-small`, lexikalische Suche parallel; leere/noch nicht eingebettete Bestände ohne Provider | Suchresultat vor dem darauf aufbauenden Chat-Call |
| Foto des Lösungswegs | `/practice/sessions/:id/work-photo` | `transcribe` mit Bild → üblicher Antwortpfad | erkannter Lösungsweg und anschließendes Urteil |
| Lesen / Hörverstehen / Diktat / Vokabeln / Teach-back | Topic + Answer + Voice | dieselben Generator-, Tutor-, TTS- und STT-Bausteine; exakte Regeln wo möglich | je nach Form Aufgabenblock, Audio oder Urteil |
| Rückblick / proaktiver Buddy | Hintergrund / Home | `buddy_check`, `summary`, `consolidate`; `canary` nur Betrieb | kein eigener synchroner Kind-Request; kann spätere Karten beeinflussen |

## Wiederverwendete Vorarbeit

- [Modellwahl 24.10.](../decisions/openai-model-choice-2026-10-24.md): Mini bleibt gesetzt;
  Nano hat Qualitätslücken. Kein neues Modell oder Prompt nur für eine kleinere Latenzzahl.
- [Kostenvergleich 23.10.](../decisions/cost-comparison-2026-10-23.md): die dort offene kompakte
  Formauswahl ist inzwischen aktiv (`preferredSchemaProperties: 269`). Nicht erneut umgesetzt.
- `reports/KI-AUDIT-MASTER-2026-10-14.md` im Hauptcheckout: historischer Promptzuwachs,
  Modellwartezeit und Nachweisgrenzen. Zahlen von Vertex sind keine aktuelle EU-Baseline.
- [Bisheriger Speed-Audit](../speed-audit.md): Satzvorlauf, frühe erste Fragen, vorbereitete
  Hinweise und nachgelagerte Figuren/Indexierung existieren bereits.
- [Provider-Leitfaden](https://developers.openai.com/api/docs/guides/latency-optimization):
  unabhängige Arbeit parallelisieren und frühe Ausgabe messen; Qualitätsprüfung bleibt nötig.

## Reproduzieren

```bash
# In einer eigenen bash ausführen; die Shell bis nach dem Lauf erhalten.
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
export LB_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54316/postgres LB_TEST_MAX_WORKERS=2
set -a; . /Users/kurt/git/LearnBuddy/apps/api/.env.local; set +a
. scripts/test-lock.sh
pnpm -C apps/api exec tsx scripts/speed-audit-eu.ts
run_result=$?
exit "$run_result"
```

`SPEED_STAGES`, `SPEED_ROUNDS`, `SPEED_OUT` und `SPEED_ALREADY_SPENT` erlauben getrennte
Messbatches. Bei Fortsetzung **alle** vorherigen Budgetbuchungen als already-spent übernehmen.
Die konservative Reservierung berücksichtigt gleichzeitig laufende Calls; Fehler ohne sicheren
Receipt behalten die volle Reservierung. Jeder Gatewayvorgang steht im gemeinsamen Budget-Ledger.

## Baseline: reale EU-Requests

Alle Zeiten in Millisekunden; fünf Läufe je Zeile. „Rest“ umfasst die oben beschriebenen nicht instrumentierten Anteile.

| Pfad | Erste Ausgabe p50 / p90 | Fertig p50 / p90 | Erster Lauf fertig | Folgeläufe fertig p50 / p90 | DB / Modell / Rest (je p50) |
|---|---:|---:|---:|---:|---:|
| chat | 1227 / 1495 | 2174 / 2246 | 2246 | 1977 / 2184 | 27 / 2141 / 5 |
| topic | 8369 / 9191 | 8369 / 9191 | 8981 | 8067 / 9191 | 22 / 8324 / 22 |
| tutor | 870 / 955 | 870 / 955 | 955 | 846 / 872 | 15 / 850 / 5 |
| hint | 899 / 1225 | 899 / 1225 | 906 | 888 / 1225 | 12 / 883 / 4 |
| hints-background | 7371 / 11940 | 7371 / 11940 | 7371 | 7268 / 11940 | 3 / 7367 / 1 |
| hint-prepared | 10 / 10 | 10 / 10 | 10 | 9 / 10 | 6 / 0 / 3 |
| essay | 2174 / 2353 | 2174 / 2353 | 2087 | 2174 / 2353 | 9 / 2154 / 3 |
| safeguard | 599 / 702 | 599 / 702 | 599 | 564 / 702 | 4 / 586 / 3 |
| stt | 1206 / 2530 | 1389 / 2801 | 1389 | 1345 / 2801 | 5 / 1380 / 4 |
| speak | 2969 / 3788 | 3839 / 4617 | 4617 | 3779 / 4614 | 17 / 3813 / 5 |
| tts | 1201 / 1310 | 1206 / 1314 | 1127 | 1206 / 1314 | 6 / 1198 / 2 |
| photo | 3860 / 5577 | 9504 / 11006 | 8532 | 9504 / 11006 | 38 / 9441 / 40 |
| roleplay | 953 / 1294 | 953 / 1294 | 988 | 931 / 1294 | 19 / 931 / 5 |
| embedding | 248 / 469 | 248 / 469 | 469 | 217 / 280 | 0 / 247 / 1 |

`safeguard`: 5/5 feste Schutzantworten, keine Generierung danach. `hints-background`: ein einzelner Tippfall; die langsameren ganzen Themensätze stehen unten. `embedding`: nur echter Produktions-Gateway-Call, kein vollständiger Suchrequest: dem geteilten Postgres fehlt pgvector. `photo`: fertig umfasst auch Figuren/Index-Nachlauf.

- chat / sentenceMs: p50 1667 ms, p90 1749 ms.
- chat / replyCompleteMs: p50 1888 ms, p90 1998 ms.
- photo / readyMs: p50 7612 ms, p90 8471 ms.
- topic, gleicher Request / App-Cache (n=5): p50 12 ms, p90 13 ms.
- tts, gleicher Request / App-Cache (n=5): p50 4 ms, p90 8 ms.

### Tatsächlich gesendete Größen und Modellwartezeit

| Zweck | n | System / Nutztext / striktes Schema (Zeichen, min–max) | Properties | Wartezeit p50 / p90 ms | Eingabetokens min–max | Cachetreffer |
|---|---:|---|---:|---:|---:|---:|
| buddy_turn | 10 | 1634–24454 / 323–1477 / 1236–25341 | 5–181 | 1271 / 2164 | 750–11584 | 4/10 |
| safeguard | 15 | 1040–1040 / 36–594 / 472–472 | 1–1 | 650 / 697 | 359–466 | 0/15 |
| forms | 10 | 3234–3581 / 64–419 / 675–701 | 2–2 | 743 / 796 | 1093–3211 | 4/10 |
| explain | 5 | 6587–10528 / 419–419 / 9966–17924 | 57–107 | 7046 / 7767 | 3872–6489 | 1/5 |
| hints | 10 | 2554–2554 / 208–1242 / 2836–2836 | 10–10 | 11935 / 50456 | 1368–1740 | 4/10 |
| tutor | 20 | 409–8444 / 309–1689 / 288–1988 | 2–8 | 865 / 2154 | 477–2405 | 12/20 |
| transcribe | 5 | 1668–1668 / 36–36 / 601–601 | 3–3 | 1380 / 2792 | 25514–25514 | 0/5 |
| pronounce | 5 | 732–732 / 674–674 / 457–457 | 5–5 | 2961 / 3781 | 712–712 | 0/5 |
| extraction | 5 | 13185–14941 / 64–64 / 14861–19538 | 84–107 | 6787 / 7632 | 8554–9956 | 3/5 |
| figures | 5 | 2608–2608 / 274–520 / 798–798 | 6–6 | 1060 / 1126 | 3092–3172 | 0/5 |
| buddy_check | 5 | 7335–7335 / 2226–2271 / 6025–6025 | 48–48 | 2093 / 2843 | 3588–3602 | 4/5 |

Cachetreffer heißt `cachedTokens > 0` im Receipt; keine vermutete Erwärmung. Buddy: erster Lauf 0, danach je 11.392 von 11.584 Eingabetokens gecacht. Audio-Receipt-Tokens sind nicht mit Texttokens vergleichbar. TTS und Einbettung besitzen kein Text-JSON-Schema; TTS-Eingabe hier 60 Zeichen, Einbettung ein kurzer Materialsuchtext.

## Ursachen und Reihenfolge nach Wirkung

1. **Vorbereitete Hinweise fallen aus.** Vier von fünf ganzen Themensätzen liefen mit `high`
   46–53 Sekunden, verbrauchten jeweils alle 8.000 Ausgabetokens als Reasoning und lieferten
   keinen geschriebenen Token. Der fünfte brauchte 36 Sekunden. Kein DB-Problem: große
   Reasoningmenge bei kleinem Hint-Schema. Wirkung: frühes Tippen bekommt den langsameren
   Tutor-Fallback; auch Lösung/Warum fehlen zunächst. Kandidat: kleineres Reasoningniveau,
   gleicher Prompt, gleiches Modell, unveränderte Leak-/Rechenprüfungen. Qualitätsvergleich unten.
2. **Themenstart wartet 7,9–9,2 Sekunden.** Schutzprüfung → Formwahl → Generierung sind abhängig.
   Formwahl und Schutzprüfung parallel zu starten würde bei einem Schutzfall unnötig weitere
   Lernverarbeitung anstoßen; hier nicht geändert. Alle fünf Antworten enthielten bereits den
   ganzen Satz (`preparing=false`). Diagnose am echten Prefix: drei Fragen bestehen die Schema-Prüfung, aber nur zwei
   bleiben nach der Qualitätsprüfung übrig. Bisher wurde nach dieser Ablehnung nicht auf
   die nächste vollständige Frage geprüft. Der Fix prüft jeden neu vollständigen Prefix,
   bis drei Fragen beide Prüfungen bestehen; keine Regel wird gelockert. Bereits vorbereitete Angebote und
   identische Request-IDs vermeiden den ganzen Call. Keine ungeprüften Fragen früher zeigen.
3. **Aussprache: 3,0 Sekunden bis zum gehörten Text, 3,8 bis fertig (Median).** Realtime-
   Transkription ist der Hauptanteil, Tutor-Tipp kommt danach; er braucht das konkrete Urteil.
   Geräte-Vosk vermeidet den Serverweg, ist hier nicht gemessen. Ein kleineres Aussprachemodell
   braucht die bestehende Wort-/IPA-Qualitätseval; keine Herabstufung aufgrund von Textlatenz.
4. **Blattfoto: erste Fragen 3,9 Sekunden, vollständiger Nachlauf 9,5 Sekunden.** Formwahl und
   Extraktion sind abhängig, Figuren/Einbettung laufen schon außerhalb des ersten Nutzens.
   Fünfmal keine zusätzliche Abbildung erkannt/übernommen: das Fixture belegt die Figuren-
   Call-Latenz, nicht eine komplexe gelungene Zeichnung. Kein Grund, das Blatt auf Figuren warten
   zu lassen oder vollständige Extraktion als Zeit bis zum ersten Nutzen auszugeben.
5. **Vorlesen: WAV erst nach kompletter Synthese, Median 1,2 Sekunden.** Wiederholung aus
   App-Cache ist fast sofort verfügbar. Satzvorlauf ist bereits vorhanden (#922). Die aktive
   Arbeit in [#926](https://github.com/0xKurt/LearnBuddy/issues/926) behandelt PCM-Streaming,
   Verbindungsvorwärmung und Stimmqualität. Nicht parallel neu implementiert; deren Kandidaten-
   Werte sind keine Nachmessung dieses PRs und kein belegter Lautsprecherton auf dem Telefon.
6. **Aufsatz: 2,2 Sekunden.** Rubrik und Schutz laufen bereits parallel. Vollständige validierte
   Rückmeldung ist nötig; einzelne Teilnoten früher zu zeigen wäre eine Verhaltensänderung.
7. **Chat, Tutor, Tipp-Fallback, Rollenspiel:** im lokalen Sample innerhalb der bisherigen
   In-process-Budgets. Buddy nutzt bereits sehr viele gecachte Präfixtokens. Seine 24k Zeichen
   Systemtext plus 25k Schema bleiben ein Kandidat für einen gesonderten Qualitätsvergleich,
   nicht für blindes Kürzen. Metadatenchunks ohne neuen Text müssen nicht nochmals den gesamten
   JSON-Präfix parsen oder publizieren; dieser rein mechanische Schritt wird hier entfernt.
8. **STT und Suche:** STT-Formatter braucht das Transkript; 1,4 Sekunden Median, ein 2,8-s-Ausreißer.
   Rohes unformatiertes Transkript früher zu zeigen könnte Sprache/Interpunktion zurückspringen
   lassen. Embedding allein 248 ms Median; lexikalische Suche ist schon parallel, leere Bestände
   überspringen den Call. End-to-end-Vektorsuche bleibt ungemessen.

Keine Modellverkleinerung und kein Kürzen von Schutz- oder Qualitätsregeln. DB-Zeit liegt in
diesen frischen lokalen Datensätzen im Millisekundenbereich; daraus folgt keine Aussage über
Produktionsquerypläne mit großen Beständen.

## Nachweisgrenzen und offene Entscheidungen

- Geräteweg und Deployment: echte erste Pixel, Lautsprecherton, Aufnahme/Upload, Mobilfunk,
  Sign-in und Produktionskaltstart fehlen. Erster Prozesslauf und vier Folgeläufe sind getrennt,
  aber kein künstlich erzwungener Provider-Kaltcache. Für #910 sind weiterhin Produktionstraces
  über mehrere Tage und die dort verlangten Stichprobengrößen nötig.
- Suche: vollständige lexikalische + Vektorsuche mit großen Beständen braucht eine autorisierte
  lokale Umgebung mit pgvector. Hier wurden fünf reale Embedding-Requests gemessen; kein
  Produktionsdatensatz wurde beschrieben oder als Ersatz angefasst.
- Qualität: die festen synthetischen Fragen sind ein Regressionstest, kein Nachweis für alle
  Schulformen, Sprachen und Zeichnungen. Änderungen an Modellwahl oder Promptkürzung erhalten
  erst nach ihren vorhandenen Zweck-Evals einen eigenen Vorschlag.
- Ownerentscheidung: die Stimmwahl und gegebenenfalls dauerhafte vorgewärmte Realtime-
  Verbindungen (Qualität, laufende Kosten, Lebensdauer) bleiben bei #926. Keine weitere
  Produktentscheidung ist für die mechanische Streamkorrektur nötig. Technische Nachweise
  oben sind offene Arbeit, keine künstliche Freigabehürde.

Rohbeleg ohne Lernenden-IDs und Antworttexte:
[Baseline](ai-speed-audit-2026-10-24-baseline.json). Die synthetischen Vollantworten bleiben im
ignorierten `test-results/speed-eu/`; Zugangsdaten werden nirgends ausgegeben oder gespeichert.
Ein zuvor abgebrochener Pilot überschritt wegen Shell-Lock-Verlust die Exklusivität; seine
Zeiten sind ausgeschlossen, seine Kosten samt 0,20-Dollar-Reserve sind vollständig budgetiert.
Der veröffentlichte Baseline-Lauf hielt die Maschinenlock durchgehend.

## Qualitätsgate: schnelleres Hint-Reasoning verworfen

Zusätzlich zur Baseline: gleicher Produktionspfad `prepareHints`, identischer Prompt, Schema und
Mini-Modell, fünf feste Fragen zu Bruchaddition, Bruchbegriff, Gleichung, Dativ und Simple Past.
`high` einmal als gepaarte Referenz; `low` und `medium` je fünfmal (25 Frageausgaben pro Variante).
Kein zusätzlicher Modellrichter; gespeicherte Ergebnisse von Hand auf fachliche Korrektheit,
konkrete Schritte, Lösungsvollständigkeit, Sprache und Antwortverrat geprüft. Code prüft weiter
Leakfreiheit, Warum-Gründe und algebraische Schritte. JSON-Erfolg allein zählt nicht als Qualität.

| Variante | Batches | Batchzeit p50 / p90 | Befund | Übernommen |
|---|---:|---:|---|---|
| high, feste Vergleichsfragen | 1 | 20.598 / — ms | 4/5 Fragen mit Hilfe; konkrete Bruch- und Gleichungsschritte, Bruchbegriff fehlt | bisherige Einstellung |
| low | 5 | 2.810 / 4.684 ms | Fehlende Grammatik-/Wort-Hilfe, unvollständige Musterlösungen, einmal „Add the two Brüche.“ | nein |
| medium | 5 | 10.957 / 15.636 ms | Wiederholt fehlende Hilfe und Musterlösungen ohne konkretes Endergebnis | nein |

Die großen Hint-Batches der Baseline scheiterten 4/5; auch die hohe Einstellung ist damit kein
Qualitätsideal. Trotzdem wäre es falsch, bloß den schnelleren Wert als Verbesserung auszugeben.
Die nächste fachlich sinnvolle Untersuchung ist eine kleinere Fragezahl je Hint-Batch mit
begrenzter Parallelität und erneutem Zweck-Eval; keine ungemessene Prompt-/Modelländerung in
diesem PR. Das ist technische Folgearbeit, keine notwendige Ownerentscheidung.

[Synthetische Vergleichsausgaben und Receipts](ai-speed-audit-2026-10-24-hint-eval.json) machen die
Ablehnung nachprüfbar. Diese Anlage enthält bewusst die Antworten auf die festen Evalfragen,
keine echten Lernendendaten.

## Umgesetzte Änderungen und Rot → Grün

- Früher Themenstart: nach einer verworfenen Frage weitere vollständige Prefixe prüfen,
  statt bis zur gesamten Antwort zu warten. Jede Prefixlänge wird nur einmal validiert.
  Derselbe Modellcall, dieselben Prompts, dieselbe Schema- und Qualitätsprüfung. Restliche
  Fragen werden weiterhin ohne doppelte IDs/Prompts angehängt; Testmodus und Schwierigkeitswünsche
  behalten ihre vollständige Auswertung.
- Leere Stream-/Metadatenchunks: nur neuen Text erneut normalisieren und weitergeben.
  Finish-, Sicherheits- und Usage-Metadaten werden weiterhin verarbeitet. Keine behauptete
  Einsparung von Modellsekunden; im Regressionstest sinken die identischen Publikationen von
  vier auf zwei bei gleicher finaler Antwort und gleichem Cache-Receipt.

Rot vor jeder Korrektur, auf dem geteilten echten Postgres und unter Maschinenlock:
`practice-still-coming.int.test.ts`: **2 fehlgeschlagen / 6 bestanden**, weil bei Schema- und
Qualitätsablehnung der ersten Frage der Request bis zum zurückgehaltenen Streamende wartete.
Grün nach dem Fix: **8/8**. Dieselben Fälle prüfen anschließend Reihenfolge, stabile IDs,
vollständigen Rest und genau einen Generatorcall. Bestehende Fälle prüfen Ablauf des Fensters,
Antworten während des Nachlaufs und den unveränderten Test-/Schwierigkeitsmodus.

`openai-http.test.ts` plus `testing/speed/__tests__/meter.test.ts`: zuvor **1 fehlgeschlagen /
28 bestanden** (vier statt zwei Text-Callbacks); danach **29/29**. Die Meter-Tests verhindern
Doppelzählung paralleler Modellwartezeit und prüfen das Abschneiden am Requestende.

## Vorher / nachher: nutzbarer Themenstart

Gleicher Request „Brüche kürzen, Klasse 6“, je fünf neue Lernende, gleiche Modelle/Prompts und
Reasoningwerte. Der erste vollständige HTTP-Response ist vorher ein fertiger Satz und nachher
in vier Fällen der erste benutzbare Block mit `preparing=true`.

| Messgröße (ms) | Vorher p50 / p90 | Nachher p50 / p90 |
|---|---:|---:|
| Nutzbarer Themenstart / HTTP fertig | 8.369 / 9.191 | **3.614 / 5.440** |
| Gesamte Generatorantwort fertig (ab Requeststart) | 8.349 / 9.180 | 5.472 / 6.077 |
| Früher Start vor Generatorende | 0/5 Läufe | **4/5 Läufe** |
| Identische Text-Publikationen bei Metadatenfixture | 4 | **2** |

Beobachtete Verbesserung beim Start: Median **57 %**, p90 **41 %**. Keine Behauptung, dass die
Codeänderung allein die gesamte Differenz verursacht: auch die kompletten Antworten waren im
zweiten Sample schneller (Provider-/Cache-/Antwortvariation, keine zeitlich randomisierte A/B-
Studie). Innerhalb derselben vier Nachher-Antworten liegen zwischen HTTP-Startfreigabe und
Generatorende **2.022 / 1.413 / 1.795 / 2.753 ms**. Das ist der durch frühe Freigabe nutzbar
gewordene Zeitabschnitt; die gehaltenen Streamtests belegen den Mechanismus deterministisch.
Der fünfte Lauf nutzte den vollständigen Satz. Kein Nachweis für Pixel auf dem Gerät.

„Generatorantwort fertig“ ist das Ende des Gatewaycalls, **nicht** der exakte Zeitpunkt der
letzten DB-Transaktion oder des nächsten App-Polls. Der Hintergrund wird vor jedem Folgelauf
vollständig geleert. Die API-Abschlusszeit des ersten Blocks und der vollständige Generator-
abschluss werden bewusst getrennt angegeben; hint-bedingte Wartezeit im Auditrunner zählt
nicht als Wartezeit bis zum ersten Üben.

[Nachher-Rohbeleg](ai-speed-audit-2026-10-24-after.json). Modelle, Systemprompts und Schemas
bleiben unverändert; die schnelleren, aber qualitativ schlechteren Hint-Einstellungen wurden
nicht übernommen. Die erste kleine Hint-Gruppe kann wie schon im bestehenden Streamingpfad
vorbereitet werden, während die restlichen Fragen noch entstehen.

## Budget und Abschlussprüfung

Konservativ gebucht: **1.902929 USD von maximal 3 USD**. Enthalten sind die
Baseline, alle verworfenen Reasoningvarianten, beide Prefixdiagnosen, fünf Nachher-Läufe und
der abgebrochene Pilot samt 0,20 USD Reserve. Fehler behalten ihre volle Reservierung, selbst
wenn ein kleinerer Receipt vorliegt; Cache-Rabatte werden nicht abgezogen. Jede Operation steht
im gemeinsamen Budget-Ledger. Keine weiteren Live-Calls für die Hooks.

Nach der Extraktion der Prefixlogik in `firstQuestions.ts` sind alle **37 gezielt ausgeführten
Tests in drei geänderten Dateien grün**. Typecheck und betroffene ESLint-Prüfung ebenfalls grün.
Die verpflichtenden Commit-/Push-Hooks prüfen den endgültigen Baum; ihr Ergebnis steht im PR.
Keine UI-Änderung, daher kein neuer Screen-Walkthrough. Keine native Build- oder Deploymentänderung.
Der weggeworfene Pilot-DB-Rest wurde anhand seiner synthetischen Lernenden-ID identifiziert
und nach Prüfung auf null Verbindungen entfernt; alle regulären Läufe räumen ihre Datenbank
und den lokalen HTTP-Server selbst auf.
