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
