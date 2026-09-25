# Buddy: Prinzip, Diagnose und Entscheidung

Stand: 25. September 2026 · Grundlage für [ADR 0004](../adr/0004-proactive-buddy.md) und die
Umsetzung in `apps/api/src/modules/` (siehe [Architektur](../architecture.md)) und der neuen App.

Dieses Dokument beschreibt zuerst, **welche Verantwortung Buddy tatsächlich übernimmt** –
unabhängig davon, was heute implementiert ist. Danach wird belegt, **warum das heutige Verhalten
scheitert**, und daraus die Entscheidung abgeleitet. Befunde sind mit Datei und Zeile belegt und
als _geprüft_ (reproduziert oder im Code eindeutig) oder _plausibel_ (ohne Live-Modell nicht
abschließend prüfbar) markiert.

---

## 1. Das Buddy-Prinzip

**Buddy nimmt Lernenden Organisations-, Erklär- und Nachhaltearbeit ab.** Erfolg heißt: Die
lernende Person muss weniger planen, weniger erklären und weniger im Kopf behalten – nicht, dass
sie öfter die App öffnet.

| Verantwortung                     | Was Buddy konkret tut (Lernkontext)                                                                                                                                                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Kennenlernen**                  | Erfährt im Gespräch nur, was für den nächsten Schritt fehlt: anstehende Arbeit/Test mit Datum, Fach, Thema, Klassenstufe (sie steuert das Niveau aller Fragen), wann Üben passt. Kein Formular.                                                                                            |
| **Kontext behalten**              | Bestätigte Fakten, Präferenzen und Ziele mit Herkunft; zeitlich begrenzte Umstände („diese Woche krank") laufen ab und werden nie zur Dauerregel. Alles sichtbar und korrigierbar.                                                                                                         |
| **Arbeit übernehmen**             | Legt aus „Mathearbeit am Freitag über Brüche" selbst Fach, Testordner und Datum an; bittet gezielt um das Arbeitsblatt; bereitet passende Übungssätze vor (FSRS-Stand, schwache Themen); plant wenige kurze Schritte bis zum Termin.                                                       |
| **Vorausdenken & sich melden**    | Prüft im Hintergrund – auch bei geschlossener App –, ob etwas ansteht (Termin naht, Material fertig, vereinbarter Schritt fällig, Arbeit vorbei). Meldet sich nur bei ausreichender Relevanz, innerhalb von Ruhezeiten, Häufigkeitsgrenzen und Pause. Schweigen ist ein gültiges Ergebnis. |
| **Ergebnis zeigen**               | Ein vorbereiteter Übungssatz ist direkt startbar; nach dem Üben steht da, was sitzt und was wackelt, und was als Nächstes sinnvoll wäre. Ergebnisse erscheinen als bedienbare Karten, nicht als lange Chatnachrichten.                                                                     |
| **Feedback verstehen & anpassen** | „Donnerstag hab ich Fußball", „die Arbeit ist verschoben", „zu schwer", „hör auf mich zu erinnern" ändern Plan, Einstellungen oder Gedächtnis – nachvollziehbar und rückgängig machbar.                                                                                                    |

**Was Buddy nicht ist:** kein Aufgabenzähler („12 Fragen warten"), kein Streak-Druck, keine
Hausaufgabenmaschine, keine Verwaltungsoberfläche, kein Chatbot, der Erfolg behauptet, den das
System nicht nachweisen kann.

**Spannung zum bisherigen Leitbild.** DESIGN-BRIEF und Doc 01 fordern „self-led, not app-driven"
und „reminders opt-in, off by default, account holder controls them". Das bleibt gültig und wird
zur harten Regel für Proaktivität: Kontakt ist Opt-in, bei Minderjährigen durch die erwachsene
Kontaktperson; Anlass ist immer ein eigenes Ziel der lernenden Person (ihr Test, ihr
vorbereiteter Übungssatz), nie ein Rückstand. Die Abweichung („Buddy meldet sich selbst, auch per
Push") ist in ADR 0004 festgehalten.

---

## 2. Echte Bedürfnisse vs. gewachsene Komplexität

Aus Doc 01, USER-FLOWS(-DEEP), UEBEN-ERKLAERT und den Audits, gegen den Code geprüft:

**Echte Bedürfnisse** (bleiben erhalten):

1. Arbeitsblatt fotografieren → schnell üben (Capture, robuste Extraktion, Qualitätshinweise).
2. „Vor der Arbeit am Freitag muss das sitzen" (Testdatum als echtes Objekt, Vorbereitung, Test-Modus).
3. Beim Hängenbleiben selbst draufkommen, ohne sich dumm zu fühlen (Tutor mit Tipps, nie harsch).
4. Gelerntes nicht verlieren, ohne selbst zu planen (FSRS, unsichtbar).
5. Eltern: sicher einrichten, informiert sein ohne zu kontrollieren; Daten exportieren/löschen.

**Gewachsene Komplexität** (wird von Buddy aufgenommen oder tritt zurück):

- Fach → Ordner → Material-Baum als Pflichtweg; Anlegen eines Fachs mit 18 Fachtypen,
  50 Emojis und 18 Farben (`(learner)/home.tsx` `AddSubjectModal`). Buddy legt Fach und Testordner selbst an.
- Rund acht Wege, eine Übung zu starten (Fach, Ordner, Material, Üben-Tab, zwei Resume-Banner,
  Ergebnis „nochmal", Keep-going). Buddy bietet _einen_ vorbereiteten nächsten Schritt.
- Vier gleichrangige Tabs (Home | Üben | Kamera | Konto), von denen „Konto" nur ein Link ist.
- Benachrichtigungsmatrix mit drei Schaltern, die standardmäßig **an** sind (siehe 3.5).

---

## 3. Warum das heutige Verhalten scheitert

### 3.1 Widersprüchliche oder überladene Anweisungen

- **Ein Prompt, sechs Aufgaben** (`apps/api/src/prompts/tutor.ts`, `SYSTEM_TUTOR`): warm und kurz
  antworten, ehrlich bewerten, Tipp-Treppe einhalten, Test-Modus, Materialbindung, Themenfixierung –
  und zusätzlich ein Freitext-Ausgabeformat mit maschinenlesbarer Steuerzeile `<<<LB{...}` am Ende.
  Bewertung und Gesprächston hängen am selben freien Text. _Geprüft (Code)._
- **Der Server widerspricht dem Prompt.** Der Prompt verlangt, bei „weiß nicht" einen Tipp zu geben.
  Der Server fängt genau diese Eingaben vorher ab und antwortet mit einem festen Text, ohne das Modell
  zu fragen (`routes/sessions.ts:733`). _Geprüft._

### 3.2 Wortlisten statt Sprachverständnis – mit einer Endlosschleife

`lib/give-up.ts` entscheidet per Wortliste, ob eine Nachricht „keine Antwort" ist. Probe mit
realistischen Eingaben (`isNonAnswer`, reproduziert):

| Eingabe                             | Ergebnis      | Folge                                                                                                                                                        |
| ----------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| „Tipp", „Hilfe", „hint", „hilf mir" | keine Antwort | fester Text **„…sag ‚Tipp', dann helfen wir Schritt für Schritt"** (`sessions.ts:945`). Wer „Tipp" sagt, bekommt denselben Text wieder – **nie einen Tipp**. |
| „keine Ahnung, vielleicht 3/4?"     | keine Antwort | Ein echter Lösungsversuch wird nie bewertet, auch wenn er richtig ist.                                                                                       |
| „Not sure but I think it is 12"     | keine Antwort | dito                                                                                                                                                         |
| „tipp bitte"                        | Antwort       | Nur diese Variante erreicht das Modell.                                                                                                                      |
| „indice" / „pista" / „aiuto"        | Antwort       | Die fr/es/it-Texte fordern genau diese Wörter an; sie stehen nicht in der Liste. Verhalten je Sprache verschieden.                                           |

Zusätzlich zählt `hintsGivenForItem` (`sessions.ts:618`) jede nicht-korrekte Tutor-Runde als
gegebenen Tipp – auch die festen Texte. Nach zweimal „Tipp" glaubt das Modell, zwei Tipps seien
gegeben worden, und darf die Lösung verraten, **ohne dass je ein Tipp kam**. _Geprüft (Code)._

### 3.3 Fehlender oder falsch zusammengestellter Kontext

- **Klassenstufe fehlt für alle neuen Profile.** Onboarding sendet `grade_level: null`
  (`(onboarding)/add-profile.tsx:40`); Tutor, Erklärung und Fragengenerierung fallen still auf
  Klasse 7 zurück (`sessions.ts:638`, `explain.ts:49`, `extraction.ts:167`, `materials.ts:527`).
  Eine Studentin und ein Viertklässler bekommen dasselbe Niveau. _Geprüft._
- **Kein Wissen über die Person über eine Übungssitzung hinaus.** Der Tutor sieht Name, Stufe,
  Sprache und die aktuelle Frage. Ziele, anstehende Arbeiten, Vorlieben („mag Beispiele"), frühere
  Schwierigkeiten oder Termine existieren für das Modell nicht. _Geprüft._
- **Testgewichtung wird behauptet, existiert aber nicht.** UEBEN-ERKLAERT verspricht, dass
  Übungen vor einem Test automatisch auf den Testordner gewichtet werden; `lb_pick_session_items`
  filtert nur (Migration 0012). _Geprüft._

### 3.4 Unzuverlässiges bzw. fehlendes Gedächtnis

Es gibt kein Gedächtnis. Außer FSRS-Zuständen und Versuchen wird nichts über Sitzungen hinweg
gespeichert. Korrekturen („die Arbeit ist verschoben") haben keinen Ort, zeitlich begrenzte
Umstände keine Ablaufzeit, Präferenzen keine Herkunft. _Geprüft._

### 3.5 Fehlende Werkzeuge, Zustände und Hintergrundprozesse

- **Keine Proaktivität auf dem Server.** Es gibt keinen Scheduler für Lernende, keine Push-Tokens,
  keinen Zustellnachweis (Datenmodell-Inventar; `grep getExpoPushTokenAsync` leer). Doc 01 legt
  „local notifications only" fest. _Geprüft._
- **Lokale Benachrichtigungen sind standardmäßig an** – entgegen Doc 01/05 und DESIGN-BRIEF:
  `DEFAULT_PREFS` = täglich, Test, „Streak" alle `true` (`apps/mobile/lib/notifications.ts:23-28`).
  Ein „Heute noch nicht geübt?" feuert täglich, **auch wenn geübt wurde** (`notifications.ts:145-155`) –
  genau die Missed-Day-Botschaft, die die Specs verbieten. Das Scheduling läuft bei jedem Laden der
  Startseite. _Geprüft._
- **Kein Planungszustand.** Es gibt keine „nächsten Schritte", keinen Zustand „vorbereitet" oder
  „erledigt mit Nachweis"; eine Sitzung ist nur ein Container für Fragen. _Geprüft._
- **Die Hintergrundjobs laufen so nicht.** Die pg*cron-Jobs rufen `net.http_post`, aber keine
  Migration aktiviert `pg_net`, und die benötigten GUCs (`app.api_url`, Secrets) setzt nichts im
  Repo (Migrationen 0011, 0020). \_Geprüft (Code), Produktionsstand unbekannt.*

### 3.6 Behauptete Fähigkeiten, die das System nicht hat

- Fester Text verspricht Hilfe „Schritt für Schritt", die nie kommt (3.2). _Geprüft._
- Admin-Text „Nur an Tagen ohne Sitzung", der Code plant täglich (`admin.json:127` vs.
  `notifications.ts:143`). _Geprüft._
- Testgewichtung (3.3). Historisch: „Verarbeitung läuft im Hintergrund weiter" ohne Worker (ADR 0003).

### 3.7 Fehlende Prüfung, ob eine Aktion wirklich erfolgreich war

- **Der Client darf „richtig" behaupten** (`client_local_verdict === 'correct'`, `sessions.ts:769`):
  fester Lobtext, FSRS-Update, ohne Serverprüfung. _Geprüft._
- **Bewertung aus Freitext geparst.** Fehlt die Steuerzeile, wird `incorrect` angenommen
  (`vertex.ts`, Parser nach dem Stream). Das Tutor-Modell (gemini-2.5-flash) läuft mit
  `maxOutputTokens: 512` (`vertex.ts:426`); wenn Denk-Tokens dieses Limit mitverbrauchen, bricht die
  Antwort vor der Steuerzeile ab und eine richtige Antwort wird als falsch gewertet. _Plausibel,
  braucht Live-Prüfung._
- **Kosten falsch berechnet.** Alle Aufrufe werden zum Flash-Lite-Preis abgerechnet
  (`vertex.ts:85-86`), auch das teurere Tutor-Modell; beim Streaming werden `usageMetadata` aller
  Chunks addiert (`vertex.ts:444`). Die Kostenaussage in ADR 0002 steht damit auf ungeprüfter
  Grundlage. _Geprüft (Code); Größenordnung braucht Live-Prüfung._
- **Benachrichtigungen ohne Nachweis.** Lokale Notifications werden geplant, nicht bestätigt;
  niemand weiß, ob etwas ankam oder geöffnet wurde. _Geprüft._

### 3.8 Zusammenfassung

Das Verhalten scheitert nicht an Formulierungen. Es fehlen **Zuständigkeiten** (Gedächtnis,
Planung, Scheduler, Kontaktsteuerung), **Zustände** (vorbereitet/erledigt/zugestellt) und
**Nachweise**. Wo das System Lücken hat, wurden sie mit Wortlisten, festen Texten und
Prompt-Absätzen überdeckt – und genau dort entstehen die Fehler. Ein besserer Prompt würde keine
dieser Lücken schließen.

---

## 4. Entscheidung: kontrollierter Neuaufbau

Ursprünglich war ein Neuaufbau nur der Buddy-Schicht auf dem bestehenden Schema geplant. Nach der
Freigabe des Product Owners („alles kann neu gemacht werden … fresh starten", 25.09.2026) wurde
stattdessen **das Backend vollständig neu aufgebaut** – begründet durch die Diagnose:

- Buddys Garantien brauchen **Transaktionen**: Eine Modellentscheidung darf nur ganz oder gar
  nicht und nur auf dem Stand angewendet werden, auf dem sie getroffen wurde (Kontext-Version,
  Zeilensperre, Compare-and-set). Die alte API arbeitete über den Supabase-REST-Client ohne
  Transaktionen; Nachbesserung hätte jede Route berührt.
- Das alte Schema kannte weder Gedächtnis, Ziele, Schritte, Entscheidungen, Aktionen noch
  Zustellnachweise; Termine hingen an Ordnern, Credits an jeder Modellnutzung. Ein Anbau hätte zwei
  Wahrheiten für Termine und Kosten erzeugt.
- Es gibt keine Produktivdaten: ein frischer Start ist sauberer als eine Übergangsschicht.

**Kontrolliert** heißt: zuerst der vollständige Kernablauf (kennenlernen → Kontext behalten →
selbstständig tätig werden → Ergebnis zeigen → Feedback verstehen → anpassen), geprüft gegen eine
echte Postgres-Datenbank inklusive Fehlern und Unterbrechungen, erst danach die Oberfläche. Nur
das Modell wird in Tests durch skriptierte Antworten ersetzt; alles andere ist der echte Code.

Aufbau (Details in [ADR 0004](../adr/0004-proactive-buddy.md) und [Architektur](../architecture.md)):

- **Gedächtnis** (`buddy_memories`): Fakt, Präferenz, Ziel, befristete Situation – mit dem
  wörtlichen Zitat der lernenden Person als Herkunft, Gültigkeit, Versionierung; korrigierbar.
- **Planung** (`buddy_goals`, `buddy_steps`): Ziele besitzen ihr Datum; Schritte mit Zuständen
  _geplant → vorbereitet → begonnen → erledigt (mit Nachweis) | übersprungen | abgebrochen_.
- **Scheduler** (`jobs` + `/internal/tick`, pg_cron): Termine, Ereignisse und Routine – mit
  Leasing, Fencing-Token, begrenzten Wiederholungen und Heartbeat.
- **Werkzeuge** (`modules/buddy/tools.ts`): die einzige Art, wie eine Modellentscheidung etwas
  ändert; Aliase statt IDs, Tages-Angaben statt Datumsrechnung, Zitat-Nachweis, Undo-Daten.
- **Ausführung** (`apply.ts`, `buddy_decisions`, `buddy_actions`): atomar, protokolliert,
  rückgängig machbar (verweigert, wenn sich inzwischen etwas geändert hat).
- **Kontaktsteuerung** (`policy.ts`): Opt-in, Ruhezeiten, Grenzen, Pause, Themen-Dedupe – als
  reine Funktion, beim Planen und erneut beim Senden geprüft.
- **Zustellung** (`delivery.ts`): _geplant → wird gesendet → angenommen (Ticket) → an Apple/Google
  übergeben (Receipt)_; ungewisse Sendungen werden nie wiederholt; „geöffnet" nur mit App-Nachweis.
- **Berechtigungen**: Buddy kann Kontakt nie einschalten oder erhöhen; bei Minderjährigen braucht
  jede Lockerung die PIN der erwachsenen Person (serverseitig geprüft).

**Ersetzt** werden die Startseite (wird Buddy), die Tab-Leiste, das lokale Erinnerungssystem und
die Wortlisten-/Festtext-Logik im Tutor (strukturierte Bewertung, Invarianten im Server).
Material, Gedächtnis, Einstellungen und Verlauf sind über Buddy erreichbar, aber zweitrangig.

---

## 5. Weitere Befunde außerhalb des Kernablaufs

Beim Lesen gefunden, **nicht** Teil dieser Umsetzung, als Folgeaufgaben notiert:

- Minderjährigen-Onboarding (J2) ist gebrochen: `add-profile.tsx:44` sendet
  `minor_consent_version: null`, die API lehnt Minderjährige ohne Einwilligung ab; die
  Signup-Checkbox „16+ (oder mit Erlaubnis der Eltern)" ist keine wirksame Art.-8-Einwilligung.
- Einwilligung wird beim Login-Pfad ohne angezeigten Text gespeichert (`consent.tsx:33`).
- `SECURITY DEFINER`-Funktionen (`lb_pick_session_items`, `lb_acquire_cron_lock`,
  `lb_invoke_edge_function`, …) sind für `anon` ausführbar (lokal geprüft mit
  `has_function_privilege`); über PostgREST mit dem öffentlichen Anon-Key aufrufbar.
- Offline-Outbox-Tabelle wird nie angelegt (`lib/db/index.ts`); Ordner-Archivieren tut nichts
  (`folder/[folderId].tsx:116-126`); RevenueCat-App-User-ID wird nie gesetzt; DSGVO-Export ohne
  `conversation_turns`.
- `EXPO_PUBLIC_DEV_SUPABASE_SERVICE_KEY` (`lib/dev/reset.ts:41`) würde bei gesetzter Variable den
  Service-Role-Key ins App-Bundle einbauen.

Buddy-Tabellen werden von Anfang an in DSGVO-Export und -Löschung (Cascade) einbezogen.
