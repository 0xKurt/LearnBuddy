-- Informatik: Quelltext lesen, Ausgabe vorhersagen, Fehler finden, selbst programmieren
-- (issue #262, Bausteine QUELLTEXT und CODE_RUN aus #224).
--
-- Dieselbe Änderung, die `items.bar_task` (0064) und `items.staff_task` (0078) schon waren: eine
-- Spalte für die geprüfte Aufgabe, aus der Code alles andere gerechnet hat.

-- ─────────────── die geprüfte Aufgabe ───────────────
--
-- In dieser Spalte steht, was das Modell gesagt hat: ein Programm und eine von drei Aufgaben
-- (`CodeTask`, packages/shared-types/src/contracts/code.ts). Der SCHLÜSSEL steht hier nicht: er
-- ist das Ergebnis einer Ausführung (modules/practice/code.ts, Interpreter in
-- modules/practice/python/) und steht in `items.answer`, wie bei jeder Frage.
--
-- Gespeichert wird die Aufgabe aus denselben drei Gründen wie Balken und Notenzeile:
--   * sie ist die EINE Quelle der Frage: ein Test führt sie erneut aus und vergleicht;
--   * sie sagt der App, welche Fläche die Frage hat (Zeile antippen oder Code tippen), ohne die
--     Lösung zu verraten;
--   * sie sagt der Bewertung, dass hier Code läuft und kein Text verglichen wird: ihre eigene
--     Funktion wird gegen die Tests ausgeführt („3 von 5 Tests bestanden"), ohne Modell.
--
-- Kein Backfill: alte Zeilen haben keine Aufgabe und werden behandelt wie bisher.
alter table items add column code_task jsonb;

comment on column items.code_task is
  'Die geprüfte Informatik-Aufgabe, wie das Modell sie geschrieben hat: CodeTask in packages/shared-types/src/contracts/code.ts. Frage, Programmanzeige, Schlüssel, Tipps und Musterlösung sind daraus gerechnet, der Schlüssel durch AUSFÜHRUNG im Interpreter der Lehr-Teilmenge (modules/practice/python/), nie vom Modell übernommen. Issue #262.';

-- Eine Frage hat höchstens EINE gerechnete Quelle (0078 hat das für zwei gesagt; jetzt sind es
-- drei). Derselbe Grund: sonst entschiede die Reihenfolge im Code, welche Fläche sie bekommt.
--
-- Die alte Bedingung wird ersetzt, nicht ergänzt. Sie zu lassen und eine zweite daneben zu
-- stellen wäre korrekt, aber zwei Bedingungen für dieselbe Regel sind zwei Stellen, die beim
-- nächsten Mal nur zur Hälfte geändert werden. `if exists`, weil die Reihenfolge, in der die
-- gehostete Datenbank Migrationen anwendet, nicht die der Nummern ist (README.md hier).
alter table items drop constraint if exists items_one_computed_source;
alter table items add constraint items_one_computed_source
  check (num_nonnulls(bar_task, staff_task, code_task) <= 1);
