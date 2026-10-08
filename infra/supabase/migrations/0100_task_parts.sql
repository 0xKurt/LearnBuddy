-- Aufgaben mit Teilaufgaben: ein Material, a) b) c) darauf, und Folgefehler (Issue #297).
--
-- Genau eine Spalte und keine neue Tabelle, aus demselben Grund wie `read_passage` (0086): jede
-- Teilaufgabe ist eine gewöhnliche Frage mit ihrer Antwortform und ihrem Prüfer, FSRS bleibt
-- dasselbe, die Fragekarte bleibt dieselbe. Neu ist, dass über der Frage die Lage steht (ein
-- kurzer Sachtext; eine Zeichnung trägt die Frage wie bisher in `figure`), dass sie ihren Buchstaben
-- kennt, und dass eine spätere Teilaufgabe sagt, wie ihr Ergebnis aus früheren folgt.
--
-- Die Teilaufgabe steht an JEDER Frage ihrer Aufgabe: die Wiederholung bringt eine einzelne in drei
-- Wochen allein zurück, und dann bringt sie ihre Lage mit. Die Aufgabe ist `group`, eine id, die
-- Code beim Speichern macht (Regel 2: das Modell schreibt keine ids); die App bekommt einen Alias.
--
-- `from` ist eine Formel über die Buchstaben früherer Teile („a * 0,15 + 12“). Code hat sie vor dem
-- Speichern mit deren Schlüsseln nachgerechnet; geht sie nicht auf, wurde die ganze Aufgabe
-- verworfen. Beim Antworten rechnet Code damit IHR Ergebnis aus a) weiter: rechnet sie mit einem
-- falschen a) richtig weiter, gilt b) als richtig (Folgefehler, practice/taskParts.ts).
--
-- Kein Backfill: alte Zeilen haben keine Teilaufgabe und werden genau wie bisher behandelt.

alter table items add column task_part jsonb;

comment on column items.task_part is
  'Aufgabe mit Teilaufgaben (Issue #297): {"group": uuid, "part": "a".."d", "of": 2..4, "stem": Lage, "from": Formel über frühere Buchstaben oder null}, geprüft als TaskPart (packages/shared-types/src/contracts/taskParts.ts). Die Formel ist vor dem Speichern gegen die Schlüssel nachgerechnet; mit ihr wird ein Folgefehler gewertet (practice/taskParts.ts). null für jede andere Frage.';

-- Eine Frage hat höchstens einen Reiz über sich: einen Lesetext, einen Hörtext oder eine Lage.
alter table items add constraint items_one_stem
  check (task_part is null or (read_passage is null and listen_task is null));
