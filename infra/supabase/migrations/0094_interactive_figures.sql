-- Figuren, mit denen sie ARBEITET: Antippen in einer Figur (#248) und Zeichnen auf einem Raster
-- (#249). Beide sind strukturierte Arten wie ordnen, zuordnen und Tabelle füllen (Migration 0079):
-- die geprüfte Aufgabe MIT Schlüssel steht in `items.task` (`FigureTapTask`, `GridDrawTask`,
-- packages/shared-types/src/contracts/figureTask.ts), die App bekommt sie ohne Schlüssel, und Code
-- vergleicht ihre Antwort mit dem Schlüssel (apps/api/src/modules/practice/figureTap.ts,
-- gridDraw.ts) — kein Modell, in keiner Richtung (#224, „Regel 0“).
--
-- Neue Spalten braucht es dafür nicht. Was sich ändert, sind die zwei Prüfregeln, die 0079 für
-- die Arten aufgestellt hat: `items_kind_check` (welche Arten es gibt) und
-- `items_task_matches_kind` (welche Arten eine Aufgabe tragen). Beide werden hier mit der
-- vollständigen Liste neu angelegt, `cloze` (#232) bleibt darin, wie 0079 es vorgesehen hat.
--
-- Wer nach dieser Datei eine weitere Art anlegt, schreibt ebenfalls die VOLLSTÄNDIGE Liste —
-- mit `figure_tap` und `grid_draw`. Fehlen sie, scheitert das Anlegen der Prüfregel laut an den
-- vorhandenen Zeilen, statt sie still ungültig zu machen.
--
-- Beide Prüfregeln werden nur ERWEITERT: jede Zeile, die bisher gültig war, ist es weiter.

alter table items drop constraint items_kind_check;
alter table items add constraint items_kind_check
  check (kind in ('short','long','numeric','multiple_choice','formula','vocab','speak',
                  'order','match','table_fill','cloze','figure_tap','grid_draw'));

alter table items drop constraint items_task_matches_kind;
alter table items add constraint items_task_matches_kind
  check (
    (kind in ('order','match','table_fill','cloze','figure_tap','grid_draw')) = (task is not null)
    and (task is null or task->>'type' = kind)
  );

comment on column items.task is
  'Die geprüfte Aufgabe einer strukturierten Frage MIT Schlüssel: StructuredTask in packages/shared-types/src/contracts/structured.ts (ordnen, zuordnen, Tabelle füllen — #228–#230; in einer Figur antippen, auf einem Raster zeichnen — #248, #249, contracts/figureTask.ts). Ids, Mischung und Schlüssel setzt Code. Verlässt den Server nie; die App bekommt ItemView.task_view ohne Schlüssel.';
