# Migrationen: was vergeben ist, und was verbrannt

Regel 10 (`CLAUDE.md`): **eine gemergte Migration ist unveränderlich.** Nicht umbenennen, nicht
ändern, nicht nachträglich einfügen. Jede Änderung danach ist eine neue, höhere Nummer.

## Zwei Nummern sind übersprungen, und sie müssen übersprungen bleiben

**0071 und 0076 gibt es nicht** — sie wurden am 02.10.2026 an parallel arbeitende Agenten vergeben,
die am Ende keine Migration brauchten. Sie sehen aus wie freie Plätze. Sie sind keine.

Der Grund steht nicht im Dateinamen, sondern in der **Reihenfolge**: auf der gehosteten Datenbank
wird eine Migration in der Reihenfolge angewendet, in der sie ankommt, und mit einem Zeitstempel
protokolliert — nicht mit ihrer Nummer. 0077 und 0078 sind dort seit dem 02.10. angewendet. Ein
später nachgeschobenes 0071 oder 0076 liefe auf der Produktion **nach** ihnen, sortierte beim
nächsten `db reset` aber **davor**. Die lokale Datenbank wäre danach ein anderer Stand als die
echte, ohne dass irgendetwas rot würde.

Dasselbe gilt für jede andere Lücke, die je entsteht. **Immer die nächste freie hohe Nummer.**

## Die Reihenfolge weicht schon ab, und das ist belegt

Der Hinweis ist kein Was-wäre-wenn. Die gehostete Datenbank hat am 02.10. in dieser Reihenfolge
angewendet:

```
0072 answers_with_several_parts   20261002102429
0074 curriculum_point             20261002103602
0073 items_pending_until          20261002110030   ← nach 0074
0075 writing_rubric               20261002111215
0077 listening_tasks              20261002111840
0078 staff_tasks                  20261002114003
```

0073 kam **nach** 0074 an, weil die Agenten, die sie geschrieben haben, in anderer Reihenfolge
fertig wurden. Das ist hier folgenlos — beide fügen nur je eine Spalte hinzu, die nichts von der
anderen weiß —, aber es zeigt, dass Nummernreihenfolge und Anwendungsreihenfolge **nicht** dasselbe
sind. Eine Migration, die auf einer vorherigen aufbaut, darf sich darauf nicht verlassen; sie muss
ihre Voraussetzung selbst prüfen oder in derselben Datei stehen.

## Beim Schreiben einer neuen Migration

1. `ls` in diesem Verzeichnis, höchste Nummer + 1. Nie eine Lücke füllen.
2. Bei parallel arbeitenden Agenten: die Nummer **zentral** vergeben und gegen die Branches prüfen,
   nicht nur gegen diesen Ordner — ein Agent, der noch läuft, hat seine Datei vielleicht noch nicht
   geschrieben.
3. Additiv: neue Tabellen, neue Spalten mit Vorgabewert, erweiterte CHECKs. Kein Drop, kein Rename
   (`docs/architecture.md` §Migrations).
4. Der Kommentarkopf sagt, **warum** — die Spalte selbst bekommt ein `comment on column`.
