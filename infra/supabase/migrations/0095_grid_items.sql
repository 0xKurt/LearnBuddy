-- Zeichnen auf dem Raster (issue #249, Baustein `RASTER` aus #224): Punkte eintragen, Punkte auf
-- einem Graphen setzen (eine Gerade aus zwei Punkten, eine Parabel über Punkte), eine Figur auf
-- Karopapier spiegeln, ein Säulendiagramm zeichnen.
--
-- Eine neue strukturierte Art `grid_draw` neben `order`, `match`, `table_fill`, `cloze` (0079),
-- `select_all` (0085) und `mark` (0087). Sie trägt ihre Aufgabe in `items.task` wie die anderen
-- (`GridDrawTask`, packages/shared-types/src/contracts/grid.ts): das Blatt, das CODE um die Daten
-- gelegt hat (nie das Modell), die Namen der Punkte, die Figur mit ihrer Achse oder die Säulen mit
-- ihrem Maßstab, und den Schlüssel — die Punkte auf den Kreuzungen, die Werte der Säulen. Das
-- Modell wählt nur die Art und ihre Daten; Code rechnet den Schlüssel, prüft, dass er auf dem
-- Raster im Blatt liegt, und verwirft sonst die Aufgabe (apps/api/src/modules/practice/grid.ts).
-- Ihre Zeichnung wird exakt verglichen — kein Modell.
--
-- Nur die zwei Prüfregeln ändern sich, keine Spalte. Wie in 0085 und 0087 werden sie NICHT neu
-- hingeschrieben, sondern aus der Regel gebaut, die gerade in der Datenbank steht, um `grid_draw`
-- erweitert: die Anwendungsreihenfolge ist nicht die der Nummern (README), und eine andere
-- Migration, die zur selben Zeit eine weitere Art erlaubt, darf hier nicht still wieder verboten
-- werden. Steht `grid_draw` schon drin, ändert die Datei nichts.

do $$
declare
  def text;
begin
  select pg_get_constraintdef(oid) into def
    from pg_constraint
   where conrelid = 'public.items'::regclass and conname = 'items_kind_check';
  if def is null then
    raise exception '0095_grid_items: items_kind_check is missing; nothing was changed.';
  end if;
  if position('''grid_draw''' in def) = 0 then
    if position('ARRAY[' in def) = 0 then
      raise exception '0095_grid_items: items_kind_check has an unexpected form (%); nothing was changed.', def;
    end if;
    alter table items drop constraint items_kind_check;
    execute 'alter table items add constraint items_kind_check '
         || replace(def, 'ARRAY[', 'ARRAY[''grid_draw''::text, ');
  end if;

  -- Eine strukturierte Art hat IMMER eine Aufgabe, jede andere NIE (0079). `grid_draw` ist
  -- strukturiert, also gehört sie in die Liste dieser Regel.
  select pg_get_constraintdef(oid) into def
    from pg_constraint
   where conrelid = 'public.items'::regclass and conname = 'items_task_matches_kind';
  if def is null then
    raise exception '0095_grid_items: items_task_matches_kind is missing (0079); nothing was changed.';
  end if;
  if position('''grid_draw''' in def) = 0 then
    if (length(def) - length(replace(def, 'ARRAY[', ''))) / length('ARRAY[') <> 1 then
      raise exception '0095_grid_items: items_task_matches_kind has an unexpected form (%); nothing was changed.', def;
    end if;
    alter table items drop constraint items_task_matches_kind;
    execute 'alter table items add constraint items_task_matches_kind '
         || replace(def, 'ARRAY[', 'ARRAY[''grid_draw''::text, ');
  end if;
end
$$;

comment on column items.task is
  'Die geprüfte Aufgabe einer strukturierten Frage (ordnen, zuordnen, Tabelle füllen, Lückentext, alle richtigen ankreuzen, markieren, auf dem Raster zeichnen) MIT Schlüssel: StructuredTask in packages/shared-types/src/contracts/structured.ts. Ids, Mischung, Zerlegung in Wörter, Blatt und Schlüssel setzt Code (practice/structured.ts, table.ts, mark.ts, grid.ts). Verlässt den Server nie; die App bekommt ItemView.task_view ohne Schlüssel. Issues #228–#232, #234, #240, #249.';
