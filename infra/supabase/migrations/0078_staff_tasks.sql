-- Die Notenzeile: Noten lesen, selbst schreiben und anhören (issue #226, Welle 6 aus #224).
--
-- Musik war das schwächste Fach: Notenschrift stand als `drawing` in `NotPracticableForm`, also
-- gab es für 21 Aufgabentypen keine Frage. Dabei ist Notenlehre der Teil des Lehrplans mit dem
-- höchsten Anteil formal entscheidbarer Fehlerklassen (`docs/lehrplan-und-uebungsformen.md`
-- §10.2): ein Notenname, ein Intervall, ein Notenwert, eine Taktart und die Frage, ob ein Takt
-- voll ist, sind rechenbar. Also rechnet Code sie — kein Modellaufruf pro Antwort
-- (CLAUDE.md Regel 1).
--
-- Eine Änderung, und sie ist genau die, die `items.bar_task` (Migration 0064) schon war.

-- ─────────────── die geprüfte Aufgabe ───────────────
--
-- In dieser Spalte steht genau das, was das Modell gesagt hat: eine von fünf geprüften Aufgaben,
-- ein Schlüssel, Tonhöhen und Dauern (`StaffTask`, packages/shared-types/src/contracts/staff.ts).
-- Alles andere an der Frage — `prompt`, `answer`, `accepted_answers`, `choices`, `figure`,
-- `hints`, `worked_solution` — ist daraus GERECHNET (apps/api/src/modules/practice/staff.ts) und
-- steht in den Spalten, die es immer schon gab, damit Sitzung, Bewertung und FSRS unverändert
-- weiterlaufen.
--
-- Warum die Aufgabe trotzdem gespeichert wird, obwohl das Gerechnete daneben steht — dieselben
-- drei Gründe wie beim Bruchbalken:
--   * sie ist die EINE geprüfte Quelle der Frage: ein Test rechnet aus ihr nach und vergleicht
--     mit dem, was gespeichert wurde;
--   * sie sagt der App, welche Fläche die Frage hat (`ItemView.surface`, `mode: 'notes'`), ohne
--     die Lösung zu verraten;
--   * sie sagt der Bewertung, dass diese Frage nach einer Notenzeile fragt und nicht nach einer
--     Zeichenkette: `checkStaffLine` vergleicht Tonnamen, Dauern und Taktfüllung und nennt die
--     Stelle („Takt 2 ist voller als ein Viervierteltakt"), statt zwei Texte zu vergleichen.
--
-- Kein Backfill: alte Zeilen haben keine Aufgabe und werden genau wie bisher behandelt.
alter table items add column staff_task jsonb;

comment on column items.staff_task is
  'Die geprüfte Notenaufgabe, wie das Modell sie gewählt hat: StaffTask in packages/shared-types/src/contracts/staff.ts. Frage, Notenzeile, Schlüssel, Tipps und Musterlösung sind daraus gerechnet (modules/practice/staff.ts), nie vom Modell geschrieben. Issue #226.';

-- Eine Frage hat höchstens EINE gerechnete Quelle. Das ist keine Vorsichtsmaßnahme, sondern die
-- Bedingung dafür, dass `surfaceFor` eindeutig bleibt: beide Spalten gefüllt hieße, dieselbe Frage
-- wird mit einem Bruchbalken UND einer Notenzeile beantwortet, und welche Fläche sie dann bekommt,
-- entschiede die Reihenfolge im Code.
alter table items add constraint items_one_computed_source
  check (bar_task is null or staff_task is null);
