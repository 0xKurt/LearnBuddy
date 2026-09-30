# LearnBuddy: Kontext, Werkzeuge und Verlässlichkeit im Gespräch

Geprüft auf `main` / `d3b114a9ec51f05edf35f6a36eac4e27d6ea1698`. Fokus: Buddy-Kontext, Lookup-Schleife, Aktionen, Gedächtnis und Gesprächsfortsetzung. Keine Quellcodeänderung, kein Produktionszugriff. Reproduktionen nutzten die echten Migrationen und API in **wegwerfbaren lokalen Postgres-Datenbanken**; ausschließlich Modell/Auth/Storage waren die vorhandenen Test-Stand-ins.

Artefakte: [Repro-Skript](evidence/repro-context.mts), [gemessene Ergebnisse](evidence/repro-context.json).

## Mein Urteil

Das Fundament ist erheblich besser als das eines gewöhnlichen Chat-Wrappers. Modelle bekommen keine frei verwendbaren Nutzer-IDs; Lookup-Queries sind tenant-scoped. Aktionen, Antwort und Audit-Trail werden atomar hinter einem Kontextzaun übernommen. Turn-Claims verhindern doppelte Antworten nach Unterbrechung. Ein fehlgeschlagener Modellaufruf wird nicht als gelungene Änderung verkleidet. Die neue explizite Trennung von Vokabeln, Blatt und Umfang ist richtig: #144 ist im Code gelöst, #145 hat die Obergrenze in der **Auswahl** entfernt; verbleibende Extraktionsgrenzen untersucht der Hauptagent.

Aber die Oberfläche ist bereits einfacher als der zugrunde liegende **Gesprächszustand**. Objekte gibt es; verlässliche Beziehungen zwischen „das meine ich“, „darauf warte ich“, „das hast du bestätigt“ und „das habe ich tatsächlich getan“ fehlen an einigen entscheidenden Übergängen. Daher wirken neue Einzelfeatures in ihrem ersten Turn gut und zerbrechen erst beim Nachfragen, bei einem weiteren Blatt oder beim Rückgängigmachen. Das ist keine Einladung zu mehr Menüs. Der Server braucht ausdrücklicheren Zustand, damit das Kind weniger erklären muss.

## 1. Hoch: Sensible und sogar provider-blockierte Nachrichten werden erneut verarbeitet und als dauerhaftes Wissen in STATE aufgenommen

**Runtime-belegt.** Ein echter `/buddy/messages`-Turn mit `concern=true` und ein zweiter mit synthetischem `LlmError('blocked')` erzeugen vier normale `done`-Nachrichten. Nach fünf Stunden plant und verarbeitet die echte Summary-Pipeline diese Unterhaltung. Der Summary-Modellaufruf erhält **beide Originaltexte**, inklusive der blockierten Nachricht. Ein regelkonformes Summary-Objekt über diese Inhalte wird gespeichert und steht im folgenden STATE, obwohl `buddy_memories` leer bleibt.

Belege:

- [summarise.ts:72](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/buddy/summarise.ts#L72): SELECT nimmt alle `status='done'`-Nachrichten, ohne `failure_code` oder Concern-Disposition.
- [summarise.ts:45](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/buddy/summarise.ts#L45): Zusammenfassungsauftrag umfasst ausdrücklich Selbstangaben und schlechte Tage; kein Verbot von Health/Family/Harm.
- [summarise.ts:173](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/buddy/summarise.ts#L173): unveränderte Texte gehen ins Modell; [summarise.ts:195](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/buddy/summarise.ts#L195) prüft ausschließlich Schema.
- [context.ts:359](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/buddy/context.ts#L359): gespeicherte Zusammenfassungen gehen wieder in STATE.
- [turn.ts:521](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/buddy/turn.ts#L521): provider-blockierte Nachricht wird `done`, `failure_code='blocked'`.
- [privacy.md:119](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/docs/privacy.md#L119) verspricht, dass solche Offenbarungen nicht zu gespeichertem Wissen/later prompts werden; [privacy.md:130](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/docs/privacy.md#L130) verspricht, blockierte Nachrichten nie wieder zum Modell zu senden.

**Wichtig zur Evidenz:** Die Summary-Antwort war geskriptet, die Zuführung der Originaltexte, Speicherung und Wiederaufnahme waren echter Code. Es wurde keine Live-Häufigkeit gemessen. Für die harte „niemals erneut senden“-Garantie genügt bereits der gemessene Modellinput.

**Fix:** Sensitivitäts-/Verarbeitungsdisposition der Nachricht einmal dauerhaft speichern. Ein gemeinsamer, code-erzwungener Projection-Pfad bestimmt, welche Texte Dialogue, Summary, Retrieval und Consolidation jeweils sehen dürfen; Blocked-Texte nie erneut extern verarbeiten. Concern-Texte nur für den bewusst freigegebenen Gesprächskontext, nicht als dauerhafte Lernpersonalisierung. Für normale Selbstangaben separate fachliche Filterung der Derived-Memory-Pipeline; ein weiterer Prompt allein schließt den Bypass nicht. Bestehende Zusammenfassungen überprüfen/gezielt bereinigen und Dokumentation mit dem tatsächlich zugelassenen Gesprächskontext abgleichen.

**Abnahme:** Nach Concern/Blocked plus normaler Folgemessage sehen spätere Summary-Aufrufe den Originaltext nicht; sensitive Inhalte tauchen weder in Summary noch Memory-STATE auf. Ebenso bei Kurzgesprächen, Retry, >24 Nachrichten und nach Kontextwechsel. Original-Unterhaltung und Export folgen der bewusst festgelegten Aufbewahrung.

## 2. Hoch: „Bestätigt“ ist ein einzelnes Modell-Bit, ohne Bindung an die bestätigte Handlung

**Runtime-belegt in beide Richtungen.**

1. Buddy sucht ein Blatt, fragt anschließend korrekt, ob es gelöscht werden soll, das Kind sagt „Ja löschen“. Löschung wird abgelehnt; Buddy muss erneut fragen.
2. Vorherige Frage lautete „Soll ich eine Matheübung vorbereiten?“. Der nächste Nutzertext lautet „Nein die Liste behalten“. Eine **absichtlich fehlerhafte** Modellentscheidung `delete_material` mit genau diesem Zitat wird vom Server angenommen und archiviert das Blatt. Das misst eine fehlende Serverinvariante, nicht die Häufigkeit dieses Fehlers bei Gemini.

Belege:

- [tools.ts:1161](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/buddy/tools.ts#L1161): `requireAsked` liest lediglich `output->>'asks_permission'` der letzten angewendeten Turn-Entscheidung. Es prüft keine Handlung, kein Ziel, keine Version, kein Ablaufdatum und keine Zuordnung zum Antworttext.
- [turn.ts:322](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/buddy/turn.ts#L322): nach Lookup ist Output `{lookups, final: raw}`, das Boolean liegt nicht mehr an der Stelle, die `requireAsked` liest.
- [tools.ts:1206](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/buddy/tools.ts#L1206): Delete prüft Zitat-Vorkommen plus dieses allgemeine Bit.
- [text.ts:45](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/buddy/text.ts#L45): Zitatprüfung beweist nur, dass der Text vorkam; sie beweist weder Zustimmung noch Handlung.

**Fix:** Erste Klasse `pending_intent`: bestätigte Operation + stabiler Objekt-Handle + Objektversion + vorherige Buddy-Nachricht + Ablaufzeit + Status. Der nächste Turn bestätigt/ändert/verwirft genau diesen Intent. Für irreversible Löschung kann eine kleine, konkrete Bestätigungskarte „Dieses Blatt löschen / Behalten“ dieselbe Unterhaltung präzisieren. Der Server darf ein beliebiges `asks_permission` niemals als universelles Löschticket behandeln. Lookup-Audit-Wrapper und ausführbares Ergebnis getrennt speichern.

**Abnahme:** Bestätigung nach Lookup löscht genau das genannte Objekt einmal. Eine Mathefrage autorisiert kein Löschen; „Behalten“, geänderter Zielbezug, zwischenzeitlich ersetztes Blatt, alte Bestätigung und neues Gerät löschen nichts. Mehrdeutigkeit bleibt beim Intent, nicht beim allgemeinen Verlauf.

## 3. Hoch für den Lernkern: Ein altes Blatt lässt sich finden, aber nicht mehr bedienen

**Runtime-belegt mit elf Blättern.** STATE enthält die zehn neuesten. Die Suchfunktion findet das elfte korrekt, liefert aber nur `title`, `subject`, `read_on`, `excerpt`. Dieses Blatt besitzt keinen Alias im Act-Kontext. Das Modell kann daher seinen Inhalt zitieren, aber nicht `prepare_practice(sheet)`, `rename_material`, `delete_material`, `delete_item` oder `request_material(material)` darauf anwenden. Die neue Reparatur aus #144 arbeitet nur für Blätter, die zufällig noch im Kurzkontext liegen. Gemeint ist der gezielte Objektbezug im Gespräch: Bibliothek und Materialscreen bleiben bedienbar; fachweite Übungen können ältere Items enthalten.

Belege:

- [state.ts:227](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/buddy/state.ts#L227): Materialfenster 10; [state.ts:349](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/buddy/state.ts#L349) sortiert ausschließlich nach Neuheit.
- [context.ts:322](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/buddy/context.ts#L322): einzig hier entstehen `shN`-Aliase.
- [context.ts:333](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/buddy/context.ts#L333): STATE kündigt ausdrücklich an, `search_material` finde die anderen Blätter.
- [connectors/material.ts:31](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/buddy/connectors/material.ts#L31): `MaterialHit` enthält keinen Handle; [connectors/material.ts:106](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/buddy/connectors/material.ts#L106) liefert nur Metadaten/Inhalt.
- [tools.ts:1176](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/buddy/tools.ts#L1176): Act-Ziel muss im ursprünglichen Alias-Map liegen, sonst Ablehnung.
- [tools.ts:688](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/buddy/tools.ts#L688): neue blattgenaue Übung hängt an diesem Map.

Zusätzlich berechnet [context.ts:268](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/buddy/context.ts#L268) die material-ready-Zahl eines Ziels aus derselben Zehnerliste. Ein Ziel kann dadurch „0 ready (0 questions)“ zeigen, während seine älteren Fragen vorhanden sind. Die globale Zehner-Warnung repariert diese lokale Falschaussage nicht.

**Fix:** Trenne sichtbares/contextuales Arbeitsfenster von adressierbarem Eigentum. Retrieval liefert einen vom Server registrierten, tenant-scoped Handle und Version; Treffer erweitern die gültige Objektmenge des Turns. `read_sheet(handle)` kann gezielt weitere Inhalte liefern. Materialzahlen eines Ziels stammen aus Aggregaten über alle zugehörigen Materialien, nicht aus dem Kurzfenster. Keine rohen frei wählbaren UUIDs vom Modell nötig.

**Abnahme:** Bei 40 Blättern desselben Fachs wird Blatt 1 gefunden, umbenannt und ausschließlich daraus geübt; ältere Frage wird gezielt entfernt. Zwei gleichnamige Blätter werden unterschieden. Fremde Handles bleiben unmöglich, zwischenzeitlich gelöschte Ziele werden sauber erkannt. Altes Prüfungsziel zeigt korrekte Material-/Fragezahl.

## 4. Mittel bis hoch: Wiederholungen funktionieren im Scheduler, verschwinden aber aus Buddys Verständnis; unmittelbares Undo ist kaputt

**Runtime-belegt.** Eine persistierte tägliche Erinnerung besitzt `repeat='daily'` und `repeat_until`. Nach `loadBuddyState` existieren diese Eigenschaften im Step nicht; STATE enthält kein „repeats daily“. Der jüngste Chat kann den Rhythmus noch erwähnen; nach dem Herausfallen aus dem Dialogfenster fehlt dieser Ersatz. Anschließend beendet `/buddy/messages` per `update_step(repeat='never')` die Wiederholung erfolgreich. Version bleibt **1**, Undo erwartet **2**. Ein sofortiger Undo-Aufruf liefert **409 changed_since**, obwohl nichts dazwischen geändert wurde.

Belege:

- [state.ts:259](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/buddy/state.ts#L259): SELECT der Steps vergisst beide Wiederholungsfelder.
- [context.ts:248](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/buddy/context.ts#L248): Renderer setzt genau diese Felder voraus.
- [prompts.ts:57](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/buddy/prompts.ts#L57): Modell soll vorhandene Wiederholung erkennen und ändern, statt eine zweite anzulegen; der nötige Kontext fehlt.
- [tools.ts:953](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/buddy/tools.ts#L953): Undo erwartet `s.version+1`.
- [tools.ts:977](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/buddy/tools.ts#L977): Änderung allein von `repeat` erhöht die Version nicht und kehrt direkt zurück.
- [tools.ts:1593](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/buddy/tools.ts#L1593) und [tools.ts:1829](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/buddy/tools.ts#L1829): Anzeige und Anwendung des Undo prüfen diese Version.

**Zusätzlicher code-belegter Fall:** Bei gleichzeitiger Rhythmus- und Zeit-/Statusänderung enthält der zurückgegebene Undo nicht die alten Repeat-Felder. Nur der early-return-Zweig ergänzt sie. Undo setzt dann den Rhythmus nicht zurück.

**Fix:** Vollständige Projection des Vertrags, genau eine Versionsänderung pro Step-Mutation, ein vollständiger Undo-Snapshot aller veränderten Felder. Führe für komplexe Objekte eine Mutation/Projection-Schnittstelle statt mehrerer ad-hoc SELECT/UPDATE-Blöcke. Eine `StepRow`-Typannotation ist keine Prüfung, dass SQL diese Felder liefert.

**Abnahme:** Erinnerung anlegen → neuer unabhängiger Turn erkennt Rhythmus/Ende → Rhythmus ändern/stoppen → sofort Undo stellt Rhythmus/Ende/Termin wieder her. Kombinationen mit Zeit, Datum, Cancel und Skip ebenso. Kein zweiter Daily-Step beim erneut geäußerten Wunsch.

## 5. Mittel: Lange Unterhaltungen werden hinter einer vollständigen Summary-Markierung teilweise vergessen

**Code-belegt, hier nicht runtime-reproduziert.** [summarise.ts:173](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/buddy/summarise.ts#L173) baut die Unterhaltung und schneidet sie anschließend mit `.slice(0,12_000)` ab. [summarise.ts:217](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/buddy/summarise.ts#L217) markiert trotzdem die letzte Nachricht der gesamten bis zu 200-Nachrichten-Sitzung als abgedeckt. [summarise.ts:73](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/buddy/summarise.ts#L73) nimmt später nur Texte nach deren `ended_at`. Wichtige späte Korrekturen/Entscheidungen außerhalb der ersten 12.000 Zeichen können so für spätere Zusammenfassung nie wieder drankommen. Das Rohgespräch bleibt gespeichert; die behauptete Langzeit-Kontextdeckung ist unvollständig.

**Fix:** Chunking an Nachrichtengrenzen mit explizitem Coverage-Checkpoint der letzten tatsächlich gesehenen Nachricht, anschließend Zusammenfassung der Teilstücke. Nicht „mehr Tokens auf Verdacht“, sondern garantierte Deckung und nachvollziehbare Auslassungsdisposition.

**Abnahme:** Lange Sitzung mit später Termin-/Präferenzkorrektur: jede Nachricht ist einmal abgedeckt oder explizit ausgeschlossen, auch nach Retry; Summary kennt die letzte Aussage und pointer überspringt keinen ungesehenen Text.

## Weiterführende Gestaltungsideen

1. **Das aktuelle Anliegen als explizites Arbeitsobjekt.** Ein Kind denkt „wir lernen gerade meinen Französischzettel“. Der Server sollte das halten: Thema/Ziel, ausgewählte Blätter, gewünschte Richtung/Form, Umfang, nächster Schritt, ausstehende Frage. Nicht sämtliche Vergangenheit muss in jedem Prompt stehen. Das Arbeitsobjekt trägt die Aufgabe über mehrere Turns, Fotoverarbeitung und Gerätwechsel. Der Chat bleibt die leichte Oberfläche.
2. **Ergebnisse als aus dem Vollzug gebaute Belege.** Ein Modell kann sagen „ich bereite das vor“, bevor es die tatsächliche Anzahl kennt. Nach der Tool-Ausführung baut Code einen kleinen Receipt: „Französisch · dein Blatt X · alle 48 Wörter · Deutsch → Französisch“. Dieser erscheint/ist vorlesbar in der Unterhaltung und kann mit „anders herum“, „nur zehn“ oder einem Tap geändert werden. Es nimmt der Tochter die Notwendigkeit, die Übung erst zu starten, um zu merken, dass Buddy sie falsch verstanden hat.
3. **Gedächtnis nicht als 60-Satz-Bucket verstehen.** Es gibt Profilwissen, konkrete Lernziele, aktuelle Arbeitsvorhaben, reversible Präferenzen und fachliche Lernbelege. Eine Konsolidierung kann drei gleichlautende Sätze deduplizieren; sie kann nicht verhindern, dass 60 unterschiedliche nützliche Dinge irgendwann voll sind. Dauerhafte Fakten sollten strukturiert und abrufbar bleiben, während nur relevantes Wissen im kleinen Kontextfenster liegt. Das Kind sollte kein Speicheradministrator werden („was darf ich vergessen?“).
4. **Konsolidierung mit lebender Herkunft.** [consolidate.ts:267](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/buddy/consolidate.ts#L267) speichert die neue Satzform ohne Quote/Source-Message; Originale werden nach sieben Tagen gelöscht ([purge.ts:254](https://github.com/0xKurt/LearnBuddy/blob/d3b114a9ec51f05edf35f6a36eac4e27d6ea1698/apps/api/src/modules/materials/purge.ts#L254)). Der Originaltext kann im Rohchat fortbestehen, aber seine direkte Beziehung zur aktiven Aussage geht verloren. Behalte für die Lebensdauer des aktiven Wissens minimalen Quellenbezug statt nur „aus mehreren Dingen zusammengefasst“. Das ist eine Produktvertrauens-Empfehlung, kein Beleg einer Live-Halluzination.
5. **OpenClaw eher als Backend-Idee denn als Interaktionsmodell.** Der nützliche Teil ist Fähigkeiten + explizite Zustände + überprüfbare Tool-Ergebnisse. Ein Kind sollte weder Tools entdecken noch ein generisches Agentensystem dirigieren. Eine kleine Zahl gut integrierter Lernhandlungen mit klaren Ergebnissen ist wertvoller als ein immer größerer Werkzeugkatalog. TURN bekommt heute alle 20 Tools; perspektivisch können Lernhandlung, Materialhandlung und Einstellungen passende kleine Capability-Sets liefern, sofern der Kontextwechsel verlässlich ist.

## Nicht erneut als offene Bugs behaupten

- #144: `prepare_practice` kann jetzt `sheet` und `vocabulary_only`; kein stilles Auffüllen, wenn der ausdrückliche Filter nichts findet.
- #145: `all_of_them` und `question_count` sind vorhanden; `questionCountFor` besitzt keine alte 15er-Auswahlobergrenze mehr. Der End-to-End-Umfang bleibt separat zu prüfen.
- Alias-Scoping, Kontextzaun, atomare Reply+Action-Übernahme und Turn-Claims sind echte Stärken, nicht nur Promptaussagen.
- Lookup-Begrenzung auf 2 Schritte ×3 Calls ist eine bewusste Kosten-/Laufzeitgrenze. Problem ist nicht diese Zahl selbst, sondern fehlende Coverage/Handles/Pagination für die Daten, die außerhalb des sichtbaren Fensters liegen.
- Externe Connectoren für Kinder bleiben laut ADR0005 bewusst aus. Das ist keine unbeendete App-Funktion.

HEAD nach den Reproduktionen weiterhin `d3b114a9ec51f05edf35f6a36eac4e27d6ea1698`; Arbeitsbaum blieb unverändert.
