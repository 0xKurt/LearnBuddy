# Browser-Regressionen vom 24.10.2026 (#913)

Quelle: Owner 23./24.10.: „Die App muss zuverlässig laufen. Alle Funktionen zuverlässig … Ich habe etwas Angst, dass es bereits verbaut wurde.“ Ausgangsbefund: die 34 übergebenen Fehler des noch laufenden Walkthroughs auf `b966f9ff`. Bearbeitung ausschließlich im zugewiesenen Worktree, Basis `879532cb`. Keine Live-Modellaufrufe, keine Produktionsänderung.

## Ursachen

| Kürzel | Klasse | Nachweis und Korrektur |
| --- | --- | --- |
| S1 | b – Szenario | #856 (`17b04203`) verlagerte die Formauswahl aus den Fakes ins Vitest-Setup. Der Browser lädt dieses Setup nicht: `forms` war ungeskriptet, der minimale Satz entfernte alle benötigten Formen/Abbildungen. Die Szenarien laden jetzt dieselbe Domain-Auswahl. Zusätzlich passen die Leseregeln auch auf den seit #883 verkürzten Auswahl-Prompt; das Vorauslesen verbraucht keine Lesung. |
| S2 | b – Szenario | Seit #885 enthält der Generierungsaufruf gemessene Lernlücken. Breit passende Regeln wählten deshalb Malnehmen statt Dativ. Das Dispatching ignoriert den Lernlückenblock, behält aber Wunsch und Quelllauf. |
| S3 | b – Szenario | „Mehr davon“ nach dem Arbeitsblatt kann nur dessen bekannte Formen nutzen. Die allgemeine Brüche-Antwort enthielt ausschließlich eine Abbildungsfrage und wurde vollständig verworfen. Der Wiederholungsaufruf bekommt jetzt sein eigenes Skript mit Aufgaben innerhalb der Quellformen. |
| S4 | b – Ablaufskript | Die Aufsatzprüfung scrollte absichtlich zur Frage zurück und erwartete anschließend, dass ein Theme-Wechsel wieder zum Feedback springt. Seit #640 bleibt die manuelle Leseposition erhalten. Der Ablauf kehrt nach der geprüften Frage zum Feedback zurück. Auch die Leseprüfung geht jetzt ausdrücklich mit „Weiter“ zur nächsten Frage; beim Rechenweg scrollt der Ablauf nach dem Feedback zur Frage zurück; alle bisherigen Assertions bleiben erhalten, die erhaltene Belegstelle wird zusätzlich geprüft. |
| T1 | c – zeitlicher Ablauf | Beim Umbenennen folgte `page.reload()` unmittelbar auf den Klick, vor Abschluss des PATCH. Mit 250 ms Verzögerung des echten PATCH reproduziert: Reload verliert den Namen. Die Prüfung wartet jetzt auf die erfolgreiche echte API-Antwort und das geschlossene Formular, bevor sie Persistenz nach Reload prüft. |
| P1 | a – Produkt | Ein gescheitertes Angebot entzog nur der Karte den Start, während die Antwort weiter Erfolg behauptete. Der gemeinsame Vorbereitungspfad korrigiert Antwort und Kartenstatus in einer Transaktion unter dem Kontext-Lock. Vorübergehende Fehler lassen einen erneuten Versuch zu; bestehende Sitzungen und fremde Angebote bleiben unangetastet. Der Prompt trennt Angebot und nachgewiesene Vorbereitung. Auch Angebote ohne Bildwunsch werden bis zum Vorbereitungsergebnis zeitnah nachgeladen; ein gescheiterter Start aktualisiert die korrigierte Nachricht. |
| P2 | a – Produkt | Seit den dauerhaften Ankündigungskarten (#852/#855) erschienen dieselben Aufgaben/Zeitangaben neben der Startleiste und zwei „Ansehen“-Aktionen für dasselbe Ergebnis. Automatische Ankündigungen überlassen die Karte der sichtbaren Leiste bzw. dem aktuellen Ergebnis. Verlauf und ausgeblendete Leiste behalten den Einstieg. Der nächste unveränderte Check zeigte zusätzlich 88 px Überlauf: die abgeschlossene Fotovorschau wird zur vorhandenen 48-pt-Kachel mit Vollbildzugang, und eine unsichtbare Karte erzeugt keinen Abstandsrahmen. |
| P4 | a – Produkt | Seit #778 gilt `/me` fünf Minuten als frisch, beim Wiederherstellen wurde es jedoch nur eine Minute alt markiert. Der Neustart zeigte die gespeicherte Profilkopie ohne die zugesagte Hintergrundaktualisierung. `updatedAt: 0` erzwingt die Bestätigung nach jedem Restore; die Wiederverwendung zwischen Screens bleibt fünf Minuten lang erhalten. |
| P3 | a – Produkt | Der Rechenweg-Komponist belegte mit drei Zeilen und Tastatur 255 pt, auf dem kleineren Telefon sind höchstens 220 pt verfügbar. Die optionalen Chips falten anhand der gemessenen Feldhöhe, bevor die Leiste mehr als die halbe sichtbare Höhe belegt; Entwurf, Schlüssel und 44-pt-Bedienflächen bleiben vollständig. |
| P5 | a – Produkt | Eine auf null Höhe begrenzte Feedbackbox hielt ihre Kinder weiter im Layout und in der Tastatur-/Screenreader-Navigation. Die ganze innere Scrollfläche faltet bei null Platz; ihre Bedarfsmessung bleibt erhalten, damit sie wieder erscheinen kann. |
| P6 | a – Produkt | Während einer Frage zur strukturierten Aufgabe faltete zwar das Brett, aber nicht die optionale Tipp-Zeile. Bei enger Tastaturhöhe wurden Kopfaktionen abgeschnitten. Auch der Fokus der Frage faltet die optionale Hilfe. |
| P7 | a – Produkt | Die maximalen Reihenfolge-, Zuordnungs- und Lückentext-Aufgaben wurden unter Frage, Hilfe und Eingabefeld abgeschnitten. Die vorhandene kompakte Frage und kleinere Kachelabstände erhalten Schrift und Touch-Ziele. Gemessener Überlauf gibt zuerst die optionale Hilfe frei. Beim langen Satz zum Markieren verschob zu großer Wortinnenabstand das letzte Wort in eine dritte Zeile; ein normaler Wortabstand erhält sämtliche 44-pt-Ziele und die bisherige Zweizeilenprüfung. |
| S5 | b – Ablaufskript | Nach einer zweiten Übung fand eine allgemeine Textsuche zusätzlich das Ergebnis der darunter gemounteten Startseite. Die Prüfung verlangt jetzt genau eine sichtbare Überschrift „Geschafft!“. |
| S6 | b – Szenario | Der simulierte Transkribierer lieferte für jedes Audioteilstück denselben ganzen Satz. Ein Fortsetzungsaufruf mit bereits gesprochenem Kontext liefert keine Wiederholung; sonst wurde aus einem Satz eine doppelte, ungeskriptete Nachricht. Die simulierte Sprachausgabe bleibt auch für das anschließende Gespräch aktiv; zuvor entfernte der Ablauf sie und fiel auf die unzuverlässige Sprachausgabe des Headless-Browsers zurück. |

P1 ist zusätzlich zu den einzelnen Spec-Ursachen relevant: das Diagramm-Beispiel zeigt zugleich den Szenariofehler S1 und die unzutreffende Produktantwort P1.

## Die 34 übergebenen Fehler

Die Zeilennummern bezeichnen den Ausgangsstand. **a** = Produkt, **b** = Szenario/Ablaufskript, **c** = nachgewiesener zeitlicher Ablauf. S4 benötigt keinen zusätzlichen Modellaufruf; hier war eine bewusst ausgeführte Navigation die veraltete Szenarioannahme.

| Spec / Fall | Klasse | Ursache / Fix | Erneuter Lauf |
| --- | --- | --- | --- |
| `charts.spec.ts:100` · charts: every chart type drawn, read and judged by code | b | S1 | Erster gezielter Lauf grün |
| `circuits.spec.ts:11` · circuits, logic gates and the colour wheel: read, answered, graded by code | b | S1 | Erster gezielter Lauf grün |
| `core-loop-plan.spec.ts:15` · core loop · plan: a test, a photo → practice prepared by Buddy | a | P2 | Zweiter gezielter Lauf grün |
| `core-loop-practice.spec.ts:19` · core loop · practice: short practice, feedback remembered, the greeting after it | a | P2 | Erster gezielter Lauf grün |
| `diagrams.spec.ts:12` · diagrams: gaps in boxes with arrows, answered, graded by code | b | S1 | Erster gezielter Lauf grün |
| `ear.spec.ts:13` · ear training: two notes heard, the interval named, graded by code (#445) | b | S1 | Erster gezielter Lauf grün |
| `ear.spec.ts:106` · ear training: a heard rhythm tapped back, its timing measured by code (#445) | b | S1 | Erster gezielter Lauf grün |
| `essay.spec.ts:178` · Lange Texte: she writes an essay, the draft survives, Buddy answers per key point (issue #258) | b | S4 | Erster gezielter Lauf grün |
| `figures.spec.ts:12` · figures to scale and structural formulas: read, answered, graded by code | b | S1 | Erster gezielter Lauf grün |
| `gallery.spec.ts:33` · code tasks: output, the failing line, a function and a query, run by the sandbox (#262) | a, b | S1, P5 | Zweiter gezielter Lauf grün |
| `gallery.spec.ts:110` · tasks in parts with material: a table, a chart and a long source above the parts (#297) | b | S1 | Erster gezielter Lauf grün |
| `grid.spec.ts:96` · drawing on a grid: points, a line, a mirror image, bars — checked by code (issue #249) | b | S1 | Erster gezielter Lauf grün |
| `mark.spec.ts:77` · markieren: words, categories, commas and syllables, counted by code (issue #234) | a, b | S1, S5, P7 | Dritter gezielter Lauf grün |
| `modes.spec.ts:112` · learning modes: explain, homework help without the solution, practice with math | a, b | S1, P6 | Zweiter gezielter Lauf grün |
| `modes.spec.ts:511` · learning modes: reading aloud and talking — at a question, with Buddy, on the talk screen (#386) | b | S1, S6 | Dritter gezielter Lauf grün |
| `modes.spec.ts:707` · a written path: three lines in, the first broken step named (issue #221) | a, b | P3, S4 | Dritter gezielter Lauf grün |
| `modes.spec.ts:823` · an order: tap in order, tap again to take back (issue #228) | a, b | S1, P7 | Zweiter gezielter Lauf grün |
| `modes.spec.ts:906` · a table to fill in: Enter walks the gaps, each cell checked on its own (issue #230) | b | S1 | Erster gezielter Lauf grün |
| `modes.spec.ts:973` · zuordnen at its largest: pairs as rows, things into groups (issues #229, #524) | a, b | S1, P7 | Zweiter gezielter Lauf grün |
| `modes.spec.ts:1093` · pictures as options: four graphs two by two, a tap answers, holding opens one large (issue #231) | b | S1 | Erster gezielter Lauf grün |
| `modes.spec.ts:1145` · note lines: read four, then write one — set with a tap on the line, no arrow keys (#275, #599) | b | S1 | Erster gezielter Lauf grün |
| `modes.spec.ts:1367` · formulas: math keys page by page, the new notation drawn, only the sign over whole numbers (issue #239) | b | S1 | Erster gezielter Lauf grün |
| `modes.spec.ts:1507` · a cloze: five gaps typed, a word bank, the longest that fits; each gap checked by the rules (issue #232) | a, b | S1, P7 | Zweiter gezielter Lauf grün |
| `periodic.spec.ts:12` · periodic table: read, answered, graded by code | b | S1 | Erster gezielter Lauf grün |
| `primary-figures.spec.ts:40` · primary-school figures: read, answered, graded by code | b | S1 | Erster gezielter Lauf grün |
| `reading.spec.ts:79` · a reading text: one text above every question, scrolling alone, folding away | b | S1, S4 | Zweiter gezielter Lauf grün |
| `redesign-done.spec.ts:11` · done pastell light | b | S3 | Erster gezielter Lauf grün |
| `redesign-done.spec.ts:11` · done pastell dark | b | S3 | Erster gezielter Lauf grün |
| `redesign-done.spec.ts:11` · done ocean light | b | S3 | Erster gezielter Lauf grün |
| `redesign-done.spec.ts:11` · done ocean dark | b | S3 | Erster gezielter Lauf grün |
| `redesign-material-title.spec.ts:9` · Material complete title: ocean light | c | T1 | Erster gezielter Lauf grün |
| `redesign-practice-body.spec.ts:92` · ordinary scrolling body and pinned real help: pastell light | b | S2 | Erster gezielter Lauf grün |
| `redesign-practice-body.spec.ts:92` · ordinary scrolling body and pinned real help: pastell dark | b | S2 | Erster gezielter Lauf grün |
| `redesign-practice-body.spec.ts:92` · ordinary scrolling body and pinned real help: ocean light | b | S2 | Im gezielten Lauf grün |

## Spätere Fehler des Ausgangslaufs

Der Ausgangslauf lief während der Analyse weiter und endete ohne Abschlusszählung nach Fall 180 von 281. Zusätzlich aufgezeichnet:

| Spec / Fälle | Klasse | Ursache / Fix | Erneuter Lauf |
| --- | --- | --- | --- |
| `redesign-practice-body.spec.ts` · ocean dark | b | S2 | Im vollständigen Endlauf zu prüfen (Ergebnis im PR-Nachweis) |
| `redesign-practice-feedback.spec.ts` · vier Themes | b | S1, keine Frage nach verworfener Diagrammform | Im vollständigen Endlauf zu prüfen (Ergebnis im PR-Nachweis) |
| `redesign-practice-screen.spec.ts` · vier Themes | b | S1, keine Diagrammfrage nach verweigerter Vorbereitung | Im vollständigen Endlauf zu prüfen (Ergebnis im PR-Nachweis) |
| `redesign-practice.spec.ts` · vier Themes | b | S1, Codefrage außerhalb der minimalen Formauswahl | Im vollständigen Endlauf zu prüfen (Ergebnis im PR-Nachweis) |
| `redesign-profile-view.spec.ts` · drei aufgezeichnete Themes, vier werden geprüft | a | P4, kein `/me` nach Reload | Alle vier Varianten im gezielten Lauf grün |

## Rot → Grün

- Unveränderte Browserprüfungen im eigenen Worktree vor den Korrekturen: Diagramme, Kernablauf Plan, Kernablauf Üben und Fertig ocean light – **4 fehlgeschlagen**.
- Neue isolierte Szenarioprüfung ohne Vitest-Domain-Setup: **3 fehlgeschlagen**, danach **3 bestanden** (Formauswahl, Lernlücken-Kontext, Wiederholung).
- Angebotstest mit falscher Vorbereitungsbehauptung: **1 fehlgeschlagen / 7 bestanden**, danach **8 bestanden**; zusätzliche Tests decken Wiederholung nach Ausfall und fremde Angebots-IDs ab.
- Ankündigungskarten: **2 fehlgeschlagen / 5 bestanden**, danach **7 bestanden**.
- Wiederhergestelltes Profil: **1 fehlgeschlagen / 1 bestanden**, danach **2 bestanden**. Vorher kein `/me`-Aufruf nach Restore, danach Aktualisierung bei sofort sichtbarer gespeicherter Kopie.
- Umbenennen bei verzögertem echtem PATCH: **1 fehlgeschlagen**, wenn nur geklickt und sofort neu geladen wird. danach im gezielten Browserlauf bestanden.
- Feedbackbox ohne Raum: **1 fehlgeschlagen / 1 bestanden**, danach **2 bestanden**.
- Optionale Hilfe beim Fragen mit Tastatur: **1 fehlgeschlagen / 4 bestanden**, danach **5 bestanden**.
- Transkription von Fortsetzungen: **1 fehlgeschlagen / 7 bestanden**, danach **8 bestanden**.
- Polling eines Angebots ohne Bildwunsch: **1 fehlgeschlagen / 5 bestanden**, danach **6 bestanden**.
- Nachricht nach verweigertem Start neu laden: **1 fehlgeschlagen**, danach **1 bestanden**.
- Aktueller fokussierter Stand: **21 API-Tests**, **21 Karten-/Foto-/Profiltests** und **14 Layout-/Abfragetests bestanden**; API- und App-Typecheck grün.
- Erster gezielter Browserlauf mit den 34 ursprünglichen Fällen, vier Profilvarianten und dem neuen Fehlerfall: **28 bestanden / 11 fehlgeschlagen**, 36,2 Minuten. Die weiteren Fehler lagen hinter den zuerst korrigierten Abbrüchen und sind oben klassifiziert.
- Plan-Ablauf nach kompakter Fotovorschau und entferntem Leerrahmen: **1 bestanden**, 35,1 Sekunden.
- Zweiter gezielter Browserlauf: **8 bestanden / 3 fehlgeschlagen**, 13,6 Minuten. Übrig blieben der lange Markiersatz, der Sprachablauf und der Rücksprung zur Frage beim Rechenweg.
- Dritter gezielter Browserlauf: **4 bestanden / 0 fehlgeschlagen**, 4,6 Minuten (Markieren, Sprachgespräch, Rechenweg, verschärfter Vorbereitungsfehler mit Sichtbarkeitsprüfung nach Reload). Damit sind **alle 34 Ausgangsfälle** in den gezielten Läufen grün; zusätzlich alle vier Profilvarianten und der neue Vorbereitungsfehler.
- Der vollständige Endlauf folgt auf die Commit-Hooks. Seine endgültige Zählung und der geprüfte Head stehen im PR-Nachweis zu #913; dieser Bericht hält die Ursachen und die gezielten Rot-Grün-Belege fest.

## Grenzen

Der Browser verwendet die echte Web-App, API und den gemeinsamen lokalen Postgres mit geskriptetem Modell. Keine Aussage zur Qualität echter Modellantworten, Mikrofon-/Audioqualität oder nativen Geräten. Kosten für Live-Modelle: 0 USD. Die vollständige ursprüngliche Prüfung lief beim Beginn der Untersuchung noch; spätere Fehler werden separat erfasst.
