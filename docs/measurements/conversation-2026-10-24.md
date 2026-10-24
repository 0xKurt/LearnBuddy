# Gesprächsaufnahme — 24.10.2026, #932 / #936

Folgt `docs/architecture.md` §Voice / Conversation mode. Keine Modellaufrufe, kein nativer
Neubau, keine Produktionsdaten- oder Deploymentänderung. POCO X3, Android 12, USB `35b1c1c`,
vorhandener Dev-Client; echte Speech-Module dieses Worktrees mit lokalen Audio-Fixtures.

## Aufnahme und Satzende

- Der vorhandene Expo-Recorder unterstützt `aac_adts` auf `voice_communication`. Während
  derselben laufenden Aufnahme waren nach 2 / 4 / 6 Sekunden 11.730 / 23.851 / 35.972 Bytes
  lesbar. Die native Decodierung ergab 30.720 / 62.464 / 94.208 Mono-Samples bei 16 kHz.
  Der PCM-Recorder der anderen Bibliothek wird dafür nicht benötigt.
- `noiseFloor.ts` extrahiert die vorhandene BargeGate-Kalibrierung. Beide Detektoren verwenden
  dessen Grundrausch-Schätzung; PauseEnd verwendet Grundpegel + 6 dB, mindestens −50 dBFS,
  250 ms Sprechzeit und 650 ms Pause im kontinuierlichen Android-Pfad. Initial 600 ms
  Vorbereitung; ein früher Sprechbeginn über den ersten ruhigen Frames wird schon erhalten.
  Ohne Fortsetzungspuffer bleiben 1,6 s Pause bestehen. Rohpegel sind wichtig:
  die für die Orb-Anzeige bei −50 dBFS abgeschnittenen Werte würden leise Sprache unterdrücken.
- Zwei externe Wiedergaben derselben 1,3676-s-Sprachdatei wurden ohne Recorder-Neustart zu
  getrennten Nachrichtenstücken. Pausenende nach **669 / 665 ms** ab erster ruhiger Messung;
  letzter lauter Messpunkt bis Ende: 801 / 798 ms (Polling ca. 133 ms).
- Beide AAC-Stücke: je 14.076 Bytes / 2,304 s; exakte Bytebereiche der laufenden Sitzungsdatei
  ab Offset 451.996 beziehungsweise 471.546. Der Vergleich der 10-ms-RMS-Hüllkurve mit der
  Referenz erreicht 0,943 / 0,947 Korrelation. Referenzanfang nach 0,61 / 0,54 s im Stück;
  nach dem vollständigen Referenzende bleiben 0,324 / 0,394 s. Der Anfang und das Ende sind
  damit auch akustisch im aufgezeichneten Stück enthalten, nicht erst ab der Gate-Auslösung.
- Acht Sekunden stationäres Rauschen über den externen Lautsprecher, vor Kalibrierung gestartet:
  gemessener Pegel ungefähr −48 bis −46 dBFS, kein Nachrichtenstück. Danach ebenfalls kein
  durch das Verstummen ausgelöstes Stück. Ein plötzlich nach der Kalibrierung einsetzendes
  Geräusch ist von einem Sprechbeginn durch einen reinen Energie-Detektor nicht sicher
  unterscheidbar; dieser Aufbau belegt keine universelle Geräuschklassifikation.

- Eigenstimme über den tatsächlichen `naturalPlayer` (`prepareAudio`/`playAudio`): fünf
  vollständige Sprachwiedergaben, jeweils Start-/End-Callbacks `done`, dazwischen Pausen;
  insgesamt über 24 s Aufnahme inklusive Nachlauf, **kein** Sprechbeginn und **kein**
  Nachrichtenstück. Ein vorgeschalteter Versuch mit einem separaten Loop-Player hatte nach
  dessen manuellem Stop ein Stück registriert; seine Ursache ist nicht abschließend zugeordnet.
  Der produktive Player-Pfad reproduzierte es nicht. Bluetooth und andere Geräte sind ungeprüft.

Lokale Rohbelege: `test-results/talk-consensus/` (Metro-Logs, Pegel, AAC/WAV, Screenshots,
Probe-Quelltext). Die Probe verwendet keine Produktionsanmeldung. Lautstärke/Stummschaltung
am Zuspieler wurden nach jeder Wiedergabe wiederhergestellt.

## Fortsetzung und Supersede

Die Android-Aufnahme läuft bei Satzenden, während Transkription und während der Antwort weiter.
ADTS-Frames werden auch über geteilte Datei-Lesegrenzen erhalten. Ein 800-ms-Vorlauf hält den
Beginn vor der Gate-Entscheidung. Transkripte gehen geordnet als separate normale Nachrichten;
kein `/stop`, kein Überschreiben der Gesprächshistorie. Die vorhandenen Server-Turns fassen
wartende Beiträge zusammen. Ein neuer Sprechbeginn macht alte Stream- und Home-Antworten lokal
unwirksam; ein Postgres-Integrationstest prüft zusätzlich die verworfene verspätete Aktion.

Rot vor Grün: acht ursprüngliche Pausenfälle scheiterten, ein verspätetes Home wurde zweimal
statt einmal übernommen, die Kalibrierung meldete vorzeitig `recording`, und eine leise
Rohpegel-Folge lieferte zunächst kein Stück. Die jeweils zugehörigen Tests bestehen nach der
Korrektur. Auch die ursprüngliche POCO-Messfolge mit Sprechbeginn vor Ende der Kalibrierung
ist abgesichert. Laufende Transkriptanzeige bleibt erhalten, veraltete Textfortschritte werden
verworfen. Der Queue-Test hält die erste Transkription offen, erfasst ein zweites vollständiges
Stück und prüft Reihenfolge, Aktualitätsprüfung und Abbruch beim Verlassen.

## Grenze der Zuordnung zur Owner-Meldung um 17:59

Die in #932 dokumentierte ursprüngliche Schwelle und der konkurrierende WAV-Dateileser sind
reproduzierte Fehler. Der PCM-only-Body-Fix bleibt unverändert. Es fehlen jedoch zeitgleiche
Logs und ein bestätigter Ablauf des damaligen Produktionsdialogs. Der am Ende ausgelesene
Geräte-Logpuffer enthält 17:59 nicht mehr. Ein Sprachpaket-Dialog/erster Start bleibt eine
Hypothese; aus den reproduzierten Fehlern folgt keine bewiesene Ursache dieses Einzelereignisses.
Die historische Zuordnung ist **offen**, #932 darf deswegen nicht als vollständig verifiziert
geschlossen werden. Keine neue Produktions- oder Live-Modellprüfung wurde dafür vorgenommen.
