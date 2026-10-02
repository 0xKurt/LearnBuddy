-- Anschauung als Figur: Uhr, Geld, Zwanziger- und Hunderterfeld, Stellenwerttafel (issue #254)
-- und Körper, Würfelnetze, Punkte im Raum (issue #255).
--
-- Dieselbe Änderung wie `items.staff_task` (Migration 0078) und `items.bar_task` (0064), aus
-- demselben Grund: bei diesen Fragen wird der Schlüssel VON DER ZEICHNUNG abgelesen. Das Modell
-- wählt eine geprüfte Aufgabe (`VisualTask`, packages/shared-types/src/contracts/visual.ts) — eine
-- Uhrzeit, Münzen, eine Zahl, einen Körper mit Maßen, sechs Quadrate, einen Punkt. Frage, Figur,
-- Schlüssel, Optionen, Tipps und Musterlösung RECHNET Code daraus
-- (apps/api/src/modules/practice/visual.ts) und schreibt sie in die Spalten, die es immer gab.
--
-- Warum die Aufgabe trotzdem gespeichert wird:
--   * sie ist die EINE geprüfte Quelle der Frage, gegen die ein Test nachrechnet;
--   * sie sagt der App, welche Fläche die Frage hat (`ItemView.surface`: die Uhr, die sie stellt,
--     die Münzen, die sie legt), ohne die Lösung zu verraten;
--   * sie sagt der Bewertung, WAS verglichen wird: eine Uhrzeit (7:30 = 19:30 = „halb acht"), ein
--     Betrag (3,45 € = 345 ct), die Summe gelegter Münzen, ein Punkt (2|3|1) — nicht zwei Texte.
--
-- Kein Backfill: alte Zeilen haben keine Aufgabe und werden behandelt wie bisher.
alter table items add column visual_task jsonb;

comment on column items.visual_task is
  'Die geprüfte Anschauungsaufgabe, wie das Modell sie gewählt hat: VisualTask in packages/shared-types/src/contracts/visual.ts. Frage, Figur, Schlüssel, Tipps und Musterlösung sind daraus gerechnet (modules/practice/visual.ts), nie vom Modell geschrieben. Issues #254, #255.';

-- Eine Frage hat höchstens EINE gerechnete Quelle (Migration 0078 hat es für bar_task und
-- staff_task gesagt): sonst entschiede die Reihenfolge im Code, welche Fläche sie bekommt und
-- welche Prüfung gilt.
alter table items add constraint items_visual_task_alone
  check (visual_task is null or (bar_task is null and staff_task is null and task is null));
