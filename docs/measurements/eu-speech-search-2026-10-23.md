# Sprache und Materialsuche: EU-Kandidaten, 23.10.2026 (#893)

Status: implementierte, opt-in Adapter; **keine Produktionsfreigabe**. Die bisherigen
Voreinstellungen bleiben erhalten. Es wurden weder Produktionsdaten geändert noch Hosting,
Secrets oder Geräte angepasst. Die vier vorhandenen Audio-Fixtures wurden laut Commit
`433b205f` mit macOS `say` erzeugt; zusätzliche menschliche Referenzen sind unten getrennt ausgewiesen.

## Messung

Alle Aufrufe mit dem freigegebenen EU-Projekt; Umgebung ausschließlich aus der `.env.local`
des Haupt-Checkouts eingelesen. Keine Schlüssel in Ausgabe oder Worktree. Vollständige
MP3-Antwort gemessen, jeweils ein kurzer Text pro Sprache, Rate 1, kuratierte Stimme warm
(Chirp3 Sulafat bzw. Kandidaten nova). Einzelmessungen, keine p95-Aussage.

| Sprache | Chirp3 | tts-1 | gpt-4o-mini-tts |
| --- | ---: | ---: | ---: |
| de | 904 ms | 2060 ms | 15965 ms |
| en | 674 ms | 1656 ms | 11796 ms |
| fr | 605 ms | 1670 ms | 15594 ms |
| es | 716 ms | 1832 ms | 13034 ms |
| it | 741 ms | 1802 ms | 10981 ms |

`tts-1` ist der schnellere Kandidat, verfehlt aber weiterhin die geforderte Latenzgleichheit.
Die höhere Wartezeit wird weder mit anderem Messbeginn noch mit einem Ausweichanbieter
verdeckt. Ein Hörvergleich für alle Sprachen, sechs Stimmen und Geschwindigkeiten fehlt.
Der API-Kandidat ist daher kein gleichwertig belegter Ersatz.

Transkription derselben synthetischen deutschen Aufnahme `t15.m4a`: `gpt-4o-transcribe`
908 ms, `gpt-4o-mini-transcribe` 588 ms, beide identischer korrekter Text (102 Audio- und
37 Ausgabetokens). Die größere Variante bleibt der Kandidat, bis breitere Genauigkeitsdaten
vorliegen. Zwei vorherige Messaufrufe endeten vor Ausführung mit HTTP 400: das Messskript
hatte `toFile` nicht abgewartet. Korrigiert und separat wiederholt; der Adapter wartet es ab.

## Menschliche Aussprache und Transkription

Sechs öffentliche, englische Aufnahmen erwachsener Sprecher aus
[SpeechOcean762](https://github.com/jimbozhang/speechocean762/tree/613968e3b0b789fc33936fb5eba1973176ba7d11),
CC-BY-4.0, fünf unabhängige fachkundige Bewerter. Fixierter Stand:
`613968e3b0b789fc33936fb5eba1973176ba7d11`. Mechanisch je die ersten zwei Erwachsenen-
Aufnahmen mit Satzgenauigkeit >=9, genau 7 und <=4 ausgewählt. IDs: `000240010`,
`000240031`, `001200098`, `003060186`, `003060002`, `003060025`; Alter 19, 21, 25,
drei Sprecher, alle mit Mandarin als Muttersprache. Keine Kinderaufnahmen oder privaten Lernerdaten übertragen.

Alle Modelle erhielten denselben bestehenden `practice/speak.ts`-Systemprompt, Zielsatz,
Sprache en, App-Sprache de, tatsächliches Alter und Original-WAV. Temperatur 0;
2500 Ausgabetokens beim bisherigen Gateway und mini, 1200 bei den beiden großen
Audiokandidaten; keine Antwort erreichte das Limit. Die bestehenden Wortpositionen
wurden verglichen. Vor Auswertung festgelegte Wortschwellen: <=6 = Fehler, >=9 = korrekt;
7/8 ausgeschlossen. Damit 39 bewertete Wörter (11 Fehler, 28 korrekte), zwei ausgeschlossen.
[Einzelergebnisse](../../apps/api/evals/media/human-results.json) enthalten Referenzwerte,
Wortentscheidungen, Transkripte und Latenzen; keine Audiodateien werden weiterverteilt.

| Modell | Fehler erkannt / 11 | Falscher Alarm / 28 | Korrekte Urteile / 39 | Latenz |
| --- | ---: | ---: | ---: | --- |
| bisheriges Gemini 3.1 Flash-Lite | 5 | 5 | 28 | 1.72–2.85 s |
| gpt-audio-mini | 1 | 4 | 25 | 1.88–2.40 s |
| gpt-audio | 7 | 6 | 29 | 1.94–3.67 s |
| gpt-audio-1.5 | 5 | 3 | 30 | 2.10–3.63 s |

**Auswahl: `gpt-audio-1.5`.** Mini verschlechtert die Fehlererkennung deutlich. 1.5 erreicht
auf diesem kleinen Korpus dieselbe Fehlererkennung wie bisher mit weniger falschen
Korrekturen. Das ist kein statistischer Gleichwertigkeitsnachweis für Kinder und fünf
Sprachen. IPA, Tippqualität und Akzentfairness bleiben zusätzlich zu prüfen. Die frühere
synthetische mini-Messung (2725 ms) belegte nur die Schnittstellenkompatibilität.

Transkript plus Code ist für Wort-/Lesegenauigkeit richtig, für Aussprache allein nicht:
Die Transkription erkannte bei den ersten vier Aufnahmen sämtliche Wörter trotz der
menschlich markierten Lautfehler in WAS und MORNING. Bei den zwei schwächsten Aufnahmen
wich der Text ab; einmal wurde ohne Sprachhinweis fälschlich Chinesisch erkannt. Deshalb
übergibt der Adapter jetzt die bereits bekannte Aufnahmesprache als API-Metadatum,
ohne Zielantwort oder Frage in die Spracherkennung einzuspeisen. Rot→Grün belegt diese
Weitergabe; erneute menschliche Live-Prüfung des Sprachhinweises steht aus.
Aussprache bleibt am Originalklang (`OPENAI_MODEL_PRONOUNCE`, Standard `gpt-audio-1.5`);
der Audio-Chat setzt explizit `store: false`. `judgementFault` bleibt unverändert. Exakte Aufgabenbewertung und Konsistenzprüfungen im Code.

## Quellenangabe zu SpeechOcean762 (CC BY 4.0)

**speechocean762: An Open-Source Non-native English Speech Corpus For Pronunciation
Assessment** — Junbo Zhang, Zhiwen Zhang, Yongqing Wang, Zhiyong Yan, Qiong Song,
Yukai Huang, Ke Li, Daniel Povey und Yujun Wang, Interspeech 2021.
Datensatz: [OpenSLR 101](https://www.openslr.org/101/), erstellt von SpeechOcean und
Xiaomi; [fixierter Quellstand](https://github.com/jimbozhang/speechocean762/tree/613968e3b0b789fc33936fb5eba1973176ba7d11).
Lizenz: [Creative Commons Namensnennung 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).
Bearbeitung hier: Auswahl der oben genannten sechs Erwachsenen-Aufnahmen, Zusammenfassung
und Schwellenbildung der Expertenbewertungen sowie Ergänzung eigener Modellurteile in
`human-results.json`. Die Original-WAVs wurden unverändert zur Messung benutzt und werden
nicht im Repository weiterverteilt. Die Autoren unterstützen damit nicht diese Auswertung.

## Suche

Beide Kandidaten bei 1536 Dimensionen, sieben vorhandene Blätter, 14 vorhandene Suchfälle:
`text-embedding-3-small` und `-large` jeweils 14/14 Rang 1 (reine Vektorsuche), initial
464 bzw. 280 ms für das gemeinsame Dokument-/Query-Batch. Vier zusätzliche Queries in
en/fr/es/it: beide insgesamt 18/18 Rang 1. Je 668 Tokens im erweiterten Batch.

Small ist für dieses Korpus die begründete Wahl: $0.02 statt $0.13 je Million Eingabetokens,
keine gemessene Trefferverbesserung durch large. Dies ist ein kleiner Funktionstest,
keine Aussage über beliebige Schulmaterialien. Quellen: [Embedding-Modelle und Dimensionen](https://developers.openai.com/api/docs/guides/embeddings),
[Preise](https://developers.openai.com/api/docs/pricing).

Die Distanzkalibrierung darf nicht vom alten Modell übernommen werden. Small: richtige
Treffer 0.317–0.643; nächster falscher Treffer teils schon 0.471. Sechs fachfremde Queries:
nächster Treffer jeweils mindestens 0.717. Deshalb wird zusätzlich zu unverändertem
lexikalischem Nachweis nur der nächste Vektortreffer vorab in den Kontext genommen:
Distanz <= 0.66, Abstand zum Zweiten >= 0.04. Dies erhält 18/18 Referenztreffer und
verwirft 6/6 fachfremde Queries. Die alte .35-Schwelle bleibt für Gemini bestehen.

Zusätzlich lief die reale Postgres-Volltext-/Trigrammsuche mit denselben live erzeugten
Vektoren durch die produktive Rangfusion: beide Anbieter 12/14 Rang 1, identische Ränge
für alle 14 Fälle. Die zwei alten Fehler bleiben sichtbar (geteilt rechnen Rang 2,
französische Wörter fürs Haus Rang 4). Vektordistanzen wurden dabei in TypeScript berechnet,
weil dem gemeinsamen Postgres pgvector fehlt. Erfasste Embedding-Kosten: alt 105,
neu 13 Mikro-USD. Kein Rückschritt im gemessenen Hybrid-Korpus.

Gesamtes Live-Budget dieser Arbeit: 58 Aufrufe inkl. zwei abgelehnter Multipart-Anfragen,
konservativ reservierte Obergrenze **0,96987 USD** (keine Rechnungsbehauptung). Jeder Batch
steht im gemeinsamen Budget-Ledger. Keine weiteren Live-Aufrufe ohne verbleibendes Budget.

## Betrieb und Nachweise

- Ein geteilter Client und eine Konfiguration für Chat, Sprache, Audio und Embeddings, strikte EU-URL,
  keine SDK-Wiederholungen, keine Weiterleitungen; vorhandene Tageslimits und Kostenprotokolle.
- Transkription plus bestehende Formatierung/Schutzinterpretation zählen als eine logische
  Anfrage; beide bezahlten Stufen werden verbucht. Bei leerem Transkript entscheidet Code.
- Code bewertet weiterhin exakte Diktat-/Hörantworten, Lesefehler, Sprechtempo und die
  Konsistenz der Ausspracheurteile. Die Bildabschrift bleibt im Chat-/Bild-Gateway.
- Additive Migration 0115: `embedding_openai vector(1536)` samt partiellem HNSW-Index;
  alte Spalte/Index bleiben bestehen. Beide Spalten erhalten Modell-ID und Dimension als
  Begleitspalten. Suche und Backfill prüfen beide Werte; auch ein Modell mit derselben
  Dimension erfordert neue Vektoren. Bestehende Vektoren ohne belegte Modell-ID werden
  neu erzeugt, nicht nachträglich mit einem geratenen Modell beschriftet.
- Re-Indexierung: `pnpm -C apps/api exec tsx scripts/reindex-passages.ts` prüft nur;
  `--apply --max-usd=1` füllt fehlende oder nicht mehr passende Vektoren in Batches. Abbruch ist fortsetzbar,
  geänderte/gelöschte Passagen erhalten keine veralteten Vektoren. Vor dem Umschalten
  laufende Uploads abschließen und erneut auf null fehlende Passagen prüfen.
- **Rollback vor Umschalten vorbereiten:** Während des neuen Backends angelegte Passagen
  können ausschließlich die neue Spalte besitzen. `--target=vertex --apply --max-usd=1`
  erzeugt den alten Raum neu; anschließend mit `--target=vertex` null fehlende Passagen
  nachweisen. Uploads während der finalen Prüfung anhalten. Der alte Index allein genügt
  nicht. Lexik/Trigramme bleiben bei unvollständigem Index verfügbar.
- Der gemeinsame lokale Postgres 16 hat **kein pgvector**. Schema-Fallback, API-Kosten,
  Limits und Fehler laufen dort real; die beiden Vektor-/Backfill-Fälle werden sichtbar
  übersprungen. Der bestehende PG17/pgvector-CI-Job führt sie zusätzlich aus und erzwingt
  die Extension. Eine lokale Vektorprüfung wird nicht behauptet.
- Rot→Grün: neue Konfiguration zunächst 8 Fehler; gezielte Regressionen für SDK-Timeout
  und leeres Transkript zunächst 2 Fehler; Sprache/Modellauswahl weitere 2 Fehler. Danach fokussierte Tests grün. Weitere
  Abdeckung: provider refusal/429/5xx, Abbruch, MP3 und M4A/AAC/WebM-Konvertierung,
  fehlerhafte Einbettungen, getrennte Suchräume, idempotentes Backfill und Mandantentrennung.

Reproduktion der synthetischen API-Messungen: `apps/api/evals/media/measure.ts` mit einem
Modus `tts`, `transcribe`, `pronounce` oder `embedding`; vorher die freigegebene Umgebung
in der Shell laden und die Maschinen-Testsperre halten. Das Skript lädt selbst keine
Umgebungsdatei und protokolliert jeden Batch im gemeinsamen Budget-Ledger.

Bibliotheken: offizielles `openai`-SDK 7.43.0 (Apache-2.0), `@audio/decode` 4.2.0
(MIT-Wrapper; AAC-Decoder GPL-2.0 und weitere Codec-Lizenzen im jeweiligen Paket),
`wav-encoder` 1.3.0 (MIT). Nur Backend, kein React-Native-Paket, keine native Kompilierung.
Die Codec-Abhängigkeiten bringen JS/WASM mit; mobile Oberfläche und Bedienbarkeit ändern
sich nicht. End-to-end Prüfung des produktiven Deploy-Bundles bleibt offen.

## Offene Freigabekriterien

TTS-Latenz ohne Regression; Hörqualität/Stimmen; breitere menschliche Aussprache
(fünf Sprachen, Kinder, Akzente) und STT inkl. leiser Sprache, Zögerlauten, Mathematik und Distress; vollständige Szenarien
Diktat, Hörverstehen, Referat und Rollenspiel mit Live-Modellen; produktive Migration/Re-Indexierung; EU-DPA,
Projekt-Residency und endpointbezogene Retention/ZDR-Freigaben. Google wird erst danach
als aktiver Verarbeiter und Credential-Abhängigkeit entfernt.

## Fix-Runde: gestreamte erste Audiobytes

Gemessen mit `evals/media/tts-first-byte.ts`: derselbe deutsche Satz wie oben, MP3, Rate 1,
Sulafat/nova, EU-Endpunkte, ohne SDK-Retries. Zeitbeginn vor Auth/Request, Ende des ersten
Wertes erst bei tatsächlichen Audiobytes; bei Chirp3 nach den ersten vier Base64-Zeichen in
`audioContent`, nicht beim ersten JSON-Zeichen. Die komplette Antwort wird weiter gelesen.
Das ist Netzwerk-Ankunft, keine gemessene Player-Startzeit. Chunkzahlen hängen auch von HTTP
und Puffern ab, sie sind keine Modellereignisse.

Zwei abschließende, unter der bis zum Prozessende gehaltenen Maschinensperre ausgeführte Runden:

| Modell | Runde | Header | Erstes Audio | Vollständig | Chunks | Audiobytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Chirp3 | 1 | 904 ms | 906 ms | 918 ms | 36 | 20256 |
| tts-1 | 1 | 1731 ms | 1731 ms | 1827 ms | 56 | 64128 |
| gpt-4o-mini-tts | 1 | 1289 ms | 1289 ms | 4799 ms | 74 | 84096 |
| Chirp3 | 2 | 709 ms | 710 ms | 726 ms | 24 | 19104 |
| tts-1 | 2 | 1825 ms | 1825 ms | 1957 ms | 66 | 71808 |
| gpt-4o-mini-tts | 2 | 682 ms | 682 ms | 2756 ms | 27 | 81792 |

Drei vorherige explorative Runden (erste Audiobytes / vollständig): Chirp3
991/1004, 859/876, 772/781 ms; tts-1 1741/1949, 1473/1624, 1679/1834 ms;
mini-TTS 636/2519, 2020/3658, 646/2985 ms. Bei diesen Runden endete die Sperrenlebensdauer
der aufrufenden Shell zu früh und ein fokussierter Testlauf überlappte; daher nicht als
isolierten Vergleich werten. Die abschließenden Runden nutzten eine bis zum Ende wartende
Bash-Shell. Alle 15 bezahlten Aufrufe stehen im Budget-Ledger: **höchstens $0.10 zusätzlich**
($0.06 + $0.04 reserviert), keine weiteren Live-Aufrufe in dieser Fix-Runde.

**Entscheidung:** Streaming schließt die Lücke für `tts-1` nicht. Mini-TTS profitiert stark,
erreicht aber im isolierten Vergleich einmal 1289 statt 906 ms und einmal 682 statt 710 ms;
eine verlässliche Latenzgleichheit ist damit nicht belegt. Google bleibt der aktive Standard,
der bisherige Konfigurationsstandard `disabled` bleibt ebenfalls unverändert. Kein Wechsel
zu Mini-TTS und kein neuer Playback-Transport in dieser Runde.

Playerprüfung im Code: `naturalAudio.ts` schreibt vollständige Base64-Antworten in eine lokale
MP3/WAV-Datei; `naturalAudio.web.ts` erzeugt eine Data-URI. Beides benötigt die vollständige
Antwort. Ein Anbieterstream allein macht diese Wiedergabe nicht früher hörbar. Für einen
später belegten Streaming-Wechsel braucht die vorhandene Player-Quelle eine autorisierte
Audio-URL bzw. eine browsergeeignete Streamquelle und einen Server, der die Audiochunks
weiterreicht. Kein nativer Build oder Gerätetest wurde durchgeführt.

Die [Speech-API-Dokumentation](https://developers.openai.com/api/docs/guides/text-to-speech)
bestätigt Chunk-Transfer für die geprüften Modelle; die Messung liest diesen Stream tatsächlich.
Die neuen parametrisierten Verträge prüfen Sprache (Google/direkt/Fake), Embeddings
(Vertex/direkt/Fake) und beide Audiozwecke (Vertex/direkt/Fake) mit denselben Erfolgs-, Timeout-,
429-, Verweigerungs-, Abbruch- und Kostenbuchungsszenarien. Die Kostenbuchung läuft auf dem
gemeinsamen echten Postgres. Provider-Importguard bleibt unverändert; Client und Fehlerklassifikation
liegen mit dem Chatadapter in `llm/`. Audio umschließt jeden konfigurierten Chatadapter.

Fix-Runden-Nachweis lokal: 16 gezielte rote Fälle vor Korrektur (3 Routing/Konfiguration/
Retention, 10 Adapterverträge, 1 Migration/Metadaten, 2 Audio-Tokenpreise). Danach 92/92
Tests der zuletzt geänderten fünf Dateien grün, zwei Vektorfälle ohne lokale Extension
ausdrücklich übersprungen. Die weiteren vier fokussierten Dateien bestanden zuvor mit
29 Tests. Transkriptionskosten berücksichtigen Audio-Eingabetokens getrennt von Texttokens.
