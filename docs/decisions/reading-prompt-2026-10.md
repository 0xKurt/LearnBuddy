# Blattlesung: Prüfung der Inhaltsbefunde zu #869 / #883, 23.10.2026

Die beiden Vergleichsfragen des zweiten Laufs verletzen eine **beibehaltene Regel**.
Die Auswahl hat diese Regel nicht entfernt; dafür ist keine Produktänderung nötig.
Der zusätzliche Gesamtlauf ist allerdings nicht fehlerfrei: **26/27**, ein neuer
Deutschbefund und zwei vor der Bewertung verworfene Mathefragen. #883 bleibt deshalb
Entwurf. Grundlage: `docs/architecture.md` §Schema budget und ADR 0010.

## Die beiden ursprünglichen Befunde

Gelesen wurden beide Einträge im gespeicherten Bericht des serialisierten Laufs
vom 23.10., 15:22 UTC (`.cache/869/serialized/content.md`):

| Frage, wie sie der Richter erhielt | Schlüssel | Urteil                                                                   |
| ---------------------------------- | --------- | ------------------------------------------------------------------------ |
| Welcher Bruch ist größer?          | `2/3`     | „Es fehlen die beiden Brüche, die miteinander verglichen werden sollen.“ |
| Welcher Bruch ist größer?          | `5/8`     | „Es fehlen die zwei Brüche, die miteinander verglichen werden sollen.“   |

Beide Urteile setzten `answerable` und `one_answer` auf falsch; die übrigen Kriterien
waren erfüllt. Der Richter bekam nur `prompt` und `answer`. Die damaligen vollständigen
Antworten einschließlich Auswahloptionen wurden nicht gespeichert und lassen sich
aus dem Bericht nicht wiederherstellen. Die Befunde werden daher **nicht** zu
Fehlalarmen erklärt, auch nicht mit dem Hinweis auf möglicherweise vorhandene Optionen.

Der Aufrufnachweis (`serialized/content-calls.json`, Aufruf 2) nennt
`forms: [part_tasks]`, `figures: [fraction]`, 14.941 Systemprompt-Zeichen und die
Promptversion `extract.3ac83f84+sources.07ecfd85` auf Stand `c031ae37`.
Der dazugehörige Builder enthält `CHOICE_RULES` unabhängig von der Formenwahl:

> multiple_choice: when the options are what the question compares or picks among
> (which number, fraction, word or object is larger, right, the odd one out), the
> question names them itself, so it reads as a question without its options; a
> printed stem is copied whole.

Diese Regel steht unverändert in `practice/items.ts`, im vollständigen Prompt auf
`main` und im ausgewählten Prompt. Auch `SHEET_PART_RULES` bleibt für `part_tasks`
erhalten; dessen Material muss alle für die Teilaufgaben benötigten Zahlen enthalten.
Die Kürzung entfernt keine Anweisung, die diese beiden Fragen gebraucht hätten.
Die neuen Guard-Tests prüfen die vorhandene Vergleichsregel für die tatsächlich
angepassten Schemas: Teilaufgaben mit Bruchfigur, Teilaufgaben ohne Figur und die
Basisauswahl ohne strukturierte Formen, jeweils für Lernmaterial und Hausaufgaben.

Damit ist für diese beiden Befunde Nichtbefolgung einer vorhandenen Regel belegt,
nicht Regelverlust durch die Auswahl. Eine identische statistische Fehlerrate auf
`main` und diesem Branch ist damit nicht belegt und wird nicht behauptet.

## Zusätzlicher Gesamtlauf mit vollständigen Antworten

Ein unveränderter `evals/content`-Lauf mit beiden vorhandenen Fotoblättern, Lesung,
„Mehr davon“ und unveränderter Bewertungsrubrik. Produktcode, Temperatur und
Ausgabegrenzen blieben unverändert. Modell: `eu/gemini-3.6-flash`, Formenwahl:
`eu/gemini-3.1-flash-lite`. Unter bash mit Maschinensperre, gemeinsamem Postgres
und höchstens zwei Test-Workern. Keine zusätzlichen Wiederholungen auf ein grünes
Ergebnis hin.

Der Mess-Wrapper speichert diesmal die vollständigen strukturierten Antworten und
Anfragetexte einschließlich Systemprompt, Schema und Richterantworten. Fotos werden
im lokalen Protokoll nur durch ihren MIME-Typ vertreten; ihre Quelle bleibt der
unveränderte synthetische Eval-Fall. Lokale Belege:
`.cache/869/follow-up/content.md`, `content.log`, `content-calls.json` und `call-*.json`.

| Stufe                    | Ohne Befund |
| ------------------------ | ----------- |
| Bruchblatt: vom Blatt    | 6/6         |
| Bruchblatt: mehr davon   | 8/8         |
| Deutschblatt: vom Blatt  | 5/6         |
| Deutschblatt: mehr davon | 7/7         |
| Gesamt                   | **26/27**   |

Die ursprünglichen beiden Fragen bestanden mit sämtlichen Kriterien. Aufruf 2
enthält die Vergleichsregel und diese vollständigen Fragen/Optionen:

| Frage                                       | Optionen     | Schlüssel |
| ------------------------------------------- | ------------ | --------- |
| Welcher Bruch ist größer: `2/3` oder `3/5`? | `2/3`, `3/5` | `2/3`     |
| Welcher Bruch ist größer: `5/8` oder `1/2`? | `5/8`, `1/2` | `5/8`     |

Die Brüche sind in der Antwort als Dollar-LaTeX geschrieben. Beide Systemprompts
haben wieder 14.941 bzw. 13.705 Zeichen; die Formenwahl jeweils 3.234.

### Neuer Deutschbefund

Aufruf 23 schrieb für „Setze ein: Ich schenke \_\_\_ (meine Schwester) ein Buch.“:

```json
{
  "kind": "short",
  "prompt": "In welchem Fall steht „meine Schwester“ im Satz: „Ich schenke ___ (meine Schwester) ein Buch.“?",
  "answer": "meiner Schwester",
  "accepted_answers": ["Dativ"],
  "fills_gaps": true
}
```

Aufruf 29 bewertete ausschließlich `one_answer` als falsch: „Die Frage verlangt die
Bestimmung des Falls (Dativ), aber die Antwort nennt die gebeugte Form statt den
Namen des Falls.“ Das zusätzliche `accepted_answers: [Dativ]` ändert den widersprüchlichen
Hauptschlüssel und die Umformulierung der Blattaufgabe nicht. Dieser Befund ist offen;
sein Fehleranteil gegenüber `main` wurde nicht gemessen.

### Zwei vor der Bewertung verworfene Fragen

Aufruf 2 schrieb auch die beiden Umwandlungen `7/4` und `11/3` mit korrekten
Hauptschlüsseln `1 3/4` bzw. `3 2/3`, aber zusätzlich mit den ungültigen alternativen
Antworten `1 3\4` und `3 2\3`. `usableItems` verwarf beide mit Grund `notation`,
weil `drawsUnsupported` auch `accepted_answers` prüft. Deshalb wurden nur sechs
der acht gelesenen Bruchaufgaben bewertet.

Die gemeinsame Notationsregel blieb ebenfalls vollständig im gesendeten Prompt:
Sie umfasst ausdrücklich `answers and accepted_answers`, nennt die erlaubten
LaTeX-Befehle und kündigt das Verwerfen nicht unterstützter Notation an. Der konkrete
Verwerfungsgrund ist damit belegt; der grüne Teilwert 6/6 belegt jedoch keine
vollständige Blattabdeckung. Die Produktvalidierung wurde nicht gelockert.

## Guard-Nachweis und Kosten

- Rot: `CHOICE_RULES` vorübergehend ausschließlich bei übergebener Formenwahl aus
  beiden Buildern entfernt. Die beiden neuen Prüfungen schlagen fehl; zusammen mit
  den bestehenden Vollauswahl-Prüfungen 4 fehlgeschlagene und 8 bestandene Tests.
- Grün: unveränderten Produktcode wiederhergestellt, **12/12** in
  `readingPrompt.test.ts`. Dies ist ein Mutationstest für den Guard, keine Behauptung,
  dass im Produkt ein fehlender Regelblock repariert wurde. Der ursprüngliche
  Rot-Grün-Nachweis der Promptkürzung bleibt im PR dokumentiert.
- 41 Provider-Versuche einschließlich aller Richter: **0,124987 USD netto**, mit
  konservativer Bruttorechnung **0,248730 USD** zusätzlich, unter dem Limit 0,40 USD.
  Vorher und nachher im gemeinsamen `BUDGET-LEDGER.md` als `869-follow-up` erfasst.
  Jeder Versuch reservierte sein Budget einschließlich Ausgabegrenze vor dem Senden.
- `.env.local` aus dem Hauptcheckout nur für den Lauf kopiert; danach diese Kopie
  und die temporäre Zugangsdaten-Datei gelöscht. Browser beendet, Sperre freigegeben.

Offen bleiben der neue Deutschbefund und der Abdeckungsnachweis für die verworfenen
Mathefragen. Vor „ready“ müssen diese gezielt gegenüber dem vollständigen Prompt
geprüft und ein vollständiger Abnahmelauf belegt werden. Keine Geräte- oder
Oberflächenprüfung, da keine Oberfläche geändert wurde.

## Direkter A/B-Vergleich am 23.10.: erste Runde, Budgetgrenze

Auftrag: dieselben beiden `evals/content`-Blätter auf `origin/main` und diesem
Branch, abwechselnd zwei Runden je Stand, höchstens 0,60 USD. Geplante Reihenfolge:
main 1 → Branch 1 → main 2 → Branch 2. Tatsächlich ausgeführt wurde nur das erste
Paar; die zweite Runde ist **nicht belegt**. Der PR bleibt Entwurf.

Verglichen wurden `cc47e303580de5bf94d9a031ec3d9ab7796f05b0` (main) und
`13e5d9a781a35d6359d6e3d7e8cf1c15858980c4` (Branch nach Rebase). Der einzige neue
main-Commit gegenüber der vorigen Nachprüfung ändert die Provider-Dokumentation.
Beide Läufe verwenden den unveränderten vollständigen `evals/content/run.ts`,
dieselben Modelle, Temperaturen, Ausgabegrenzen, Richter und Validatoren.
Die tatsächlich gesendeten JPEGs sind je Blatt SHA-256-identisch. Beide Läufe
liefen nacheinander in demselben Worktree, unter der Maschinensperre und mit dem
gemeinsamen Test-Postgres. Keine Wiederholung auf ein günstiges Ergebnis hin.

| Lauf     | Mathe vom Blatt  | Deutsch vom Blatt | Mehr davon | Gesamt bewertet | Erhaltene Blattaufgaben | Gemischte Zahlen verworfen | Netto USD | Brutto USD |
| -------- | ---------------- | ----------------- | ---------- | --------------- | ----------------------- | -------------------------- | --------- | ---------- | --- |
| main 1   | 8/8              | 5/5               | 16/16      | 29/29           | 13/14                   | 0/2                        | 0,144410  | 0,281640   |
| Branch 1 | 7/7              | 6/6               | 16/16      | 29/29           | 13/14                   | 0/2                        | 0,123868  | 0,246492   |
| main 2   | nicht ausgeführt | —                 | —          | —               | —                       | —                          | —         | —          |
| Branch 2 | nicht ausgeführt | —                 | —          | —               | —                       | —                          | —         | —          | —   |

Die Quotienten der ersten vier Bewertungsspalten zählen nur die tatsächlich
bewerteten Fragen. „Erhaltene Blattaufgaben“ verwendet dagegen alle acht Mathe-
und sechs Deutschaufgaben als festen Nenner; eine verschwundene Aufgabe zählt
hier nicht als Erfolg.

### Die beiden gemischten Zahlen und die gesendeten Regeln

Beide Stände lieferten und behielten `7/4 → 1 3/4` und `11/3 → 3 2/3` korrekt.
main schrieb sie in `items`, der Branch in `part_tasks`. main verwendete für die
alternativen Antworten die gewöhnliche Schrägstrichschreibweise; der Branch
zusätzlich gültiges `\frac`. Die früheren ungültigen Varianten `1 3\4` und
`3 2\3` traten in keinem der beiden Läufe auf. Das ist **0/2 gegen 0/2 in einer
Runde**, kein belastbarer Nachweis gleicher Fehlerraten.

Die vollständige `MATH_RULES`-Anweisung einschließlich `answers and
accepted_answers`, erlaubter Befehle und Verwerfungswarnung ist in sämtlichen
vier gespeicherten Lese-Prompts bytegleich. Auch `NUMERIC_KEY_RULES` ist
bytegleich. SHA-256 der verglichenen Textabschnitte (ab dem jeweiligen Regeltext
nach dem identischen Präfix bis zur nächsten Regel):

- Notation: `51bc3ceacd2365ac9156233c8877f87b3279adb568d89b0aadf4d52bc2c8736d`.
- Numerische Schlüssel: `3765ba79419ed2d17bc16683f7782a8779892f34ed1a6fe35b4a09a1fab168e8`.

Die ausgewählten Systemprompts hatten 14.941 Zeichen für Mathe und 13.705 für
Deutsch; main hatte 44.101 bzw. 44.108. Die Formenwahl hatte 3.234 gegenüber
44.293 Zeichen. **Keine fehlende Mathe- oder Notationsregel und keine Änderung
am Produktcode erforderlich.** Die neuen Tests schützen genau diese vorhandenen
Regeln bei den beobachteten Auswahlen und beim Fallback, für beide Lesewege.

### Abdeckung trotz grüner Richterwerte

- main erzeugte die Deutschaufgabe „Ich schenke \_\_\_ (meine Schwester) ein Buch“
  als `cloze` mit einer Lücke. Die bestehende Validierung verlangt mindestens
  zwei (`CLOZE_MIN_GAPS`); die Aufgabe gelangte nicht in die Übung. Die im
  vollständigen Prompt enthaltene Cloze-Regel sagt ebenfalls mindestens zwei.
- Der Branch las die Pizza-Aufgabe vollständig, ordnete sie aber unter `unclear`
  ein: Die Frage verlange den Namen einer Person, sei als kurze Antwort oder
  Auswahl lösbar, sei aber eine einfache Wortaufgabe. Das ist keine unleserliche
  Stelle; die erhaltene `UNCLEAR_RULES`-Anweisung verlangt eine tatsächlich
  unentscheidbare Stelle. Die Aufgabe gelangte nicht in die Übung.
- Der frühere Deutschfehler „Fallname gefragt, gebeugte Wortgruppe als Schlüssel“
  wiederholte sich im Branch nicht; dort wurde die Lücke korrekt abgefragt.
  main bewertete diese Aufgabe wegen des oben beschriebenen Verlusts nicht.

Gleiche Gesamtwerte verdecken hier unterschiedliche Abdeckungslücken. Die
zweite vorab geplante Runde fehlt; deshalb wird weder Regressionsfreiheit noch
statistische Gleichwertigkeit behauptet und `gh pr ready` nicht ausgeführt.

### Nachweise, Budget und Begrenzung

- Neuer Guard rot: Notationsregel vorübergehend nur bei übergebener Formenwahl
  entfernt → **4 rot / 10 grün**, darunter beide neuen Prüfungen. Danach exakt
  den ursprünglichen Produktcode wiederhergestellt → **14/14 grün** in
  `readingPrompt.test.ts`. Ein Mutationstest des Guards, keine Produktkorrektur.
- 85 Provider-Versuche, sämtlich mit Verbrauchswerten: **0,268278 USD netto /
  0,528132 USD brutto**. Vorher/nachher je Charge im gemeinsamen Budget-Ledger;
  jeder Versuch einschließlich Richter und Wiederholungen reserviert vorab
  sein Budget. Keine ungemessenen Kosten. Lokale vollständige Belege:
  `.cache/869/ab/{main-1,branch-1}/{content.md,content.log,call-*.json,calls.json}`.
- Die Preistabelle beschreibt den halben Flash-Preis als spätere Gutschrift,
  nicht als niedrigeren Rechnungsbetrag. Deshalb wurde bis zur ausdrücklichen
  Klärung **brutto** gegen die Grenze von 0,60 USD gerechnet. Übrig bleiben
  0,071868 USD brutto; das zweite vollständige Paar kostet voraussichtlich
  weitere rund 0,53 USD brutto. Vier Läufe lägen nach diesem Paar bei rund
  0,54 USD netto / 1,06 USD brutto. Ob die Vorgabe netto gemeint ist, wurde vor
  den Läufen zur Klärung gestellt; ohne Antwort keine Ausweitung.
- `.env.local` wurde je Lauf kopiert und anschließend zusammen mit der eigens
  angelegten Zugangsdaten-Datei entfernt. Die Eval-Browser wurden geschlossen
  und die Sperre nach jeder Charge freigegeben. Keine Produktionsdaten verändert.

Offen: zweites vollständiges A/B-Paar nach Klärung der Budgetbasis sowie die
Bewertung, ob sich die unterschiedlichen Abdeckungslücken wiederholen.
