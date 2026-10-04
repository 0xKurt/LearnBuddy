-- Leseverständnis: mehrere Fragen zu EINEM Text, der sichtbar bleibt (Issue #233).
--
-- Genau eine Spalte und keine neue Tabelle, aus demselben Grund wie `listen_task` (0077): die
-- Antwortformen bleiben die, die es gibt (`multiple_choice` — richtig/falsch ist eine mit zwei
-- Optionen, die Code schreibt —, `short`, `order`), die Bewertung bleibt dieselbe, FSRS bleibt
-- dasselbe, die Fragekarte bleibt dieselbe. Neu ist nur, dass über der Frage ihr Text steht.
--
-- Der Text steht an JEDER Frage seiner Gruppe: die Wiederholung (`item_states`) bringt eine
-- einzelne Frage in drei Wochen allein zurück, und dann muss sie ihren Text mitbringen. Die
-- Gruppe sind die Fragen mit demselben Text; die App bekommt dafür einen gemeinsamen Alias
-- (`PassageView.ref`, packages/shared-types/src/contracts/reading.ts).
--
-- Zeilenweise, wie gedruckt (`ReadPassage`): „Z. 12“ in einer Frage meint Zeile 12 des Blatts,
-- und Code prüft vor dem Speichern, dass es sie gibt (apps/api/src/modules/practice/reading.ts).
-- Anders als ein Hörtext ist er der Reiz, nicht die Lösung: die App bekommt ihn, solange die
-- Frage offen ist.
--
-- Kein Backfill: alte Zeilen haben keinen Lesetext und werden genau wie bisher behandelt.

alter table items add column read_passage jsonb;

comment on column items.read_passage is
  'Leseverständnis (Issue #233): der Text, zu dem diese Frage gestellt ist — {"title": …, "lines": [...], "lang": …}, geprüft als ReadPassage. Zeilenweise wie gedruckt; Zeilenverweise der Frage sind gegen genau diese Zeilen geprüft (practice/reading.ts). null für jede andere Frage.';

-- Eine Frage hat höchstens einen Text als Reiz: einen, den sie liest, oder einen, den sie hört.
alter table items add constraint items_one_text
  check (read_passage is null or listen_task is null);
