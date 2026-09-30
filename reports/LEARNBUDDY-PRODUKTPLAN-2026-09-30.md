# LearnBuddy konkrete Produktverbesserungen

Dieser Vorschlag ergänzt den [Audit](LEARNBUDDY-AUDIT-2026-09-30.md). Er beschreibt, wie ich LearnBuddy aus dem geprüften Stand `d3b114a` weiterentwickeln würde: konkrete Abläufe, interne Fähigkeiten und überprüfbare Lieferungen. Die folgenden Funktionen sind Vorschläge, keine bereits implementierten Fähigkeiten und keine nachgewiesenen Wirksamkeitsversprechen.

## Die Produktentscheidung

Ich würde LearnBuddy um **gemeinsame Arbeit an einem konkreten Lernproblem** bauen. Buddy kennt das Blatt, hält den aktuellen Bezug, wählt eine passende Lernhandlung und bemerkt, wann Hilfe zurückgenommen werden kann. Die Unterhaltung bleibt der Einstieg; für den jeweiligen Schritt erscheint eine kleine geeignete Arbeitsfläche.

Der entscheidende Fortschritt wäre: Deine Tochter muss weder gute Prompts schreiben noch durch Erklärungen herausfinden, ob sie etwas verstanden hat. Sie kann eine Aufgabe zeigen, etwas versuchen und merken, welcher nächste Schritt ihr hilft.

Dabei hat eine ausdrückliche Bitte Vorrang vor Buddys optimierter Routine. **„Alle Wörter von diesem Blatt“ bleibt genau dieser Umfang.** Buddy darf eine Pause anbieten und den Stand erhalten. Er darf daraus nicht still zehn Wörter, das ganze Fach oder einen anderen Lernmodus machen. Eure Probleme aus #144/#145 sind deshalb eine Produktregel, nicht nur zwei reparierte Parameter.

## 1 Das aktuelle Lernproblem sichtbar halten

**Erfahrung:** Über der aktuellen Handlung steht eine kurze Zeile wie „Französisch · deine Vokabelliste · Deutsch → Französisch“. Im Materialkontext kann sie stattdessen „Mathe · Aufgabe 3 auf diesem Blatt“ sagen. Antippen zeigt das Blatt beziehungsweise die relevante Stelle. „Anderes Blatt“ und eine Korrektur per Sprache bleiben möglich.

Buddy hält intern das aktuelle Anliegen über Chat, Fotoverarbeitung, Übung, Pause und Rückkehr hinweg. Das ist ein Arbeitsobjekt mit Materialbezug, gewünschtem Umfang, aktueller Aufgabe, Abfragerichtung und ausstehender Frage. Es wird aktualisiert, wenn das Kind etwas ändert; ein alter Chattext muss nicht jedes Mal als aktuelle Wahrheit rekonstruiert werden.

**Beispiel:** Nach der Fotoverarbeitung sagt das Kind „nur die Wörter, nicht die Wegbeschreibung“. Buddy ändert den bestehenden Lernbezug. Nach „anders herum“ wechselt die Richtung. Nach „morgen weiter“ bleibt der Fortschritt erhalten. Beim Rückkommen reicht „weiter“.

**Abnahme:** Ein Gespräch mit zwei Französischblättern, mehreren Richtungswechseln, Pause und App-Neustart übt weiterhin genau die vereinbarte Quelle. Bei zwei gleich plausiblen Blättern zeigt Buddy deren Vorschauen zur Auswahl. Er rät nicht. Bezug zu [#144](https://github.com/0xKurt/LearnBuddy/issues/144), [#49](https://github.com/0xKurt/LearnBuddy/issues/49) und Audit F3.

## 2 Eine kleine Lernfläche statt immer mehr Text

Ich würde drei geprüfte Darstellungen zuerst bauen: **Bruchbalken, Zahlenstrahl und eine Vokabelkarte mit gezielter Antwortform.** Sie erscheinen, wenn sie die Aufgabe verständlicher machen. Es entsteht kein neuer Katalog, den das Kind bedienen muss.

Bei Brüchen kann die Tochter zwei Balken vergleichen, eine Hälfte in Viertel teilen oder eine Zahl auf dem Zahlenstrahl platzieren. Bei Vokabeln kann sie eine Bedeutung antippen, ein Wort produzieren oder bei geeigneten Wörtern sprechen. Derselbe Lernbezug bleibt erhalten; die Eingabeform passt zur Handlung.

Das Modell wählt eine erlaubte Darstellung mit begrenzten Parametern. Code berechnet Werte und Lösungen, rendert geprüfte Komponenten und prüft die Antwort. Es erzeugt keine beliebigen ausführbaren Mini-Apps. Text, Darstellung und richtige Lösung stammen aus demselben geprüften Aufgabenobjekt.

**Warum ich das für wichtig halte:** Eine gute Zeichnung kann einen Zusammenhang direkt erfahrbar machen, für den sonst mehrere Chatnachrichten nötig wären. Die Vereinfachung entsteht durch passende Handlung, nicht nur durch weniger Knöpfe.

**Abnahme:** Fünf Minuten sinnvolle Übung ohne verpflichtenden vollständigen getippten Satz. Eine mathematisch gleichwertige Darstellung bleibt korrekt; Sprache/Text sind weiter erreichbar. Die konkrete Lernwirkung muss im Pilot geprüft werden. Bezug zu [#147](https://github.com/0xKurt/LearnBuddy/issues/147).

## 3 Fehler als prüfbare Vermutung behandeln

Heute kann eine falsche Zahl sicher abgelehnt werden, ohne dass der Tutor den Denkweg aufgreift. Ich würde eine eigene pädagogische Entscheidung nach dem Urteil ergänzen: welche beobachtete Hürde ist plausibel, und welche kleinste Handlung kann sie klären?

Für `1/2 + 1/4 = 2/6` könnte Buddy fragen: „Hast du oben 1 + 1 und unten 2 + 4 gerechnet?“ Das ist eine Vermutung. Bei „Nein“ muss sie verworfen werden; bei „Ja“ folgt eine passende Darstellung. Buddy zeigt, dass dieselbe Hälfte auch zwei Viertel sein kann. Danach ergänzt die Tochter einen Schritt selbst.

Die Hilfe kann je nach Hürde ein Beispiel, eine vervollständigbare Rechnung oder eine Frage sein. „Weiß nicht“ soll keine Folge weiterer unerreichbarer Fragen starten. Wer ausdrücklich eine Erklärung möchte, bekommt eine Erklärung; eine Diagnose ist kein verpflichtender Eingangstest vor jeder Hilfe.

**Abnahme:** Drei plausible Fehlwege derselben Aufgabenfamilie führen zu unterschiedlichen passenden Reaktionen. Eine verworfene Vermutung wird nicht zur dauerhaften Schwäche. Nach Unterstützung folgt ein selbstständiger Versuch. Bezug zu Audit F5 und [#77](https://github.com/0xKurt/LearnBuddy/issues/77).

## 4 Ein kompletter Ablauf am Beispiel einer Matheblockade

| Schritt                 | Was die Tochter tut                                                                            | Was Buddy konkret tut                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Problem zeigen          | „Die dritte Aufgabe verstehe ich nicht“, Foto oder Tap auf die Stelle.                         | Hält genau diese Aufgabe fest. Bei unlesbaren Zeichen fragt er zur betroffenen Stelle nach. |
| Ansatz sichtbar machen  | Zeigt ihre Rechnung, sagt den ersten Schritt oder „ich weiß gar nicht, wie ich anfangen soll“. | Verwendet den vorhandenen Ansatz; ohne Ansatz erklärt er ein kleines Beispiel.              |
| Zusammenhang bearbeiten | Vergleicht Bruchbalken oder ergänzt einen fehlenden Schritt.                                   | Prüft den Schritt; die Hilfe bezieht sich auf die konkrete Hürde.                           |
| Selbst versuchen        | Rechnet eine passende Aufgabe auf Papier oder in der App.                                      | Nimmt die Hilfe zurück und prüft das Ergebnis.                                              |
| Nachweis begrenzen      | Löst eine andere Aufgabe ohne Hilfe oder beendet heute.                                        | Sagt, was heute selbst gelang. Unterstützte Leistung bleibt unterstützt.                    |
| Später wiederkommen     | Probiert eine kurze Variante nach Abstand.                                                     | Aktualisiert den Lernbeleg, ohne daraus vorschnell „Brüche beherrscht“ zu machen.           |

Für Hausaufgaben kann Buddy zunächst ein paralleles Beispiel mit anderen Zahlen vollständig vormachen. Anschließend löst das Kind seine Originalaufgabe. Das trennt verständliche Lehre und das Übernehmen der eigentlichen Arbeit. Eine feste Zahl von Tipps ist dabei keine pädagogische Notwendigkeit.

Wenn die Tochter die Aufgabe schon kann, wird der Ablauf kurz. Wer nur eine Vokabel wiederholen möchte, durchläuft keine Mathediagnose. Ein gutes System passt die Unterstützung an; es zwingt nicht jeden Anlass in denselben Dialog.

## 5 Vokabeln vom Bestand bis zum eigenen Abruf verbinden

Ein vollständiger Materialbestand und eine Übungssitzung sind getrennte Dinge. Eine Liste mit 50 Paaren bleibt eine Liste mit 50 Paaren. Lesen kann in mehreren Jobs erfolgen; die Wortpaare haben stabile Bezüge. Der Parser darf nicht still den Rest entfernen.

Danach würde ich drei Arten von Lernhandlungen unterscheiden:

- **Bedeutung erkennen:** geringe Eingabehürde, plausible Ablenker aus passenden eigenen Wörtern. Das zeigt Wiedererkennen.
- **Wort selbst abrufen:** Antwort tippen oder bei geeignetem Prüfziel sprechen. Das zeigt Produzieren in dieser Richtung.
- **In einem kurzen Zusammenhang verwenden:** nur wenn der Schulstoff das verlangt; ein Wort im Satz ergänzen oder zwischen zwei passenden Kontexten wählen.

Eine richtige Auswahl darf nicht automatisch den Nachweis der Wortproduktion ersetzen. Ein fehlender Artikel, eine falsche Bedeutung und ein Eingabefehler erhalten unterscheidbare Rückmeldungen. Gesprochene Antworten prüfen Aussprache beziehungsweise mündlichen Abruf, nicht zuverlässig Rechtschreibung.

Bei „alle abfragen“ bleiben alle vereinbarten Paare im Durchgang. Bei „zehn reichen heute“ wird der Umfang bewusst geändert. Eine Pause speichert die Position. Buddy sagt etwa „Dein Blatt hat 50 Wortpaare; wir machen Deutsch → Französisch“. Eine Zahl von 100 Fragen in zwei Richtungen wäre eine andere Information und sollte nicht als 100 gelernte Wörter erscheinen.

**Abnahme:** Mehrere Blätter, 50 eindeutige Paare, beide Richtungen, Pause/Resume, Artikel und Synonyme. Wiedererkennen und Produzieren bleiben in den Lernbelegen getrennt. Bezug zu [#145](https://github.com/0xKurt/LearnBuddy/issues/145), [#147](https://github.com/0xKurt/LearnBuddy/issues/147) und Audit F2/F4.

## 6 Unsicherheit an der konkreten Stelle klären

Buddy sollte bei einer unklaren Quelle die kleinste erforderliche Klärung anbieten. Beispielsweise einen Ausschnitt zeigen: „Ist das 12 oder 17?“ oder „Hier fehlt der rechte Rand; diese Aufgabe kann ich noch nicht sicher lesen.“ Gelesene Teile bleiben verwendbar.

Für Antworten sollte „Bewertung stimmt nicht“ direkt am Urteil erreichbar sein. Die ursprüngliche Aufgabe, Quelle, Antwort und verwendete Bewertung bleiben nachvollziehbar. Während einer fachlichen Unklarheit wird keine behauptete Schwäche des Kindes weiterverwendet. Korrigierte Bewertungen müssen auch ihren Lernstandseffekt korrigieren können.

Ein weiteres Modell kann beim Prüfen helfen, ist aber kein unabhängiger Wahrheitsbeweis. Für geeignete Rechenaufgaben werden Lösungen deterministisch aus geprüften Parametern erzeugt. Für offene Fragen braucht es nachvollziehbare Rubriken und fachlich geprüfte Stichproben.

**Abnahme:** Ein absichtlich falscher Schlüssel, eine unlesbare Ziffer und ein fachlich richtiger ungewohnter Lösungsweg ergeben einen verständlichen Prüfweg. Das Kind muss nicht argumentativ gegen einen autoritären Tutor gewinnen. Bezug zu Audit F9 und [#77](https://github.com/0xKurt/LearnBuddy/issues/77).

## 7 Pause und Rückkehr als Teil des Lernens gestalten

Bei „keine Lust mehr“ würde ich eine kurze Wahl anbieten: „Für heute Schluss oder ein kleines Beispiel?“ Bei einer klaren Stop-Bitte endet die Handlung. Buddy hält den vereinbarten Stand, ohne aus einem müden Nachmittag eine Persönlichkeitseigenschaft abzuleiten.

Nach Rückkehr könnte eine einzige passende Handlung bereitstehen: „Bei deinem Zettel waren noch diese Wörter offen. Weiter?“ Eine vorbereitete Wiederaufnahme braucht kein Push. Kontaktfreigabe und Grenzen bleiben eigenständige, geprüfte Zustände.

Das Ende einer Sitzung sagt konkret, was beobachtet wurde: „Zwei Aufgaben heute selbst gelöst; bei einer half das Beispiel.“ Eine spätere Aufgabe bekommt eine stärkere Aussage: „Diesen Gedanken hast du nach drei Tagen wieder selbst angewendet.“ Das sind verständliche Sätze ohne Kompetenz-Dashboard.

**Abnahme:** Ende, Pause und Rückkehr funktionieren nach Neustart. Es gibt keine unbelegte Aufmunterung wie „du bist fast fertig“, wenn das System das nicht weiß. Eine klare Ablehnung erzeugt keine neue Lernverpflichtung. Bezug zu Audit F4/F5 und [#112](https://github.com/0xKurt/LearnBuddy/issues/112).

## 8 Gedächtnis nach Zweck und Kontrolle trennen

Ich würde die Annahme aus [#123](https://github.com/0xKurt/LearnBuddy/issues/123) hinterfragen, dass ein Speicherstopp zwangsläufig den gesamten Buddy nutzlos machen muss. Persönliche Erinnerungen, vorhandene Schulmaterialien, ausdrücklich angelegte Termine, laufende Arbeit und überprüfbare Lernbelege sind unterschiedliche Datenarten.

Ein ausdrückliches „Merk dir nichts Neues über mich“ sollte technisch erfüllbar sein. Buddy kann knapp klären, ob das Kind persönliche Erinnerungen meint oder auch Lernfortschritt. Bestehende Materialien und ausdrücklich vereinbarte Termine können weiterhin verwendet werden, soweit der gewählte Umfang das erlaubt. Die Konsequenz wird beim Einstellen einmal konkret erklärt. Ein vollständiger Löschwunsch bleibt ein anderer Vorgang.

Meine Präferenz wäre ein dauerhafter, bewusst gesetzter Speicherstopp für den gewählten Bereich, den das Kind wieder aufheben kann. Eine automatische Reaktivierung nach einer Woche wäre eine zusätzliche Überraschung. Das ist eine Produktentscheidung zur Diskussion, keine bereits implementierte Einstellung.

Lernhypothesen sollten eng und korrigierbar sein: „Bei diesen zwei Aufgaben brauchte sie Hilfe beim gemeinsamen Nenner“, mit Quelle und Zeitpunkt. „Schlecht in Mathe“ wird daraus nicht. Sensible Erzählungen sind keine Rohstoffe für dauerhafte Lernpersonalisierung; der Schutz muss sämtliche abgeleiteten Kontexte erfassen.

**Abnahme:** Speicherstopp wirkt auch über Summary, Konsolidierung und Hintergrundjobs. Buddy erklärt richtig, welche bereits vereinbarten Funktionen weitergehen und welche eingeschränkt werden. Bezug zu [#108](https://github.com/0xKurt/LearnBuddy/issues/108), [#123](https://github.com/0xKurt/LearnBuddy/issues/123) und Audit F1.

## Welche Werkzeuge ich als Nächstes ergänzen würde

Die vorhandenen administrativen Werkzeuge bleiben sinnvoll. Der nächste wertvolle Ausbau gibt Buddy Möglichkeiten, eine Lernhandlung zu wählen. Die Namen unten sind illustrative Vorschläge für die bestehende Registry; sie müssen nicht als drei öffentliche API-Endpunkte umgesetzt werden.

| Fähigkeit                    | Aufgabe und begrenzte Eingaben                                                                    | Ergebnis, das Code sicherstellt                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `present_learning_activity`  | Aktuelles Anliegen, Zweck wie Erklärung/Diagnose/Übung, geprüfte Aufgabenfamilie und Darstellung. | Versionierte, startbare Aktivität mit Quelle und geprüfter Lösung; verständliche Darstellung. |
| `adapt_learning_support`     | Aktuelle Aktivität, beobachteter Versuch und gewählte Hilfe wie Beispiel/Teilergänzung/Rückfrage. | Unterstützung gehört zur richtigen Aufgabe; ihre Nutzung wird als Hilfe erfasst.              |
| `schedule_independent_check` | Engere Teilfähigkeit, gewünschter Abstand und passende geprüfte Variante.                         | Geplante Probe mit begrenzter Aussagekraft; kein neuer Push ohne vorhandene Erlaubnis.        |

Das Kind sieht die Lernhandlung, nicht Werkzeugnamen. Das Modell interpretiert; die Komponenten und Aufgabenfamilien begrenzen die Ausführung. Ergebnisse zeigen die tatsächlich ausgewählte Quelle und den tatsächlichen Umfang. Die normale Antwort-/Versuchsverarbeitung speichert Belege serverseitig; das Modell kann Erfolg nicht durch einen selbst behaupteten Beleg herstellen.

Für den ersten Prototyp würde ich `present_learning_activity` für eine Bruchfamilie integrieren und die anderen Fähigkeiten zunächst über die vorhandene Sitzungslogik abbilden. Das verhindert, dass eine neue Plattform gebaut wird, bevor der Lernmoment geprüft wurde.

## Wie eure bisherigen Issues den Vorschlag prägen

Die folgende Auswahl basiert auf den gelesenen Issue-Beschreibungen und dem geprüften Code. Sie ist keine Behauptung, dass alle historischen Fehler noch offen sind. Im Audit wurden offene und ältere geschlossene Issues recherchiert; nicht sämtliche Kommentare jedes Issues wurden vollständig ausgewertet.

| Eure Erfahrung                                                                                                                                                                    | Konsequenz für das Produkt                                                                                        | Stand oder verbleibende Prüfung                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [#49](https://github.com/0xKurt/LearnBuddy/issues/49): Materialgrenzen werden im Schulalltag schnell zu eng.                                                                      | Bestand darf nicht vom kurzen Promptfenster abhängen.                                                             | Alte Quellen sind auffindbar; gezielte konversationelle Nutzung braucht noch Handles, Audit F3. |
| [#58](https://github.com/0xKurt/LearnBuddy/issues/58): Ähnliche Aufgaben verlassen bekannten Stoff.                                                                               | Eine Variante erbt Material, Lernziel und Voraussetzungen; ein neues Thema ist eine bewusst erklärte Erweiterung. | Material-/Themenbindung ist verbessert; fachlich geprüfte Inhalts-Evals bleiben notwendig.      |
| [#77](https://github.com/0xKurt/LearnBuddy/issues/77): Geprüft wird zu wenig, ob Inhalt und Erklärung passen.                                                                     | Echte Schulaufgaben samt Antwort- und Hilferubrik werden Bestandteil der Abnahme.                                 | Bestehende Evals nutzen; kleine Live-Stichproben sind kein vollständiger Qualitätsnachweis.     |
| [#80](https://github.com/0xKurt/LearnBuddy/issues/80), [#127](https://github.com/0xKurt/LearnBuddy/issues/127): Einzelne Fixes und grüne Evals erklären den Gesamteindruck nicht. | Mehrzügige Situationen, Rückfragen, Aufwand und Hilfepassung zwischen Versionen vergleichen.                      | Zusätzlich zum Pass/Fail müssen Antworten und Auswirkungen verglichen werden.                   |
| [#108](https://github.com/0xKurt/LearnBuddy/issues/108): Speicherverbot muss über den Prompt hinaus gelten.                                                                       | Schutzdisposition gilt über den vollständigen Datenlebenszyklus.                                                  | Turn-Schutz verbessert; Summary-Bypass neu reproduziert, Audit F1.                              |
| [#111](https://github.com/0xKurt/LearnBuddy/issues/111), [#120](https://github.com/0xKurt/LearnBuddy/issues/120): Was man sagen kann, muss ausführbar sein.                       | Aktuelle Quellen/Fragen und Suchtreffer haben serverseitig gültige Bezüge.                                        | Materialwerkzeuge sind vorhanden; Übergänge und Bestätigung benötigen Korrekturen.              |
| [#112](https://github.com/0xKurt/LearnBuddy/issues/112): Relative Zeiten und Wiederholung waren nicht ausdrückbar.                                                                | Planung wird als genauer, korrigierbarer Zustand gehalten.                                                        | Wiederholung vorhanden; fehlende STATE-Felder/Undo sind neue Folgefehler, Audit F7.             |
| [#144](https://github.com/0xKurt/LearnBuddy/issues/144): Vokabelwunsch führt zu Fragen vom falschen Blatt.                                                                        | Quelle und Lernhandlung bleiben zusammen; keine automatische Auffüllung mit anderem Stoff.                        | Blatt-/Vokabelfilter sind implementiert.                                                        |
| [#145](https://github.com/0xKurt/LearnBuddy/issues/145): Minutenannahme ersetzt gewünschten Umfang.                                                                               | Expliziter Umfang bleibt bindend; Sitzungsportion und Materialbestand sind getrennt.                              | Auswahlfix implementiert, Extraktionsgrenze bleibt, Audit F2.                                   |
| [#147](https://github.com/0xKurt/LearnBuddy/issues/147): Tippen allein ist zu aufwendig.                                                                                          | Darstellung und Eingabeform folgen dem Lernziel; Erkennen und Produzieren bleiben verschiedene Nachweise.         | Antipp-Auswahl ist vorhanden; weitere Formen gezielt prüfen.                                    |
| [#123](https://github.com/0xKurt/LearnBuddy/issues/123): Wunsch nach Speicherstopp ist eine offene Entscheidung.                                                                  | Speicherzwecke trennen und eine echte, verständliche Kontrolle ermöglichen.                                       | Bewusster neuer Produktvorschlag; Entscheidung und Umsetzung stehen aus.                        |

Für mich folgt daraus eine dauerhafte Entwicklungsregel: **Ein Feature ist erst abgenommen, wenn die Tochter es auch korrigieren, später wiederaufnehmen und mit einem älteren Objekt verwenden kann.** Ein erfolgreicher erster Turn ist eine zu kleine Abnahme.

## Drei Lieferungen für den nächsten Entwicklungszyklus

### Lieferung 1 Verlässliche Grundlage für den Pilot

Schutz über Summaries schließen; vollständigen Materialbestand und adressierbare Suchtreffer herstellen; Bestätigungen und Undo binden. Die Ergebnisformulierung „Sitzt“ sofort durch eine belegbare heutige Aussage ersetzen. Den verwendeten Sprachweg auf dem Zieltelefon prüfen.

**Fertig, wenn:** 50-Wörter-Blatt vollständig; altes Blatt per Gespräch gezielt nutzbar; Ablehnung löscht nichts; Pause/Undo/Rückkehr erhalten den Bezug; sensible Inhalte bleiben aus abgeleitetem Lernwissen ausgeschlossen. Die einzelnen Abnahmen stehen im Audit.

### Lieferung 2 Einen Lernmoment vollständig ausreifen

Eine häufige Bruchaufgabe nehmen und daran Lernanker, geprüften Bruchbalken, eigene Schritte, passende Hilfe und eine unabhängige Variante verbinden. Bestehende Registry, Verträge und Übungsfläche erweitern. Eine kurze Vokabelroutine mit Erkennen/Produzieren daneben prüfen. Fachbreite wächst danach anhand echter Nachfrage.

**Fertig, wenn:** Die Tochter kommt von einer echten Blockade zu einem eigenen Schritt. Im normalen Ablauf muss sie den Aufgabenbezug nicht wiederholen. Die Hilfe reagiert auf ihren Versuch. Ihr Aufwand und deine notwendigen Eingriffe werden protokolliert. Ein Misserfolg wird sichtbar, statt als erledigte Sitzung schöngezählt.

### Lieferung 3 Lernen über mehrere Tage prüfen

Unabhängige Varianten mit Abstand, sparsame Rückkehr und vergleichbare Szenarien für Prompt-/Modelländerungen. Erst dann entscheiden, ob „Buddy erklären“, Fehler finden oder Bildzuordnung den Lernmoment weiter verbessert.

**Fertig, wenn:** Eine vorher fachlich geprüfte neue Aufgabe ohne Hilfe zeigt, was erhalten blieb. Unterstützte Erfolge, selbstständige Erfolge und spätere Erfolge werden getrennt. Zwei Wochen mit deiner Tochter liefern Hinweise zur Bedienbarkeit und zum Lernmechanismus; allgemeine Wirksamkeit verlangt breitere Prüfung.

## Was ich persönlich zuerst prototypisieren würde

**Eine einzige gute Bruchblockade auf dem vorhandenen Blatt.** Dazu eine stabile Quellenzeile, ein geprüfter Bruchbalken, eine passende Hilfe und eine neue eigenständige Aufgabe. Das ist klein genug, um mit deiner Tochter zu beurteilen, und umfasst zugleich den Kern deiner Vision.

Die entscheidende Beobachtung wäre: Hat sie anschließend einen Gedanken selbst benutzt, den sie vorher nicht benutzen konnte? Wenn ja, wird daraus ein wiederholbarer Lernmechanismus. Wenn sie nur weniger klicken muss, ist die Oberfläche verbessert; der Lernkern braucht weitere Arbeit.
