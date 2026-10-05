-- Antippen in einer Figur (issue #248, Analyse #224 `HOTSPOT_FIG`): eine Stelle am Zahlenstrahl,
-- ein Punkt im Koordinatensystem, eine Säule, die Uhrzeit auf einem Zifferblatt.
--
-- Eine Frage mit Figur kann sagen „hier wird in die Figur getippt“. Die Orte, die man antippen
-- kann, sind das Raster der Figur selbst (`tapAxes`, packages/shared-math/src/tap.ts). Code prüft
-- vor dem Speichern, dass der Schlüssel auf genau einem dieser Orte liegt und die Figur ihn nicht
-- schon zeigt (apps/api/src/modules/practice/tapCheck.ts). Liegt er daneben, könnte ihn niemand
-- antippen: Die Frage entsteht dann nicht (Regel 0).
--
-- Warum eine eigene Spalte und kein Feld in `figure`: Die Figur bleibt, was sie ist — dieselbe
-- Zeichnung, dieselben Prüfungen, dieselbe Form in jeder Liste. Antippen ist die Art zu antworten,
-- keine Eigenschaft der Zeichnung. Eine Frage ohne Figur hat nichts zum Antippen, das hält die
-- Prüfregel fest. Kein Backfill: alte Fragen werden getippt wie bisher.

alter table items add column tap boolean not null default false;

alter table items add constraint items_tap_has_figure check (not tap or figure is not null);

comment on column items.tap is
  'She answers by tapping a place in the figure (issue #248); the key lies on the figure''s grid (practice/tapCheck.ts).';
